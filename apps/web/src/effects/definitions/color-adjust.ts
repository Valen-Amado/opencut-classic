import type { EffectDefinition } from "@/effects/types";
import {
	ADJUSTMENT_KEYS,
	ADJUSTMENT_META,
	COLOR_ADJUST_EFFECT_TYPE,
	COLOR_ADJUST_SHADER,
	COLOR_PRESETS,
	buildColorAdjustUniforms,
} from "@/effects/color-adjust";

export const colorAdjustEffectDefinition: EffectDefinition = {
	type: COLOR_ADJUST_EFFECT_TYPE,
	name: "Ajustes de color",
	keywords: ["color", "ajustes", "filtro", "lut", "exposure", "saturation", "grade"],
	params: [
		{
			key: "preset",
			label: "Preset",
			type: "select",
			default: "none",
			keyframable: false,
			options: [
				{ value: "none", label: "Ninguno" },
				...COLOR_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })),
			],
		},
		{ key: "intensity", label: "Intensidad", type: "number", default: 100, min: 0, max: 100, step: 1 },
		...ADJUSTMENT_KEYS.map((key) => ({
			key,
			label: ADJUSTMENT_META[key].label,
			type: "number" as const,
			default: 0,
			min: ADJUSTMENT_META[key].min,
			max: ADJUSTMENT_META[key].max,
			step: 1,
		})),
	],
	renderer: {
		passes: [
			{
				shader: COLOR_ADJUST_SHADER,
				uniforms: ({ effectParams }) => buildColorAdjustUniforms({ params: effectParams }),
			},
		],
	},
};
