import type { EditorCore } from "@/core";
import { buildDefaultEffectInstance } from "@/effects";
import {
	COLOR_ADJUST_EFFECT_TYPE,
	getColorPreset,
} from "@/effects/color-adjust";
import type { Effect } from "@/effects/types";
import type { EffectElement, TimelineElement, VisualElement } from "@/timeline";
import { buildEffectElement, isVisualElement } from "@/timeline/element-utils";

export type ColorAdjustTarget =
	| { kind: "clip"; trackId: string; element: VisualElement }
	| { kind: "layer"; trackId: string; element: EffectElement };

/** What a color preset would apply to given the current selection, if anything. */
export function getColorAdjustTarget({
	editor,
}: {
	editor: EditorCore;
}): ColorAdjustTarget | null {
	const selected = editor.selection.getSelectedElements();
	if (selected.length !== 1) return null;
	const [found] = editor.timeline.getElementsWithTracks({ elements: selected });
	if (!found) return null;
	const { track, element } = found;
	if (element.type === "effect" && element.effectType === COLOR_ADJUST_EFFECT_TYPE) {
		return { kind: "layer", trackId: track.id, element };
	}
	if (isVisualElement(element)) {
		return { kind: "clip", trackId: track.id, element };
	}
	return null;
}

export function getClipColorAdjustEffect({
	element,
}: {
	element: TimelineElement;
}): Effect | null {
	if (!isVisualElement(element)) return null;
	return element.effects?.find((effect) => effect.type === COLOR_ADJUST_EFFECT_TYPE) ?? null;
}

const layerName = (presetId: string) => {
	const preset = getColorPreset(presetId);
	return preset ? `Ajuste · ${preset.label}` : "Capa de ajuste";
};

/** Element patch that sets a preset on the target (adding the effect to a clip if needed). */
export function buildColorPresetPatch({
	target,
	presetId,
}: {
	target: ColorAdjustTarget;
	presetId: string;
}): Partial<TimelineElement> {
	if (target.kind === "layer") {
		return {
			name: layerName(presetId),
			params: { ...target.element.params, preset: presetId },
		};
	}
	const effects = target.element.effects ?? [];
	const existing = effects.find((effect) => effect.type === COLOR_ADJUST_EFFECT_TYPE);
	if (existing) {
		return {
			effects: effects.map((effect) =>
				effect.id === existing.id
					? { ...effect, enabled: true, params: { ...effect.params, preset: presetId } }
					: effect,
			),
		};
	}
	const instance = buildDefaultEffectInstance({ effectType: COLOR_ADJUST_EFFECT_TYPE });
	return {
		effects: [...effects, { ...instance, params: { ...instance.params, preset: presetId } }],
	};
}

export function applyColorPreset({
	editor,
	target,
	presetId,
}: {
	editor: EditorCore;
	target: ColorAdjustTarget;
	presetId: string;
}): void {
	editor.timeline.discardPreview();
	editor.timeline.updateElements({
		updates: [
			{
				trackId: target.trackId,
				elementId: target.element.id,
				patch: buildColorPresetPatch({ target, presetId }),
			},
		],
	});
}

/** Adds an adjustment layer at the playhead; it affects everything below it. */
export function insertAdjustmentLayer({
	editor,
	presetId = "none",
}: {
	editor: EditorCore;
	presetId?: string;
}): void {
	const element = buildEffectElement({
		effectType: COLOR_ADJUST_EFFECT_TYPE,
		startTime: editor.playback.getCurrentTime(),
	});
	editor.timeline.insertElement({
		placement: { mode: "auto", trackType: "effect" },
		element: {
			...element,
			name: layerName(presetId),
			params: { ...element.params, preset: presetId },
		},
	});
}
