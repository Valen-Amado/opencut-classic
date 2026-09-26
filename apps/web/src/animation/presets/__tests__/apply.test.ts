import { describe, expect, test } from "bun:test";
import { mediaTime } from "@/wasm";
import { applyAnimationPreset, splitAnimationPresets } from "../apply";

const fade = { presetId: "fade", duration: mediaTime({ ticks: 300 }) };
const spin = { presetId: "spin", duration: mediaTime({ ticks: 400 }) };

describe("applyAnimationPreset", () => {
	test("stores only the preset id and duration", () => {
		const result = applyAnimationPreset({
			animationPresets: undefined,
			slot: "in",
			presetId: "rise",
			durationTicks: 250,
			elementDuration: 1000,
		});
		expect(result).toEqual({ in: { presetId: "rise", duration: mediaTime({ ticks: 250 }) } });
	});

	test("replaces or clears one slot and keeps the others", () => {
		const current = { in: fade, loop: spin };
		expect(
			applyAnimationPreset({
				animationPresets: current,
				slot: "in",
				presetId: "none",
				durationTicks: 300,
				elementDuration: 1000,
			}),
		).toEqual({ loop: spin });
		expect(
			applyAnimationPreset({
				animationPresets: current,
				slot: "loop",
				presetId: "pulse",
				durationTicks: 500,
				elementDuration: 1000,
			}),
		).toEqual({ in: fade, loop: { presetId: "pulse", duration: mediaTime({ ticks: 500 }) } });
	});

	test("clamps entrance and exit so they fit together", () => {
		const result = applyAnimationPreset({
			animationPresets: { in: fade },
			slot: "out",
			presetId: "fade",
			durationTicks: 900,
			elementDuration: 1001,
		});
		expect(result.out?.duration).toBe(mediaTime({ ticks: 500 }));
	});
});

describe("splitAnimationPresets", () => {
	test("left keeps the entrance, right keeps the exit, both keep the loop", () => {
		const exit = { presetId: "slide-up", duration: mediaTime({ ticks: 200 }) };
		expect(splitAnimationPresets({ animationPresets: { in: fade, out: exit, loop: spin } })).toEqual({
			left: { in: fade, loop: spin },
			right: { out: exit, loop: spin },
		});
	});

	test("elements without presets stay without presets", () => {
		expect(splitAnimationPresets({ animationPresets: undefined })).toEqual({
			left: undefined,
			right: undefined,
		});
	});
});
