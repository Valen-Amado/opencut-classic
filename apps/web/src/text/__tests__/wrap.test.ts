import { describe, expect, test } from "bun:test";
import {
	WRAP_REPEAT_SEPARATOR,
	buildWrapText,
	getWrapBounds,
	getWrapPhase,
	getWrapRingGeometry,
	layoutWrapRing,
} from "../wrap";

/** Every character is 10 units wide. */
const measure = (text: string) => Array.from(text).length * 10;

describe("getWrapRingGeometry", () => {
	test("radius is a share of the canvas width, tilt in radians", () => {
		const geometry = getWrapRingGeometry({ radiusPercent: 50, tiltDegrees: 30, canvasWidth: 1000 });
		expect(geometry.radius).toBeCloseTo(140);
		expect(geometry.tilt).toBeCloseTo(Math.PI / 6);
	});
});

describe("getWrapPhase", () => {
	test("spins by degrees per second", () => {
		expect(getWrapPhase({ spinDegreesPerSecond: 90, seconds: 2 })).toBeCloseTo(Math.PI);
		expect(getWrapPhase({ spinDegreesPerSecond: -60, seconds: 0 })).toBeCloseTo(0);
	});
});

describe("getWrapBounds", () => {
	test("covers the ring plus a glyph", () => {
		const bounds = getWrapBounds({
			geometry: { radius: 100, tilt: Math.PI / 6 },
			fontSize: 20,
		});
		expect(bounds.width).toBeCloseTo(220);
		expect(bounds.height).toBeCloseTo(100 + 28);
		expect(bounds.left).toBeCloseTo(-110);
		expect(bounds.top).toBeCloseTo(-64);
	});

	test("a flat ring is a single row of text high", () => {
		const bounds = getWrapBounds({ geometry: { radius: 100, tilt: 0 }, fontSize: 20 });
		expect(bounds.height).toBeCloseTo(28);
	});
});

describe("buildWrapText", () => {
	test("joins lines into one", () => {
		expect(buildWrapText({ content: "ab\ncd", repeat: false, circumference: 1000, measure })).toBe(
			"ab cd",
		);
	});

	test("repeats the text until the ring is closed", () => {
		const text = buildWrapText({ content: "abc", repeat: true, circumference: 190, measure });
		const unit = `abc${WRAP_REPEAT_SEPARATOR}`;
		// Each copy is 60 wide: three fit (180) without reaching 190.
		expect(text).toBe(unit.repeat(3));
	});

	test("keeps at least one copy when it's longer than the ring", () => {
		const text = buildWrapText({ content: "abcdef", repeat: true, circumference: 10, measure });
		expect(text).toBe(`abcdef${WRAP_REPEAT_SEPARATOR}`);
	});
});

describe("layoutWrapRing", () => {
	const geometry = { radius: 100, tilt: Math.PI / 6 };

	test("a single glyph at phase 0 sits at the front center, unscaled sideways", () => {
		const [glyph] = layoutWrapRing({ text: "A", measure, geometry, phase: 0, fill: false });
		expect(glyph.x).toBeCloseTo(0);
		expect(glyph.depth).toBeCloseTo(1);
		expect(glyph.isBack).toBe(false);
		expect(glyph.scaleX).toBeCloseTo(1.16);
		expect(glyph.y).toBeCloseTo(50);
	});

	test("the back half is mirrored, faded and higher", () => {
		const [glyph] = layoutWrapRing({ text: "A", measure, geometry, phase: Math.PI, fill: false });
		expect(glyph.isBack).toBe(true);
		expect(glyph.scaleX).toBeLessThan(0);
		expect(glyph.alpha).toBeLessThan(1);
		expect(glyph.y).toBeCloseTo(-50);
	});

	test("glyphs on the sides are compressed by |cos θ|", () => {
		const [glyph] = layoutWrapRing({ text: "A", measure, geometry, phase: Math.PI / 3, fill: false });
		expect(Math.abs(glyph.scaleX)).toBeCloseTo(0.5 * (1 + 0.16 * 0.5));
		expect(glyph.x).toBeCloseTo(100 * Math.sin(Math.PI / 3));
	});

	test("reads left to right on the front and skips spaces", () => {
		const glyphs = layoutWrapRing({ text: "a b", measure, geometry, phase: 0, fill: false });
		expect(glyphs.map((glyph) => glyph.char).sort()).toEqual(["a", "b"]);
		const a = glyphs.find((glyph) => glyph.char === "a");
		const b = glyphs.find((glyph) => glyph.char === "b");
		expect(a && b && a.x < b.x).toBe(true);
	});

	test("is sorted back to front", () => {
		const glyphs = layoutWrapRing({
			text: "abcdefghijklmnopqrstuvwxyz",
			measure,
			geometry,
			phase: 0.3,
			fill: true,
		});
		for (let index = 1; index < glyphs.length; index++) {
			expect(glyphs[index].depth).toBeGreaterThanOrEqual(glyphs[index - 1].depth);
		}
	});

	test("with fill, the text spans the whole circumference", () => {
		const glyphs = layoutWrapRing({ text: "abcd", measure, geometry, phase: 0, fill: true });
		const thetas = glyphs.map((glyph) => glyph.theta).sort((a, b) => a - b);
		// Four glyphs evenly spread: a quarter turn apart.
		for (let index = 1; index < thetas.length; index++) {
			expect(thetas[index] - thetas[index - 1]).toBeCloseTo(Math.PI / 2);
		}
	});
});
