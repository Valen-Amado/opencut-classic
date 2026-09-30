import { describe, expect, test } from "bun:test";
import {
	getAlignDeltas,
	getDistributeDeltas,
	getGroupRect,
	getRefsInMarquee,
	mergeSelections,
	toggleRefInSelection,
	type BoundedRef,
} from "@/preview/multi-select";

const item = ({ id, cx, cy, width = 100, height = 50 }: { id: string; cx: number; cy: number; width?: number; height?: number }): BoundedRef => ({
	trackId: "t",
	elementId: id,
	bounds: { cx, cy, width, height, rotation: 0 },
});

const a = item({ id: "a", cx: 100, cy: 100 });
const b = item({ id: "b", cx: 400, cy: 200 });
const c = item({ id: "c", cx: 250, cy: 300, width: 200 });

describe("multi-select geometry", () => {
	test("group box wraps every item", () => {
		expect(getGroupRect({ items: [a, b] })).toEqual({ left: 50, top: 75, right: 450, bottom: 225 });
		expect(getGroupRect({ items: [] })).toBeNull();
	});

	test("marquee picks what it touches", () => {
		const hits = getRefsInMarquee({ items: [a, b, c], marquee: { left: 0, top: 0, right: 160, bottom: 90 } });
		expect(hits.map((ref) => ref.elementId)).toEqual(["a"]);
	});

	test("rotated boxes use their axis-aligned extent", () => {
		const rotated = { ...a, bounds: { ...a.bounds, rotation: 90 } };
		expect(getGroupRect({ items: [rotated] })).toEqual({ left: 75, top: 50, right: 125, bottom: 150 });
	});
});

describe("selection helpers", () => {
	test("toggle adds and removes", () => {
		const one = toggleRefInSelection({ selection: [], ref: a });
		expect(one).toHaveLength(1);
		expect(toggleRefInSelection({ selection: one, ref: { trackId: "t", elementId: "a" } })).toHaveLength(0);
	});

	test("merge keeps order without duplicates", () => {
		expect(mergeSelections({ base: [a, b], extra: [b, c] }).map((r) => r.elementId)).toEqual(["a", "b", "c"]);
	});
});

describe("align and distribute", () => {
	test("align left moves each box to the group's left edge", () => {
		expect(getAlignDeltas({ items: [a, b], mode: "left" }).map((d) => d.dx)).toEqual([0, -300]);
	});

	test("align vertical centers to the group's middle", () => {
		expect(getAlignDeltas({ items: [a, b], mode: "vcenter" }).map((d) => d.dy)).toEqual([50, -50]);
	});

	test("distribute makes the gaps equal and keeps the outer items", () => {
		const left = item({ id: "l", cx: 50, cy: 0 }); // 0..100
		const mid = item({ id: "m", cx: 130, cy: 0 }); // 80..180
		const right = item({ id: "r", cx: 450, cy: 0 }); // 400..500
		const deltas = getDistributeDeltas({ items: [right, mid, left], axis: "horizontal" });
		// total span 500, boxes 300 → gaps of 100: mid should span 200..300 (moves +120)
		expect(deltas.map((d) => [d.elementId, d.dx])).toEqual([["l", 0], ["m", 120], ["r", 0]]);
		expect(getDistributeDeltas({ items: [left, right], axis: "horizontal" })).toEqual([]);
	});
});
