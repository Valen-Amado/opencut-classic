import { CORNER_RADIUS_MIN } from "@/text/background";
import { DEFAULTS } from "@/timeline/defaults";
import type { TextElement } from "@/timeline";
import type { TextBackground } from "@/text/background";
import { resolveNumberAtTime } from "@/animation/values";
import { resolveAnimationPathValueAtTime } from "@/animation/resolve";
import { layerPresetsOnTextLayout } from "@/animation/presets/resolve";
import {
	getTextVisualRect,
} from "./layout";
import { TICKS_PER_SECOND } from "@/wasm";
import { buildTextPaintStyleFromElement } from "./effects";
import {
	getWrapBounds,
	getWrapPhase,
	getWrapRingGeometry,
	type WrapRingGeometry,
} from "./wrap";
import {
	measureTextLayout,
	type MeasuredTextLayout,
	type TextAlign,
	type TextDecoration,
	type TextFontStyle,
	type TextFontWeight,
	type TextLayoutParams,
} from "./primitives";

export interface ResolvedTextBackground extends TextBackground {
	paddingX: number;
	paddingY: number;
	offsetX: number;
	offsetY: number;
	cornerRadius: number;
}

export interface MeasuredTextWrap {
	geometry: WrapRingGeometry;
	/** Ring rotation at this time, in radians. */
	phase: number;
}

export interface MeasuredTextElement extends MeasuredTextLayout {
	resolvedBackground: ResolvedTextBackground;
	visualRect: { left: number; top: number; width: number; height: number };
	/** Set when the text is laid on a ring ("Envolver" effect). */
	wrap: MeasuredTextWrap | null;
}

let textMeasurementContext:
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D
	| null = null;

export function getTextMeasurementContext():
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D {
	if (textMeasurementContext) {
		return textMeasurementContext;
	}

	if (typeof OffscreenCanvas !== "undefined") {
		const canvas = new OffscreenCanvas(1, 1);
		const context = canvas.getContext("2d");
		if (context) {
			textMeasurementContext = context;
			return context;
		}
	}

	if (typeof document !== "undefined") {
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");
		if (context) {
			textMeasurementContext = context;
			return context;
		}
	}

	throw new Error("Failed to create text measurement context");
}

export function measureTextElement({
	element,
	canvasHeight,
	canvasWidth = (canvasHeight * 16) / 9,
	localTime,
	ctx,
}: {
	element: TextElement;
	canvasHeight: number;
	/** Sizes the "Envolver" ring. */
	canvasWidth?: number;
	localTime: number;
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}): MeasuredTextElement {
	const text = buildTextLayoutParamsFromElement({ element, localTime });
	const measuredLayout = measureTextLayout({
		text,
		canvasHeight,
		ctx,
	});

	const bg = buildTextBackgroundFromElement({ element });
	const resolvedBackground: ResolvedTextBackground = {
		...bg,
		paddingX: resolveNumberAtTime({
			baseValue: bg.paddingX ?? DEFAULTS.text.background.paddingX,
			animations: element.animations,
			propertyPath: "background.paddingX",
			localTime,
		}),
		paddingY: resolveNumberAtTime({
			baseValue: bg.paddingY ?? DEFAULTS.text.background.paddingY,
			animations: element.animations,
			propertyPath: "background.paddingY",
			localTime,
		}),
		offsetX: resolveNumberAtTime({
			baseValue: bg.offsetX ?? DEFAULTS.text.background.offsetX,
			animations: element.animations,
			propertyPath: "background.offsetX",
			localTime,
		}),
		offsetY: resolveNumberAtTime({
			baseValue: bg.offsetY ?? DEFAULTS.text.background.offsetY,
			animations: element.animations,
			propertyPath: "background.offsetY",
			localTime,
		}),
		cornerRadius: resolveNumberAtTime({
			baseValue: bg.cornerRadius ?? CORNER_RADIUS_MIN,
			animations: element.animations,
			propertyPath: "background.cornerRadius",
			localTime,
		}),
	};

	const { fx } = buildTextPaintStyleFromElement({ element, localTime });
	const wrap: MeasuredTextWrap | null =
		fx.type === "wrap"
			? {
					geometry: getWrapRingGeometry({
						radiusPercent: fx.wrap.radius,
						tiltDegrees: fx.wrap.tilt,
						canvasWidth,
					}),
					phase: getWrapPhase({
						spinDegreesPerSecond: fx.wrap.spin,
						seconds: Math.max(0, localTime) / TICKS_PER_SECOND,
					}),
				}
			: null;

	const visualRect = wrap
		? getWrapBounds({ geometry: wrap.geometry, fontSize: measuredLayout.scaledFontSize })
		: getTextVisualRect({
				textAlign: text.textAlign,
				block: measuredLayout.block,
				background: resolvedBackground,
				fontSizeRatio: measuredLayout.fontSizeRatio,
			});

	return {
		...measuredLayout,
		resolvedBackground,
		visualRect,
		wrap,
	};
}

/**
 * With `localTime`, keyframed size params (font size, letter spacing, line
 * height) resolve to their animated value at that time, and animation presets
 * (letter spacing, text reveal) are layered on top.
 */
