import { Input, ALL_FORMATS, BlobSource, CanvasSink } from "mediabunny";

const THUMBNAIL_WIDTH_PX = 128;
const THUMBNAIL_JPEG_QUALITY = 0.7;
const MAX_CONCURRENT_JOBS = 2;
const MAX_CACHED_THUMBNAILS = 2000;

interface ThumbnailSource {
	input: Input;
	sink: CanvasSink;
	firstTimestamp: number;
}

interface ThumbnailJob {
	key: string;
	mediaId: string;
	file: File;
	time: number;
	refs: number;
	started: boolean;
}

export function buildFrameThumbnailKey({
	mediaId,
	time,
}: {
	mediaId: string;
	time: number;
}): string {
	return `${mediaId}@${time.toFixed(2)}`;
}

async function canvasToJpegUrl({
	canvas,
}: {
	canvas: HTMLCanvasElement | OffscreenCanvas;
}): Promise<string | null> {
	let blob: Blob | null;
	if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
		blob = await canvas.convertToBlob({
			type: "image/jpeg",
			quality: THUMBNAIL_JPEG_QUALITY,
		});
	} else if (canvas instanceof HTMLCanvasElement) {
		blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, "image/jpeg", THUMBNAIL_JPEG_QUALITY),
		);
	} else {
		blob = null;
	}
	return blob ? URL.createObjectURL(blob) : null;
}

/**
 * Small JPEG thumbnails of individual video frames (~128 px wide), decoded
 * lazily with limited concurrency and cached per media id + source time.
 * Callers quantize the time so neighbouring requests share entries.
 */
export class FrameThumbnailService {
	private urls = new Map<string, string>();
	private failedKeys = new Set<string>();
	private jobs = new Map<string, ThumbnailJob>();
	private queue: ThumbnailJob[] = [];
	private busyMedia = new Set<string>();
	private activeJobs = 0;
	private sources = new Map<string, Promise<ThumbnailSource | null>>();
	private listeners = new Set<() => void>();

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	getThumbnailUrl({
		mediaId,
		time,
	}: {
		mediaId: string;
		time: number;
	}): string | null {
		return this.urls.get(buildFrameThumbnailKey({ mediaId, time })) ?? null;
	}

	/**
	 * Queues a thumbnail for decoding. Returns a cancel function; a request that
	 * has not started yet is dropped once every requester cancels it (e.g. the
	 * tile scrolled out of view).
	 */
	requestThumbnail({
		mediaId,
		file,
		time,
	}: {
		mediaId: string;
		file: File;
		time: number;
	}): () => void {
		const key = buildFrameThumbnailKey({ mediaId, time });
		if (this.urls.has(key) || this.failedKeys.has(key)) {
			return () => {};
		}

		let job = this.jobs.get(key);
		if (job) {
			job.refs += 1;
			// Most recent requests are the ones on screen now: move to the front.
			if (!job.started) {
				this.queue = this.queue.filter((queued) => queued !== job);
				this.queue.push(job);
			}
		} else {
			job = { key, mediaId, file, time, refs: 1, started: false };
			this.jobs.set(key, job);
			this.queue.push(job);
		}
		this.pump();

		let isCancelled = false;
		const requestedJob = job;
		return () => {
			if (isCancelled) return;
			isCancelled = true;
			requestedJob.refs -= 1;
			if (requestedJob.refs <= 0 && !requestedJob.started) {
				this.queue = this.queue.filter((queued) => queued !== requestedJob);
				this.jobs.delete(requestedJob.key);
			}
		};
	}

	clearMedia({ mediaId }: { mediaId: string }): void {
		const prefix = `${mediaId}@`;
		for (const [key, url] of this.urls) {
			if (key.startsWith(prefix)) {
				URL.revokeObjectURL(url);
				this.urls.delete(key);
			}
		}
		for (const key of this.failedKeys) {
			if (key.startsWith(prefix)) this.failedKeys.delete(key);
		}
		this.queue = this.queue.filter((job) => job.mediaId !== mediaId);
		for (const [key, job] of this.jobs) {
			if (job.mediaId === mediaId && !job.started) this.jobs.delete(key);
		}
		const source = this.sources.get(mediaId);
		this.sources.delete(mediaId);
		void source?.then((resolved) => resolved?.input.dispose());
		this.notify();
	}

