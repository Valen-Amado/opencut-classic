import { resolveAnimationPathValueAtTime } from "@/animation/resolve";
import {
	removeElementKeyframe,
	updateScalarKeyframeCurve,
	upsertPathKeyframe,
} from "@/animation/keyframes";
import { getScalarKeyframeContext } from "@/animation/graph-channels";
import type { ElementAnimations } from "@/animation/types";
import {
	buildGraphEditorCurvePatches,
	getReferenceSpanValue,
} from "@/timeline/components/graph-editor/session";
import { resolveAnimationTarget } from "@/timeline/animation-targets";
import type { ElementAnimationPresets, TimelineElement } from "@/timeline";
import { generateUUID } from "@/utils/id";
import { mediaTime } from "@/wasm";
import {
	PRESET_EASE_CURVES,
	buildPresetKeyframes,
	clampPresetTicks,
	type AnimationPresetSlot,
	type PresetBase,
	type PresetCanvas,
} from "./catalog";

const BASE_PATHS: Record<keyof PresetBase, string> = {
	opacity: "opacity",
	positionX: "transform.positionX",
	positionY: "transform.positionY",
	scaleX: "transform.scaleX",
	scaleY: "transform.scaleY",
	rotate: "transform.rotate",
	letterSpacing: "letterSpacing",
};

const OPPOSITE: Record<AnimationPresetSlot, AnimationPresetSlot | null> = {
	in: "out",
	out: "in",
	loop: null,
};

function removeSlotKeyframes({
	element,
	slot,
}: {
	element: TimelineElement;
	slot: AnimationPresetSlot;
}): ElementAnimations | undefined {
	const ids = new Set(element.animationPresets?.[slot]?.keyframeIds ?? []);
	let animations = element.animations;
	if (ids.size === 0 || !animations) return animations;
	for (const [propertyPath, data] of Object.entries(animations)) {
		if (!data) continue;
		const keys = "keys" in data && Array.isArray(data.keys) ? data.keys : [];
		for (const key of keys) {
			if (typeof key === "object" && key && "id" in key && ids.has(String(key.id))) {
				animations = removeElementKeyframe({ animations, propertyPath, keyframeId: String(key.id) });
			}
		}
	}
	return animations;
}

function resolveBase({
	element,
	animations,
	localTicks,
}: {
	element: TimelineElement;
	animations: ElementAnimations | undefined;
	localTicks: number;
}): PresetBase {
	const readValue = ({ path, fallback }: { path: string; fallback: number }): number => {
		const target = resolveAnimationTarget({ element, path });
		if (!target) return fallback;
		const base = target.getBaseValue();
		const resolved = resolveAnimationPathValueAtTime({
			animations,
			propertyPath: path,
			localTime: mediaTime({ ticks: localTicks }),
			fallbackValue: base ?? fallback,
		});
		return typeof resolved === "number" ? resolved : fallback;
	};
	return {
		opacity: readValue({ path: BASE_PATHS.opacity, fallback: 1 }),
		positionX: readValue({ path: BASE_PATHS.positionX, fallback: 0 }),
		positionY: readValue({ path: BASE_PATHS.positionY, fallback: 0 }),
		scaleX: readValue({ path: BASE_PATHS.scaleX, fallback: 1 }),
		scaleY: readValue({ path: BASE_PATHS.scaleY, fallback: 1 }),
		rotate: readValue({ path: BASE_PATHS.rotate, fallback: 0 }),
		letterSpacing: readValue({ path: BASE_PATHS.letterSpacing, fallback: 0 }),
	};
}

/**
 * Replaces the keyframes an element got from a preset slot with the ones of
 * `presetId` ("none" just removes them). Keyframes created by hand are kept.
 * Returns the patch to write on the element.
 */
export function applyAnimationPreset({
	element,
	slot,
	presetId,
	durationTicks,
	canvas,
	frameTicks,
}: {
	element: TimelineElement;
	slot: AnimationPresetSlot;
	presetId: string | "none";
	durationTicks: number;
	canvas: PresetCanvas;
	frameTicks: number;
}): { animations: ElementAnimations | undefined; animationPresets: ElementAnimationPresets } {
	let animations = removeSlotKeyframes({ element, slot });
	const animationPresets: ElementAnimationPresets = { ...(element.animationPresets ?? {}) };
	delete animationPresets[slot];
	if (presetId === "none") return { animations, animationPresets };

	const elementTicks = Number(element.duration);
	const opposite = OPPOSITE[slot];
	const presetTicks = clampPresetTicks({
		slot,
		presetTicks: durationTicks,
		elementTicks,
		hasOppositeSlot: opposite !== null && animationPresets[opposite] !== undefined,
	});
	const anchor = slot === "in" ? presetTicks : slot === "out" ? elementTicks - presetTicks : elementTicks / 2;
	const base = resolveBase({ element, animations, localTicks: anchor });
	const generated = buildPresetKeyframes({
		slot,
		presetId,
		base,
		canvas,
		presetTicks,
		elementTicks,
		frameTicks,
	});

	const keyframeIds: string[] = [];
	const created: Array<{ path: string; id: string; ease: keyof typeof PRESET_EASE_CURVES }> = [];
	for (const keyframe of generated) {
		const target = resolveAnimationTarget({ element, path: keyframe.path });
		if (!target) continue;
		const id = generateUUID();
		animations = upsertPathKeyframe({
			animations,
			propertyPath: keyframe.path,
			time: mediaTime({ ticks: keyframe.time }),
			value: keyframe.value,
			interpolation: "linear",
			keyframeId: id,
			channelLayout: target.channelLayout,
			coerceValue: target.coerceValue,
		});
		keyframeIds.push(id);
		created.push({ path: keyframe.path, id, ease: keyframe.ease });
	}

	for (const { path, id, ease } of created) {
		if (ease === "linear") continue;
		const context = getScalarKeyframeContext({
			animations,
			propertyPath: path,
			componentKey: "value",
			keyframeId: id,
		});
		if (!context?.nextKey) continue;
		const patches = buildGraphEditorCurvePatches({
			context,
			cubicBezier: PRESET_EASE_CURVES[ease],
			referenceSpanValue: getReferenceSpanValue({ context }),
		});
		for (const { keyframeId, patch } of patches ?? []) {
			animations = updateScalarKeyframeCurve({
				animations,
				propertyPath: path,
				componentKey: "value",
				keyframeId,
				patch,
			});
		}
	}

	animationPresets[slot] = { presetId, durationTicks: presetTicks, keyframeIds };
	return { animations, animationPresets };
}
