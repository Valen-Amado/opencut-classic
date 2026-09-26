import type {
	AnimationColorPropertyPath,
	AnimationNumericPropertyPath,
	ElementAnimations,
} from "./types";
import { resolveAnimationPathValueAtTime } from "./resolve";
import {
	layerPresetsOnOpacity,
	type PresetLayerContext,
} from "./presets/resolve";

export function resolveOpacityAtTime({
	baseOpacity,
	animations,
	localTime,
	presets,
}: {
	baseOpacity: number;
	animations: ElementAnimations | undefined;
	localTime: number;
	/** Layers the element's animation presets on top (for display). */
	presets?: PresetLayerContext;
}): number {
	const safeLocalTime = Math.max(0, localTime);
	const opacity = resolveAnimationPathValueAtTime({
		animations,
		propertyPath: "opacity",
		localTime: safeLocalTime,
		fallbackValue: baseOpacity,
	});
	if (!presets) return opacity;
	return layerPresetsOnOpacity({ opacity, localTime: safeLocalTime, presets });
}

export function resolveNumberAtTime({
	baseValue,
	animations,
	propertyPath,
	localTime,
}: {
	baseValue: number;
	animations: ElementAnimations | undefined;
	propertyPath: AnimationNumericPropertyPath;
	localTime: number;
}): number {
	return resolveAnimationPathValueAtTime({
		animations,
		propertyPath,
		localTime: Math.max(0, localTime),
		fallbackValue: baseValue,
	});
}

export function resolveColorAtTime({
	baseColor,
	animations,
	propertyPath,
	localTime,
}: {
	baseColor: string;
	animations: ElementAnimations | undefined;
	propertyPath: AnimationColorPropertyPath;
	localTime: number;
}): string {
	return resolveAnimationPathValueAtTime({
		animations,
		propertyPath,
		localTime: Math.max(0, localTime),
		fallbackValue: baseColor,
	});
}
