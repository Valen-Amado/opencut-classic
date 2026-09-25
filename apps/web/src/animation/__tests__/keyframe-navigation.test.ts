import { describe, expect, test } from "bun:test";
import { getAdjacentKeyframeTimes, getUniqueKeyframeTimes } from "../keyframe-navigation";

describe("keyframe navigation", () => {
	test("dedupes and sorts keyframe times", () => {
		expect(getUniqueKeyframeTimes({ keyframes: [{ time: 30 }, { time: 10 }, { time: 30 }] })).toEqual([10, 30]);
	});

	test("finds the previous and next keyframes around the playhead", () => {
		expect(getAdjacentKeyframeTimes({ times: [0, 10, 20], current: 15 })).toEqual({ previous: 10, next: 20, atCurrent: false });
		expect(getAdjacentKeyframeTimes({ times: [0, 10, 20], current: 10 })).toEqual({ previous: 0, next: 20, atCurrent: true });
		expect(getAdjacentKeyframeTimes({ times: [0, 10], current: 0 })).toEqual({ previous: null, next: 10, atCurrent: true });
		expect(getAdjacentKeyframeTimes({ times: [], current: 5 })).toEqual({ previous: null, next: null, atCurrent: false });
	});
});
