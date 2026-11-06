import { describe, expect, test } from "bun:test";
import { snapToKeyframeTime } from "@/animation/keyframe-navigation";
import { resolveElementPlayhead } from "@/components/editor/panels/properties/param-write";
import { buildParamWritePatch } from "@/components/editor/panels/properties/param-write";
import { getElementKeyframes } from "@/animation/keyframe-query";
import type { TimelineElement } from "@/timeline";
import { mediaTime } from "@/wasm";

const fps = { numerator: 60, denominator: 1 };
const FRAME = 2000;

describe("snapToKeyframeTime", () => {
	test("lands on a keyframe inside the playhead's frame", () => {
		expect(snapToKeyframeTime({ time: 1132400, times: [1132000], fps })).toBe(1132000);
	});

	test("leaves the time alone when the keyframe belongs to another frame", () => {
		expect(snapToKeyframeTime({ time: 10000, times: [10000 + FRAME], fps })).toBe(10000);
		expect(snapToKeyframeTime({ time: 10000, times: [10000 - 1100], fps })).toBe(10000);
	});

	test("prefers the closest keyframe", () => {
		expect(snapToKeyframeTime({ time: 10000, times: [9400, 10000, 10500], fps })).toBe(10000);
		expect(snapToKeyframeTime({ time: 10000, times: [9400, 10300], fps })).toBe(10300);
	});
});

describe("editing with the playhead on an off-frame keyframe", () => {
	test("changes that keyframe instead of adding one next to it", () => {
		// Real case: a clip starting at 1027600 with a key at 1132000 sits at
		// 2159600 on the timeline, while the playhead can only reach 2160000.
		const startTime = mediaTime({ ticks: 1027600 });
		const key = (value: number) => ({
			value: {
				keys: [{ id: "k", time: 1132000, value, segmentToNext: "linear" }],
			},
		});
		const element = {
			id: "image",
			type: "image",
			startTime,
			duration: mediaTime({ ticks: 10_000_000 }),
			params: { "transform.positionX": 0 },
			animations: { "transform.positionX": key(219) },
		} as unknown as TimelineElement;

		const { localTime } = resolveElementPlayhead({
			startTime,
			duration: element.duration,
			playheadTime: mediaTime({ ticks: 2160000 }),
			animations: element.animations,
			fps,
		});
		expect(Number(localTime)).toBe(1132000);

		const { animations } = buildParamWritePatch({
			element,
			values: { "transform.positionX": 300 },
			localTime,
		});
		const keyframes = getElementKeyframes({ animations });
		expect(keyframes.map(({ time, value }) => [time, value])).toEqual([[1132000, 300]]);
	});
});
