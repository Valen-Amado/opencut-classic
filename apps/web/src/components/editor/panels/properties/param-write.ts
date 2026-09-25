import { hasKeyframesForPath } from "@/animation/keyframe-query";
import { upsertPathKeyframe } from "@/animation/keyframes";
import type { ParamValue } from "@/params";
import { resolveAnimationTarget } from "@/timeline/animation-targets";
import type { TimelineElement } from "@/timeline";
import type { MediaTime } from "@/wasm";

/**
 * Patch that writes several params in one step. Params that already have
 * keyframes get a keyframe at the playhead (auto-key); the rest change their
 * base value. Used for multi-param actions like align or linked scale.
 */
export function buildParamWritePatch({
	element,
	values,
	localTime,
	isPlayheadWithinElementRange,
}: {
	element: TimelineElement;
	values: Record<string, ParamValue>;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
}): Pick<TimelineElement, "params" | "animations"> {
	let animations = element.animations;
	const params = { ...element.params };
	for (const [key, value] of Object.entries(values)) {
		const isAnimated = hasKeyframesForPath({ animations, propertyPath: key });
		const target = isAnimated ? resolveAnimationTarget({ element, path: key }) : null;
		if (isAnimated && isPlayheadWithinElementRange && target) {
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
