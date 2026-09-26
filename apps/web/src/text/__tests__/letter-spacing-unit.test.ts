import { describe, expect, test } from "bun:test";
import { buildLetterSpacingUnitUpgrade } from "@/text/letter-spacing-unit";
import { resolveLetterSpacingPx } from "@/text/primitives";
import type { TextElement } from "@/timeline";

const legacy = {
	params: { letterSpacing: 24, letterSpacingUnit: "px", fontSize: 15 },
	animations: undefined,
} as unknown as TextElement;

describe("letter spacing units", () => {
	test("font units scale with the canvas like the font size", () => {
		expect(resolveLetterSpacingPx({ letterSpacing: 1, unit: "font", canvasHeight: 1080 })).toBe(12);
		expect(resolveLetterSpacingPx({ letterSpacing: 1, unit: "px", canvasHeight: 1080 })).toBe(1);
	});

	test("upgrading legacy pixels keeps the rendered spacing", () => {
		const patch = buildLetterSpacingUnitUpgrade({ element: legacy, canvasHeight: 1080 });
		expect(patch?.params).toMatchObject({ letterSpacing: 2, letterSpacingUnit: "font" });
		expect(resolveLetterSpacingPx({ letterSpacing: 2, unit: "font", canvasHeight: 1080 })).toBe(24);
	});

	test("new text needs no upgrade", () => {
		const fresh = { params: { letterSpacing: 1 } } as unknown as TextElement;
		expect(buildLetterSpacingUnitUpgrade({ element: fresh, canvasHeight: 1080 })).toBeNull();
	});
});
