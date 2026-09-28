import type { FrameRate } from "opencut-wasm";
import type { AnyBaseNode } from "./nodes/base-node";
import { createCanvasSurface } from "./canvas-utils";
import { buildFrameDescriptor } from "./compositor/frame-descriptor";
import { wasmCompositor } from "./compositor/wasm-compositor";
import { resolveRenderTree } from "./resolve";
import { VideoCache, videoCache as sharedVideoCache } from "@/services/video-cache/service";
import {
	measureSpanAsync,
	measureSpanSync,
	onRenderPerfFrameComplete,
} from "@/diagnostics/render-perf";

export type CanvasRendererParams = {
	width: number;
	height: number;
	fps: FrameRate;
	/**
	 * Wait for subject segmentation models instead of skipping occlusion
	 * while they load (exports and snapshots).
	 */
	waitForSubjectMasks?: boolean;
	/**
	 * Frame source for video clips. Exports pass their own cache so they never
	 * share decoder state with (or get superseded by) the preview.
	 */
	videoCache?: VideoCache;
};

/**
 * All renderers draw through the single wasm compositor and its output
 * canvas. Renders run one at a time, and whatever reads the output canvas
 * (an export capturing a frame, a snapshot) does so inside the same turn, so
 * another render can't overwrite the canvas in between.
 */
let compositorQueue: Promise<unknown> = Promise.resolve();
function withCompositor<T>(task: () => Promise<T>): Promise<T> {
	const run = compositorQueue.then(task, task);
	compositorQueue = run.catch(() => {});
	return run;
}

export class CanvasRenderer {
	canvas: OffscreenCanvas;
	context: OffscreenCanvasRenderingContext2D;
	width: number;
	height: number;
	fps: FrameRate;
	waitForSubjectMasks: boolean;
	videoCache: VideoCache;

	constructor({
		width,
		height,
		fps,
		waitForSubjectMasks = false,
		videoCache = sharedVideoCache,
	}: CanvasRendererParams) {
		this.width = width;
		this.height = height;
		this.fps = fps;
		this.waitForSubjectMasks = waitForSubjectMasks;
		this.videoCache = videoCache;

		const surface = createCanvasSurface({ width, height });
		this.canvas = surface.canvas;
		this.context = surface.context;
	}

	getOutputCanvas(): HTMLCanvasElement {
		wasmCompositor.ensureInitialized({
			width: this.width,
			height: this.height,
		});
		return wasmCompositor.getCanvas();
	}

	setSize({ width, height }: { width: number; height: number }) {
		this.width = width;
		this.height = height;

		const surface = createCanvasSurface({ width, height });
		this.canvas = surface.canvas;
		this.context = surface.context;
	}

	/**
	 * Renders a frame into the compositor's output canvas. `onRendered` runs
	 * right after, before any other render can touch the canvas.
	 */
	render({
		node,
		time,
		onRendered,
	}: {
		node: AnyBaseNode;
		time: number;
		onRendered?: () => void | Promise<void>;
	}): Promise<void> {
		return withCompositor(async () => {
			await this.renderUnlocked({ node, time });
			await onRendered?.();
		});
	}

	private async renderUnlocked({ node, time }: { node: AnyBaseNode; time: number }) {
		await measureSpanAsync({
			name: "resolve",
			fn: () => resolveRenderTree({ node, renderer: this, time }),
		});
		const { frame, textures } = await measureSpanAsync({
			name: "buildFrame",
			fn: () => buildFrameDescriptor({ node, renderer: this }),
		});
		wasmCompositor.ensureInitialized({
			width: this.width,
			height: this.height,
		});
		measureSpanSync({
			name: "syncTextures",
			fn: () => wasmCompositor.syncTextures(textures),
		});
		measureSpanSync({
			name: "renderFrame",
			fn: () => wasmCompositor.render(frame),
		});
	}

	async renderToCanvas({
		node,
		time,
		targetCanvas,
	}: {
		node: AnyBaseNode;
		time: number;
		targetCanvas: HTMLCanvasElement;
	}) {
		const ctx = targetCanvas.getContext("2d");
		if (!ctx) {
			throw new Error("Failed to get target canvas context");
		}

		await this.render({
			node,
			time,
			onRendered: () => {
				measureSpanSync({
					name: "drawImage",
					fn: () =>
						ctx.drawImage(
							wasmCompositor.getCanvas(),
							0,
							0,
							targetCanvas.width,
							targetCanvas.height,
						),
				});
			},
		});
		onRenderPerfFrameComplete();
	}
}
