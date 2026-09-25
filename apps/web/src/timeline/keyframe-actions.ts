import type { EditorCore } from "@/core";
import { buildEasingPatchesAtTimes } from "@/animation/keyframe-easing";
import { getElementKeyframes } from "@/animation/keyframe-query";
import type { NormalizedCubicBezier, SelectedKeyframeRef } from "@/animation/types";
import type { TimelineElement } from "@/timeline";

/** Keyframe refs of an element that sit at any of the given local times. */
export function getKeyframeRefsAtTimes({
	element,
	trackId,
	times,
}: {
	element: TimelineElement;
	trackId: string;
	times: readonly number[];
}): SelectedKeyframeRef[] {
	const wanted = new Set(times);
	return getElementKeyframes({ animations: element.animations })
		.filter((keyframe) => wanted.has(keyframe.time))
		.map((keyframe) => ({
			trackId,
			elementId: element.id,
			propertyPath: keyframe.propertyPath,
			keyframeId: keyframe.id,
		}));
}

/** Applies one easing to every segment that starts at the given keyframe times. */
export function applyEasingAtTimes({
	editor,
	element,
	trackId,
	times,
	cubicBezier,
}: {
	editor: EditorCore;
	element: TimelineElement;
	trackId: string;
	times: readonly number[];
	cubicBezier: NormalizedCubicBezier;
}): void {
	const patches = buildEasingPatchesAtTimes({
		animations: element.animations,
		times,
		cubicBezier,
	});
	editor.timeline.updateKeyframeCurves({
		keyframes: patches.map((patch) => ({ trackId, elementId: element.id, ...patch })),
	});
}
