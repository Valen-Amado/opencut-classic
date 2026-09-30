import type { ElementRef } from "@/timeline";
import type { ElementBounds } from "./element-bounds";

/** Axis-aligned rect in canvas coordinates (top-left origin, like ElementBounds). */
export interface CanvasRect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export interface BoundedRef extends ElementRef {
	bounds: ElementBounds;
}

/** Axis-aligned box around a (possibly rotated) element. */
export function getBoundsRect({ bounds }: { bounds: ElementBounds }): CanvasRect {
	const rad = (bounds.rotation * Math.PI) / 180;
	const cos = Math.abs(Math.cos(rad));
	const sin = Math.abs(Math.sin(rad));
	const halfWidth = (Math.abs(bounds.width) * cos + Math.abs(bounds.height) * sin) / 2;
	const halfHeight = (Math.abs(bounds.width) * sin + Math.abs(bounds.height) * cos) / 2;
	return {
		left: bounds.cx - halfWidth,
		right: bounds.cx + halfWidth,
		top: bounds.cy - halfHeight,
		bottom: bounds.cy + halfHeight,
	};
}

/** Box around every item, or null when there are none. */
export function getGroupRect({
	items,
}: {
	items: readonly { bounds: ElementBounds }[];
}): CanvasRect | null {
	if (items.length === 0) return null;
	const rects = items.map((item) => getBoundsRect({ bounds: item.bounds }));
	return {
		left: Math.min(...rects.map((rect) => rect.left)),
		top: Math.min(...rects.map((rect) => rect.top)),
		right: Math.max(...rects.map((rect) => rect.right)),
		bottom: Math.max(...rects.map((rect) => rect.bottom)),
	};
}

export function normalizeRect({
	from,
	to,
}: {
	from: { x: number; y: number };
	to: { x: number; y: number };
}): CanvasRect {
	return {
		left: Math.min(from.x, to.x),
		right: Math.max(from.x, to.x),
		top: Math.min(from.y, to.y),
		bottom: Math.max(from.y, to.y),
	};
}

export function rectContainsPoint({
	rect,
	point,
}: {
	rect: CanvasRect;
	point: { x: number; y: number };
}): boolean {
	return (
		point.x >= rect.left &&
		point.x <= rect.right &&
		point.y >= rect.top &&
		point.y <= rect.bottom
	);
}

const rectsIntersect = ({ a, b }: { a: CanvasRect; b: CanvasRect }) =>
	a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;

/** Elements touched by a selection marquee (like Figma, touching is enough). */
export function getRefsInMarquee({
	items,
	marquee,
}: {
	items: readonly BoundedRef[];
	marquee: CanvasRect;
}): ElementRef[] {
	return items
		.filter((item) => rectsIntersect({ a: getBoundsRect({ bounds: item.bounds }), b: marquee }))
		.map(({ trackId, elementId }) => ({ trackId, elementId }));
}

const sameRef = ({ a, b }: { a: ElementRef; b: ElementRef }) =>
	a.trackId === b.trackId && a.elementId === b.elementId;

/** Adds the element to the selection, or removes it if it was already there. */
export function toggleRefInSelection({
	selection,
	ref,
}: {
	selection: readonly ElementRef[];
	ref: ElementRef;
}): ElementRef[] {
	return selection.some((item) => sameRef({ a: item, b: ref }))
		? selection.filter((item) => !sameRef({ a: item, b: ref }))
		: [...selection, ref];
}

/** Union of two selections without duplicates, keeping order. */
export function mergeSelections({
	base,
	extra,
}: {
	base: readonly ElementRef[];
	extra: readonly ElementRef[];
}): ElementRef[] {
	return [...base, ...extra.filter((ref) => !base.some((item) => sameRef({ a: item, b: ref })))];
}

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type DistributeAxis = "horizontal" | "vertical";

export interface PositionDelta extends ElementRef {
	dx: number;
	dy: number;
}

/** Moves each item so its box lines up with the group box on one side or center. */
export function getAlignDeltas({
	items,
	mode,
}: {
	items: readonly BoundedRef[];
	mode: AlignMode;
}): PositionDelta[] {
	const group = getGroupRect({ items });
	if (!group) return [];
	return items.map((item) => {
		const rect = getBoundsRect({ bounds: item.bounds });
		let dx = 0;
		let dy = 0;
		if (mode === "left") dx = group.left - rect.left;
		if (mode === "right") dx = group.right - rect.right;
		if (mode === "hcenter") dx = (group.left + group.right) / 2 - (rect.left + rect.right) / 2;
		if (mode === "top") dy = group.top - rect.top;
		if (mode === "bottom") dy = group.bottom - rect.bottom;
		if (mode === "vcenter") dy = (group.top + group.bottom) / 2 - (rect.top + rect.bottom) / 2;
		return { trackId: item.trackId, elementId: item.elementId, dx, dy };
	});
}

/**
 * Spaces items evenly between the two outermost ones (equal gaps between
 * boxes). Needs at least three items; the outermost ones don't move.
 */
export function getDistributeDeltas({
	items,
	axis,
}: {
	items: readonly BoundedRef[];
	axis: DistributeAxis;
}): PositionDelta[] {
	if (items.length < 3) return [];
	const start = axis === "horizontal" ? "left" : "top";
	const end = axis === "horizontal" ? "right" : "bottom";
	const sorted = items
		.map((item) => ({ item, rect: getBoundsRect({ bounds: item.bounds }) }))
		.sort((a, b) => a.rect[start] - b.rect[start]);
	const first = sorted[0].rect;
	const last = sorted[sorted.length - 1].rect;
	const totalSize = sorted.reduce((sum, { rect }) => sum + (rect[end] - rect[start]), 0);
	const gap = (last[end] - first[start] - totalSize) / (sorted.length - 1);

	let cursor = first[start];
	return sorted.map(({ item, rect }) => {
		const offset = cursor - rect[start];
		cursor += rect[end] - rect[start] + gap;
		return {
			trackId: item.trackId,
			elementId: item.elementId,
			dx: axis === "horizontal" ? offset : 0,
			dy: axis === "vertical" ? offset : 0,
		};
	});
}
