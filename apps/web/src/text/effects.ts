import { formatRgb, parse } from "culori";
import { resolveAnimationPathValueAtTime } from "@/animation/resolve";
import type { ElementAnimations } from "@/animation/types";
import type { ParamValues } from "@/params";

/**
 * Text styling that goes beyond the fill: drop shadow, stroke and the text
 * effects. Values are stored as element params (all numbers and colors can be
 * keyframed) and resolved here into plain data the painter consumes.
 *
 * Sizes are relative to the scaled font size so a style looks the same at any
 * font size, canvas size or preview zoom.
 */

export const TEXT_SHADOW_DEFAULTS = {
	enabled: false,
	color: "#000000",
	/** 0–100 % */
	opacity: 60,
	/** 0–100, relative to the font size */
	blur: 30,
	/** 0–100, relative to the font size */
	distance: 8,
	/** Degrees, counter-clockwise from the +x axis: -45 points down-right. */
	angle: -45,
} as const;

export const TEXT_STROKE_DEFAULTS = {
	enabled: false,
	color: "#000000",
	/** 0–100, relative to the font size */
	width: 25,
} as const;

export const TEXT_FX_TYPES = [
	"none",
	"neon",
	"glow",
	"hollow",
	"hard",
	"lift",
	"echo",
	"glitch",
	"gradient",
] as const;

export type TextFxType = (typeof TEXT_FX_TYPES)[number];

export interface TextFxDefinition {
	label: string;
	/** Effect color picked when the effect is chosen. */
	defaultColor: string;
	usesColor: boolean;
	usesIntensity: boolean;
}

export const TEXT_FX_DEFINITIONS: Record<TextFxType, TextFxDefinition> = {
	none: { label: "Ninguno", defaultColor: "#ffffff", usesColor: false, usesIntensity: false },
	neon: { label: "Neón", defaultColor: "#ff2d95", usesColor: true, usesIntensity: true },
	glow: { label: "Resplandor", defaultColor: "#ffffff", usesColor: true, usesIntensity: true },
	hollow: { label: "Contorno", defaultColor: "#ffffff", usesColor: false, usesIntensity: true },
	hard: { label: "Sombra dura", defaultColor: "#ff5a1f", usesColor: true, usesIntensity: true },
	lift: { label: "3D", defaultColor: "#2567ec", usesColor: true, usesIntensity: true },
	echo: { label: "Eco", defaultColor: "#37b6f7", usesColor: true, usesIntensity: true },
	glitch: { label: "Glitch", defaultColor: "#00e5ff", usesColor: false, usesIntensity: true },
	gradient: { label: "Degradado", defaultColor: "#f7a24b", usesColor: true, usesIntensity: false },
};

export const TEXT_FX_DEFAULTS = {
	type: "none" as TextFxType,
	color: "#ff2d95",
	/** 0–100 % */
	intensity: 50,
};

/** Params edited in the "Efectos de texto" tab. */
export const TEXT_FX_PARAM_KEYS = ["fx.type", "fx.color", "fx.intensity"] as const;

export function isTextFxType(value: unknown): value is TextFxType {
	return TEXT_FX_TYPES.some((type) => type === value);
}

export interface TextFxStyle {
	type: TextFxType;
	color: string;
	/** 0–100 */
	intensity: number;
}

export interface TextShadowStyle {
	color: string;
	opacity: number;
	blur: number;
	distance: number;
	angle: number;
}

export interface TextStrokeStyle {
	color: string;
	width: number;
}

export interface TextPaintStyle {
	shadow: TextShadowStyle | null;
	stroke: TextStrokeStyle | null;
	fx: TextFxStyle;
}

export const EMPTY_TEXT_PAINT_STYLE: TextPaintStyle = {
	shadow: null,
	stroke: null,
	fx: { type: "none", color: TEXT_FX_DEFAULTS.color, intensity: TEXT_FX_DEFAULTS.intensity },
};

/**
 * Canvas `lineWidth` of the stroke, in local units. The stroke is drawn
 * behind the fill, so only its outer half shows.
 */
export function getStrokeLineWidth({
	stroke,
	fontSize,
}: {
	stroke: TextStrokeStyle;
	fontSize: number;
}): number {
	return (Math.max(0, stroke.width) / 100) * fontSize * 0.32 * 2;
}

