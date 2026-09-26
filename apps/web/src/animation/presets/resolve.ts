/**
 * Procedural evaluation of animation presets. Presets are never stored as
 * keyframes: at any element-local time, the active entrance / exit / loop is
 * layered on top of the values already resolved from params + manual
 * keyframes. Pure math, no editor state.
 */

import { evaluateCubicBezierEasing } from "@/animation/bezier";
import type { ElementAnimationPresets } from "@/timeline/types";
import {
	ENTRY_PRESETS,
	LOOP_PRESETS,
	PRESET_EASE_CURVES,
	type AnimationPresetSlot,
	type PresetBase,
	type PresetCanvas,
	type PresetEase,
	type PresetTrack,
} from "./catalog";

/** Every value a preset can drive. */
export interface PresetValues extends PresetBase {
	revealCharacters: number;
	revealWords: number;
}

export const DEFAULT_PRESET_VALUES: PresetValues = {
	opacity: 1,
	positionX: 0,
	positionY: 0,
	scaleX: 1,
	scaleY: 1,
	rotate: 0,
	letterSpacing: 0,
	revealCharacters: 100,
	revealWords: 100,
};

const PATH_TO_VALUE_KEY: Record<string, keyof PresetValues> = {
	opacity: "opacity",
	"transform.positionX": "positionX",
	"transform.positionY": "positionY",
	"transform.scaleX": "scaleX",
	"transform.scaleY": "scaleY",
	"transform.rotate": "rotate",
	letterSpacing: "letterSpacing",
	revealCharacters: "revealCharacters",
	revealWords: "revealWords",
};

/** Order in which slots are layered: entrance and exit win over a loop. */
const LAYER_ORDER: readonly AnimationPresetSlot[] = ["loop", "in", "out"];

/** Everything needed to layer an element's presets on resolved values. */
export interface PresetLayerContext {
	animationPresets: ElementAnimationPresets | undefined;
	/** Element duration (ticks). */
	duration: number;
	/** Project canvas size; slide presets move by a fraction of it. */
	canvas: PresetCanvas;
}

export function hasAnimationPresets({
	animationPresets,
}: {
	animationPresets: ElementAnimationPresets | undefined;
}): boolean {
	return (
		!!animationPresets &&
		LAYER_ORDER.some((slot) => animationPresets[slot] !== undefined)
	);
}

/**
 * Duration a slot actually plays for: entrances and exits are clamped to the
 * element, and to half of it when both exist, so trimming or splitting a clip
 * never makes them overlap. Returns 0 when the slot is empty.
 */
export function getEffectivePresetDuration({
	animationPresets,
	slot,
	elementDuration,
}: {
	animationPresets: ElementAnimationPresets | undefined;
	slot: AnimationPresetSlot;
	elementDuration: number;
}): number {
	const entry = animationPresets?.[slot];
	if (!entry) return 0;
	const duration = Math.max(1, entry.duration);
	if (slot === "loop") return duration;
	const hasBoth = !!animationPresets?.in && !!animationPresets?.out;
	const max = Math.max(1, hasBoth ? elementDuration / 2 : elementDuration);
	return Math.min(duration, max);
}

/** Value of a preset track at `progress` (0..1 along the preset). */
export function evaluatePresetTrack({
	points,
	progress,
	ease,
}: {
	points: PresetTrack["points"];
	progress: number;
	ease: PresetEase;
}): number {
	const first = points[0];
	const last = points[points.length - 1];
	if (!first || !last) return 0;
	if (progress <= first[0]) return first[1];
	if (progress >= last[0]) return last[1];
	for (let index = 0; index < points.length - 1; index++) {
		const [fromRatio, fromValue, pointEase] = points[index];
		const [toRatio, toValue] = points[index + 1];
		if (progress < fromRatio || progress > toRatio) continue;
		const span = toRatio - fromRatio;
		const linear = span > 0 ? (progress - fromRatio) / span : 1;
		const eased = evaluateCubicBezierEasing({
			curve: PRESET_EASE_CURVES[pointEase ?? ease],
			progress: linear,
		});
		return fromValue + (toValue - fromValue) * eased;
	}
	return last[1];
}

interface SlotPlayback {
	tracks: PresetTrack[];
	progress: number;
	cycle: number;
	ease: PresetEase;
}