	clearAll(): void {
		const mediaIds = new Set([
			...this.sources.keys(),
			...[...this.urls.keys()].map((key) => key.slice(0, key.lastIndexOf("@"))),
		]);
		for (const mediaId of mediaIds) {
			this.clearMedia({ mediaId });
		}
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}

	private pump(): void {
		while (this.activeJobs < MAX_CONCURRENT_JOBS) {
			const job = this.takeNextJob();
			if (!job) return;
			this.activeJobs += 1;
			this.busyMedia.add(job.mediaId);
			job.started = true;
			void this.runJob({ job }).finally(() => {
				this.activeJobs -= 1;
				this.busyMedia.delete(job.mediaId);
				this.jobs.delete(job.key);
				this.pump();
			});
		}
	}

	/** Newest request first, skipping media that are already decoding. */
	private takeNextJob(): ThumbnailJob | null {
		for (let index = this.queue.length - 1; index >= 0; index--) {
			const job = this.queue[index];
			if (!this.busyMedia.has(job.mediaId)) {
				this.queue.splice(index, 1);
				return job;
			}
		}
		return null;
	}

	private async runJob({ job }: { job: ThumbnailJob }): Promise<void> {
		try {
			const source = await this.getSource({
				mediaId: job.mediaId,
				file: job.file,
			});
			if (!source) {
				this.failedKeys.add(job.key);
				return;
			}

			const frame = await source.sink.getCanvas(
				Math.max(job.time, source.firstTimestamp),
			);
			if (!frame) {
				this.failedKeys.add(job.key);
				return;
			}

			const url = await canvasToJpegUrl({ canvas: frame.canvas });
			// The media may have been cleared while decoding.
			if (!url || !this.sources.has(job.mediaId)) {
				if (url) URL.revokeObjectURL(url);
				return;
			}
			this.storeUrl({ key: job.key, url });
			this.notify();
		} catch (error) {
			console.warn("Failed to render frame thumbnail:", error);
			this.failedKeys.add(job.key);
		}
	}

	private storeUrl({ key, url }: { key: string; url: string }): void {
		this.urls.set(key, url);
		while (this.urls.size > MAX_CACHED_THUMBNAILS) {
			const oldest = this.urls.keys().next();
			if (oldest.done) break;
			const oldestUrl = this.urls.get(oldest.value);
			if (oldestUrl) URL.revokeObjectURL(oldestUrl);
			this.urls.delete(oldest.value);
		}
	}

	private getSource({
		mediaId,
		file,
	}: {
		mediaId: string;
		file: File;
	}): Promise<ThumbnailSource | null> {
		const existing = this.sources.get(mediaId);
		if (existing) return existing;

		const created = this.createSource({ file });
		this.sources.set(mediaId, created);
		return created;
	}

	private async createSource({
		file,
	}: {
		file: File;
	}): Promise<ThumbnailSource | null> {
		const input = new Input({
			source: new BlobSource(file),
			formats: ALL_FORMATS,
		});
		try {
			const videoTrack = await input.getPrimaryVideoTrack();
			if (!videoTrack || !(await videoTrack.canDecode())) {
				input.dispose();
				return null;
			}
			return {
				input,
				sink: new CanvasSink(videoTrack, { width: THUMBNAIL_WIDTH_PX }),
				firstTimestamp: await videoTrack.getFirstTimestamp(),
			};
		} catch (error) {
			console.warn("Failed to open video for frame thumbnails:", error);
			input.dispose();
			return null;
		}
	}
}

export const frameThumbnails = new FrameThumbnailService();
