export const PREVIEW_ZOOM_PRESETS = [25, 50, 75, 100, 150, 200];

/**
 * Canvas-space center after a zoom that keeps the point under the cursor in
 * place. `anchorOffset` is the cursor's screen distance from the viewport
 * center along one axis.
 */
export function getAnchoredCenter({
	center,
	anchorOffset,
	previousScale,
	nextScale,
}: {
	center: number;
	anchorOffset: number;
	previousScale: number;
	nextScale: number;
}): number {
	if (previousScale <= 0 || nextScale <= 0) return center;
	return center + anchorOffset * (1 / previousScale - 1 / nextScale);
}

export const PREVIEW_ZOOM = {
	min: 0.25,
	max: 16,
	step: 1.25,
} as const;
