import { describe, expect, test } from "bun:test";
import type {
	ImageElement,
	SceneTracks,
	VideoElement,
	VideoTrack,
} from "@/timeline";
import {
	findFrameSourceAtTime,
	getKeyboardSeekTime,
	getProgressRatio,
	getSeekRatioAtPointer,
	getTooltipLeft,
} from "@/preview/seek-bar";
import { mediaTime, TICKS_PER_SECOND, ZERO_MEDIA_TIME } from "@/wasm";

const seconds = (value: number) =>
	mediaTime({ ticks: Math.round(value * TICKS_PER_SECOND) });

function buildVideo({
	id,
	start,
	duration,
	trimStart = 0,
	rate,
	hidden,
}: {
	id: string;
	start: number;
	duration: number;
	trimStart?: number;
	rate?: number;
	hidden?: boolean;
}): VideoElement {
	return {
		id,
		type: "video",
		name: id,
		mediaId: `media-${id}`,
		startTime: seconds(start),
		duration: seconds(duration),
		trimStart: seconds(trimStart),
		trimEnd: ZERO_MEDIA_TIME,
		params: {},
		...(rate !== undefined ? { retime: { rate } } : {}),
		...(hidden !== undefined ? { hidden } : {}),
	};
}

function buildImage({
	id,
	start,
	duration,
}: {
	id: string;
	start: number;
	duration: number;
}): ImageElement {
	return {
		id,
		type: "image",
		name: id,
		mediaId: `media-${id}`,
		startTime: seconds(start),
		duration: seconds(duration),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		params: {},
	};
}

function buildTrack({
	id,
	elements,
	hidden = false,
}: {
	id: string;
	elements: (VideoElement | ImageElement)[];
	hidden?: boolean;
}): VideoTrack {
	return { id, name: id, type: "video", elements, muted: false, hidden };
}

function buildTracks({
	overlay = [],
	main,
}: {
	overlay?: VideoTrack[];
	main: VideoTrack;
}): SceneTracks {
	return { overlay, main, audio: [] };
}

describe("getSeekRatioAtPointer", () => {
	test("maps the pointer onto the track and clamps", () => {
		const track = { trackLeft: 100, trackWidth: 400 };
		expect(getSeekRatioAtPointer({ clientX: 300, ...track })).toBe(0.5);
		expect(getSeekRatioAtPointer({ clientX: 0, ...track })).toBe(0);
		expect(getSeekRatioAtPointer({ clientX: 900, ...track })).toBe(1);
		expect(
			getSeekRatioAtPointer({ clientX: 10, trackLeft: 0, trackWidth: 0 }),
		).toBe(0);
	});
});

describe("getProgressRatio", () => {
	test("is time over duration, clamped", () => {
		expect(getProgressRatio({ time: 25, duration: 100 })).toBe(0.25);
		expect(getProgressRatio({ time: 250, duration: 100 })).toBe(1);
		expect(getProgressRatio({ time: 5, duration: 0 })).toBe(0);
	});
});

describe("getKeyboardSeekTime", () => {
	const duration = 10 * TICKS_PER_SECOND;

	test("steps one second with arrows and five with shift", () => {
		const currentTime = 4 * TICKS_PER_SECOND;
		expect(
			getKeyboardSeekTime({
				key: "ArrowRight",
				shiftKey: false,
				currentTime,
				duration,
			}),
		).toBe(5 * TICKS_PER_SECOND);
		expect(
			getKeyboardSeekTime({
				key: "ArrowLeft",
				shiftKey: true,
				currentTime,
				duration,
			}),
		).toBe(0);
	});

	test("clamps to the timeline and ignores other keys", () => {
		expect(
			getKeyboardSeekTime({
				key: "ArrowRight",
				shiftKey: true,
				currentTime: 8 * TICKS_PER_SECOND,
				duration,
			}),
		).toBe(duration);
		expect(
			getKeyboardSeekTime({
				key: "Enter",
				shiftKey: false,
				currentTime: 0,
				duration,
			}),
		).toBeNull();
	});
});

describe("getTooltipLeft", () => {
	test("keeps the tooltip inside the bar", () => {
		const base = { containerWidth: 1000, halfTooltipWidth: 90 };
		expect(getTooltipLeft({ pointerX: 10, ...base })).toBe(90);
		expect(getTooltipLeft({ pointerX: 500, ...base })).toBe(500);
		expect(getTooltipLeft({ pointerX: 990, ...base })).toBe(910);
	});
});

describe("findFrameSourceAtTime", () => {
	test("resolves the source time of the video under the playhead", () => {
		const tracks = buildTracks({
			main: buildTrack({
				id: "main",
				elements: [buildVideo({ id: "a", start: 2, duration: 4, trimStart: 1, rate: 2 })],
			}),
		});
		const source = findFrameSourceAtTime({
			tracks,
			time: 3 * TICKS_PER_SECOND,
		});
		expect(source?.kind).toBe("video");
		if (source?.kind !== "video") return;
		expect(source.mediaId).toBe("media-a");
		// trim 1 s + (3 - 2) s * 2x
		expect(source.sourceTimeSec).toBeCloseTo(3);
	});

	test("prefers the top-most visible video over images and lower tracks", () => {
		const tracks = buildTracks({
			overlay: [
				buildTrack({
					id: "hidden",
					hidden: true,
					elements: [buildVideo({ id: "h", start: 0, duration: 10 })],
				}),
				buildTrack({
					id: "top",
					elements: [buildImage({ id: "img", start: 0, duration: 10 })],
				}),
				buildTrack({
					id: "mid",
					elements: [buildVideo({ id: "mid", start: 0, duration: 10 })],
				}),
			],
			main: buildTrack({
				id: "main",
				elements: [buildVideo({ id: "main", start: 0, duration: 10 })],
			}),
		});
		const source = findFrameSourceAtTime({
			tracks,
			time: 5 * TICKS_PER_SECOND,
		});
		expect(source).toEqual({
			kind: "video",
			mediaId: "media-mid",
			sourceTimeSec: 5,
		});
	});

	test("falls back to an image and to null when nothing is visible", () => {
		const tracks = buildTracks({
			main: buildTrack({
				id: "main",
				elements: [
					buildImage({ id: "img", start: 0, duration: 2 }),
					buildVideo({ id: "v", start: 4, duration: 2, hidden: true }),
				],
			}),
		});
		expect(
			findFrameSourceAtTime({ tracks, time: TICKS_PER_SECOND }),
		).toEqual({ kind: "image", mediaId: "media-img" });
		expect(
			findFrameSourceAtTime({ tracks, time: 5 * TICKS_PER_SECOND }),
		).toBeNull();
	});

	test("clamps to the source duration", () => {
		const tracks = buildTracks({
			main: buildTrack({
				id: "main",
				elements: [buildVideo({ id: "a", start: 0, duration: 10, rate: 3 })],
			}),
		});
		const source = findFrameSourceAtTime({
			tracks,
			time: 9 * TICKS_PER_SECOND,
			sourceDurations: new Map([["media-a", 12]]),
		});
		expect(source?.kind === "video" && source.sourceTimeSec).toBeCloseTo(
			11.95,
		);
	});
});
