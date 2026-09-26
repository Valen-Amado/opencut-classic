"use client";

import { isTypableDOMElement } from "@/utils/browser";
import { PREVIEW_ZOOM } from "@/preview/zoom";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";
import { useEditor } from "@/editor/use-editor";
import { useRafLoop } from "@/hooks/use-raf-loop";
import { useContainerSize } from "@/hooks/use-container-size";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import { TICKS_PER_SECOND } from "@/wasm";
import type { RootNode } from "@/services/renderer/nodes/root-node";
import { buildScene } from "@/services/renderer/scene-builder";
import { PreviewOverlayLayer } from "./overlay-layer";
import { PreviewInteractionOverlay } from "./preview-interaction-overlay";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import type {
	PreviewOverlayControl,
	PreviewOverlayInstance,
} from "@/preview/overlays";
import { PreviewContextMenu } from "./context-menu";
import { PreviewToolbar } from "./toolbar";
import { FullscreenSeekBar } from "./fullscreen-seek-bar";
import { cn } from "@/utils/ui";

/** Fullscreen player controls fade out after this long without pointer movement. */
const FULLSCREEN_CONTROLS_IDLE_MS = 2500;
import {
	PreviewViewportProvider,
	usePreviewViewportState,
} from "./preview-viewport";

function usePreviewSize() {
	const canvasSize = useEditor(
		(e) => e.project.getActive()?.settings.canvasSize,
	);

	return {
		width: canvasSize?.width,
		height: canvasSize?.height,
	};
}

function normalizeWheelDelta({
	delta,
	deltaMode,
	pageSize,
}: {
	delta: number;
	deltaMode: number;
	pageSize: number;
}): number {
	if (deltaMode === WheelEvent.DOM_DELTA_LINE) {
		return delta * 16;
	}

	if (deltaMode === WheelEvent.DOM_DELTA_PAGE) {
		return delta * pageSize;
	}

	return delta;
}

