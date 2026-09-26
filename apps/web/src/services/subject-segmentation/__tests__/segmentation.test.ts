import { describe, expect, test } from "bun:test";
import {
	LruCache,
	MIN_SUBJECT_COVERAGE,
	getMaskCacheKey,
	hasSubject,
	maskFromBackgroundConfidence,
	maskToRgba,
	type SubjectMaskData,
} from "../mask";
import { SubjectSegmentationService } from "../service";
import type { SegmenterStatus, SubjectSegmenter } from "../types";

// Stands in for a video frame: the fake segmenter never reads it.
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const frame = {} as TexImageSource;

/** Bun has no canvas; the service only needs a placeholder per mask. */
const createService = ({ segmenter }: { segmenter: SubjectSegmenter }) =>
	new SubjectSegmentationService({
		createSegmenter: () => segmenter,
		createCanvas: ({ data }) => {
			const canvas = { width: data.width, height: data.height };
			// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
			return canvas as unknown as OffscreenCanvas;
		},
	});

function maskWithCoverage({ coverage }: { coverage: number }): SubjectMaskData {
	const size = 100;
	const background = new Float32Array(size).map((_, index) => (index < coverage * size ? 0 : 1));
	return maskFromBackgroundConfidence({ width: 10, height: 10, background });
}

/** Scripted segmenter: loads when told to, returns a fixed mask. */
class FakeSegmenter implements SubjectSegmenter {
	status: SegmenterStatus = "idle";
	calls = 0;
	private readonly listeners = new Set<() => void>();

	constructor(private readonly result: SubjectMaskData | null) {}

	getStatus() {
		return this.status;
	}
	async load() {
		return this.status === "ready";
	}
	subscribe(listener: () => void) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	finishLoading() {
		this.status = "ready";
		for (const listener of this.listeners) listener();
	}
	async segment({ wait }: { source: TexImageSource; wait: boolean }) {
		this.calls++;
		if (this.status !== "ready") {
			this.status = "loading";
			if (!wait) return null;
			this.status = "ready";
		}
		return this.result;
	}
}

describe("mask helpers", () => {
	test("subject alpha is the inverse of the background confidence", () => {
		const mask = maskFromBackgroundConfidence({
			width: 2,
			height: 1,
			background: new Float32Array([1, 0.25]),
		});
		expect(Array.from(mask.alpha)).toEqual([0, 0.75]);
		expect(mask.coverage).toBeCloseTo(0.375);
		expect(Array.from(maskToRgba({ mask }))).toEqual([255, 255, 255, 0, 255, 255, 255, 191]);
	});

	test("tiny masks don't count as a subject", () => {
		expect(hasSubject({ mask: null })).toBe(false);
		expect(hasSubject({ mask: maskWithCoverage({ coverage: 0 }) })).toBe(false);
		expect(hasSubject({ mask: maskWithCoverage({ coverage: 0.3 }) })).toBe(true);
		expect(MIN_SUBJECT_COVERAGE).toBeGreaterThan(0);
	});

	test("cache keys quantize the source time per media", () => {
		expect(getMaskCacheKey({ mediaId: "a", timeSeconds: 1 })).toBe(
			getMaskCacheKey({ mediaId: "a", timeSeconds: 1.02 }),
		);
		expect(getMaskCacheKey({ mediaId: "a", timeSeconds: 1 })).not.toBe(
			getMaskCacheKey({ mediaId: "a", timeSeconds: 1.2 }),
		);
		expect(getMaskCacheKey({ mediaId: "a", timeSeconds: 1 })).not.toBe(
			getMaskCacheKey({ mediaId: "b", timeSeconds: 1 }),
		);
	});

	test("the LRU cache drops the least recently used entry", () => {
		const cache = new LruCache<number | null>(2);
		cache.set({ key: "a", value: 1 });
		cache.set({ key: "b", value: null });
		cache.get("a");
		cache.set({ key: "c", value: 3 });
		expect(cache.has("a")).toBe(true);
		expect(cache.has("b")).toBe(false);
		expect(cache.get("c")).toBe(3);
		expect(cache.size).toBe(2);
	});
});

describe("SubjectSegmentationService", () => {
	test("while the models load, returns no mask right away and retries later", async () => {
		const segmenter = new FakeSegmenter(maskWithCoverage({ coverage: 0.3 }));
		const service = createService({ segmenter });
		const request = { mediaId: "m", timeSeconds: 2, source: frame, wait: false };

		expect(await service.getMask(request)).toBeNull();
		expect(service.detectionWithoutMask()).toBe("loading");

		let notified = 0;
		service.subscribe(() => notified++);
		segmenter.finishLoading();
		expect(notified).toBe(1);

		const mask = await service.getMask(request);
		expect(mask?.coverage).toBeCloseTo(0.3);
		expect(segmenter.calls).toBe(2);
	});

	test("caches masks per media and quantized time", async () => {
		const segmenter = new FakeSegmenter(maskWithCoverage({ coverage: 0.5 }));
		segmenter.status = "ready";
		const service = createService({ segmenter });
		await service.getMask({ mediaId: "m", timeSeconds: 1, source: frame, wait: false });
		await service.getMask({ mediaId: "m", timeSeconds: 1.01, source: frame, wait: false });
		expect(segmenter.calls).toBe(1);
		await service.getMask({ mediaId: "m", timeSeconds: 3, source: frame, wait: false });
		expect(segmenter.calls).toBe(2);
	});

	test("waiting (exports) gets the mask on the first call", async () => {
		const segmenter = new FakeSegmenter(maskWithCoverage({ coverage: 0.5 }));
		const service = createService({ segmenter });
		const mask = await service.getMask({ mediaId: "m", timeSeconds: 0, source: frame, wait: true });
		expect(mask).not.toBeNull();
	});

	test("no subject means no mask, and it's cached", async () => {
		const segmenter = new FakeSegmenter(maskWithCoverage({ coverage: 0 }));
		segmenter.status = "ready";
		const service = createService({ segmenter });
		const request = { mediaId: "m", timeSeconds: 0, source: frame, wait: false };
		expect(await service.getMask(request)).toBeNull();
		expect(await service.getMask(request)).toBeNull();
		expect(segmenter.calls).toBe(1);
		expect(service.detectionWithoutMask()).toBe("none");
	});

	test("detections notify only when they change", () => {
		const service = createService({ segmenter: new FakeSegmenter(null) });
		let notified = 0;
		service.subscribe(() => notified++);
		service.reportDetection({ elementId: "t", detection: "detected" });
		service.reportDetection({ elementId: "t", detection: "detected" });
		service.reportDetection({ elementId: "t", detection: "none" });
		expect(notified).toBe(2);
		expect(service.getDetection({ elementId: "t" })).toBe("none");
		expect(service.getDetection({ elementId: "other" })).toBeNull();
	});
});
