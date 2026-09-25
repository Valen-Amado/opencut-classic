import { describe, expect, test } from "bun:test";
import {
	buildPresetKeyframes,
	clampPresetTicks,
	listAnimationPresets,
	type PresetBase,
} from "../catalog";

const BASE: PresetBase = { opacity: 1, positionX: 0, positionY: 100, scaleX: 1, scaleY: 1, rotate: 0, letterSpacing: 0 };
const CANVAS = { width: 1920, height: 1080 };
const common = { base: BASE, canvas: CANVAS, frameTicks: 10, elementTicks: 1000 };

describe("listAnimationPresets", () => {
	test("text-only presets are hidden for other elements", () => {
		const forText = listAnimationPresets({ slot: "in", isText: true }).map((p) => p.id);
		const forVideo = listAnimationPresets({ slot: "in", isText: false }).map((p) => p.id);
		expect(forText).toContain("tracking");
		expect(forVideo).not.toContain("tracking");
	});

	test("presets without an exit variant are not listed for out", () => {
		expect(listAnimationPresets({ slot: "out", isText: false }).map((p) => p.id)).not.toContain("bounce-drop");
	});
});

describe("buildPresetKeyframes", () => {
	test("entrance goes from the start value back to the base value", () => {
		const keys = buildPresetKeyframes({ slot: "in", presetId: "fade", presetTicks: 300, ...common });
		expect(keys).toEqual([
			{ path: "opacity", time: 0, value: 0, ease: "ease-out" },
			{ path: "opacity", time: 300, value: 1, ease: "ease-out" },
		]);
	});

	test("exit mirrors the entrance at the end of the element", () => {
		const keys = buildPresetKeyframes({ slot: "out", presetId: "slide-up", presetTicks: 300, ...common });
		const position = keys.filter((k) => k.path === "transform.positionY");
		expect(position.map((k) => [k.time, k.value])).toEqual([
			[700, 100],
			[1000, 100 + 1080 * 0.15],
		]);
		expect(position.every((k) => k.ease === "ease-in")).toBe(true);
	});

	test("times are snapped to frames", () => {
		const keys = buildPresetKeyframes({ slot: "in", presetId: "pop", presetTicks: 333, ...common });
		expect(keys.every((k) => k.time % 10 === 0)).toBe(true);
	});

	test("loops repeat for the whole element and accumulate spins", () => {
		const keys = buildPresetKeyframes({ slot: "loop", presetId: "spin", presetTicks: 400, ...common });
		expect(keys.map((k) => [k.time, k.value])).toEqual([
			[0, 0],
			[400, 360],
			[800, 720],
		]);
		expect(keys.every((k) => k.ease === "linear")).toBe(true);
	});

	test("unknown presets produce no keyframes", () => {
		expect(buildPresetKeyframes({ slot: "in", presetId: "nope", presetTicks: 300, ...common })).toEqual([]);
	});
});

describe("clampPresetTicks", () => {
	test("in and out share the element when both are set", () => {
		expect(clampPresetTicks({ slot: "in", presetTicks: 900, elementTicks: 1000, hasOppositeSlot: true })).toBe(500);
		expect(clampPresetTicks({ slot: "in", presetTicks: 900, elementTicks: 1000, hasOppositeSlot: false })).toBe(900);
		expect(clampPresetTicks({ slot: "out", presetTicks: 2000, elementTicks: 1000, hasOppositeSlot: false })).toBe(1000);
	});
});
