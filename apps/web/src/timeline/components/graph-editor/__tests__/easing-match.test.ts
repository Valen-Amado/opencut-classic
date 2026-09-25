import { describe, expect, test } from "bun:test";
import { getEasingCurvePath, matchEasingPreset } from "../easing-match";

describe("easing presets", () => {
	test("matches built-in presets within the tolerance", () => {
		expect(matchEasingPreset({ cubicBezier: [0, 0, 0.21, 1] })?.id).toBe("ease-out");
		expect(matchEasingPreset({ cubicBezier: [0, 0, 1, 1] })?.id).toBe("linear");
		expect(matchEasingPreset({ cubicBezier: [0.5, 0.5, 0.5, 0.5] })).toBeNull();
		expect(matchEasingPreset({ cubicBezier: null })).toBeNull();
	});

	test("draws the curve inside the icon box", () => {
		expect(getEasingCurvePath({ cubicBezier: [0, 0, 1, 1] })).toBe("M3.0 17.0 C3.0 17.0 17.0 3.0 17.0 3.0");
	});
});
