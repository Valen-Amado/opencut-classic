import type { TextCanvasContext } from "./layout";
import {
	colorWithAlpha,
	getShadowGeometry,
	getStrokeLineWidth,
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

/** Offset copies drawn behind the text (3D, hard shadow, echo, glitch). */
function paintBackLayers({
	ctx,
	text,
	x,
	y,
	fontSize,
	style,
}: {
	ctx: TextCanvasContext;
	text: string;
	x: number;
	y: number;
	fontSize: number;
	style: TextPaintStyle;
}): void {
	const { type, color } = style.fx;
	const intensity = style.fx.intensity / 100;
	ctx.save();
	ctx.shadowColor = "transparent";
	switch (type) {
		case "lift": {
			const steps = Math.round(3 + intensity * 10);
			const step = fontSize * 0.012;
			ctx.fillStyle = color;
			for (let index = steps; index >= 1; index--) {
				ctx.fillText(text, x + index * step, y + index * step);
			}
			break;
		}
		case "hard": {
			const offset = fontSize * (0.03 + 0.09 * intensity);
			ctx.fillStyle = color;
			ctx.fillText(text, x + offset, y + offset);
			break;
		}
		case "echo": {
			const offset = fontSize * (0.04 + 0.07 * intensity);
			for (let index = 3; index >= 1; index--) {
				ctx.fillStyle = colorWithAlpha({ color, alpha: 0.6 - index * 0.15 });
				ctx.fillText(text, x + index * offset, y + index * offset);
			}
			break;
		}
		case "glitch": {
			const offset = fontSize * (0.015 + 0.05 * intensity);
			ctx.globalCompositeOperation = "lighter";
			ctx.fillStyle = "rgba(0, 229, 255, 0.85)";
			ctx.fillText(text, x - offset, y);
			ctx.fillStyle = "rgba(255, 45, 85, 0.85)";
			ctx.fillText(text, x + offset, y);
			break;
		}
		default:
			break;
	}
	ctx.restore();
}

/**
 * Paints one run of text (a line or a glyph) at (x, y) with the context's
 * current font, alignment and baseline. Back to front: effect layers, drop
 * shadow, glow, then the stroke (behind the fill, with round joins) and the
 * fill.
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
	const fx = style.fx;
	const intensity = fx.intensity / 100;
	const strokeWidth = style.stroke
		? getStrokeLineWidth({ stroke: style.stroke, fontSize })
		: 0;

	paintBackLayers({ ctx, text, x, y, fontSize, style });

	let fill: string | CanvasGradient = textColor;
	if (fx.type === "gradient") {
		const gradient = ctx.createLinearGradient(0, y - fontSize / 2, 0, y + fontSize / 2);
		gradient.addColorStop(0, textColor);
		gradient.addColorStop(1, fx.color);
		fill = gradient;
	}

	const shape = (fillStyle: string | CanvasGradient) => {
		if (style.stroke && strokeWidth > 0) {
			ctx.lineJoin = "round";
			ctx.lineCap = "round";
			ctx.lineWidth = strokeWidth;
			ctx.strokeStyle = style.stroke.color;
			ctx.strokeText(text, x, y);
		}
		if (fx.type === "hollow") {
			ctx.lineJoin = "round";
			ctx.lineWidth = fontSize * (0.02 + 0.05 * intensity);
			ctx.strokeStyle = textColor;
			ctx.strokeText(text, x, y);
			return;
		}
		ctx.fillStyle = fillStyle;
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
		shape(fill);
		ctx.restore();
	}

	const isGlow = fx.type === "neon" || fx.type === "glow";
	if (isGlow) {
		ctx.save();
		ctx.shadowColor = fx.color;
		const passes = fx.type === "neon" ? 3 : 2;
		for (let pass = 1; pass <= passes; pass++) {
			ctx.shadowBlur = fontSize * (0.08 + 0.3 * intensity) * pass * deviceScale;
			ctx.fillStyle = fx.type === "neon" ? fx.color : fill;
			ctx.fillText(text, x, y);
		}
		ctx.restore();
	}

	if (!style.shadow || isGlow) {
		shape(fx.type === "neon" ? "rgba(255, 255, 255, 0.95)" : fill);
	}
	ctx.fillStyle = textColor;
}