export function buildTextLayoutParamsFromElement({
	element,
	localTime,
}: {
	element: TextElement;
	localTime?: number;
}): TextLayoutParams {
	const readAnimatedNumber = ({
		key,
		fallback,
	}: {
		key: "fontSize" | "letterSpacing" | "lineHeight" | "revealCharacters" | "revealWords";
		fallback: number;
	}) => {
		const baseValue = readNumberParam({ params: element.params, key, fallback });
		if (localTime === undefined) return baseValue;
		return resolveAnimationPathValueAtTime({
			animations: element.animations,
			propertyPath: key,
			localTime: Math.max(0, localTime),
			fallbackValue: baseValue,
		});
	};

	const animated = {
		letterSpacing: readAnimatedNumber({
			key: "letterSpacing",
			fallback: DEFAULTS.text.letterSpacing,
		}),
		revealCharacters: readAnimatedNumber({
			key: "revealCharacters",
			fallback: 100,
		}),
		revealWords: readAnimatedNumber({ key: "revealWords", fallback: 100 }),
	};
	const withPresets =
		localTime === undefined
			? animated
			: layerPresetsOnTextLayout({
					...animated,
					localTime: Math.max(0, localTime),
					presets: {
						animationPresets: element.animationPresets,
						duration: element.duration,
						// Letter spacing and reveal curves never depend on the canvas.
						canvas: { width: 0, height: 0 },
					},
				});

	return {
		content: readStringParam({
			params: element.params,
			key: "content",
			fallback: "Default text",
		}),
		fontSize: readAnimatedNumber({ key: "fontSize", fallback: 15 }),
		fontFamily: readStringParam({
			params: element.params,
			key: "fontFamily",
			fallback: "Arial",
		}),
		fontWeight: readFontWeight({
			value: element.params.fontWeight,
			fallback: "normal",
		}),
		fontStyle: readFontStyle({
			value: element.params.fontStyle,
			fallback: "normal",
		}),
		textAlign: readTextAlign({
			value: element.params.textAlign,
			fallback: "center",
		}),
		textDecoration: readTextDecoration({
			value: element.params.textDecoration,
			fallback: "none",
		}),
		letterSpacing: withPresets.letterSpacing,
		// Text saved before v33 with a spacing keeps raw pixels so it looks the same.
		letterSpacingUnit: element.params.letterSpacingUnit === "px" ? "px" : "font",
		lineHeight: readAnimatedNumber({
			key: "lineHeight",
			fallback: DEFAULTS.text.lineHeight,
		}),
		reveal: {
			characters: withPresets.revealCharacters,
			words: withPresets.revealWords,
		},
	};
}

export function buildTextBackgroundFromElement({
	element,
}: {
	element: TextElement;
}): TextBackground {
	return {
		enabled: readBooleanParam({
			params: element.params,
			key: "background.enabled",
			fallback: DEFAULTS.text.background.enabled,
		}),
		color: readStringParam({
			params: element.params,
			key: "background.color",
			fallback: DEFAULTS.text.background.color,
		}),
		cornerRadius: readNumberParam({
			params: element.params,
			key: "background.cornerRadius",
			fallback: DEFAULTS.text.background.cornerRadius,
		}),
		paddingX: readNumberParam({
			params: element.params,
			key: "background.paddingX",
			fallback: DEFAULTS.text.background.paddingX,
		}),
		paddingY: readNumberParam({
			params: element.params,
			key: "background.paddingY",
			fallback: DEFAULTS.text.background.paddingY,
		}),
		offsetX: readNumberParam({
			params: element.params,
			key: "background.offsetX",
			fallback: DEFAULTS.text.background.offsetX,
		}),
		offsetY: readNumberParam({
			params: element.params,
			key: "background.offsetY",
			fallback: DEFAULTS.text.background.offsetY,
		}),
	};
}

function readStringParam({
	params,
	key,
	fallback,
}: {
	params: TextElement["params"];
	key: string;
	fallback: string;
}): string {
	const value = params[key];
	return typeof value === "string" ? value : fallback;
}

function readNumberParam({
	params,
	key,
	fallback,
}: {
	params: TextElement["params"];
	key: string;
	fallback: number;
}): number {
	const value = params[key];
	return typeof value === "number" ? value : fallback;
}

function readBooleanParam({
	params,
	key,
	fallback,
}: {
	params: TextElement["params"];
	key: string;
	fallback: boolean;
}): boolean {
	const value = params[key];
	return typeof value === "boolean" ? value : fallback;
}

function readTextAlign({
	value,
	fallback,
}: {
	value: unknown;
	fallback: TextAlign;
}): TextAlign {
	return value === "left" || value === "center" || value === "right"
		? value
		: fallback;
}

function readFontWeight({
	value,
	fallback,
}: {
	value: unknown;
	fallback: TextFontWeight;
}): TextFontWeight {
	return value === "bold" || value === "normal" ? value : fallback;
}

function readFontStyle({
	value,
	fallback,
}: {
	value: unknown;
	fallback: TextFontStyle;
}): TextFontStyle {
	return value === "italic" || value === "normal" ? value : fallback;
}

function readTextDecoration({
	value,
	fallback,
}: {
	value: unknown;
	fallback: TextDecoration;
}): TextDecoration {
	return value === "none" || value === "underline" || value === "line-through"
		? value
		: fallback;
}
