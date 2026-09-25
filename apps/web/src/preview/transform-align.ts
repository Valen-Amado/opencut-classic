import type { SnapRect } from "@/preview/preview-snap";

export type CanvasAlignment = "left" | "center-x" | "right" | "top" | "center-y" | "bottom";

/**
 * Transform position that puts the element's bounding box against a canvas
 * edge or center. `rect` is the element box in center-origin coordinates at
 * its current `position`.
 */
export function getAlignedPosition({
	rect,
	position,
	canvasSize,
	alignment,
}: {
	rect: SnapRect;
	position: { x: number; y: number };
	canvasSize: { width: number; height: number };
	alignment: CanvasAlignment;
}): { x: number; y: number } {
	const halfW = canvasSize.width / 2;
	const halfH = canvasSize.height / 2;
	const offsetX = (rect.left + rect.right) / 2 - position.x;
	const offsetY = (rect.top + rect.bottom) / 2 - position.y;
	const halfBoxW = (rect.right - rect.left) / 2;
	const halfBoxH = (rect.bottom - rect.top) / 2;
	switch (alignment) {
		case "left":
			return { x: -halfW + halfBoxW - offsetX, y: position.y };
		case "center-x":
			return { x: -offsetX, y: position.y };
		case "right":
			return { x: halfW - halfBoxW - offsetX, y: position.y };
		case "top":
			return { x: position.x, y: -halfH + halfBoxH - offsetY };
		case "center-y":
			return { x: position.x, y: -offsetY };
		case "bottom":
			return { x: position.x, y: halfH - halfBoxH - offsetY };
	}
}

/**
 * Uniform scale that makes media "fit" (whole frame visible) or "fill" (cover
 * the canvas). `unscaledSize` is the element size at scale 1.
 */
export function getFramingScale({
	unscaledSize,
	canvasSize,
	mode,
}: {
	unscaledSize: { width: number; height: number };
	canvasSize: { width: number; height: number };
	mode: "fit" | "fill";
}): number {
	if (unscaledSize.width <= 0 || unscaledSize.height <= 0) return 1;
	const ratioX = canvasSize.width / unscaledSize.width;
	const ratioY = canvasSize.height / unscaledSize.height;
	return mode === "fit" ? Math.min(ratioX, ratioY) : Math.max(ratioX, ratioY);
}

/** Wraps an angle into (-180, 180]. */
export function normalizeRotation(degrees: number): number {
	const wrapped = ((((degrees + 180) % 360) + 360) % 360) - 180;
	return wrapped === -180 ? 180 : wrapped;
}
