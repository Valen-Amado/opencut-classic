import { describe, expect, test } from "bun:test";
import { getTimelinePixelsPerSecond } from "@/timeline/pixel-utils";
import { getSkimTime } from "@/timeline/skim";
import { TICKS_PER_SECOND } from "@/wasm";

const ticksPerFrame = TICKS_PER_SECOND / 30;

describe("getSkimTime", () => {
	test("maps the pointer to the frame under it", () => {
		const pps = getTimelinePixelsPerSecond({ zoomLevel: 1 });
		expect(Number(getSkimTime({ offsetX: pps * 2, zoomLevel: 1, ticksPerFrame, duration: TICKS_PER_SECOND * 10 }))).toBe(TICKS_PER_SECOND * 2);
	});

	test("clamps to the timeline", () => {
		expect(Number(getSkimTime({ offsetX: -40, zoomLevel: 1, ticksPerFrame, duration: 1000 }))).toBe(0);
		expect(Number(getSkimTime({ offsetX: 1e7, zoomLevel: 1, ticksPerFrame, duration: TICKS_PER_SECOND }))).toBe(TICKS_PER_SECOND);
	});
});