/** Shadow offset and blur in local (font) units. */
export function getShadowGeometry({
	shadow,
	fontSize,
}: {
	shadow: TextShadowStyle;
	fontSize: number;
}): { offsetX: number; offsetY: number; blur: number } {
	const distance = (Math.max(0, shadow.distance) / 100) * fontSize * 0.5;
	const angle = (shadow.angle * Math.PI) / 180;
	return {
		offsetX: Math.cos(angle) * distance,
		// Canvas y grows downwards; a positive angle points up.
		offsetY: -Math.sin(angle) * distance,
		blur: (Math.max(0, shadow.blur) / 100) * fontSize * 0.6,
	};
}

/** `color` with its alpha multiplied by `alpha` (0–1), as a CSS color. */
export function colorWithAlpha({
	color,
	alpha,
}: {
	color: string;
	alpha: number;
}): string {
	const parsed = parse(color);
	if (!parsed) return color;
	const base = parsed.alpha ?? 1;
	return formatRgb({
		...parsed,
		alpha: Math.min(1, Math.max(0, base * alpha)),
	});
}

type StyleSource = {
	params: ParamValues;
	animations?: ElementAnimations;
};

/** Typed, keyframe-aware readers for one element at one time. */
export function createStyleReader({
	source,
	localTime,
}: {
	source: StyleSource;
	localTime?: number;
}) {
	const time = localTime === undefined ? undefined : Math.max(0, localTime);
	return {
		number: ({ key, fallback }: { key: string; fallback: number }): number => {
			const raw = source.params[key];
			const base = typeof raw === "number" ? raw : fallback;
			if (time === undefined) return base;
			return resolveAnimationPathValueAtTime({
				animations: source.animations,
				propertyPath: key,
				localTime: time,
				fallbackValue: base,
			});
		},
		string: ({ key, fallback }: { key: string; fallback: string }): string => {
			const raw = source.params[key];
			const base = typeof raw === "string" ? raw : fallback;
			if (time === undefined) return base;
			return resolveAnimationPathValueAtTime({
				animations: source.animations,
				propertyPath: key,
				localTime: time,
				fallbackValue: base,
			});
		},
		boolean: ({ key, fallback }: { key: string; fallback: boolean }): boolean => {
			const raw = source.params[key];
			return typeof raw === "boolean" ? raw : fallback;
		},
	};
}

/**
 * Resolves the paint style of a text element. With `localTime`, keyframed
 * numbers and colors resolve to their animated value at that time.
 */
export function buildTextPaintStyleFromElement({
	element,
	localTime,
}: {
	element: StyleSource;
	localTime?: number;
}): TextPaintStyle {
	const read = createStyleReader({ source: element, localTime });

	const shadow: TextShadowStyle | null = read.boolean({
		key: "shadow.enabled",
		fallback: TEXT_SHADOW_DEFAULTS.enabled,
	})
		? {
				color: read.string({ key: "shadow.color", fallback: TEXT_SHADOW_DEFAULTS.color }),
				opacity: read.number({ key: "shadow.opacity", fallback: TEXT_SHADOW_DEFAULTS.opacity }),
				blur: read.number({ key: "shadow.blur", fallback: TEXT_SHADOW_DEFAULTS.blur }),
				distance: read.number({
					key: "shadow.distance",
					fallback: TEXT_SHADOW_DEFAULTS.distance,
				}),
				angle: read.number({ key: "shadow.angle", fallback: TEXT_SHADOW_DEFAULTS.angle }),
			}
		: null;

	const stroke: TextStrokeStyle | null = read.boolean({
		key: "stroke.enabled",
		fallback: TEXT_STROKE_DEFAULTS.enabled,
	})
		? {
				color: read.string({ key: "stroke.color", fallback: TEXT_STROKE_DEFAULTS.color }),
				width: read.number({ key: "stroke.width", fallback: TEXT_STROKE_DEFAULTS.width }),
			}
		: null;

	const rawType = element.params["fx.type"];
	const fx: TextFxStyle = {
		type: isTextFxType(rawType) ? rawType : TEXT_FX_DEFAULTS.type,
		color: read.string({ key: "fx.color", fallback: TEXT_FX_DEFAULTS.color }),
		intensity: read.number({ key: "fx.intensity", fallback: TEXT_FX_DEFAULTS.intensity }),
	};

	return { shadow, stroke, fx };
}
