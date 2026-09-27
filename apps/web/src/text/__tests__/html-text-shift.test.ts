import { describe, expect, test } from "bun:test";
import { getHtmlToCanvasTextShift } from "@/text/measure-element";

function fakeContext({ ascent, descent }: { ascent: number; descent: number }) {
	return {
		font: "",
		textBaseline: "alphabetic",
		save() {},
		restore() {},
		measureText: () => ({ fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent }),
	} as unknown as CanvasRenderingContext2D;
}

describe("getHtmlToCanvasTextShift", () => {
	test("is half the difference between the font box ascent and descent", () => {
		expect(getHtmlToCanvasTextShift({ fontString: "100px Poppins", ctx: fakeContext({ ascent: 80, descent: 60 }) })).toBe(10);
	});

	test("is zero when the browser gives no font box metrics", () => {
		expect(getHtmlToCanvasTextShift({ fontString: "x", ctx: fakeContext({ ascent: Number.NaN, descent: 1 }) })).toBe(0);
	});
});
