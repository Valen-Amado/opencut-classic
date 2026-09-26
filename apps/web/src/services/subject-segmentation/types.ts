import type { SubjectMaskData } from "./mask";

export type SegmenterStatus = "idle" | "loading" | "ready" | "unavailable";

/**
 * Finds the main subject of a video frame. Implementations may load models
 * lazily; rendering must work (showing the full ring) while they're loading
 * or when segmentation isn't available at all.
 */
export interface SubjectSegmenter {
	getStatus(): SegmenterStatus;
	/** Starts loading; resolves to whether segmentation is ready. Never throws. */
	load(): Promise<boolean>;
	/**
	 * Segments one frame. Without `wait`, anything not loaded yet is skipped
	 * (and starts loading) so the call returns right away; with `wait`, it
	 * waits for the models so the result is the best available (exports).
	 * Resolves to null when nothing can be computed. Never throws.
	 */
	segment({
		source,
		wait,
	}: {
		source: TexImageSource;
		wait: boolean;
	}): Promise<SubjectMaskData | null>;
	/** Called whenever the status changes or better models become available. */
	subscribe(listener: () => void): () => void;
}
