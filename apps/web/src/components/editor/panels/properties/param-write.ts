import { hasKeyframesForPath } from "@/animation/keyframe-query";
import { upsertPathKeyframe } from "@/animation/keyframes";
import type { ParamValue } from "@/params";
import { resolveAnimationTarget } from "@/timeline/animation-targets";
import type { TimelineElement } from "@/timeline";
import { getElementLocalTime } from "@/animation";
import { addMediaTime, mediaTime, type MediaTime } from "@/wasm";

/** Where the playhead sits relative to an element, for writing its keyframes. */
export function resolveElementPlayhead({
	startTime,
	duration,
	playheadTime,
}: {
	startTime: MediaTime;
	duration: MediaTime;
	playheadTime: MediaTime;
}): { localTime: MediaTime; isPlayheadWithinElementRange: boolean } {
	return {
		localTime: mediaTime({
			ticks: getElementLocalTime({
				timelineTime: playheadTime,
				elementStartTime: startTime,
				elementDuration: duration,
			}),
		}),
		isPlayheadWithinElementRange:
			playheadTime >= startTime &&
			playheadTime <= addMediaTime({ a: startTime, b: duration }),
	};
}

/**
 * Patch that writes several params in one step. Params that already have
 * keyframes get a keyframe at `localTime` (auto-key); the rest change their
 * base value. A base write can't change what a keyframed param shows, so with
 * the playhead outside the clip the key lands on the clip edge it's clamped to.
 * Used for multi-param actions like align, linked scale and gestures on the
 * canvas.
 */
export function buildParamWritePatch({
	element,
	values,
	localTime,
}: {
	element: TimelineElement;
	values: Record<string, ParamValue>;
	localTime: MediaTime;
}): Pick<TimelineElement, "params" | "animations"> {
	let animations = element.animations;
	const params = { ...element.params };
	for (const [key, value] of Object.entries(values)) {
		const isAnimated = hasKeyframesForPath({ animations, propertyPath: key });
		const target = isAnimated ? resolveAnimationTarget({ element, path: key }) : null;
		if (isAnimated && target) {
			animations = upsertPathKeyframe({
				animations,
				propertyPath: key,
				time: localTime,
				value,
				channelLayout: target.channelLayout,
				coerceValue: target.coerceValue,
			});
		} else {
			params[key] = value;
		}
	}
	return { params, animations };
}
