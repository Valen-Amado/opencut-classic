import type { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";
import { hasSubject, maskFromBackgroundConfidence, type SubjectMaskData } from "./mask";
import type { SegmenterStatus, SubjectSegmenter } from "./types";

/**
 * Subject segmentation with MediaPipe Tasks Vision. Nothing is downloaded
 * until the first frame needs a mask: the JS runtime is a lazy chunk and the
 * wasm + models come from their CDNs.
 *
 * Two models: the multiclass selfie model outlines people precisely (hair,
 * skin, clothes); when it finds nobody, DeepLab v3 looks for common objects
 * and animals (the 20 PASCAL VOC classes). Both put "background" first.
 */

/** Keep in sync with the installed @mediapipe/tasks-vision version. */
const TASKS_VISION_VERSION = "1.0.1";
const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL_URLS = {
	people:
		"https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite",
	objects:
		"https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite",
} as const;

type ModelKind = keyof typeof MODEL_URLS;
type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

type ModelSlot = {
	status: SegmenterStatus;
	segmenter: ImageSegmenter | null;
	loading: Promise<ImageSegmenter | null> | null;
};

export class MediaPipeSubjectSegmenter implements SubjectSegmenter {
	private fileset: Promise<WasmFileset> | null = null;
	private readonly slots: Record<ModelKind, ModelSlot> = {
		people: { status: "idle", segmenter: null, loading: null },
		objects: { status: "idle", segmenter: null, loading: null },
	};
	private readonly listeners = new Set<() => void>();
	private hasWarnedAboutRun = false;

	getStatus(): SegmenterStatus {
		return this.slots.people.status;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async load(): Promise<boolean> {
		return (await this.loadModel({ kind: "people" })) !== null;
	}

	async segment({
		source,
		wait,
	}: {
		source: TexImageSource;
		wait: boolean;
	}): Promise<SubjectMaskData | null> {
		const people = await this.getModel({ kind: "people", wait });
		if (!people) return null;
		const primary = this.run({ segmenter: people, source });
		if (hasSubject({ mask: primary })) return primary;

		const objects = await this.getModel({ kind: "objects", wait });
		if (!objects) return primary;
		const fallback = this.run({ segmenter: objects, source });
		return hasSubject({ mask: fallback }) ? fallback : primary;
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}

	/** The model if ready; otherwise waits for it, or starts loading and returns null. */
	private async getModel({
		kind,
		wait,
	}: {
		kind: ModelKind;
		wait: boolean;
	}): Promise<ImageSegmenter | null> {
		const slot = this.slots[kind];
		if (slot.segmenter) return slot.segmenter;
		if (slot.status === "unavailable") return null;
		const loading = this.loadModel({ kind });
		return wait ? loading : null;
	}

	private loadModel({ kind }: { kind: ModelKind }): Promise<ImageSegmenter | null> {
		const slot = this.slots[kind];
		if (slot.loading) return slot.loading;
		if (typeof window === "undefined") {
			slot.status = "unavailable";
			return Promise.resolve(null);
		}

		slot.status = "loading";
		this.emit();
		slot.loading = (async () => {
			try {
				const vision = await import("@mediapipe/tasks-vision");
				this.fileset ??= vision.FilesetResolver.forVisionTasks(WASM_BASE_URL);
				const fileset = await this.fileset;
				const create = ({ delegate }: { delegate: "GPU" | "CPU" }) =>
					vision.ImageSegmenter.createFromOptions(fileset, {
						baseOptions: { modelAssetPath: MODEL_URLS[kind], delegate },
						runningMode: "IMAGE",
						outputConfidenceMasks: true,
						outputCategoryMask: false,
					});
				let segmenter: ImageSegmenter;
				try {
					segmenter = await create({ delegate: "GPU" });
				} catch {
					segmenter = await create({ delegate: "CPU" });
				}
				slot.segmenter = segmenter;
				slot.status = "ready";
			} catch (error) {
				console.warn(`[subject-segmentation] couldn't load the ${kind} model`, error);
				slot.status = "unavailable";
				if (kind === "people") this.fileset = null;
			}
			this.emit();
			return slot.segmenter;
		})();
		return slot.loading;
	}

	private run({
		segmenter,
		source,
	}: {
		segmenter: ImageSegmenter;
		source: TexImageSource;
	}): SubjectMaskData | null {
		try {
			const result = segmenter.segment(source);
			try {
				const background = result.confidenceMasks?.[0];
				if (!background) return null;
				return maskFromBackgroundConfidence({
					width: background.width,
					height: background.height,
					background: background.getAsFloat32Array(),
				});
			} finally {
				result.close();
			}
		} catch (error) {
			if (!this.hasWarnedAboutRun) {
				this.hasWarnedAboutRun = true;
				console.warn("[subject-segmentation] segmentation failed", error);
			}
			return null;
		}
	}
}
