import { describe, expect, test } from "bun:test";
import type { ElementAnimationPresets } from "@/timeline/types";
import { mediaTime } from "@/wasm";
import {
	DEFAULT_PRESET_VALUES,
	evaluatePresetTrack,
	getEffectivePresetDuration,
	layerPresetsOnOpacity,
	layerPresetsOnTransform,
	resolveAnimationPresetValues,
	type PresetValues,
} from "../resolve";

const CANVAS = { width: 1920, height: 1080 };
const DURATION = 1000;
const VALUES: PresetValues = { ...DEFAULT_PRESET_VALUES, positionY: 100 };

function preset({ presetId, ticks }: { presetId: string; ticks: number }) {
	return { presetId, duration: mediaTime({ ticks }) };
}

function resolveAt({
	animationPresets,
	localTime,
	values = VALUES,
}: {
	animationPresets: ElementAnimationPresets;
	localTime: number;
	values?: PresetValues;
}): PresetValues {
	return resolveAnimationPresetValues({
		animationPresets,
		localTime,
		duration: DURATION,
		canvas: CANVAS,
		values,
	});
}

describe("evaluatePresetTrack", () => {
	test("interpolates between points and holds the ends", () => {
		const points = [
			[0, 0],
			[1, 10],
		] as const;
		expect(evaluatePresetTrack({ points, progress: -1, ease: "linear" })).toBe(0);
		expect(evaluatePresetTrack({ points, progress: 0.25, ease: "linear" })).toBeCloseTo(2.5);
		expect(evaluatePresetTrack({ points, progress: 2, ease: "linear" })).toBe(10);
	});

	test("a point's own ease wins over the track ease", () => {
		const points = [
			[0, 0, "linear"],
			[1, 10],
		] as const;
		expect(evaluatePresetTrack({ points, progress: 0.5, ease: "ease-out" })).toBeCloseTo(5);
		expect(
			evaluatePresetTrack({ points: [[0, 0], [1, 10]], progress: 0.5, ease: "ease-out" }),
		).toBeGreaterThan(5);
	});
});

describe("resolveAnimationPresetValues", () => {
	test("an entrance goes from its start value to the resolved value", () => {
		const presets = { in: preset({ presetId: "fade", ticks: 300 }) };
		expect(resolveAt({ animationPresets: presets, localTime: 0 }).opacity).toBe(0);
		const middle = resolveAt({ animationPresets: presets, localTime: 150 }).opacity;
		expect(middle).toBeGreaterThan(0.5);
		expect(middle).toBeLessThan(1);
		expect(resolveAt({ animationPresets: presets, localTime: 300 })).toEqual(VALUES);
		expect(resolveAt({ animationPresets: presets, localTime: 800 })).toEqual(VALUES);
	});

	test("presets are relative to the resolved values, so manual keyframes combine", () => {
		const presets = { in: preset({ presetId: "rise", ticks: 300 }) };
		const values = { ...VALUES, positionY: 400, opacity: 0.5 };
		const start = resolveAt({ animationPresets: presets, localTime: 0, values });
		expect(start.positionY).toBe(460);
		expect(start.opacity).toBe(0);
		const almostDone = resolveAt({ animationPresets: presets, localTime: 299, values });
		expect(almostDone.positionY).toBeCloseTo(400, 0);
		expect(almostDone.opacity).toBeCloseTo(0.5, 2);
	});

	test("an exit is the entrance curve played backwards up to the clip end", () => {
		const entrance = { in: preset({ presetId: "slide-up", ticks: 300 }) };
		const exit = { out: preset({ presetId: "slide-up", ticks: 300 }) };
		expect(resolveAt({ animationPresets: exit, localTime: 700 })).toEqual(VALUES);
		expect(resolveAt({ animationPresets: exit, localTime: 1000 }).positionY).toBeCloseTo(
			100 + 1080 * 0.15,
		);
		for (const offset of [20, 90, 150, 260]) {
			const incoming = resolveAt({ animationPresets: entrance, localTime: offset });
			const outgoing = resolveAt({ animationPresets: exit, localTime: DURATION - offset });
			expect(outgoing.positionY).toBeCloseTo(incoming.positionY);
			expect(outgoing.opacity).toBeCloseTo(incoming.opacity);
		}
	});

	test("an exit-less preset in the out slot does nothing", () => {
		const presets = { out: preset({ presetId: "bounce-drop", ticks: 300 }) };
		expect(resolveAt({ animationPresets: presets, localTime: 900 })).toEqual(VALUES);
	});

	test("a loop repeats every cycle and accumulates spins", () => {
		const presets = { loop: preset({ presetId: "spin", ticks: 400 }) };
		expect(resolveAt({ animationPresets: presets, localTime: 0 }).rotate).toBe(0);
		expect(resolveAt({ animationPresets: presets, localTime: 200 }).rotate).toBeCloseTo(180);
		expect(resolveAt({ animationPresets: presets, localTime: 600 }).rotate).toBeCloseTo(540);
		expect(resolveAt({ animationPresets: presets, localTime: 800 }).rotate).toBeCloseTo(720);
	});

	test("a loop cycle is periodic for non-cumulative presets", () => {
		const presets = { loop: preset({ presetId: "float", ticks: 400 }) };
		const first = resolveAt({ animationPresets: presets, localTime: 100 }).positionY;
		const second = resolveAt({ animationPresets: presets, localTime: 500 }).positionY;
		expect(second).toBeCloseTo(first);
		expect(resolveAt({ animationPresets: presets, localTime: 200 }).positionY).toBeCloseTo(76);
	});

	test("entrance and exit win over the loop on the same value", () => {
		const presets = {
			loop: preset({ presetId: "blink", ticks: 400 }),
			in: preset({ presetId: "fade", ticks: 300 }),
		};
		expect(resolveAt({ animationPresets: presets, localTime: 0 }).opacity).toBe(0);
		expect(resolveAt({ animationPresets: presets, localTime: 600 }).opacity).toBeCloseTo(0.25);
	});

	test("text reveal presets drive the reveal percentage", () => {
		const presets = {
			in: preset({ presetId: "typewriter", ticks: 400 }),
			out: preset({ presetId: "word-by-word", ticks: 400 }),
		};
		expect(resolveAt({ animationPresets: presets, localTime: 100 }).revealCharacters).toBeCloseTo(25);
		expect(resolveAt({ animationPresets: presets, localTime: 900 }).revealWords).toBeCloseTo(25);
	});

	test("unknown presets leave the values untouched", () => {
		const presets = { in: preset({ presetId: "nope", ticks: 300 }) };
		expect(resolveAt({ animationPresets: presets, localTime: 10 })).toEqual(VALUES);
	});
});

