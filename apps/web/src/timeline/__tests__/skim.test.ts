import { describe, expect, test } from "bun:test";
import { getTimelinePixelsPerSecond } from "@/timeline/pixel-utils";
import { getSkimTime } from "@/timeline/skim";
import { mediaTime, snapSeekMediaTime, TICKS_PER_SECOND } from "@/wasm";

const fps = { numerator: 30, denominator: 1 };
const duration = mediaTime({ ticks: TICKS_PER_SECOND * 10 });

describe("getSkimTime", () => {
	test("matches the frame a click at the same spot seeks to", () => {
		const pps = getTimelinePixelsPerSecond({ zoomLevel: 1 });
		for (const seconds of [0.5, 0.55, 1.26, 2.49]) {
			const expected = snapSeekMediaTime({
				time: mediaTime({ ticks: Math.round(seconds * TICKS_PER_SECOND) }),
				duration,
				fps,
			});
			expect(Number(getSkimTime({ offsetX: pps * seconds, zoomLevel: 1, fps, duration }))).toBe(Number(expected));
		}
	});

	test("clamps to the timeline", () => {
		expect(Number(getSkimTime({ offsetX: -40, zoomLevel: 1, fps, duration }))).toBe(0);
	});
});
