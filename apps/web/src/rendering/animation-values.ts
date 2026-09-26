import type { ElementAnimations } from "@/animation/types";
import { resolveAnimationPathValueAtTime } from "@/animation";
import {
	layerPresetsOnTransform,
	type PresetLayerContext,
} from "@/animation/presets/resolve";
import type { Transform } from "./index";

/**
 * Transform at an element-local time: params + manual keyframes, plus the
 * element's animation presets when `presets` is given. Pass `presets` for
 * anything displayed; omit it where the manual value is being edited.
 */
export function resolveTransformAtTime({
	baseTransform,
	animations,
	localTime,
	presets,
}: {
	baseTransform: Transform;
	animations: ElementAnimations | undefined;
	localTime: number;
	presets?: PresetLayerContext;
}): Transform {
	const safeLocalTime = Math.max(0, localTime);
	const transform: Transform = {
		position: {
			x: resolveAnimationPathValueAtTime({
				animations,
				propertyPath: "transform.positionX",
				localTime: safeLocalTime,
				fallbackValue: baseTransform.position.x,
			}),
			y: resolveAnimationPathValueAtTime({
				animations,
				propertyPath: "transform.positionY",
				localTime: safeLocalTime,
				fallbackValue: baseTransform.position.y,
			}),
		},
		scaleX: resolveAnimationPathValueAtTime({
			animations,
			propertyPath: "transform.scaleX",
			localTime: safeLocalTime,
			fallbackValue: baseTransform.scaleX,
		}),
		scaleY: resolveAnimationPathValueAtTime({
			animations,
			propertyPath: "transform.scaleY",
			localTime: safeLocalTime,
			fallbackValue: baseTransform.scaleY,
		}),
		rotate: resolveAnimationPathValueAtTime({
			animations,
			propertyPath: "transform.rotate",
			localTime: safeLocalTime,
			fallbackValue: baseTransform.rotate,
		}),
	};
	if (!presets) return transform;
	return layerPresetsOnTransform({
		transform,
		localTime: safeLocalTime,
		presets,
	});
}
