/**
 * Pure helpers for subject masks: turning segmenter output into an alpha
 * mask and keying the per-frame cache.
 */

/** A subject mask at the segmenter's resolution: alpha 0–1 per pixel, 1 = subject. */
export interface SubjectMaskData {
	width: number;
	height: number;
	alpha: Float32Array;
	/** Share of the frame covered by the subject, 0–1. */
	coverage: number;
}

/** Below this share of the frame, nothing counts as a subject. */
export const MIN_SUBJECT_COVERAGE = 0.01;

/** Masks are computed at most this many times per second of source video. */
export const MASK_TIME_BUCKETS_PER_SECOND = 15;

export function getMaskCacheKey({
	mediaId,
	timeSeconds,
}: {
	mediaId: string;
	timeSeconds: number;
}): string {
	const bucket = Math.round(Math.max(0, timeSeconds) * MASK_TIME_BUCKETS_PER_SECOND);
	return `${mediaId}@${bucket}`;
}

/** Subject alpha from the background confidence (the first category of both models). */
export function maskFromBackgroundConfidence({
	width,
	height,
	background,
}: {
	width: number;
	height: number;
	background: Float32Array;
}): SubjectMaskData {
	const alpha = new Float32Array(width * height);
	let sum = 0;
	for (let index = 0; index < alpha.length; index++) {
		const value = Math.min(1, Math.max(0, 1 - (background[index] ?? 1)));
		alpha[index] = value;
		sum += value;
	}
	return { width, height, alpha, coverage: alpha.length ? sum / alpha.length : 0 };
}

export function hasSubject({ mask }: { mask: SubjectMaskData | null }): boolean {
	return mask !== null && mask.coverage >= MIN_SUBJECT_COVERAGE;
}

/** RGBA pixels (white, alpha = subject) ready for `putImageData`. */
export function maskToRgba({ mask }: { mask: SubjectMaskData }): Uint8ClampedArray {
	const pixels = new Uint8ClampedArray(mask.width * mask.height * 4);
	for (let index = 0; index < mask.alpha.length; index++) {
		const offset = index * 4;
		pixels[offset] = 255;
		pixels[offset + 1] = 255;
		pixels[offset + 2] = 255;
		pixels[offset + 3] = Math.round(mask.alpha[index] * 255);
	}
	return pixels;
}

/** Small LRU map: reading or writing a key makes it the most recent. */
export class LruCache<TValue> {
	private readonly entries = new Map<string, TValue>();

	constructor(private readonly capacity: number) {}

	has(key: string): boolean {
		return this.entries.has(key);
	}

	get(key: string): TValue | undefined {
		if (!this.entries.has(key)) return undefined;
		const value = this.entries.get(key);
		this.entries.delete(key);
		if (value !== undefined) this.entries.set(key, value);
		return value;
	}

	set({ key, value }: { key: string; value: TValue }): void {
		this.entries.delete(key);
		this.entries.set(key, value);
		while (this.entries.size > this.capacity) {
			const oldest = this.entries.keys().next().value;
			if (oldest === undefined) break;
			this.entries.delete(oldest);
		}
	}

	clear(): void {
		this.entries.clear();
	}

	get size(): number {
		return this.entries.size;
	}
}
