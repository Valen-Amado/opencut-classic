import type { TextPaintStyle } from "./effects";
import { setCanvasLetterSpacing, type TextCanvasContext } from "./layout";
import type { MeasuredTextWrap } from "./measure-element";
import { getContextDeviceScale, paintTextRun } from "./paint";
import type { MeasuredTextLayout } from "./primitives";
import { buildWrapText, layoutWrapRing, type WrapGlyph } from "./wrap";

/**
 * Removes the parts of the ring's back half that pass behind something. It
 * is called on a canvas the size of the target with an identity transform and
 * `destination-out` compositing: whatever it paints is erased.
 */
export type WrapOccluder = ({ ctx }: { ctx: TextCanvasContext }) => void;

type OffscreenSurface = {
	canvas: OffscreenCanvas | HTMLCanvasElement;
	ctx: TextCanvasContext;
};

let backSurface: OffscreenSurface | null = null;

function createSurface({
	width,
	height,
}: {
	width: number;
	height: number;
}): OffscreenSurface | null {
	if (typeof OffscreenCanvas !== "undefined") {
		const canvas = new OffscreenCanvas(width, height);
		const ctx = canvas.getContext("2d");
		return ctx ? { canvas, ctx } : null;
	}
	if (typeof document !== "undefined") {
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		return ctx ? { canvas, ctx } : null;
	}
	return null;
}

function getBackSurface({
	width,
	height,
}: {
	width: number;
	height: number;
}): OffscreenSurface | null {
	backSurface ??= createSurface({ width, height });
	if (!backSurface) return null;
	const { canvas, ctx } = backSurface;
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
	} else {
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, width, height);
	}
	return backSurface;
}

/**
 * Draws the text on its spinning ring around the current origin. Back half
 * first, then the front half on top; with an occluder, the back half is
 * drawn offscreen and cut where the occluder paints before it's composited.
 */
export function drawWrapRing({
	ctx,
	layout,
	wrap,
	textColor,
	style,
	repeat,
	occluder,
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	wrap: MeasuredTextWrap;
	textColor: string;
	style: TextPaintStyle;
	repeat: boolean;
	occluder?: WrapOccluder | null;
}): void {
	const setup = (target: TextCanvasContext) => {
		target.font = layout.fontString;
		target.textAlign = "center";
		target.textBaseline = "middle";
		setCanvasLetterSpacing({ ctx: target, letterSpacingPx: layout.letterSpacing });
	};
	setup(ctx);

	const measure = (text: string) => ctx.measureText(text).width;
	const content = (layout.visibleLines ?? layout.lines).join("\n");
	const text = buildWrapText({
		content,
		repeat,
		circumference: 2 * Math.PI * wrap.geometry.radius,
		measure,
	});
	const glyphs = layoutWrapRing({
		text,
		measure,
		geometry: wrap.geometry,
		phase: wrap.phase,
		fill: repeat,
	});
	if (glyphs.length === 0) return;

	const deviceScale = getContextDeviceScale({ ctx });
	// The ring is the effect; each glyph is painted with the shadow and stroke only.
	const glyphStyle: TextPaintStyle = { ...style, fx: { ...style.fx, type: "none" } };
	const drawGlyph = ({ target, glyph }: { target: TextCanvasContext; glyph: WrapGlyph }) => {
		target.save();
		target.translate(glyph.x, glyph.y);
		target.scale(glyph.scaleX, glyph.scaleY);
		target.globalAlpha *= glyph.alpha;
		paintTextRun({
			ctx: target,
			text: glyph.char,
			x: 0,
			y: 0,
			fontSize: layout.scaledFontSize * (0.92 + 0.08 * glyph.scaleY),
			textColor,
			style: glyphStyle,
			deviceScale,
		});
		target.restore();
	};

	const back = glyphs.filter((glyph) => glyph.isBack);
	const front = glyphs.filter((glyph) => !glyph.isBack);

	const surface =
		occluder && back.length > 0
			? getBackSurface({ width: ctx.canvas.width, height: ctx.canvas.height })
			: null;
	if (occluder && surface) {
		const offscreen = surface.ctx;
		offscreen.setTransform(ctx.getTransform());
		offscreen.globalAlpha = ctx.globalAlpha;
		setup(offscreen);
		for (const glyph of back) drawGlyph({ target: offscreen, glyph });

		offscreen.setTransform(1, 0, 0, 1, 0, 0);
		offscreen.globalAlpha = 1;
		offscreen.globalCompositeOperation = "destination-out";
		occluder({ ctx: offscreen });
		offscreen.globalCompositeOperation = "source-over";

		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalAlpha = 1;
		ctx.drawImage(surface.canvas, 0, 0);
		ctx.restore();
	} else {
		for (const glyph of back) drawGlyph({ target: ctx, glyph });
	}

	for (const glyph of front) drawGlyph({ target: ctx, glyph });
}