function getSlotPlayback({
	animationPresets,
	slot,
	localTime,
	elementDuration,
	base,
	canvas,
}: {
	animationPresets: ElementAnimationPresets;
	slot: AnimationPresetSlot;
	localTime: number;
	elementDuration: number;
	base: PresetBase;
	canvas: PresetCanvas;
}): SlotPlayback | null {
	const entry = animationPresets[slot];
	if (!entry) return null;
	const duration = getEffectivePresetDuration({
		animationPresets,
		slot,
		elementDuration,
	});
	if (duration <= 0) return null;

	if (slot === "loop") {
		const preset = LOOP_PRESETS[entry.presetId];
		if (!preset) return null;
		const cycles = Math.max(0, localTime) / duration;
		const cycle = Math.floor(cycles);
		return {
			tracks: preset.tracks({ base, canvas }),
			progress: cycles - cycle,
			cycle,
			ease: "smooth",
		};
	}

	const preset = ENTRY_PRESETS[entry.presetId];
	if (!preset) return null;
	if (slot === "out" && !preset.out) return null;
	let progress: number;
	if (slot === "in") {
		if (localTime >= duration) return null;
		progress = Math.max(0, localTime) / duration;
	} else {
		// The exit is the entrance curve played backwards, ending at the clip end.
		if (localTime <= elementDuration - duration) return null;
		progress = Math.max(0, elementDuration - localTime) / duration;
	}
	return {
		tracks: preset.tracks({ base, canvas }),
		progress: Math.min(1, progress),
		cycle: 0,
		ease: preset.ease ?? "ease-out",
	};
}

/**
 * Returns `values` with the element's active presets layered on top at
 * `localTime`. `values` are the already-resolved values at that time (params +
 * manual keyframes); presets animate relative to them, so manual keyframes and
 * presets combine.
 */
export function resolveAnimationPresetValues({
	animationPresets,
	localTime,
	duration,
	canvas,
	values,
}: PresetLayerContext & {
	localTime: number;
	values: PresetValues;
}): PresetValues {
	if (!animationPresets) return values;
	const result: PresetValues = { ...values };
	for (const slot of LAYER_ORDER) {
		const playback = getSlotPlayback({
			animationPresets,
			slot,
			localTime,
			elementDuration: duration,
			base: values,
			canvas,
		});
		if (!playback) continue;
		for (const track of playback.tracks) {
			const key = PATH_TO_VALUE_KEY[track.path];
			if (!key) continue;
			const value = evaluatePresetTrack({
				points: track.points,
				progress: playback.progress,
				ease: track.ease ?? playback.ease,
			});
			result[key] = value + (track.cumulative ?? 0) * playback.cycle;
		}
	}
	return result;
}

/** Shape shared with `@/rendering` Transform, kept local to stay pure. */
interface PresetTransform {
	position: { x: number; y: number };
	scaleX: number;
	scaleY: number;
	rotate: number;
}

export function layerPresetsOnTransform<TTransform extends PresetTransform>({
	transform,
	localTime,
	presets,
}: {
	transform: TTransform;
	localTime: number;
	presets: PresetLayerContext;
}): TTransform {
	if (!hasAnimationPresets({ animationPresets: presets.animationPresets })) {
		return transform;
	}
	const resolved = resolveAnimationPresetValues({
		...presets,
		localTime,
		values: {
			...DEFAULT_PRESET_VALUES,
			positionX: transform.position.x,
			positionY: transform.position.y,
			scaleX: transform.scaleX,
			scaleY: transform.scaleY,
			rotate: transform.rotate,
		},
	});
	return {
		...transform,
		position: { x: resolved.positionX, y: resolved.positionY },
		scaleX: resolved.scaleX,
		scaleY: resolved.scaleY,
		rotate: resolved.rotate,
	};
}

export function layerPresetsOnOpacity({
	opacity,
	localTime,
	presets,
}: {
	opacity: number;
	localTime: number;
	presets: PresetLayerContext;
}): number {
	if (!hasAnimationPresets({ animationPresets: presets.animationPresets })) {
		return opacity;
	}
	return resolveAnimationPresetValues({
		...presets,
		localTime,
		values: { ...DEFAULT_PRESET_VALUES, opacity },
	}).opacity;
}

/** Letter spacing and text reveal, the text-only values a preset can drive. */
export function layerPresetsOnTextLayout({
	letterSpacing,
	revealCharacters,
	revealWords,
	localTime,
	presets,
}: {
	letterSpacing: number;
	revealCharacters: number;
	revealWords: number;
	localTime: number;
	presets: PresetLayerContext;
}): { letterSpacing: number; revealCharacters: number; revealWords: number } {
	if (!hasAnimationPresets({ animationPresets: presets.animationPresets })) {
		return { letterSpacing, revealCharacters, revealWords };
	}
	const resolved = resolveAnimationPresetValues({
		...presets,
		localTime,
		values: {
			...DEFAULT_PRESET_VALUES,
			letterSpacing,
			revealCharacters,
			revealWords,
		},
	});
	return {
		letterSpacing: resolved.letterSpacing,
		revealCharacters: resolved.revealCharacters,
		revealWords: resolved.revealWords,
	};
}
