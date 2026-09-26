import { describe, expect, test } from "bun:test";
import {
	clampSourceTime,
	getFilmstripTileWidth,
	getFilmstripTiles,
	getSourceAspectRatio,
	getSourceTimeAtClipOffset,
	getThumbnailTimeStep,
	quantizeThumbnailTime,
} from "@/timeline/filmstrip";

describe("getSourceAspectRatio", () => {
	test("uses the media dimensions", () => {
		expect(getSourceAspectRatio({ width: 1080, height: 1920 })).toBeCloseTo(
			0.5625,
		);
	});

	test("falls back to 16:9 without dimensions", () => {
		expect(getSourceAspectRatio({})).toBeCloseTo(16 / 9);
		expect(getSourceAspectRatio({ width: 100, height: 0 })).toBeCloseTo(
			16 / 9,
		);
	});
});

describe("getFilmstripTileWidth", () => {
	test("is track height times aspect", () => {
		expect(getFilmstripTileWidth({ trackHeight: 45, aspectRatio: 16 / 9 })).toBe(
			80,
		);
		expect(
			getFilmstripTileWidth({ trackHeight: 64, aspectRatio: 9 / 16 }),
		).toBe(36);
	});
});

describe("getThumbnailTimeStep", () => {
	test("is 0.1 s when zoomed in", () => {
		expect(getThumbnailTimeStep({ sourceSecondsPerTile: 0.05 })).toBe(0.1);
		expect(getThumbnailTimeStep({ sourceSecondsPerTile: 0.3 })).toBe(0.1);
	});

	test("gets coarser when zoomed out", () => {
		expect(getThumbnailTimeStep({ sourceSecondsPerTile: 2 })).toBe(1);
		expect(getThumbnailTimeStep({ sourceSecondsPerTile: 30 })).toBe(15);
		expect(getThumbnailTimeStep({ sourceSecondsPerTile: 1000 })).toBe(60);
	});
});

describe("quantizeThumbnailTime", () => {
	test("rounds to the step without float noise", () => {
		expect(quantizeThumbnailTime({ time: 0.34, step: 0.1 })).toBe(0.3);
		expect(quantizeThumbnailTime({ time: 7.4, step: 5 })).toBe(5);
		expect(quantizeThumbnailTime({ time: 7.6, step: 5 })).toBe(10);
	});

	test("never goes negative", () => {
		expect(quantizeThumbnailTime({ time: -3, step: 0.1 })).toBe(0);
		expect(quantizeThumbnailTime({ time: Number.NaN, step: 0.1 })).toBe(0);
	});
});

describe("clampSourceTime", () => {
	test("keeps times inside the source", () => {
		expect(clampSourceTime({ time: 12, sourceDurationSec: 10 })).toBeCloseTo(
			9.95,
		);
		expect(clampSourceTime({ time: -1, sourceDurationSec: 10 })).toBe(0);
		expect(clampSourceTime({ time: 12 })).toBe(12);
	});
});

describe("getSourceTimeAtClipOffset", () => {
	test("applies trim and playback speed", () => {
		expect(
			getSourceTimeAtClipOffset({
				offsetPx: 100,
				pixelsPerSecond: 50,
				trimStartSec: 1,
				playbackRate: 2,
			}),
		).toBe(5);
	});

	test("clamps to the source duration", () => {
		expect(
			getSourceTimeAtClipOffset({
				offsetPx: 1000,
				pixelsPerSecond: 50,
				trimStartSec: 0,
				playbackRate: 1,
				sourceDurationSec: 8,
			}),
		).toBeCloseTo(7.95);
	});
});

describe("getFilmstripTiles", () => {
	const base = {
		clipWidthPx: 400,
		tileWidthPx: 80,
		pixelsPerSecond: 100,
		trimStartSec: 2,
		playbackRate: 1,
		sourceDurationSec: 60,
	};

	test("gives each tile the frame where it starts on the clip", () => {
		const tiles = getFilmstripTiles(base);
		expect(tiles.map((tile) => tile.leftPx)).toEqual([0, 80, 160, 240, 320]);
		// 0.8 s of source per tile -> 0.2 s step (target 0.4 s rounds down to 0.2).
		expect(tiles.map((tile) => tile.sourceTimeSec)).toEqual([
			2, 2.8, 3.6, 4.4, 5.2,
		]);
	});

	test("respects playback speed", () => {
		const tiles = getFilmstripTiles({ ...base, playbackRate: 2 });
		expect(tiles.map((tile) => tile.sourceTimeSec)).toEqual([
			2, 3.5, 5, 7, 8.5,
		]);
	});

	test("clips the last tile to the clip width", () => {
		const tiles = getFilmstripTiles({ ...base, clipWidthPx: 200 });
		expect(tiles.map((tile) => tile.widthPx)).toEqual([80, 80, 40]);
	});

	test("only returns visible tiles plus overscan", () => {
		const tiles = getFilmstripTiles({
			...base,
			clipWidthPx: 8000,
			visibleStartPx: 1000,
			visibleEndPx: 1300,
			overscanTiles: 1,
		});
		expect(tiles.map((tile) => tile.index)).toEqual([11, 12, 13, 14, 15, 16, 17]);
	});

	test("returns nothing when the clip is off screen", () => {
		expect(
			getFilmstripTiles({ ...base, visibleStartPx: 500, visibleEndPx: 900 }),
		).toEqual([]);
	});

	test("clamps tiles past the end of the source", () => {
		const tiles = getFilmstripTiles({ ...base, sourceDurationSec: 3 });
		expect(tiles.at(-1)?.sourceTimeSec).toBeCloseTo(2.95);
	});
});
