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

describe("cursor-anchored zoom", () => {
	test("keeps the point under the cursor fixed", async () => {
		const { getAnchoredCenter } = await import("../zoom");
		// cursor 100px right of the viewport centre, zooming from scale 1 to 2
		const center = getAnchoredCenter({ center: 500, anchorOffset: 100, previousScale: 1, nextScale: 2 });
		// canvas point under the cursor before: 500 + 100/1 = 600; after: center + 100/2
		expect(center + 100 / 2).toBe(600);
	});

	test("zooming at the viewport centre keeps the centre", async () => {
		const { getAnchoredCenter } = await import("../zoom");
		expect(getAnchoredCenter({ center: 320, anchorOffset: 0, previousScale: 1, nextScale: 3 })).toBe(320);
	});
});

describe("transform readout", () => {
	test("formats uniform scale, free scale and rotation", async () => {
		const { getTransformReadout } = await import("../transform-readout");
		expect(getTransformReadout({ isRotation: false, rotation: 0, scaleX: 1.24, scaleY: 1.24 })).toBe("124%");
		expect(getTransformReadout({ isRotation: false, rotation: 0, scaleX: 1.4, scaleY: 0.9 })).toBe("140% × 90%");
		expect(getTransformReadout({ isRotation: true, rotation: 14.6, scaleX: 1, scaleY: 1 })).toBe("15°");
	});
});

describe("transform alignment", () => {
	test("aligns the box against canvas edges and centers", async () => {
		const { getAlignedPosition } = await import("../transform-align");
		const rect = { left: 100, right: 300, top: -50, bottom: 50 }; // 200x100 box centered at (200, 0)
		const base = { rect, position: { x: 200, y: 0 }, canvasSize: { width: 1000, height: 600 } };
		expect(getAlignedPosition({ ...base, alignment: "left" })).toEqual({ x: -400, y: 0 });
		expect(getAlignedPosition({ ...base, alignment: "right" })).toEqual({ x: 400, y: 0 });
		expect(getAlignedPosition({ ...base, alignment: "center-x" })).toEqual({ x: 0, y: 0 });
		expect(getAlignedPosition({ ...base, alignment: "top" })).toEqual({ x: 200, y: -250 });
		expect(getAlignedPosition({ ...base, alignment: "bottom" })).toEqual({ x: 200, y: 250 });
	});

	test("fit and fill scales", async () => {
		const { getFramingScale } = await import("../transform-align");
		const canvasSize = { width: 1920, height: 1080 };
		expect(getFramingScale({ unscaledSize: { width: 1080, height: 1080 }, canvasSize, mode: "fit" })).toBe(1);
		expect(getFramingScale({ unscaledSize: { width: 1080, height: 1080 }, canvasSize, mode: "fill" })).toBeCloseTo(1920 / 1080);
	});

	test("normalizes rotations", async () => {
		const { normalizeRotation } = await import("../transform-align");
		expect(normalizeRotation(270)).toBe(-90);
		expect(normalizeRotation(-270)).toBe(90);
		expect(normalizeRotation(180)).toBe(180);
		expect(normalizeRotation(-180)).toBe(180);
		expect(normalizeRotation(45)).toBe(45);
	});
});
