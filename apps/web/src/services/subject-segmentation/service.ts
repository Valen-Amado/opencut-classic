import { LruCache, getMaskCacheKey, hasSubject, maskToRgba, type SubjectMaskData } from "./mask";
import { MediaPipeSubjectSegmenter } from "./mediapipe-segmenter";
import type { SegmenterStatus, SubjectSegmenter } from "./types";

/** A computed mask, as a canvas whose alpha is the subject. */
export interface SubjectMask {
	key: string;
	canvas: OffscreenCanvas | HTMLCanvasElement;
	width: number;
	height: number;
	coverage: number;
}

/** What the "Envolver" options show about the subject under a text. */
export type SubjectDetection =
	| "detected"
	| "none"
	| "no-video"
	| "loading"
	| "unavailable";

const MASK_CACHE_SIZE = 90;

type MaskCanvasFactory = ({
	data,
}: {
	data: SubjectMaskData;
}) => OffscreenCanvas | HTMLCanvasElement | null;

function createMaskCanvas({ data }: { data: SubjectMaskData }): OffscreenCanvas | HTMLCanvasElement | null {
	if (typeof ImageData === "undefined") return null;
	const pixels = maskToRgba({ mask: data });
	const image = new ImageData(new Uint8ClampedArray(pixels), data.width, data.height);
	if (typeof OffscreenCanvas !== "undefined") {
		const canvas = new OffscreenCanvas(data.width, data.height);
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		ctx.putImageData(image, 0, 0);
		return canvas;
	}
	if (typeof document !== "undefined") {
		const canvas = document.createElement("canvas");
		canvas.width = data.width;
		canvas.height = data.height;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		ctx.putImageData(image, 0, 0);
		return canvas;
	}
	return null;
}

/**
 * Subject masks for video frames, cached per media and quantized source
 * time, plus the per-text detection state the UI shows.
 */
export class SubjectSegmentationService {
	private readonly cache = new LruCache<SubjectMask | null>(MASK_CACHE_SIZE);
	private readonly pending = new Map<string, Promise<SubjectMask | null>>();
	private readonly detections = new Map<string, SubjectDetection>();
	private readonly listeners = new Set<() => void>();
	private segmenter: SubjectSegmenter | null = null;
	private readonly createSegmenter: () => SubjectSegmenter;
	private readonly createCanvas: MaskCanvasFactory;

	constructor({
		createSegmenter,
		createCanvas = createMaskCanvas,
	}: {
		/** Called on first use, so nothing loads until a mask is needed. */
		createSegmenter: () => SubjectSegmenter;
		createCanvas?: MaskCanvasFactory;
	}) {
		this.createSegmenter = createSegmenter;
		this.createCanvas = createCanvas;
	}

	private getSegmenter(): SubjectSegmenter {
		if (!this.segmenter) {
			this.segmenter = this.createSegmenter();
			// A model finished loading (or failed): earlier "no subject" results
			// may be stale, and the preview has to redraw.
			this.segmenter.subscribe(() => {
				this.cache.clear();
				this.emit();
			});
		}
		return this.segmenter;
	}

	getStatus(): SegmenterStatus {
		return this.segmenter?.getStatus() ?? "idle";
	}

	/** Notified when models load and when a detection changes. */
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}

	/**
	 * Mask of the frame of `mediaId` at `timeSeconds` (source time). Without
	 * `wait`, returns null while the models load instead of blocking.
	 */
	async getMask({
		mediaId,
		timeSeconds,
		source,
		wait,
	}: {
		mediaId: string;
		timeSeconds: number;
		source: TexImageSource;
		wait: boolean;
	}): Promise<SubjectMask | null> {
		const key = getMaskCacheKey({ mediaId, timeSeconds });
		if (this.cache.has(key)) return this.cache.get(key) ?? null;
		const inFlight = this.pending.get(key);
		if (inFlight) return inFlight;

		const segmenter = this.getSegmenter();
		const request = (async () => {
			const data = await segmenter.segment({ source, wait });
			const canvas = data && hasSubject({ mask: data }) ? this.createCanvas({ data }) : null;
			const mask: SubjectMask | null =
				data && canvas
					? { key, canvas, width: data.width, height: data.height, coverage: data.coverage }
					: null;
			// Only cache real answers: a skipped frame (models loading) is retried.
			if (data || segmenter.getStatus() === "unavailable") {
				this.cache.set({ key, value: mask });
			}
			return mask;
		})().finally(() => this.pending.delete(key));
		this.pending.set(key, request);
		return request;
	}

	reportDetection({
		elementId,
		detection,
	}: {
		elementId: string;
		detection: SubjectDetection;
	}): void {
		if (this.detections.get(elementId) === detection) return;
		this.detections.set(elementId, detection);
		this.emit();
	}

	getDetection({ elementId }: { elementId: string }): SubjectDetection | null {
		return this.detections.get(elementId) ?? null;
	}

	/** What to report for a text when no mask came back. */
	detectionWithoutMask(): SubjectDetection {
		const status = this.getStatus();
		if (status === "unavailable") return "unavailable";
		if (status === "ready") return "none";
		return "loading";
	}
}

export const subjectSegmentation = new SubjectSegmentationService({
	createSegmenter: () => new MediaPipeSubjectSegmenter(),
});
