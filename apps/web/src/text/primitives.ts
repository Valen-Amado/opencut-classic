import type { TextCanvasContext, TextBlockMeasurement } from "@/text/layout";
import { DEFAULTS } from "@/timeline/defaults";
import { clamp } from "@/utils/math";
import { CORNER_RADIUS_MAX, CORNER_RADIUS_MIN } from "./background";
import {
	drawTextDecoration,
	getLineAnchorX,
	getTextBackgroundRect,
	measureTextBlock,
	setCanvasLetterSpacing,
} from "./layout";
import { FONT_SIZE_SCALE_REFERENCE } from "./typography";
import { getRevealedLines, isFullyRevealed, type TextReveal } from "./reveal";
import { EMPTY_TEXT_PAINT_STYLE, type TextPaintStyle } from "./effects";
import { getContextDeviceScale, paintTextRun } from "./paint";

export type TextAlign = "left" | "center" | "right";
export type TextFontWeight = "normal" | "bold";
export type TextFontStyle = "normal" | "italic";
export type TextDecoration = "none" | "underline" | "line-through";
export type LetterSpacingUnit = "font" | "px";

export interface TextLayoutParams {
	content: string;
	fontSize: number;
	fontFamily: string;
	fontWeight: TextFontWeight;
	fontStyle: TextFontStyle;
	textAlign: TextAlign;
	textDecoration?: TextDecoration;
	letterSpacing?: number;
	/**
	 * "font": letter spacing in font-size units, scaled with the canvas like
	 * fontSize (what text elements use). "px" (default): raw canvas pixels,
	 * kept for text masks and for text saved before the unit existed.
	 */
	letterSpacingUnit?: LetterSpacingUnit;
	lineHeight?: number;
	/** Typewriter / word reveal; the full text when omitted. */
	reveal?: TextReveal;
}

export interface ResolvedTextLayout {
	scaledFontSize: number;
	fontString: string;
	letterSpacing: number;
	lineHeightPx: number;
	fontSizeRatio: number;
	textAlign: TextAlign;
	textDecoration: TextDecoration;
}

export interface MeasuredTextLayout extends ResolvedTextLayout {
	lines: string[];
	lineMetrics: TextMetrics[];
	block: TextBlockMeasurement;
	/** Part of each line to draw while the text reveals; all of it when omitted. */
	visibleLines?: string[];
}

export interface ResolvedTextBackgroundLike {
	enabled: boolean;
	color: string;
	paddingX: number;
	paddingY: number;
	offsetX: number;
	offsetY: number;
	cornerRadius: number;
}

export function quoteFontFamily({ fontFamily }: { fontFamily: string }): string {
	return `"${fontFamily.replace(/"/g, '\\"')}"`;
}

export function buildTextFontString({
	fontFamily,
	fontWeight,
	fontStyle,
	scaledFontSize,
}: {
	fontFamily: string;
	fontWeight: TextFontWeight;
	fontStyle: TextFontStyle;
	scaledFontSize: number;
}): string {
	return `${fontStyle} ${fontWeight} ${scaledFontSize}px ${quoteFontFamily({ fontFamily })}, sans-serif`;
}

/** Letter spacing in canvas pixels for a value in the given unit. */
export function resolveLetterSpacingPx({
	letterSpacing,
	unit = "px",
	canvasHeight,
}: {
	letterSpacing: number;
	unit?: LetterSpacingUnit;
	canvasHeight: number;
}): number {
	return unit === "font"
		? letterSpacing * (canvasHeight / FONT_SIZE_SCALE_REFERENCE)
		: letterSpacing;
}

/**
 * Lines that take up space. Trailing line breaks are dropped: they draw
 * nothing but would add empty lines to the box, pushing the text to the top
 * (editing on the canvas easily leaves some, since browsers report an extra
 * line break at the end of edited content).
 */
export function getVisibleTextLines({ content }: { content: string }): string[] {
	return content.replace(/\n+$/, "").split("\n");
}

export function resolveTextLayout({
	text,
	canvasHeight,
}: {
	text: TextLayoutParams;
	canvasHeight: number;
}): ResolvedTextLayout {
	const scaledFontSize =
		text.fontSize * (canvasHeight / FONT_SIZE_SCALE_REFERENCE);
	const fontWeight = text.fontWeight === "bold" ? "bold" : "normal";
	const fontStyle = text.fontStyle === "italic" ? "italic" : "normal";
	const letterSpacing = resolveLetterSpacingPx({
		letterSpacing: text.letterSpacing ?? DEFAULTS.text.letterSpacing,
		unit: text.letterSpacingUnit,
		canvasHeight,
	});
	const lineHeightPx =
		scaledFontSize * (text.lineHeight ?? DEFAULTS.text.lineHeight);
	const fontSizeRatio = text.fontSize / 15;

	return {
		scaledFontSize,
		fontString: buildTextFontString({
			fontFamily: text.fontFamily,
			fontWeight,
			fontStyle,
			scaledFontSize,
		}),
		letterSpacing,
		lineHeightPx,
		fontSizeRatio,
		textAlign: text.textAlign,
		textDecoration: text.textDecoration ?? "none",
	};
}

