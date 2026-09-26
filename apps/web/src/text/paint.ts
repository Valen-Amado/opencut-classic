import type { TextCanvasContext } from "./layout";
import {
	colorWithAlpha,
	getShadowGeometry,
	type TextPaintStyle,
} from "./effects";

/**
 * How many device pixels one local unit covers under the context's current
 * transform. Canvas shadow offsets and blur ignore the transform, so they are
 * converted with this to stay proportional to the text.
 */
export function getContextDeviceScale({ ctx }: { ctx: TextCanvasContext }): number {
	if (typeof ctx.getTransform !== "function") return 1;
	const { a, b, c, d } = ctx.getTransform();
	const scale = Math.sqrt(Math.abs(a * d - b * c));
	return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/**
 * Paints one run of text (a line or a glyph) at (x, y) with the context's
 * current font, alignment and baseline: shadow first, then the fill.
 */
export function paintTextRun({
	ctx,
	text,
	x,
	y,
	fontSize,
	textColor,
	style,
	deviceScale,
}: {
	ctx: TextCanvasContext;
	text: string;
	x: number;
	y: number;
	/** Scaled font size, in local units. */
	fontSize: number;
	textColor: string;
	style: TextPaintStyle;
	/** Local units → device pixels, see {@link getContextDeviceScale}. */
	deviceScale: number;
}): void {
	const fill = textColor;
	const shape = () => {
		ctx.fillStyle = fill;
		ctx.fillText(text, x, y);
	};

	if (style.shadow) {
		const geometry = getShadowGeometry({ shadow: style.shadow, fontSize });
		ctx.save();
		ctx.shadowColor = colorWithAlpha({
			color: style.shadow.color,
			alpha: style.shadow.opacity / 100,
		});
		ctx.shadowBlur = geometry.blur * deviceScale;
		ctx.shadowOffsetX = geometry.offsetX * deviceScale;
		ctx.shadowOffsetY = geometry.offsetY * deviceScale;
		// The shadow pass draws the text too.
		shape();
		ctx.restore();
	} else {
		shape();
	}
	ctx.fillStyle = textColor;
}
