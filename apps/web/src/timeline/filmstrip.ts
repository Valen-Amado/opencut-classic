const DEFAULT_SOURCE_ASPECT_RATIO = 16 / 9;
/** Keep the last requested frame slightly inside the source so decoders always return one. */
const SOURCE_END_GUARD_SEC = 0.05;
/** Candidate thumbnail time steps, all multiples of 0.1 s so cache keys line up across zoom levels. */
const THUMBNAIL_TIME_STEPS_SEC = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60];

export interface FilmstripTile {
	index: number;
	leftPx: number;
	widthPx: number;
	sourceTimeSec: number;
}

export function getSourceAspectRatio({
	width,
	height,
}: {
	width?: number;
	height?: number;
}): number {
	if (!width || !height || width <= 0 || height <= 0) {
		return DEFAULT_SOURCE_ASPECT_RATIO;
	}
	return width / height;
}

export function getFilmstripTileWidth({
	trackHeight,
	aspectRatio,
}: {
	trackHeight: number;
	aspectRatio: number;
}): number {
	return Math.max(1, Math.round(trackHeight * aspectRatio));
}

/**
 * Picks how finely thumbnail times are quantized. When one tile spans many
 * source seconds (zoomed out) nearby tiles can share coarser frames; when zoomed
 * in the step drops to 0.1 s.
 */
export function getThumbnailTimeStep({
	sourceSecondsPerTile,
}: {
	sourceSecondsPerTile: number;
}): number {
	const target = sourceSecondsPerTile / 2;
	let step = THUMBNAIL_TIME_STEPS_SEC[0];
	for (const candidate of THUMBNAIL_TIME_STEPS_SEC) {
		if (candidate <= target) {
			step = candidate;
		}
	}
	return step;
}

export function quantizeThumbnailTime({
	time,
	step,
}: {
	time: number;
	step: number;
}): number {
	if (!Number.isFinite(time) || time <= 0) {
		return 0;
	}
	const quantized = Math.round(time / step) * step;
	// Round to tenths to strip floating point noise (0.30000000000000004).
	return Math.round(quantized * 10) / 10;
}

export function clampSourceTime({
	time,
	sourceDurationSec,
}: {
	time: number;
	sourceDurationSec?: number;
}): number {
	const lowerBounded = Math.max(0, time);
	if (sourceDurationSec === undefined || !(sourceDurationSec > 0)) {
		return lowerBounded;
	}
	return Math.min(
		lowerBounded,
		Math.max(0, sourceDurationSec - SOURCE_END_GUARD_SEC),
	);
}

/**
 * Source time shown by a tile starting `offsetPx` pixels into the clip:
 * trimStart + (offset / pixelsPerSecond) * playbackRate, clamped to the source.
 */
export function getSourceTimeAtClipOffset({
	offsetPx,
	pixelsPerSecond,
	trimStartSec,
	playbackRate,
	sourceDurationSec,
}: {
	offsetPx: number;
	pixelsPerSecond: number;
	trimStartSec: number;
	playbackRate: number;
	sourceDurationSec?: number;
}): number {
	const clipTime = pixelsPerSecond > 0 ? offsetPx / pixelsPerSecond : 0;
	return clampSourceTime({
		time: trimStartSec + clipTime * playbackRate,
		sourceDurationSec,
	});
}

/**
 * Lays out the filmstrip tiles that intersect the visible pixel range of a clip
 * (plus `overscanTiles` on each side), each with the quantized source time
 * whose frame it should show.
 */
export function getFilmstripTiles({
	clipWidthPx,
	tileWidthPx,
	pixelsPerSecond,
	trimStartSec,
	playbackRate,
	sourceDurationSec,
	visibleStartPx = 0,
	visibleEndPx = clipWidthPx,
	overscanTiles = 1,
}: {
	clipWidthPx: number;
	tileWidthPx: number;
	pixelsPerSecond: number;
	trimStartSec: number;
	playbackRate: number;
	sourceDurationSec?: number;
	visibleStartPx?: number;
	visibleEndPx?: number;
	overscanTiles?: number;
}): FilmstripTile[] {
	if (clipWidthPx <= 0 || tileWidthPx <= 0 || pixelsPerSecond <= 0) {
		return [];
	}

	const tileCount = Math.ceil(clipWidthPx / tileWidthPx);
	const start = Math.max(0, Math.min(visibleStartPx, clipWidthPx));
	const end = Math.max(start, Math.min(visibleEndPx, clipWidthPx));
	if (end <= start) {
		return [];
	}

	const firstIndex = Math.max(
		0,
		Math.floor(start / tileWidthPx) - overscanTiles,
	);
	const lastIndex = Math.min(
		tileCount - 1,
		Math.ceil(end / tileWidthPx) - 1 + overscanTiles,
	);
	const step = getThumbnailTimeStep({
		sourceSecondsPerTile: (tileWidthPx / pixelsPerSecond) * playbackRate,
	});

	const tiles: FilmstripTile[] = [];
	for (let index = firstIndex; index <= lastIndex; index++) {
		const leftPx = index * tileWidthPx;
		const rawTime = getSourceTimeAtClipOffset({
			offsetPx: leftPx,
			pixelsPerSecond,
			trimStartSec,
			playbackRate,
			sourceDurationSec,
		});
		tiles.push({
			index,
			leftPx,
			widthPx: Math.min(tileWidthPx, clipWidthPx - leftPx),
			sourceTimeSec: clampSourceTime({
				time: quantizeThumbnailTime({ time: rawTime, step }),
				sourceDurationSec,
			}),
		});
	}
	return tiles;
}
