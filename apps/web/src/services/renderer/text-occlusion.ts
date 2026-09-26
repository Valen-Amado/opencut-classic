import { mediaTimeToSeconds, roundMediaTime } from "@/wasm";
import { getSourceTimeAtClipTime } from "@/retime";
import { subjectSegmentation } from "@/services/subject-segmentation/service";
import type { CanvasRenderer } from "./canvas-renderer";
import { computeVisualTransform } from "./compositor/frame-descriptor";
import type { AnyBaseNode } from "./nodes/base-node";
import { TextNode } from "./nodes/text-node";
import { VideoNode } from "./nodes/video-node";

/** The frame as something the segmenter can read, if it is one. */
function asTexImageSource({ source }: { source: CanvasImageSource }): TexImageSource | null {
	if (
		(typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) ||
		(typeof OffscreenCanvas !== "undefined" && source instanceof OffscreenCanvas) ||
		(typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) ||
		(typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) ||
		(typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) ||
		(typeof VideoFrame !== "undefined" && source instanceof VideoFrame)
	) {
		return source;
	}
	return null;
}

/** The topmost video visible at this time below `index` (children go bottom to top). */
function findVideoBelow({
	children,
	index,
}: {
	children: AnyBaseNode[];
	index: number;
}): VideoNode | null {
	for (let below = index - 1; below >= 0; below--) {
		const node = children[below];
		if (node instanceof VideoNode && node.resolved) return node;
	}
	return null;
}

function getVideoSourceSeconds({ node, time }: { node: VideoNode; time: number }): number {
	const clipTime = time - node.params.timeOffset;
	const sourceTicks =
		node.params.trimStart + getSourceTimeAtClipTime({ clipTime, retime: node.params.retime });
	return mediaTimeToSeconds({ time: roundMediaTime({ time: sourceTicks }) });
}

/**
 * For texts on the "Envolver" ring that pass behind the subject: segments
 * the frame of the video right below them and stores where its subject is.
 * Runs after the tree is resolved. Without a mask (no video, models still
 * loading, segmentation unavailable) the full ring is drawn.
 */
export async function resolveTextOcclusions({
	root,
	renderer,
	time,
}: {
	root: AnyBaseNode;
	renderer: CanvasRenderer;
	time: number;
}): Promise<void> {
	const { children } = root;
	for (let index = 0; index < children.length; index++) {
		const node = children[index];
		if (!(node instanceof TextNode) || !node.resolved) continue;
		const { fx } = node.resolved.paintStyle;
		if (fx.type !== "wrap" || !fx.wrap.occlude) continue;

		const elementId = node.params.id;
		const video = findVideoBelow({ children, index });
		const resolvedVideo = video?.resolved;
		const frame = resolvedVideo ? asTexImageSource({ source: resolvedVideo.source }) : null;
		if (!video || !resolvedVideo || !frame) {
			subjectSegmentation.reportDetection({ elementId, detection: "no-video" });
			continue;
		}

		const mask = await subjectSegmentation.getMask({
			mediaId: video.params.mediaId,
			timeSeconds: getVideoSourceSeconds({ node: video, time }),
			source: frame,
			wait: renderer.waitForSubjectMasks,
		});
		subjectSegmentation.reportDetection({
			elementId,
			detection: mask ? "detected" : subjectSegmentation.detectionWithoutMask(),
		});
		if (!mask) continue;

		node.resolved = {
			...node.resolved,
			subjectOcclusion: {
				mask,
				transform: computeVisualTransform({
					renderer,
					resolved: resolvedVideo,
					sourceWidth: resolvedVideo.sourceWidth,
					sourceHeight: resolvedVideo.sourceHeight,
				}),
			},
		};
	}
}
