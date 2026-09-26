import { describe, expect, test } from "bun:test";
import type { TextElement } from "@/timeline";
import { TICKS_PER_SECOND, mediaTime } from "@/wasm";
import { measureTextElement } from "../measure-element";
import type { TextCanvasContext } from "../layout";
import { getWrapBounds } from "../wrap";

/** Bun has no canvas: a fixed-advance fake is enough to measure. */
function createFakeContext(): TextCanvasContext {
	const ctx = {
		font: "10px sans-serif",
		textBaseline: "alphabetic",
		letterSpacing: "0px",
		save() {},
		restore() {},
		measureText(text: string) {
			const size = Number.parseFloat(this.font.match(/([\d.]+)px/)?.[1] ?? "10");
			return {
				width: text.length * size * 0.5,
				actualBoundingBoxAscent: size * 0.8,
				actualBoundingBoxDescent: size * 0.2,
			};
		},
	};
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return ctx as unknown as TextCanvasContext;
}

function textElement({ params }: { params: TextElement["params"] }): TextElement {
	return {
		id: "t1",
		type: "text",
		name: "Text",
		duration: mediaTime({ ticks: TICKS_PER_SECOND * 5 }),
		startTime: mediaTime({ ticks: 0 }),
		trimStart: mediaTime({ ticks: 0 }),
		trimEnd: mediaTime({ ticks: 0 }),
		params: { content: "Hola mundo", fontSize: 15, ...params },
	};
}

describe("measureTextElement with the wrap effect", () => {
	test("plain text has no ring", () => {
		const measured = measureTextElement({
			element: textElement({ params: {} }),
			canvasHeight: 1080,
			canvasWidth: 1920,
			localTime: 0,
			ctx: createFakeContext(),
		});
		expect(measured.wrap).toBeNull();
	});

	test("the bounds are the ring, and the ring spins with time", () => {
		const element = textElement({
			params: { "fx.type": "wrap", "fx.radius": 50, "fx.tilt": 30, "fx.spin": 90 },
		});
		const measured = measureTextElement({
			element,
			canvasHeight: 1080,
			canvasWidth: 1920,
			localTime: TICKS_PER_SECOND * 2,
			ctx: createFakeContext(),
		});
		expect(measured.wrap?.geometry.radius).toBeCloseTo(0.5 * 1920 * 0.28);
		expect(measured.wrap?.phase).toBeCloseTo(Math.PI);
		const expected = measured.wrap
			? getWrapBounds({ geometry: measured.wrap.geometry, fontSize: measured.scaledFontSize })
			: null;
		expect(measured.visualRect).toEqual(expected ?? measured.visualRect);
		expect(measured.visualRect.width).toBeGreaterThan(2 * measured.wrap!.geometry.radius);
	});
});
