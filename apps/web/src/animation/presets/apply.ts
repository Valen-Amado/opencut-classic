import type { ElementAnimationPresets } from "@/timeline/types";
import { roundMediaTime } from "@/wasm";
import { clampPresetTicks, type AnimationPresetSlot } from "./catalog";

const OPPOSITE: Record<AnimationPresetSlot, AnimationPresetSlot | null> = {
	in: "out",
	out: "in",
	loop: null,
};

/**
 * Sets (or with "none", clears) the preset of one slot. Only the element's
 * `animationPresets` change; presets never touch its keyframes. The duration
 * is clamped so an entrance and an exit fit in the element together.
 */
export function applyAnimationPreset({
	animationPresets,
	slot,
	presetId,
	durationTicks,
	elementDuration,
}: {
	animationPresets: ElementAnimationPresets | undefined;
	slot: AnimationPresetSlot;
	presetId: string | "none";
	durationTicks: number;
	elementDuration: number;
}): ElementAnimationPresets {
	const next: ElementAnimationPresets = { ...(animationPresets ?? {}) };
	delete next[slot];
	if (presetId === "none") return next;

	const opposite = OPPOSITE[slot];
	const ticks = clampPresetTicks({
		slot,
		presetTicks: durationTicks,
		elementTicks: elementDuration,
		hasOppositeSlot: opposite !== null && next[opposite] !== undefined,
	});
	next[slot] = { presetId, duration: roundMediaTime({ time: ticks }) };
	return next;
}

/**
 * Presets of the two halves of a split: the entrance stays at the start (left
 * part) and the exit at the end (right part); a loop runs on both.
 */
export function splitAnimationPresets({
	animationPresets,
}: {
	animationPresets: ElementAnimationPresets | undefined;
}): {
	left: ElementAnimationPresets | undefined;
	right: ElementAnimationPresets | undefined;
} {
	if (!animationPresets) return { left: undefined, right: undefined };
	const { in: entrance, out: exit, loop } = animationPresets;
	return {
		left: {
			...(entrance ? { in: entrance } : {}),
			...(loop ? { loop } : {}),
		},
		right: {
			...(exit ? { out: exit } : {}),
			...(loop ? { loop } : {}),
		},
	};
}
