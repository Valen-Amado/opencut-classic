import {
	Input,
	ALL_FORMATS,
	BlobSource,
	VideoSampleSink,
	type VideoSample,
} from "mediabunny";

type FrameCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface VideoCacheFrame {
	canvas: FrameCanvas;
	/** Presentation time of the frame in seconds. */
	timestamp: number;
	/** Duration of the frame in seconds. */
	duration: number;
}

/**
 * Canvases a stream draws its shown frames into. A frame's canvas is only
 * reused two frames later, so the one on screen (and the one before it, which
 * an in-flight render may still be uploading) is never overwritten.
 */
const CANVAS_RING_SIZE = 3;
/**
 * Containers store frame timestamps rounded to their timescale (often 1 ms),
 * so a frame meant to start at 32/30 s = 1.06667 s may be stored as 1.067 s.
 * Asking for the exact frame boundary would then land 0.3 ms before that frame
 * and return the previous one — repeating one frame and skipping the next.
 * Look this far past the requested time to absorb the rounding; it is far
 * smaller than any real frame duration.
 */
export const FRAME_TIME_TOLERANCE = 0.001;

/** Stay on the current decoder while the target is at most this far ahead (seconds). */
const MAX_FORWARD_DECODE = 2;

interface VideoStream {
	input: Input;
	sink: VideoSampleSink;
	iterator: AsyncGenerator<VideoSample, void, unknown> | null;
	/** Decoded sample that starts after the last target, kept for the next request. */
	pending: VideoSample | null;
	/** In-flight read of the next sample (decode-ahead). */
	prefetch: Promise<VideoSample | null> | null;
	current: VideoCacheFrame | null;
	canvases: FrameCanvas[];
	nextCanvas: number;
}