export function measureTextLayout({
	text,
	canvasHeight,
	ctx,
}: {
	text: TextLayoutParams;
	canvasHeight: number;
	ctx: TextCanvasContext;
}): MeasuredTextLayout {
	const resolvedLayout = resolveTextLayout({ text, canvasHeight });
	const lines = getVisibleTextLines({ content: text.content });

	ctx.save();
	ctx.font = resolvedLayout.fontString;
	ctx.textBaseline = "middle";
	setCanvasLetterSpacing({
		ctx,
		letterSpacingPx: resolvedLayout.letterSpacing,
	});
	const lineMetrics = lines.map((line) => ctx.measureText(line));
	ctx.restore();

	const block = measureTextBlock({
		lineMetrics,
		lineHeightPx: resolvedLayout.lineHeightPx,
	});

	return {
		...resolvedLayout,
		lines,
		lineMetrics,
		block,
		...(isFullyRevealed({ reveal: text.reveal })
			? {}
			: { visibleLines: getRevealedLines({ lines, reveal: text.reveal ?? { characters: 100, words: 100 } }) }),
	};
}

/**
 * Where and how to draw line `index`. A partially revealed line is drawn
 * left-aligned from where the full line starts, so it types in place instead
 * of re-centering on every character.
 */
function getLineDraw({
	ctx,
	layout,
	index,
	lineX,
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	index: number;
	lineX: number;
}): { text: string; x: number; align: CanvasTextAlign; width: number } {
	const full = layout.lines[index];
	const fullWidth = layout.lineMetrics[index].width;
	const text = layout.visibleLines?.[index] ?? full;
	if (text === full) {
		return { text, x: lineX, align: layout.textAlign, width: fullWidth };
	}
	const startOffset =
		layout.textAlign === "center" ? fullWidth / 2 : layout.textAlign === "right" ? fullWidth : 0;
	return {
		text,
		x: lineX - startOffset,
		align: "left",
		width: text ? ctx.measureText(text).width : 0,
	};
}

export function drawMeasuredTextLayout({
	ctx,
	layout,
	textColor,
	background,
	backgroundColor,
	textBaseline = "middle",
	style = EMPTY_TEXT_PAINT_STYLE,
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	textColor: string;
	background?: ResolvedTextBackgroundLike | null;
	backgroundColor?: string;
	textBaseline?: CanvasTextBaseline;
	/** Shadow, stroke and text effects; plain fill when omitted. */
	style?: TextPaintStyle;
}): void {
	ctx.font = layout.fontString;
	ctx.textAlign = layout.textAlign;
	ctx.textBaseline = textBaseline;
	ctx.fillStyle = textColor;
	setCanvasLetterSpacing({ ctx, letterSpacingPx: layout.letterSpacing });

	if (
		background?.enabled &&
		backgroundColor &&
		backgroundColor !== "transparent" &&
		layout.lines.length > 0
	) {
		const backgroundRect = getTextBackgroundRect({
			textAlign: layout.textAlign,
			block: layout.block,
			background: {
				...background,
				color: backgroundColor,
			},
			fontSizeRatio: layout.fontSizeRatio,
		});
		if (backgroundRect) {
			const p =
				clamp({
					value: background.cornerRadius,
					min: CORNER_RADIUS_MIN,
					max: CORNER_RADIUS_MAX,
				}) / 100;
			const radius =
				(Math.min(backgroundRect.width, backgroundRect.height) / 2) * p;
			ctx.fillStyle = backgroundColor;
			ctx.beginPath();
			ctx.roundRect(
				backgroundRect.left,
				backgroundRect.top,
				backgroundRect.width,
				backgroundRect.height,
				radius,
			);
			ctx.fill();
			ctx.fillStyle = textColor;
		}
	}

	const deviceScale = getContextDeviceScale({ ctx });
	const lineX = getLineAnchorX({
		textAlign: layout.textAlign,
		block: layout.block,
	});
	for (let index = 0; index < layout.lines.length; index++) {
		const lineY = index * layout.lineHeightPx - layout.block.visualCenterOffset;
		const line = getLineDraw({ ctx, layout, index, lineX });
		if (!line.text) continue;
		ctx.textAlign = line.align;
		paintTextRun({
			ctx,
			text: line.text,
			x: line.x,
			y: lineY,
			fontSize: layout.scaledFontSize,
			textColor,
			style,
			deviceScale,
		});
		drawTextDecoration({
			ctx,
			textDecoration: layout.textDecoration,
			lineWidth: line.width,
			lineX: line.x,
			lineY,
			metrics: layout.lineMetrics[index],
			scaledFontSize: layout.scaledFontSize,
			textAlign: line.align,
		});
	}
	ctx.textAlign = layout.textAlign;
}

export function strokeMeasuredTextLayout({
	ctx,
	layout,
	strokeColor,
	strokeWidth,
	textBaseline = "middle",
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	strokeColor: string;
	strokeWidth: number;
	textBaseline?: CanvasTextBaseline;
}): void {
	ctx.font = layout.fontString;
	ctx.textAlign = layout.textAlign;
	ctx.textBaseline = textBaseline;
	ctx.strokeStyle = strokeColor;
	ctx.lineWidth = strokeWidth;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	setCanvasLetterSpacing({ ctx, letterSpacingPx: layout.letterSpacing });

	const lineX = getLineAnchorX({
		textAlign: layout.textAlign,
		block: layout.block,
	});
	for (let index = 0; index < layout.lines.length; index++) {
		const lineY = index * layout.lineHeightPx - layout.block.visualCenterOffset;
		const line = getLineDraw({ ctx, layout, index, lineX });
		if (!line.text) continue;
		ctx.textAlign = line.align;
		ctx.strokeText(line.text, line.x, lineY);
	}
	ctx.textAlign = layout.textAlign;
}
