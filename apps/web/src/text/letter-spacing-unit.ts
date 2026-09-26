import { getChannel, setChannel } from "@/animation";
import { isScalarChannel } from "@/animation/interpolation";
import type { TextElement } from "@/timeline";
import { FONT_SIZE_SCALE_REFERENCE } from "./typography";

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Text saved before v33 keeps its letter spacing in raw canvas pixels
 * (`letterSpacingUnit: "px"`). The first time the user edits it, convert the
 * value and its keyframes to font-size units so the field behaves like on new
 * text; the rendered spacing stays the same. Returns null when there is
 * nothing to convert.
 */
export function buildLetterSpacingUnitUpgrade({
	element,
	canvasHeight,
}: {
	element: TextElement;
	canvasHeight: number;
}): Pick<TextElement, "params" | "animations"> | null {
	if (element.params.letterSpacingUnit !== "px" || canvasHeight <= 0) return null;
	const scale = canvasHeight / FONT_SIZE_SCALE_REFERENCE;
	const base = element.params.letterSpacing;

	let animations = element.animations;
	const channel = getChannel({ animations, propertyPath: "letterSpacing" });
	if (channel && isScalarChannel(channel)) {
		animations = setChannel({
			animations,
			propertyPath: "letterSpacing",
			channel: {
				...channel,
				keys: channel.keys.map((key) => ({ ...key, value: round(key.value / scale) })),
			},
		});
	}

	return {
		params: {
			...element.params,
			letterSpacing: typeof base === "number" ? round(base / scale) : 0,
			letterSpacingUnit: "font",
		},
		animations,
	};
}
