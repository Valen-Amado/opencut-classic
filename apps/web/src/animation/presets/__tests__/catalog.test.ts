import { describe, expect, test } from "bun:test";
import {
	clampPresetTicks,
	listAnimationPresets,
} from "../catalog";

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

describe("clampPresetTicks", () => {
	test("in and out share the element when both are set", () => {
		expect(clampPresetTicks({ slot: "in", presetTicks: 900, elementTicks: 1000, hasOppositeSlot: true })).toBe(500);
		expect(clampPresetTicks({ slot: "in", presetTicks: 900, elementTicks: 1000, hasOppositeSlot: false })).toBe(900);
		expect(clampPresetTicks({ slot: "out", presetTicks: 2000, elementTicks: 1000, hasOppositeSlot: false })).toBe(1000);
	});
});
