import { describe, expect, test } from "bun:test";
import {
	EMPTY_TEXT_PAINT_STYLE,
	TEXT_SHADOW_DEFAULTS,
	getShadowGeometry,
	type TextPaintStyle,
} from "../effects";
import type { TextCanvasContext } from "../layout";
import { getContextDeviceScale, paintTextRun } from "../paint";

type Call = {
	op: "fillText" | "strokeText";
	x: number;
	y: number;
	fillStyle: unknown;
	strokeStyle: unknown;
	lineWidth: number;
	shadowColor: string;
	shadowOffsetX: number;
	shadowOffsetY: number;
	shadowBlur: number;
};

/** Records draw calls with the state they were made with. */
function createRecorder({ scale = 1 }: { scale?: number } = {}) {
	const calls: Call[] = [];
	const state = {
		fillStyle: "#000" as unknown,
		strokeStyle: "#000" as unknown,
		lineWidth: 1,
		lineJoin: "miter",
		lineCap: "butt",
		shadowColor: "transparent",
		shadowOffsetX: 0,
		shadowOffsetY: 0,
		shadowBlur: 0,
		globalCompositeOperation: "source-over",
	};
	const stack: Array<typeof state> = [];
	const record = ({ op, x, y }: { op: Call["op"]; x: number; y: number }) =>
		calls.push({
			op,
			x,
			y,
			fillStyle: state.fillStyle,
			strokeStyle: state.strokeStyle,
			lineWidth: state.lineWidth,
			shadowColor: state.shadowColor,
			shadowOffsetX: state.shadowOffsetX,
			shadowOffsetY: state.shadowOffsetY,
			shadowBlur: state.shadowBlur,
		});
	const ctx = Object.assign(state, {
		save: () => stack.push({ ...state }),
		restore: () => {
			const previous = stack.pop();
			if (previous) Object.assign(state, previous);
		},
		fillText: (_text: string, x: number, y: number) => record({ op: "fillText", x, y }),
		strokeText: (_text: string, x: number, y: number) => record({ op: "strokeText", x, y }),
		getTransform: () => ({ a: scale, b: 0, c: 0, d: scale }),
		createLinearGradient: () => ({ addColorStop: () => {} }),
	});
	// A partial fake: only what the painter touches.
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return { ctx: ctx as unknown as TextCanvasContext, calls };
}

const paint = ({ style, scale = 1 }: { style: TextPaintStyle; scale?: number }) => {
	const { ctx, calls } = createRecorder({ scale });
	paintTextRun({
		ctx,
		text: "Hi",
		x: 0,
		y: 0,
		fontSize: 100,
		textColor: "#ffffff",
		style,
		deviceScale: getContextDeviceScale({ ctx }),
	});
	return calls;
};

describe("paintTextRun", () => {
	test("plain text is a single fill", () => {
		const calls = paint({ style: EMPTY_TEXT_PAINT_STYLE });
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({ op: "fillText", fillStyle: "#ffffff", shadowBlur: 0 });
	});

	test("the stroke is drawn before the fill", () => {
		const calls = paint({
			style: { ...EMPTY_TEXT_PAINT_STYLE, stroke: { color: "#ff0000", width: 25 } },
		});
		expect(calls.map((call) => call.op)).toEqual(["strokeText", "fillText"]);
		expect(calls[0].strokeStyle).toBe("#ff0000");
		expect(calls[0].lineWidth).toBeCloseTo(16);
	});

	test("shadow offsets are converted to device pixels", () => {
		const shadow = { ...TEXT_SHADOW_DEFAULTS };
		const expected = getShadowGeometry({ shadow, fontSize: 100 });
		const [atOne] = paint({ style: { ...EMPTY_TEXT_PAINT_STYLE, shadow } });
		const [atTwo] = paint({ style: { ...EMPTY_TEXT_PAINT_STYLE, shadow }, scale: 2 });
		expect(atOne.shadowOffsetX).toBeCloseTo(expected.offsetX);
		expect(atOne.shadowOffsetY).toBeCloseTo(expected.offsetY);
		expect(atTwo.shadowOffsetX).toBeCloseTo(expected.offsetX * 2);
		expect(atTwo.shadowBlur).toBeCloseTo(expected.blur * 2);
		expect(atOne.shadowColor).toBe("rgba(0, 0, 0, 0.6)");
	});

	test("a shadow draws the text once, with the shadow", () => {
		const calls = paint({ style: { ...EMPTY_TEXT_PAINT_STYLE, shadow: { ...TEXT_SHADOW_DEFAULTS } } });
		expect(calls).toHaveLength(1);
	});

	test("hard shadow draws an offset copy behind the text", () => {
		const calls = paint({
			style: { ...EMPTY_TEXT_PAINT_STYLE, fx: { ...EMPTY_TEXT_PAINT_STYLE.fx, type: "hard", color: "#ff5a1f", intensity: 50 } },
		});
		expect(calls).toHaveLength(2);
		expect(calls[0]).toMatchObject({ fillStyle: "#ff5a1f", shadowColor: "transparent" });
		expect(calls[0].x).toBeGreaterThan(0);
		expect(calls[1]).toMatchObject({ x: 0, fillStyle: "#ffffff" });
	});

	test("neon glows in the effect color and ends with a near-white fill", () => {
		const calls = paint({
			style: { ...EMPTY_TEXT_PAINT_STYLE, fx: { ...EMPTY_TEXT_PAINT_STYLE.fx, type: "neon", color: "#ff2d95", intensity: 50 } },
		});
		expect(calls).toHaveLength(4);
		expect(calls[0].shadowColor).toBe("#ff2d95");
		expect(calls[3].shadowBlur).toBe(0);
		expect(calls[3].fillStyle).toBe("rgba(255, 255, 255, 0.95)");
	});

	test("hollow strokes the outline instead of filling", () => {
		const calls = paint({
			style: { ...EMPTY_TEXT_PAINT_STYLE, fx: { ...EMPTY_TEXT_PAINT_STYLE.fx, type: "hollow", color: "#fff", intensity: 50 } },
		});
		expect(calls.map((call) => call.op)).toEqual(["strokeText"]);
	});
});