export function PreviewPanel({
	overlayControls,
	overlayInstances,
	onOverlayVisibilityChange,
}: {
	overlayControls: PreviewOverlayControl[];
	overlayInstances: PreviewOverlayInstance[];
	onOverlayVisibilityChange: (params: {
		overlayId: string;
		isVisible: boolean;
	}) => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const { isFullscreen, toggleFullscreen } = useFullscreen({ containerRef });
	const handleContainerRef = useCallback((node: HTMLDivElement | null) => {
		containerRef.current = node;
		setContainer(node);
	}, []);
	const isPlaying = useEditor((e) => e.playback.getIsPlaying());
	const isIdle = useIdleWhileFullscreen({ container, isFullscreen });
	const areControlsHidden = isFullscreen && isPlaying && isIdle;

	return (
		<div
			ref={handleContainerRef}
			className={cn(
				"panel bg-background relative flex size-full min-h-0 min-w-0 flex-col rounded-sm border",
				areControlsHidden && "cursor-none [&_*]:cursor-none!",
			)}
		>
			<PreviewCanvas
				container={container}
				isFullscreen={isFullscreen}
				areControlsHidden={areControlsHidden}
				onToggleFullscreen={toggleFullscreen}
				overlayControls={overlayControls}
				overlayInstances={overlayInstances}
				onOverlayVisibilityChange={onOverlayVisibilityChange}
			/>
			<RenderTreeController />
		</div>
	);
}

/**
 * True after the pointer has been still for a while inside the fullscreen
 * preview, so player controls (and the cursor) can fade out.
 */
function useIdleWhileFullscreen({
	container,
	isFullscreen,
}: {
	container: HTMLElement | null;
	isFullscreen: boolean;
}): boolean {
	const [isIdle, setIsIdle] = useState(false);

	useEffect(() => {
		if (!container || !isFullscreen) return;
		let timer: ReturnType<typeof setTimeout> | null = null;
		const scheduleIdle = () => {
			if (timer !== null) clearTimeout(timer);
			timer = setTimeout(() => setIsIdle(true), FULLSCREEN_CONTROLS_IDLE_MS);
		};
		const wake = () => {
			setIsIdle(false);
			scheduleIdle();
		};
		scheduleIdle();
		container.addEventListener("pointermove", wake);
		container.addEventListener("pointerdown", wake);
		return () => {
			if (timer !== null) clearTimeout(timer);
			container.removeEventListener("pointermove", wake);
			container.removeEventListener("pointerdown", wake);
			setIsIdle(false);
		};
	}, [container, isFullscreen]);

	return isFullscreen && isIdle;
}

function RenderTreeController() {
	const editor = useEditor();
	const tracks = useEditor(
		(e) => e.timeline.getPreviewTracks() ?? e.scenes.getActiveScene().tracks,
	);
	const mediaAssets = useEditor((e) => e.media.getAssets());
	const activeProject = useEditor((e) => e.project.getActive());

	const { width, height } = usePreviewSize();

	useDeepCompareEffect(() => {
		if (!activeProject) return;

		const duration = editor.timeline.getTotalDuration();
		const renderTree = buildScene({
			tracks,
			mediaAssets,
			duration,
			canvasSize: { width, height },
			background: activeProject.settings.background,
			isPreview: true,
		});

		editor.renderer.setRenderTree({ renderTree });
	}, [tracks, mediaAssets, activeProject?.settings.background, width, height]);

	return null;
}

function PreviewCanvas({
	container,
	isFullscreen,
	areControlsHidden,
	onToggleFullscreen,
	overlayControls,
	overlayInstances,
	onOverlayVisibilityChange,
}: {
	container: HTMLElement | null;
	isFullscreen: boolean;
	areControlsHidden: boolean;
	onToggleFullscreen: () => void;
	overlayControls: PreviewOverlayControl[];
	overlayInstances: PreviewOverlayInstance[];
	onOverlayVisibilityChange: (params: {
		overlayId: string;
		isVisible: boolean;
	}) => void;
}) {
	const canvasMountRef = useRef<HTMLDivElement>(null);
	const viewportRef = useRef<HTMLDivElement>(null);
	const lastFrameRef = useRef(-1);
	const lastSceneRef = useRef<RootNode | null>(null);
	const renderingRef = useRef(false);
	const { width: nativeWidth, height: nativeHeight } = usePreviewSize();
	const viewportSize = useContainerSize({ containerRef: viewportRef });
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActive());
	const renderTree = useEditor((e) => e.renderer.getRenderTree());
	const viewport = usePreviewViewportState({
		canvasHeight: nativeHeight,
		canvasWidth: nativeWidth,
		viewportHeight: viewportSize.height,
		viewportRef,
		viewportWidth: viewportSize.width,
	});
	const { canPan, panByScreenDelta, scaleZoom, fitToScreen, setViewportPercent } = viewport;

	// Ctrl/Cmd + "=" / "-" zoom the preview, "0" fits it and "1" shows it at 100 %.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
			const active = document.activeElement;
			if (active instanceof HTMLElement && isTypableDOMElement({ element: active })) return;
			const handlers: Record<string, () => void> = {
				"=": () => scaleZoom({ factor: PREVIEW_ZOOM.step }),
				"+": () => scaleZoom({ factor: PREVIEW_ZOOM.step }),
				"-": () => scaleZoom({ factor: 1 / PREVIEW_ZOOM.step }),
				"0": () => fitToScreen(),
				"1": () => setViewportPercent({ percent: 100 }),
			};
			const handler = handlers[event.key];
			if (!handler) return;
			event.preventDefault();
			handler();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [scaleZoom, fitToScreen, setViewportPercent]);

	const renderer = useMemo(() => {
		return new CanvasRenderer({
			width: nativeWidth,
			height: nativeHeight,
			fps: activeProject.settings.fps,
		});
	}, [nativeWidth, nativeHeight, activeProject.settings.fps]);

	// Mount the compositor's output canvas directly into the preview. wgpu
	// renders straight into this element, so there is no intermediate copy —
	// the container div owns positioning/styling, the canvas itself fills it.
	useEffect(() => {
		const mount = canvasMountRef.current;
		if (!mount) return;
		const outputCanvas = renderer.getOutputCanvas();
		outputCanvas.style.display = "block";
		outputCanvas.style.width = "100%";
		outputCanvas.style.height = "100%";
		mount.appendChild(outputCanvas);
		return () => {
			if (outputCanvas.parentElement === mount) {
				mount.removeChild(outputCanvas);
			}
		};
	}, [renderer]);

	const render = useCallback(() => {
		if (!renderTree || renderingRef.current) return;

		const renderTime = Math.min(
			editor.playback.getCurrentTime(),
			editor.timeline.getLastFrameTime(),
		);
		const ticksPerFrame = Math.round(
			(TICKS_PER_SECOND * renderer.fps.denominator) / renderer.fps.numerator,
		);
		const frame = Math.floor(renderTime / ticksPerFrame);

		if (
			frame === lastFrameRef.current &&
			renderTree === lastSceneRef.current
		) {
			return;
		}

		renderingRef.current = true;
		lastSceneRef.current = renderTree;
		lastFrameRef.current = frame;
		renderer
			.render({ node: renderTree, time: renderTime })
			.then(() => {
				renderingRef.current = false;
			});
	}, [renderer, renderTree, editor.playback, editor.timeline]);

	useRafLoop(render);

	useEffect(() => {
		const container = viewportRef.current;
		if (!container) return;

		let pendingZoomDelta = 0;
		let zoomAnchor = { clientX: 0, clientY: 0 };
		let pendingPanDeltaX = 0;
		let pendingPanDeltaY = 0;
		let zoomRafId: ReturnType<typeof requestAnimationFrame> | null = null;
		let panRafId: ReturnType<typeof requestAnimationFrame> | null = null;

		const onWheel = (event: WheelEvent) => {
			const normalizedDeltaX = normalizeWheelDelta({
				delta: event.deltaX,
				deltaMode: event.deltaMode,
				pageSize: container.clientWidth,
			});
			const normalizedDeltaY = normalizeWheelDelta({
				delta: event.deltaY,
				deltaMode: event.deltaMode,
				pageSize: container.clientHeight,
			});
			const isZoomGesture = event.ctrlKey || event.metaKey;
			if (isZoomGesture) {
				event.preventDefault();
				pendingZoomDelta += normalizedDeltaY;
				zoomAnchor = { clientX: event.clientX, clientY: event.clientY };

				if (zoomRafId === null) {
					zoomRafId = requestAnimationFrame(() => {
						const cappedDelta =
							Math.sign(pendingZoomDelta) *
							Math.min(Math.abs(pendingZoomDelta), 30);
						const zoomFactor = Math.exp(-cappedDelta / 300);

						scaleZoom({ factor: zoomFactor, ...zoomAnchor });
						pendingZoomDelta = 0;
						zoomRafId = null;
					});
				}

				return;
			}

			if (!canPan) {
				return;
			}

			if (normalizedDeltaX === 0 && normalizedDeltaY === 0) {
				return;
			}

			event.preventDefault();
			pendingPanDeltaX += normalizedDeltaX;
			pendingPanDeltaY += normalizedDeltaY;

			if (panRafId === null) {
				panRafId = requestAnimationFrame(() => {
					panByScreenDelta({
						deltaX: pendingPanDeltaX,
						deltaY: pendingPanDeltaY,
					});
					pendingPanDeltaX = 0;
					pendingPanDeltaY = 0;
					panRafId = null;
				});
			}
		};

		container.addEventListener("wheel", onWheel, {
			capture: true,
			passive: false,
		});

		// Safari reports trackpad pinches as gesture events instead of ctrl+wheel.
		type GestureLikeEvent = Event & { scale?: number; clientX?: number; clientY?: number };
		let lastGestureScale = 1;
		const onGestureStart = (event: Event) => {
			event.preventDefault();
			lastGestureScale = 1;
		};
		const onGestureChange = (event: GestureLikeEvent) => {
			event.preventDefault();
			const scale = event.scale ?? 1;
			if (scale <= 0) return;
			scaleZoom({
				factor: scale / lastGestureScale,
				clientX: event.clientX,
				clientY: event.clientY,
			});
			lastGestureScale = scale;
		};
		container.addEventListener("gesturestart", onGestureStart);
		container.addEventListener("gesturechange", onGestureChange);

		return () => {
			container.removeEventListener("wheel", onWheel, {
				capture: true,
			});
			container.removeEventListener("gesturestart", onGestureStart);
			container.removeEventListener("gesturechange", onGestureChange);
			if (zoomRafId !== null) {
				cancelAnimationFrame(zoomRafId);
			}
			if (panRafId !== null) {
				cancelAnimationFrame(panRafId);
			}
		};
	}, [canPan, panByScreenDelta, scaleZoom]);

	return (
		<PreviewViewportProvider value={viewport}>
			<div className="flex size-full min-h-0 min-w-0 flex-col">
				<div className="flex min-h-0 min-w-0 flex-1 p-2 pb-0">
					<ContextMenu>
						<ContextMenuTrigger asChild>
							<div
								ref={viewportRef}
								className="relative flex size-full min-h-0 min-w-0 items-center justify-center overflow-hidden"
							>
							<div
								ref={canvasMountRef}
								className="absolute block border"
								style={{
									left: viewport.sceneLeft,
									top: viewport.sceneTop,
									width: viewport.sceneWidth,
									height: viewport.sceneHeight,
									background:
										activeProject.settings.background.type === "blur"
											? "transparent"
											: activeProject?.settings.background.color,
								}}
							/>
								<PreviewOverlayLayer
									instances={overlayInstances}
									plane="under-interaction"
								/>
								<PreviewInteractionOverlay />
								<PreviewOverlayLayer
									instances={overlayInstances}
									plane="over-interaction"
								/>
							</div>
						</ContextMenuTrigger>
						<PreviewContextMenu
							onToggleFullscreen={onToggleFullscreen}
							container={container}
							overlayControls={overlayControls}
							onOverlayVisibilityChange={onOverlayVisibilityChange}
						/>
					</ContextMenu>
				</div>
				<div
					className={cn(
						"transition-opacity duration-300",
						areControlsHidden && "opacity-0",
					)}
				>
					{isFullscreen && <FullscreenSeekBar />}
					<PreviewToolbar onToggleFullscreen={onToggleFullscreen} />
				</div>
			</div>
		</PreviewViewportProvider>
	);
}
