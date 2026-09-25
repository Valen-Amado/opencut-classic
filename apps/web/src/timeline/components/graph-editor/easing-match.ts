import type { NormalizedCubicBezier } from "@/animation/types";
import {
	BUILTIN_PRESETS,
	PRESET_MATCH_TOLERANCE,
	type EasingPreset,
} from "./easing-presets";

export function matchEasingPreset({
	cubicBezier,
	presets = BUILTIN_PRESETS,
	tolerance = PRESET_MATCH_TOLERANCE,
}: {
	cubicBezier: NormalizedCubicBezier | null;
	presets?: readonly EasingPreset[];
	tolerance?: number;
}): EasingPreset | null {
	if (!cubicBezier) return null;
	return (
		presets.find((preset) =>
			preset.value.every(
				(value, index) => Math.abs(value - cubicBezier[index]) <= tolerance,
			),
		) ?? null
	);
}

/** SVG path of a curve drawn in a 20x20 box with 3px padding. */
export function getEasingCurvePath({
	cubicBezier,
}: {
	cubicBezier: NormalizedCubicBezier;
}): string {
	const point = ({ x, y }: { x: number; y: number }) =>
		`${(3 + x * 14).toFixed(1)} ${(17 - y * 14).toFixed(1)}`;
	const [x1, y1, x2, y2] = cubicBezier;
	return `M${point({ x: 0, y: 0 })} C${point({ x: x1, y: y1 })} ${point({ x: x2, y: y2 })} ${point({ x: 1, y: 1 })}`;
}