describe("getEffectivePresetDuration", () => {
	test("entrances and exits are clamped to the clip, and to half with both", () => {
		const only = { in: preset({ presetId: "fade", ticks: 2000 }) };
		expect(getEffectivePresetDuration({ animationPresets: only, slot: "in", elementDuration: 1000 })).toBe(1000);
		const both = {
			in: preset({ presetId: "fade", ticks: 900 }),
			out: preset({ presetId: "fade", ticks: 900 }),
		};
		expect(getEffectivePresetDuration({ animationPresets: both, slot: "in", elementDuration: 1000 })).toBe(500);
		expect(getEffectivePresetDuration({ animationPresets: both, slot: "out", elementDuration: 1000 })).toBe(500);
		expect(getEffectivePresetDuration({ animationPresets: both, slot: "loop", elementDuration: 1000 })).toBe(0);
	});

	test("the clamp applies at resolve time after a trim", () => {
		const presets = {
			in: preset({ presetId: "fade", ticks: 900 }),
			out: preset({ presetId: "fade", ticks: 900 }),
		};
		// With the entrance clamped to 500 ticks, 250 is its midpoint.
		const atQuarter = resolveAt({ animationPresets: presets, localTime: 250 }).opacity;
		const reference = resolveAt({
			animationPresets: { in: preset({ presetId: "fade", ticks: 500 }) },
			localTime: 250,
		}).opacity;
		expect(atQuarter).toBeCloseTo(reference);
		expect(resolveAt({ animationPresets: presets, localTime: 500 }).opacity).toBe(1);
	});
});

describe("layer helpers", () => {
	const transform = { position: { x: 10, y: 20 }, scaleX: 2, scaleY: 2, rotate: 5 };

	test("without presets the transform is returned as-is", () => {
		const result = layerPresetsOnTransform({
			transform,
			localTime: 0,
			presets: { animationPresets: undefined, duration: DURATION, canvas: CANVAS },
		});
		expect(result).toBe(transform);
	});

	test("scale presets multiply the resolved scale", () => {
		const result = layerPresetsOnTransform({
			transform,
			localTime: 0,
			presets: {
				animationPresets: { in: preset({ presetId: "zoom-in", ticks: 300 }) },
				duration: DURATION,
				canvas: CANVAS,
			},
		});
		expect(result.scaleX).toBeCloseTo(1.2);
		expect(result.position).toEqual({ x: 10, y: 20 });
		expect(result.rotate).toBe(5);
	});

	test("opacity layering", () => {
		const presets = {
			animationPresets: { out: preset({ presetId: "fade", ticks: 300 }) },
			duration: DURATION,
			canvas: CANVAS,
		};
		expect(layerPresetsOnOpacity({ opacity: 0.8, localTime: 100, presets })).toBe(0.8);
		expect(layerPresetsOnOpacity({ opacity: 0.8, localTime: 1000, presets })).toBe(0);
	});
});