function createCanvas({ width, height }: { width: number; height: number }): FrameCanvas {
	if (typeof OffscreenCanvas !== "undefined") {
		return new OffscreenCanvas(width, height);
	}
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

function containsTime({
	frame,
	time,
}: {
	frame: { timestamp: number; duration: number };
	time: number;
}): boolean {
	return time >= frame.timestamp && time < frame.timestamp + frame.duration;
}

/**
 * Decodes video frames for playback and scrubbing.
 *
 * Samples are decoded in order (inter-frame compression requires it), but only
 * the frame that is actually shown is drawn to a canvas; frames skipped over —
 * e.g. every other frame at 2x speed — are closed right away without the cost
 * of drawing them.
 */
export class VideoCache {
	/**
	 * Preview: a request overtaken by a newer one for the same media before it
	 * starts returns the frame on hand, so scrubbing stays responsive. Exports
	 * turn this off: every requested frame must be the exact one.
	 */
	private readonly dropSupersededRequests: boolean;

	constructor({
		dropSupersededRequests = true,
	}: { dropSupersededRequests?: boolean } = {}) {
		this.dropSupersededRequests = dropSupersededRequests;
	}

	private streams = new Map<string, VideoStream>();
	private initPromises = new Map<string, Promise<void>>();
	private frameChain = new Map<string, Promise<unknown>>();
	private seekGenerations = new Map<string, number>();

	async getFrameAt({
		mediaId,
		file,
		time,
	}: {
		mediaId: string;
		file: File;
		time: number;
	}): Promise<VideoCacheFrame | null> {
		await this.ensureStream({ mediaId, file });

		const stream = this.streams.get(mediaId);
		if (!stream) return null;

		// Requests are served one at a time per media; a request superseded by a
		// newer one before it starts just returns the frame on hand.
		const generation = (this.seekGenerations.get(mediaId) ?? 0) + 1;
		this.seekGenerations.set(mediaId, generation);

		const previous = this.frameChain.get(mediaId) ?? Promise.resolve();
		const current = previous.then(() => {
			if (
				this.dropSupersededRequests &&
				this.seekGenerations.get(mediaId) !== generation
			) {
				return stream.current;
			}
			return this.resolveFrame({ stream, time });
		});
		this.frameChain.set(
			mediaId,
			current.catch(() => {}),
		);
		return current;
	}

	private async resolveFrame({
		stream,
		time: requestedTime,
	}: {
		stream: VideoStream;
		time: number;
	}): Promise<VideoCacheFrame | null> {
		const time = requestedTime + FRAME_TIME_TOLERANCE;
		const shown = stream.current;
		if (shown && containsTime({ frame: shown, time })) {
			this.startPrefetch({ stream });
			return shown;
		}

		const canContinue =
			stream.iterator !== null &&
			shown !== null &&
			time >= shown.timestamp &&
			time < shown.timestamp + MAX_FORWARD_DECODE;

		try {
			if (!canContinue) {
				await this.restartAt({ stream, time });
			}
			const frame = await this.advanceTo({
				stream,
				time,
				// After a seek the old frame is from elsewhere; show the first
				// decoded frame even if it starts slightly after the target.
				allowAhead: !canContinue,
			});
			this.startPrefetch({ stream });
			return frame;
		} catch (error) {
			console.warn("Video decode failed, will reseek:", error);
			await this.closeIterator({ stream });
			return stream.current;
		}
	}

	/** Reads samples up to the one covering `time`, drawing only that one. */
	private async advanceTo({
		stream,
		time,
		allowAhead,
	}: {
		stream: VideoStream;
		time: number;
		allowAhead: boolean;
	}): Promise<VideoCacheFrame | null> {
		while (true) {
			const sample = stream.pending ?? (await this.readNext({ stream }));
			stream.pending = null;
			if (!sample) {
				return stream.current;
			}

			if (sample.timestamp + sample.duration <= time) {
				// Before the target: decoded (required), never drawn.
				sample.close();
				continue;
			}

			if (sample.timestamp > time && stream.current && !allowAhead) {
				// The target falls in a gap before this sample: keep what is shown
				// and hold the sample for the next request.
				stream.pending = sample;
				return stream.current;
			}

			return this.show({ stream, sample });
		}
	}

	private show({
		stream,
		sample,
	}: {
		stream: VideoStream;
		sample: VideoSample;
	}): VideoCacheFrame {
		const width = Math.max(1, sample.displayWidth);
		const height = Math.max(1, sample.displayHeight);
		const index = stream.nextCanvas;
		stream.nextCanvas = (index + 1) % CANVAS_RING_SIZE;

		let canvas = stream.canvases[index];
		if (!canvas) {
			canvas = createCanvas({ width, height });
			stream.canvases[index] = canvas;
		} else if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}

		const context = canvas.getContext("2d");
		if (context && "drawImage" in context) {
			context.clearRect(0, 0, width, height);
			// Applies the sample's rotation (e.g. portrait phone videos).
			sample.drawWithFit(context, { fit: "fill" });
		}

		const frame: VideoCacheFrame = {
			canvas,
			timestamp: sample.timestamp,
			duration: sample.duration,
		};
		sample.close();
		stream.current = frame;
		return frame;
	}

	private async readNext({
		stream,
	}: {
		stream: VideoStream;
	}): Promise<VideoSample | null> {
		if (stream.prefetch) {
			const prefetched = stream.prefetch;
			stream.prefetch = null;
			return prefetched;
		}
		if (!stream.iterator) return null;
		const { value, done } = await stream.iterator.next();
		return done || !value ? null : value;
	}

	/** Decodes the next sample in the background so playback rarely waits. */
	private startPrefetch({ stream }: { stream: VideoStream }): void {
		if (!stream.iterator || stream.prefetch || stream.pending) return;
		const iterator = stream.iterator;
		stream.prefetch = iterator
			.next()
			.then(({ value, done }) => (done || !value ? null : value))
			.catch(() => null);
	}

	private async restartAt({
		stream,
		time,
	}: {
		stream: VideoStream;
		time: number;
	}): Promise<void> {
		await this.closeIterator({ stream });
		stream.iterator = stream.sink.samples(time);
	}

	private async closeIterator({ stream }: { stream: VideoStream }): Promise<void> {
		if (stream.prefetch) {
			const prefetched = await stream.prefetch;
			prefetched?.close();
			stream.prefetch = null;
		}
		stream.pending?.close();
		stream.pending = null;
		if (stream.iterator) {
			const iterator = stream.iterator;
			stream.iterator = null;
			await iterator.return();
		}
	}

	private async ensureStream({
		mediaId,
		file,
	}: {
		mediaId: string;
		file: File;
	}): Promise<void> {
		if (this.streams.has(mediaId)) return;

		if (this.initPromises.has(mediaId)) {
			await this.initPromises.get(mediaId);
			return;
		}

		const initPromise = this.initializeStream({ mediaId, file });
		this.initPromises.set(mediaId, initPromise);

		try {
			await initPromise;
		} finally {
			this.initPromises.delete(mediaId);
		}
	}

	private async initializeStream({
		mediaId,
		file,
	}: {
		mediaId: string;
		file: File;
	}): Promise<void> {
		const input = new Input({
			source: new BlobSource(file),
			formats: ALL_FORMATS,
		});

		try {
			const videoTrack = await input.getPrimaryVideoTrack();
			if (!videoTrack) {
				throw new Error("No video track found");
			}

			const canDecode = await videoTrack.canDecode();
			if (!canDecode) {
				throw new Error("Video codec not supported for decoding");
			}

			this.streams.set(mediaId, {
				input,
				sink: new VideoSampleSink(videoTrack),
				iterator: null,
				pending: null,
				prefetch: null,
				current: null,
				canvases: [],
				nextCanvas: 0,
			});
		} catch (error) {
			input.dispose();
			console.error(`Failed to initialize video sink for ${mediaId}:`, error);
			throw error;
		}
	}

	clearVideo({ mediaId }: { mediaId: string }): void {
		const stream = this.streams.get(mediaId);
		if (stream) {
			void this.closeIterator({ stream });
			stream.input.dispose();
			this.streams.delete(mediaId);
		}

		this.initPromises.delete(mediaId);
		this.frameChain.delete(mediaId);
		this.seekGenerations.delete(mediaId);
	}

	clearAll(): void {
		for (const [mediaId] of this.streams) {
			this.clearVideo({ mediaId });
		}
	}

	getStats() {
		return {
			totalSinks: this.streams.size,
			activeSinks: Array.from(this.streams.values()).filter((s) => s.iterator)
				.length,
			cachedFrames: Array.from(this.streams.values()).filter((s) => s.current)
				.length,
		};
	}
}

export const videoCache = new VideoCache();
