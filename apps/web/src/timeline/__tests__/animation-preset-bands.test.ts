import { describe, expect, test } from "bun:test";
import { TICKS_PER_SECOND, mediaTime } from "@/wasm";
import {
	formatPresetSeconds,
	getAnimationPresetBands,
	parseAnimationPresetSlot,
} from "../animation-preset-bands";

const seconds = (value: number) => mediaTime({ ticks: Math.round(value * TICKS_PER_SECOND) });

describe("getAnimationPresetBands", () => {
	test("entrance, exit and loop bands with Spanish tooltips", () => {
		const bands = getAnimationPresetBands({
			animationPresets: {
				in: { presetId: "fade", duration: seconds(0.6) },
				out: { presetId: "slide-up", duration: seconds(1) },
				loop: { presetId: "spin", duration: seconds(2) },
			},
			elementDuration: seconds(4),
		});
		expect(bands).toEqual([
			{ slot: "in", widthPercent: 15, tooltip: "Entrada: Aparecer · 0,6 s" },
			{ slot: "out", widthPercent: 25, tooltip: "Salida: Hacia abajo · 1,0 s" },
			{ slot: "loop", widthPercent: 100, tooltip: "Bucle: Girar · 2,0 s" },
		]);
	});

	test("bands shrink with the clip: half each when both exist", () => {
		const bands = getAnimationPresetBands({
			animationPresets: {
				in: { presetId: "fade", duration: seconds(3) },
				out: { presetId: "fade", duration: seconds(3) },
			},
			elementDuration: seconds(2),
		});
		expect(bands.map((band) => band.widthPercent)).toEqual([50, 50]);
		expect(bands[0].tooltip).toBe("Entrada: Aparecer · 1,0 s");
	});

	test("no presets, no bands", () => {
		expect(getAnimationPresetBands({ animationPresets: undefined, elementDuration: 100 })).toEqual([]);
	});
});

describe("helpers", () => {
	test("formats seconds with a decimal comma", () => {
		expect(formatPresetSeconds({ ticks: seconds(0.25) })).toBe("0,3 s");
	});

	test("parses slot names", () => {
		expect(parseAnimationPresetSlot({ value: "out" })).toBe("out");
		expect(parseAnimationPresetSlot({ value: "sideways" })).toBeNull();
		expect(parseAnimationPresetSlot({ value: null })).toBeNull();
	});
});
