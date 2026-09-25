import { describe, expect, test } from "bun:test";
import { offsetChannelValues } from "@/animation/offset-channel";
import type { AnimationChannel } from "@/animation/types";
import type { MediaTime } from "@/wasm";

const slide: AnimationChannel = {
	keys: [
		{ id: "a", time: 0 as MediaTime, value: -200, segmentToNext: "bezier", tangentMode: "auto", rightHandle: { dt: 10 as MediaTime, dv: 40 } },
		{ id: "b", time: 120000 as MediaTime, value: 0, segmentToNext: "linear", tangentMode: "auto" },
	],
};

describe("offsetChannelValues", () => {
	test("moves every keyframe by the delta and keeps relative handles", () => {
		const moved = offsetChannelValues({ channel: slide, delta: 50 });
		expect(moved?.keys.map((key) => key.value)).toEqual([-150, 50]);
		expect(moved?.keys[0]).toMatchObject({ rightHandle: { dt: 10, dv: 40 } });
	});

	test("is a no-op without a channel or delta", () => {
		expect(offsetChannelValues({ channel: undefined, delta: 5 })).toBeUndefined();
		expect(offsetChannelValues({ channel: slide, delta: 0 })).toBe(slide);
	});

	test("ignores discrete channels", () => {
		const discrete: AnimationChannel = { keys: [{ id: "c", time: 0 as MediaTime, value: "on" }] };
		expect(offsetChannelValues({ channel: discrete, delta: 5 })).toBe(discrete);
	});
});
