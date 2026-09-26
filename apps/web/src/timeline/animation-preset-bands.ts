import {
	getAnimationPresetLabel,
	type AnimationPresetSlot,
} from "@/animation/presets/catalog";
import { getEffectivePresetDuration } from "@/animation/presets/resolve";
import { TICKS_PER_SECOND } from "@/wasm";
import type { ElementAnimationPresets } from "./types";

export const ANIMATION_PRESET_SLOT_LABELS: Record<AnimationPresetSlot, string> =
	{
		in: "Entrada",
		out: "Salida",
		loop: "Bucle",
	};

const BAND_SLOTS: readonly AnimationPresetSlot[] = ["in", "out", "loop"];

export interface AnimationPresetBand {
	slot: AnimationPresetSlot;
	/** Share of the clip width the band covers (0..100). The loop covers it all. */
	widthPercent: number;
	tooltip: string;
}

/** "0,6 s": one decimal with a decimal comma. */
export function formatPresetSeconds({ ticks }: { ticks: number }): string {
	return `${(ticks / TICKS_PER_SECOND).toFixed(1).replace(".", ",")} s`;
}

/**
 * Bands drawn over a timeline clip for its animation presets: the entrance at
 * the start and the exit at the end, as wide as the time they actually play,
 * and the loop along the whole clip.
 */
export function getAnimationPresetBands({
	animationPresets,
	elementDuration,
}: {
	animationPresets: ElementAnimationPresets | undefined;
	elementDuration: number;
}): AnimationPresetBand[] {
	if (!animationPresets || elementDuration <= 0) return [];
	return BAND_SLOTS.flatMap((slot) => {
		const entry = animationPresets[slot];
		if (!entry) return [];
		const ticks = getEffectivePresetDuration({
			animationPresets,
			slot,
			elementDuration,
		});
		const label =
			getAnimationPresetLabel({ slot, presetId: entry.presetId }) ??
			entry.presetId;
		return [
			{
				slot,
				widthPercent:
					slot === "loop" ? 100 : Math.min(100, (ticks / elementDuration) * 100),
				tooltip: `${ANIMATION_PRESET_SLOT_LABELS[slot]}: ${label} · ${formatPresetSeconds({ ticks })}`,
			},
		];
	});
}

export function parseAnimationPresetSlot({
	value,
}: {
	value: string | null | undefined;
}): AnimationPresetSlot | null {
	return BAND_SLOTS.find((slot) => slot === value) ?? null;
}
