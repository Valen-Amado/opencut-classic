import { describe, expect, test } from "bun:test";
import { getDistanceGuides, rectFromBounds, snapPosition, type SnapRect } from "../preview-snap";

const canvasSize = { width: 1000, height: 600 };
const elementSize = { width: 100, height: 100 };
const snapThreshold = { x: 8, y: 8 };
const rect = ({ left, top, size = 100 }: { left: number; top: number; size?: number }): SnapRect => ({ left, right: left + size, top, bottom: top + size });

describe("snapPosition with other elements", () => {
	test("aligns the left edge with another element's left edge", () => {
		const other = rect({ left: -300, top: -250 });
		const result = snapPosition({ proposedPosition: { x: -245, y: 100 }, canvasSize, elementSize, snapThreshold, targets: [other] });
		expect(result.snappedPosition.x).toBe(-250);
		expect(result.activeLines[0]).toMatchObject({ type: "vertical", position: -300, source: "element", start: -250, end: 150 });
	});

	test("still snaps to the canvas center", () => {
		const result = snapPosition({ proposedPosition: { x: 4, y: 200 }, canvasSize, elementSize, snapThreshold, targets: [] });
		expect(result.snappedPosition.x).toBe(0);
		expect(result.spacingGuides).toEqual([]);
	});

	test("centres between two neighbors when the gaps nearly match", () => {
		const left = rect({ left: -420, top: -50 });
		const right = rect({ left: 180, top: -50 });
		// neighbors leave a 500px hole centred on -70; a centred 100px element has 200px on each side
		const result = snapPosition({ proposedPosition: { x: -67, y: 7 }, canvasSize, elementSize, snapThreshold: { x: 4, y: 4 }, targets: [left, right] });
		expect(result.snappedPosition.x).toBe(-70);
		const equal = result.spacingGuides.filter((guide) => guide.axis === "x");
		expect(equal).toHaveLength(2);
		expect(equal.every((guide) => guide.isEqual && guide.to - guide.from === 200)).toBe(true);
	});
});

describe("distance guides", () => {
	test("measure to the canvas edges when there are no neighbors", () => {
		const guides = getDistanceGuides({ rect: rect({ left: 0, top: 0 }), others: [], canvasSize, includeCanvasEdges: true });
		expect(guides.map((g) => [g.axis, g.to - g.from])).toEqual([
			["x", 500],
			["x", 400],
			["y", 300],
			["y", 200],
		]);
	});

	test("converts rotated top-left bounds into a centre-origin box", () => {
		const box = rectFromBounds({ bounds: { cx: 500, cy: 300, width: 100, height: 50, rotation: 90 }, canvasSize });
		expect(box.left).toBeCloseTo(-25);
		expect(box.right).toBeCloseTo(25);
		expect(box.top).toBeCloseTo(-50);
		expect(box.bottom).toBeCloseTo(50);
	});
});
