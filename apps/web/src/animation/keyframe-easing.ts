import { getElementKeyframes } from "@/animation/keyframe-query";
import { getEditableScalarChannels, getScalarKeyframeContext } from "@/animation/graph-channels";
import { getNormalizedCubicBezierForScalarSegment } from "@/animation/curve-bridge";
import type {
	AnimationPath,
	ElementAnimations,
	NormalizedCubicBezier,
	ScalarCurveKeyframePatch,
} from "@/animation/types";
import {
	buildGraphEditorCurvePatches,
	getReferenceSpanValue,
} from "@/timeline/components/graph-editor/session";

export interface KeyframeCurvePatch {
	propertyPath: AnimationPath;
	componentKey: string;
	keyframeId: string;
	patch: ScalarCurveKeyframePatch;
}

const LINEAR: NormalizedCubicBezier = [0, 0, 1, 1];

/**
 * Curve patches that give every scalar segment starting at one of `times`
 * the same easing (the segment from that keyframe to the next one).
 */
export function buildEasingPatchesAtTimes({
	animations,
	times,
	cubicBezier,
}: {
	animations: ElementAnimations | undefined;
	times: readonly number[];
	cubicBezier: NormalizedCubicBezier;
}): KeyframeCurvePatch[] {
	const wanted = new Set(times);
	const propertyPaths = [
		...new Set(getElementKeyframes({ animations }).map((keyframe) => keyframe.propertyPath)),
	];
	const patches: KeyframeCurvePatch[] = [];

	for (const propertyPath of propertyPaths) {
		const editable = getEditableScalarChannels({ animations, propertyPath });
		for (const channel of editable?.channels ?? []) {
			for (const key of channel.channel.keys) {
				if (!wanted.has(key.time)) continue;
				const context = getScalarKeyframeContext({
					animations,
					propertyPath,
					componentKey: channel.componentKey,
					keyframeId: key.id,
				});
				if (!context?.nextKey) continue;
				const segmentPatches = buildGraphEditorCurvePatches({
					context,
					cubicBezier,
					referenceSpanValue: getReferenceSpanValue({ context }),
				});
				for (const { keyframeId, patch } of segmentPatches ?? []) {
					patches.push({ propertyPath, componentKey: channel.componentKey, keyframeId, patch });
				}
			}
		}
	}
	return patches;
}

/** Easing of the first scalar segment that starts at `time`, if any. */
export function getEasingAtTime({
	animations,
	time,
}: {
	animations: ElementAnimations | undefined;
	time: number;
}): NormalizedCubicBezier | null {
	const propertyPaths = [
		...new Set(getElementKeyframes({ animations }).map((keyframe) => keyframe.propertyPath)),
	];
	for (const propertyPath of propertyPaths) {
		const editable = getEditableScalarChannels({ animations, propertyPath });
		for (const channel of editable?.channels ?? []) {
			const keys = channel.channel.keys;
			const index = keys.findIndex((key) => key.time === time);
			const key = keys[index];
			const nextKey = keys[index + 1];
			if (!key || !nextKey) continue;
			if (key.segmentToNext === "linear") return LINEAR;
			if (key.segmentToNext !== "bezier") continue;
			return getNormalizedCubicBezierForScalarSegment({ leftKey: key, rightKey: nextKey });
		}
	}
	return null;
}
