import { BaseNode } from "./base-node";
import type { TextElement } from "@/timeline";
import type { EffectPass } from "@/effects/types";
import type { BlendMode, Transform } from "@/rendering";
import { drawMeasuredTextLayout } from "@/text/primitives";
import type { MeasuredTextElement } from "@/text/measure-element";
import type { TextPaintStyle } from "@/text/effects";
import { drawWrapRing, type WrapOccluder } from "@/text/wrap-paint";
import type { SubjectMask } from "@/services/subject-segmentation/service";
import type { QuadTransformDescriptor } from "../compositor/types";

export type TextNodeParams = TextElement & {
	transform: Transform;
	opacity: number;
	blendMode?: BlendMode;
	canvasCenter: { x: number; y: number };
	canvasHeight: number;
	textBaseline?: CanvasTextBaseline;
};

export interface ResolvedTextNodeState {
	transform: Transform;
	opacity: number;
	textColor: string;
	backgroundColor: string;
	effectPasses: EffectPass[][];
	measuredText: MeasuredTextElement;
	paintStyle: TextPaintStyle;
	/** Subject the ring's back half passes behind ("Envolver" effect). */
	subjectOcclusion?: TextSubjectOcclusion | null;
}

/** The subject of the video under a text, and where that video sits on the canvas. */
export interface TextSubjectOcclusion {
	mask: SubjectMask;
	transform: QuadTransformDescriptor;
}

/** Erases the subject from the ring's back half, placed like its video. */
function createSubjectOccluder({
	occlusion,
}: {
	occlusion: TextSubjectOcclusion;
}): WrapOccluder {
	return ({ ctx }) => {
		const { mask, transform } = occlusion;
		ctx.save();
		ctx.translate(transform.centerX, transform.centerY);
		ctx.rotate((transform.rotationDegrees * Math.PI) / 180);
		ctx.scale(transform.flipX ? -1 : 1, transform.flipY ? -1 : 1);
		ctx.imageSmoothingEnabled = true;
		ctx.drawImage(
			mask.canvas,
			-transform.width / 2,
			-transform.height / 2,
			transform.width,
			transform.height,
		);
		ctx.restore();
	};
}

export class TextNode extends BaseNode<TextNodeParams, ResolvedTextNodeState> {}

export function renderTextToContext({
	node,
	ctx,
}: {
	node: TextNode;
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}): void {
	const resolved = node.resolved;
	if (!resolved) {
		return;
	}

	const x = resolved.transform.position.x + node.params.canvasCenter.x;
	const y = resolved.transform.position.y + node.params.canvasCenter.y;
	const baseline = node.params.textBaseline ?? "middle";

	ctx.save();
	ctx.translate(x, y);
	ctx.scale(resolved.transform.scaleX, resolved.transform.scaleY);
	if (resolved.transform.rotate) {
		ctx.rotate((resolved.transform.rotate * Math.PI) / 180);
	}

	const { wrap } = resolved.measuredText;
	if (wrap) {
		drawWrapRing({
			ctx,
			layout: resolved.measuredText,
			wrap,
			textColor: resolved.textColor,
			style: resolved.paintStyle,
			repeat: resolved.paintStyle.fx.wrap.repeat,
			occluder: resolved.subjectOcclusion
				? createSubjectOccluder({ occlusion: resolved.subjectOcclusion })
				: null,
		});
		ctx.restore();
		return;
	}

	drawMeasuredTextLayout({
		ctx,
		layout: resolved.measuredText,
		textColor: resolved.textColor,
		background: resolved.measuredText.resolvedBackground,
		backgroundColor: resolved.backgroundColor,
		textBaseline: baseline,
		style: resolved.paintStyle,
	});

	ctx.restore();
}
