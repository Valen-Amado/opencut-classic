import type {
	MouseEvent as ReactMouseEvent,
	PointerEvent as ReactPointerEvent,
} from "react";
import type { MediaAsset } from "@/media/types";
import {
	getVisibleElementsWithBounds,
	type ElementWithBounds,
} from "@/preview/element-bounds";
import {
	getHitElements,
	hitTest,
	resolvePreferredHit,
} from "@/preview/hit-test";
import {
	SNAP_THRESHOLD_SCREEN_PIXELS,
	getDistanceGuides,
	rectFromBounds,
	snapPosition,
	type SnapLine,
	type SpacingGuide,
} from "@/preview/preview-snap";
import type { TCanvasSize } from "@/project/types";
import type { ParamValues } from "@/params";
import { buildTransformFromParams, type Transform } from "@/rendering";
import { resolveTransformAtTime } from "@/rendering/animation-values";
import { getChannel, getElementLocalTime, setChannel } from "@/animation";
import { offsetChannelValues } from "@/animation/offset-channel";
import {
	getGroupRect,
	getRefsInMarquee,
	mergeSelections,
	normalizeRect,
	rectContainsPoint,
	toggleRefInSelection,
	type CanvasRect,
} from "@/preview/multi-select";
import type { ElementAnimations } from "@/animation/types";
import { isVisualElement } from "@/timeline/element-utils";
import type {
	ElementRef,
	SceneTracks,
	TextElement,
	TimelineElement,
	TimelineTrack,
	VisualElement,
} from "@/timeline";

const MIN_DRAG_DISTANCE = 0.5;
const PRIMARY_POINTER_BUTTON = 0;

type Point = { readonly x: number; readonly y: number };

interface CapturedPointerState {
	readonly pointerId: number;
	readonly captureTarget: HTMLElement;
}

interface PendingGesture extends CapturedPointerState {
	readonly kind: "pending";
	readonly origin: Point;
	readonly topmostHit: ElementWithBounds | null;
	readonly selectedHit: ElementWithBounds | null;
	readonly selectedElements: readonly ElementRef[];
	/** Shift or Cmd/Ctrl held: clicks toggle, marquees add to the selection. */
	readonly additive: boolean;
	/** Pressed inside the box of a multi-element selection. */
	readonly insideGroup: boolean;
}

interface MarqueeGesture extends CapturedPointerState {
	readonly kind: "marquee";
	readonly origin: Point;
	readonly current: Point;
	readonly base: readonly ElementRef[];
}

interface DragElementSnapshot {
	readonly trackId: string;
	readonly elementId: string;
	/** Transform as shown at the playhead (keyframes applied). */
	readonly initialTransform: Transform;
	readonly initialParams: ParamValues;
	readonly initialAnimations: ElementAnimations | undefined;
}

const POSITION_PATHS = ["transform.positionX", "transform.positionY"] as const;

/**
 * Moves an element by a delta. Animated position axes shift all their
 * keyframes too, otherwise the keyframes would override the new base value
 * and the element would not move on that axis.
 */
export function buildMoveUpdates({
	snapshot,
	delta,
}: {
	snapshot: Pick<DragElementSnapshot, "initialParams" | "initialAnimations">;
	delta: Point;
}): Partial<TimelineElement> {
	const base = buildTransformFromParams({ params: snapshot.initialParams }).position;
	let animations = snapshot.initialAnimations;
	for (const propertyPath of POSITION_PATHS) {
		const channel = getChannel({ animations, propertyPath });
		if (!channel || channel.keys.length === 0) continue;
		animations = setChannel({
			animations,
			propertyPath,
			channel: offsetChannelValues({
				channel,
				delta: propertyPath === "transform.positionX" ? delta.x : delta.y,
			}),
		});
	}
	return {
		params: {
			...snapshot.initialParams,
			"transform.positionX": base.x + delta.x,
			"transform.positionY": base.y + delta.y,
		},
		...(animations !== snapshot.initialAnimations ? { animations } : {}),
	};
}

interface DraggingGesture extends CapturedPointerState {
	readonly kind: "dragging";
	readonly origin: Point;
	/** Position (center-origin) that snapping moves: the element's, or the group's center. */
	readonly anchor: Point;
	readonly bounds: {
		readonly width: number;
		readonly height: number;
		readonly rotation: number;
	};
	readonly elements: readonly DragElementSnapshot[];
}

type GestureSession =
	| { readonly kind: "idle" }
	| PendingGesture
	| MarqueeGesture
	| DraggingGesture;

const IDLE_GESTURE: GestureSession = { kind: "idle" };

export interface EditingTextState {
	readonly trackId: string;
	readonly elementId: string;
	readonly element: TextElement;
}

export interface PreviewViewportAdapter {
	screenToCanvas: ({
		clientX,
		clientY,
	}: {
		clientX: number;
		clientY: number;
	}) => Point | null;
	screenPixelsToLogicalThreshold: ({
		screenPixels,
	}: {
		screenPixels: number;
	}) => Point;
}

export interface InputAdapter {
	isShiftHeld: () => boolean;
	/** Ctrl/Cmd: move or scale without snapping. */
	isSnapBypassHeld: () => boolean;
}

export interface SceneReader {
	getTracks: () => SceneTracks;
	getCurrentTime: () => number;
	getMediaAssets: () => MediaAsset[];
	getCanvasSize: () => TCanvasSize;
}

export interface SelectionApi {
	getSelected: () => readonly ElementRef[];
	setSelected: (elements: readonly ElementRef[]) => void;
	clearSelection: () => void;
}

export interface TimelinePreviewUpdate {
	readonly trackId: string;
	readonly elementId: string;
	readonly updates: Partial<TimelineElement>;
}

export interface TimelineOps {
	getElementsWithTracks: ({
		elements,
	}: {
		elements: readonly ElementRef[];
	}) => Array<{ track: TimelineTrack; element: TimelineElement }>;
	previewElements: (updates: readonly TimelinePreviewUpdate[]) => void;
	commitPreview: () => void;
	discardPreview: () => void;
}

export interface PlaybackApi {
	getIsPlaying: () => boolean;
	subscribe: (listener: () => void) => () => void;
}

export interface PreviewOptions {
	isMaskMode: () => boolean;
	onSnapLinesChange?: (lines: SnapLine[], spacing?: SpacingGuide[]) => void;
	/** When false, elements only snap to the canvas, not to each other. */
	isSmartGuidesEnabled?: () => boolean;
}

export interface PreviewInteractionDeps {
	viewport: PreviewViewportAdapter;
	input: InputAdapter;
	scene: SceneReader;
	selection: SelectionApi;
	timeline: TimelineOps;
	playback: PlaybackApi;
	preview: PreviewOptions;
}

export interface PreviewInteractionDepsRef {
	readonly current: PreviewInteractionDeps;
}

function isSameElementRef({
	left,
	right,
}: {
	left: ElementRef;
	right: ElementRef;
}): boolean {
	return left.trackId === right.trackId && left.elementId === right.elementId;
}

function buildDragSelection({
	selectedElements,
	dragTarget,
}: {
	selectedElements: readonly ElementRef[];
	dragTarget: ElementWithBounds;
}): ElementRef[] {
	const dragTargetRef = {
		trackId: dragTarget.trackId,
		elementId: dragTarget.elementId,
	};

	if (
		!selectedElements.some((selectedElement) =>
			isSameElementRef({ left: selectedElement, right: dragTargetRef }),
		)
	) {
		return [dragTargetRef];
	}

	return [
		dragTargetRef,
		...selectedElements.filter(
			(selectedElement) =>
				!isSameElementRef({ left: selectedElement, right: dragTargetRef }),
		),
	];
}

function movedPastDragThreshold({
	current,
	origin,
}: {
	current: Point;
	origin: Point;
}): boolean {
	return (
		Math.abs(current.x - origin.x) > MIN_DRAG_DISTANCE ||
		Math.abs(current.y - origin.y) > MIN_DRAG_DISTANCE
	);
}

function toDragElementSnapshots({
	elementsWithTracks,
	currentTime,
}: {
	elementsWithTracks: Array<{ track: TimelineTrack; element: TimelineElement }>;
	currentTime: number;
}): DragElementSnapshot[] {
	const isVisualTrackedElement = (value: {
		track: TimelineTrack;
		element: TimelineElement;
	}): value is { track: TimelineTrack; element: VisualElement } =>
		isVisualElement(value.element);

	return elementsWithTracks
		.filter(isVisualTrackedElement)
		.map(({ track, element }) => ({
			trackId: track.id,
			elementId: element.id,
			initialTransform: resolveTransformAtTime({
				baseTransform: buildTransformFromParams({ params: element.params }),
				animations: element.animations,
				localTime: getElementLocalTime({
					timelineTime: currentTime,
					elementStartTime: element.startTime,
					elementDuration: element.duration,
				}),
			}),
			initialParams: element.params,
			initialAnimations: element.animations,
		}));
}

export class PreviewInteractionController {
	private readonly depsRef: PreviewInteractionDepsRef;
	private readonly subscribers = new Set<() => void>();

	private gesture: GestureSession = IDLE_GESTURE;
	private editingTextState: EditingTextState | null = null;
	private wasPlaying: boolean;
	private unsubscribePlayback: (() => void) | null = null;

	constructor({ depsRef }: { depsRef: PreviewInteractionDepsRef }) {
		this.depsRef = depsRef;
		this.wasPlaying = this.deps.playback.getIsPlaying();

		this.onDoubleClick = this.onDoubleClick.bind(this);
		this.onPointerDown = this.onPointerDown.bind(this);
		this.onPointerMove = this.onPointerMove.bind(this);
		this.onPointerUp = this.onPointerUp.bind(this);
		this.commitTextEdit = this.commitTextEdit.bind(this);
		this.handlePlaybackChange = this.handlePlaybackChange.bind(this);

		this.unsubscribePlayback = this.deps.playback.subscribe(
			this.handlePlaybackChange,
		);
	}

	private get deps(): PreviewInteractionDeps {
		return this.depsRef.current;
	}

	get isDragging(): boolean {
		return this.gesture.kind === "dragging";
	}

	/** Selection marquee being drawn, in canvas coordinates (top-left origin). */
	get marquee(): CanvasRect | null {
		return this.gesture.kind === "marquee"
			? normalizeRect({ from: this.gesture.origin, to: this.gesture.current })
			: null;
	}

	/** Visible selected elements with their bounds. */
	private getSelectedWithBounds(): ElementWithBounds[] {
		const selected = this.deps.selection.getSelected();
		return this.getVisibleElementsWithBounds().filter((item) =>
			selected.some((ref) => isSameElementRef({ left: ref, right: item })),
		);
	}

	/** Moves the selected elements by a canvas offset in one undo step (arrow keys). */
	nudgeSelection({ dx, dy }: { dx: number; dy: number }): boolean {
		const selected = this.deps.selection.getSelected();
		if (selected.length === 0 || this.gesture.kind !== "idle" || this.editingTextState) {
			return false;
		}
		const snapshots = toDragElementSnapshots({
			currentTime: this.deps.scene.getCurrentTime(),
			elementsWithTracks: this.deps.timeline.getElementsWithTracks({ elements: selected }),
		});
		if (snapshots.length === 0) return false;
		this.deps.timeline.previewElements(
			snapshots.map((snapshot) => ({
				trackId: snapshot.trackId,
				elementId: snapshot.elementId,
				updates: buildMoveUpdates({ snapshot, delta: { x: dx, y: dy } }),
			})),
		);
		this.deps.timeline.commitPreview();
		return true;
	}

	get editingText(): EditingTextState | null {
		return this.editingTextState;
	}

	subscribe({ listener }: { listener: () => void }): () => void {
		this.subscribers.add(listener);
		return () => this.subscribers.delete(listener);
	}

	destroy(): void {
		this.unsubscribePlayback?.();
		this.unsubscribePlayback = null;
		this.abortActiveGesture();
		this.editingTextState = null;
		this.subscribers.clear();
	}

	cancel(): void {
		if (this.gesture.kind === "idle") return;
		this.abortActiveGesture();
		this.notify();
	}

	private abortActiveGesture(): void {
		if (this.gesture.kind === "idle") return;

		if (this.gesture.kind === "dragging") {
			this.deps.timeline.discardPreview();
		}

		this.releaseCapturedPointer({ pointerState: this.gesture });
		this.gesture = IDLE_GESTURE;
		this.clearSnapLines();
	}

	commitTextEdit(): void {
		if (!this.editingTextState) return;

		this.editingTextState = null;
		this.deps.timeline.commitPreview();
		this.notify();
	}

	/** Starts editing a text element on the canvas (e.g. from the properties panel). */
	startTextEdit({
		trackId,
		elementId,
	}: {
		trackId: string;
		elementId: string;
	}): void {
		if (this.deps.preview.isMaskMode()) return;
		if (this.editingTextState) this.commitTextEdit();

		const [found] = this.deps.timeline.getElementsWithTracks({
			elements: [{ trackId, elementId }],
		});
		if (!found || found.element.type !== "text") return;

		this.deps.selection.setSelected([{ trackId, elementId }]);
		this.editingTextState = { trackId, elementId, element: found.element };
		this.notify();
	}

	onDoubleClick({ clientX, clientY }: ReactMouseEvent): void {
		if (this.editingTextState || this.deps.preview.isMaskMode()) return;

		const startPos = this.deps.viewport.screenToCanvas({
			clientX,
			clientY,
		});
		if (!startPos) return;

		const hit = hitTest({
			canvasX: startPos.x,
			canvasY: startPos.y,
			elementsWithBounds: this.getVisibleElementsWithBounds(),
		});

		if (!hit || hit.element.type !== "text") return;

		this.editingTextState = {
			trackId: hit.trackId,
			elementId: hit.elementId,
			element: hit.element,
		};
		this.notify();
	}

	onPointerDown({
		clientX,
		clientY,
		currentTarget,
		pointerId,
		button,
	}: ReactPointerEvent): void {
		if (this.editingTextState) return;
		if (this.deps.preview.isMaskMode()) return;
		if (button !== PRIMARY_POINTER_BUTTON) return;

		const startPos = this.deps.viewport.screenToCanvas({
			clientX,
			clientY,
		});
		if (!startPos) return;

		const hits = getHitElements({
			canvasX: startPos.x,
			canvasY: startPos.y,
			elementsWithBounds: this.getVisibleElementsWithBounds(),
		});
		const selectedElements = this.deps.selection.getSelected();
		const groupRect =
			selectedElements.length > 1
				? getGroupRect({ items: this.getSelectedWithBounds() })
				: null;

		this.gesture = {
			kind: "pending",
			additive: this.deps.input.isShiftHeld() || this.deps.input.isSnapBypassHeld(),
			insideGroup: groupRect !== null && rectContainsPoint({ rect: groupRect, point: startPos }),
			origin: startPos,
			pointerId,
			captureTarget: currentTarget as HTMLElement,
			topmostHit: hits[0] ?? null,
			selectedHit: resolvePreferredHit({
				hits,
				preferredElements: [...selectedElements],
			}),
			selectedElements,
		};

		currentTarget.setPointerCapture(pointerId);
	}

	onPointerMove({ clientX, clientY }: ReactPointerEvent): void {
		const currentPos = this.deps.viewport.screenToCanvas({
			clientX,
			clientY,
		});
		if (!currentPos) return;

		if (this.gesture.kind === "pending") {
			const pending = this.gesture;
			if (
				!movedPastDragThreshold({
					current: currentPos,
					origin: pending.origin,
				})
			) {
				this.clearSnapLines();
				return;
			}

			this.beginDragFromPending({ pending });
		}

		if (this.gesture.kind === "marquee") {
			this.updateMarquee({ marquee: this.gesture, currentPos });
			return;
		}

		if (this.gesture.kind !== "dragging") return;

		this.updateDragPreview({
			drag: this.gesture,
			currentPos,
		});
	}

	onPointerUp({ type }: ReactPointerEvent): void {
		if (this.gesture.kind === "marquee") {
			const marquee = this.gesture;
			if (type === "pointercancel") {
				this.deps.selection.setSelected([...marquee.base]);
			}
			this.gesture = IDLE_GESTURE;
			this.releaseCapturedPointer({ pointerState: marquee });
			this.notify();
			return;
		}

		if (this.gesture.kind === "dragging") {
			const drag = this.gesture;

			if (type === "pointercancel") {
				this.deps.timeline.discardPreview();
			} else {
				this.deps.timeline.commitPreview();
			}

			this.gesture = IDLE_GESTURE;
			this.clearSnapLines();
			this.releaseCapturedPointer({ pointerState: drag });
			this.notify();
			return;
		}

		if (this.gesture.kind !== "pending") return;

		const pending = this.gesture;

		if (type !== "pointercancel") {
			const clickTarget = pending.topmostHit;
			if (pending.additive) {
				// Shift / Cmd-click adds or removes; on empty canvas it keeps the selection.
				if (clickTarget) {
					this.deps.selection.setSelected(
						toggleRefInSelection({
							selection: pending.selectedElements,
							ref: { trackId: clickTarget.trackId, elementId: clickTarget.elementId },
						}),
					);
				}
			} else if (!clickTarget) {
				if (!pending.insideGroup) this.deps.selection.clearSelection();
			} else if (
				pending.insideGroup &&
				pending.selectedElements.some((ref) => isSameElementRef({ left: ref, right: clickTarget }))
			) {
				// Clicking one element of a group selection keeps the group.
			} else {
				this.deps.selection.setSelected([
					{
						trackId: clickTarget.trackId,
						elementId: clickTarget.elementId,
					},
				]);
			}
		}

		this.gesture = IDLE_GESTURE;
		this.clearSnapLines();
		this.releaseCapturedPointer({ pointerState: pending });
	}

	private notify(): void {
		for (const listener of this.subscribers) listener();
	}

	private clearSnapLines(): void {
		this.deps.preview.onSnapLinesChange?.([], []);
	}

	/**
	 * Alt-measure: distances from the selected element to the element under the
	 * pointer, or to the canvas edges when the pointer is not over another one.
	 */
	getMeasureGuides({
		clientX,
		clientY,
	}: {
		clientX: number;
		clientY: number;
	}): SpacingGuide[] {
		const selected = this.deps.selection.getSelected();
		if (selected.length !== 1 || this.gesture.kind === "dragging") return [];
		const canvasSize = this.deps.scene.getCanvasSize();
		const visible = this.getVisibleElementsWithBounds();
		const selectedItem = visible.find((item) => item.elementId === selected[0].elementId);
		if (!selectedItem) return [];
		const rect = rectFromBounds({ bounds: selectedItem.bounds, canvasSize });

		const pointer = this.deps.viewport.screenToCanvas({ clientX, clientY });
		const hovered = pointer
			? hitTest({
					canvasX: pointer.x,
					canvasY: pointer.y,
					elementsWithBounds: visible.filter((item) => item.elementId !== selectedItem.elementId),
				})
			: null;
		if (hovered) {
			const hoveredItem = visible.find((item) => item.elementId === hovered.elementId);
			if (hoveredItem) {
				const guides = getDistanceGuides({
					rect,
					others: [rectFromBounds({ bounds: hoveredItem.bounds, canvasSize })],
				});
				if (guides.length > 0) return guides;
			}
		}
		return getDistanceGuides({ rect, others: [], canvasSize, includeCanvasEdges: true });
	}

	private releaseCapturedPointer({
		pointerState,
	}: {
		pointerState: CapturedPointerState | null;
	}): void {
		if (!pointerState) return;

		if (!pointerState.captureTarget.hasPointerCapture(pointerState.pointerId)) {
			return;
		}

		pointerState.captureTarget.releasePointerCapture(pointerState.pointerId);
	}

	private getVisibleElementsWithBounds(): ElementWithBounds[] {
		return getVisibleElementsWithBounds({
			tracks: this.deps.scene.getTracks(),
			currentTime: this.deps.scene.getCurrentTime(),
			canvasSize: this.deps.scene.getCanvasSize(),
			mediaAssets: this.deps.scene.getMediaAssets(),
		});
	}

	private handlePlaybackChange(): void {
		const isPlaying = this.deps.playback.getIsPlaying();
		if (isPlaying && !this.wasPlaying && this.editingTextState) {
			this.commitTextEdit();
		}
		this.wasPlaying = isPlaying;
	}

	private beginMarquee({ pending }: { pending: PendingGesture }): void {
		this.gesture = {
			kind: "marquee",
			origin: pending.origin,
			current: pending.origin,
			base: pending.additive ? pending.selectedElements : [],
			pointerId: pending.pointerId,
			captureTarget: pending.captureTarget,
		};
		this.clearSnapLines();
		this.notify();
	}

	private updateMarquee({
		marquee,
		currentPos,
	}: {
		marquee: MarqueeGesture;
		currentPos: Point;
	}): void {
		this.gesture = { ...marquee, current: currentPos };
		const touched = getRefsInMarquee({
			items: this.getVisibleElementsWithBounds().filter((item) =>
				isVisualElement(item.element),
			),
			marquee: normalizeRect({ from: marquee.origin, to: currentPos }),
		});
		this.deps.selection.setSelected(mergeSelections({ base: marquee.base, extra: touched }));
		this.notify();
	}

	private beginDragFromPending({ pending }: { pending: PendingGesture }): void {
		// Inside a group selection, dragging anywhere in its box moves the group
		// (unless the press landed on an element outside the selection).
		const topmostHit = pending.topmostHit;
		const hitOutsideSelection =
			topmostHit !== null &&
			!pending.selectedElements.some((ref) =>
				isSameElementRef({ left: ref, right: topmostHit }),
			);
		const dragsGroup = pending.insideGroup && !hitOutsideSelection;
		const dragTarget = pending.selectedHit ?? topmostHit;
		if (!dragTarget && !dragsGroup) {
			// Empty canvas: draw a selection marquee.
			this.beginMarquee({ pending });
			return;
		}

		const dragSelection = dragsGroup || !dragTarget
			? [...pending.selectedElements]
			: buildDragSelection({
					selectedElements: pending.selectedElements,
					dragTarget,
				});
		const draggableElements = toDragElementSnapshots({
			currentTime: this.deps.scene.getCurrentTime(),
			elementsWithTracks: this.deps.timeline.getElementsWithTracks({
				elements: dragSelection,
			}),
		});

		if (draggableElements.length === 0) {
			this.gesture = IDLE_GESTURE;
			this.clearSnapLines();
			this.releaseCapturedPointer({ pointerState: pending });
			return;
		}

		if (!dragsGroup && dragTarget && pending.selectedHit === null) {
			this.deps.selection.setSelected([
				{
					trackId: dragTarget.trackId,
					elementId: dragTarget.elementId,
				},
			]);
		}

		// Several elements snap as one box: the group's, unrotated.
		const movedIds = new Set(draggableElements.map((element) => element.elementId));
		const groupRect =
			draggableElements.length > 1
				? getGroupRect({
						items: this.getVisibleElementsWithBounds().filter((item) =>
							movedIds.has(item.elementId),
						),
					})
				: null;
		const canvasSize = this.deps.scene.getCanvasSize();
		const firstElement = draggableElements[0];

		this.gesture = {
			kind: "dragging",
			origin: pending.origin,
			pointerId: pending.pointerId,
			captureTarget: pending.captureTarget,
			anchor: groupRect
				? {
						x: (groupRect.left + groupRect.right) / 2 - canvasSize.width / 2,
						y: (groupRect.top + groupRect.bottom) / 2 - canvasSize.height / 2,
					}
				: firstElement.initialTransform.position,
			bounds: groupRect
				? {
						width: groupRect.right - groupRect.left,
						height: groupRect.bottom - groupRect.top,
						rotation: 0,
					}
				: {
						width: dragTarget?.bounds.width ?? 0,
						height: dragTarget?.bounds.height ?? 0,
						rotation: dragTarget?.bounds.rotation ?? 0,
					},
			elements: draggableElements,
		};
		this.notify();
	}

	private updateDragPreview({
		drag,
		currentPos,
	}: {
		drag: DraggingGesture;
		currentPos: Point;
	}): void {
		const firstElement = drag.elements[0];
		if (!firstElement) return;

		const deltaX = currentPos.x - drag.origin.x;
		const deltaY = currentPos.y - drag.origin.y;

		// Shift keeps the movement on the dominant axis.
		const lockAxis = this.deps.input.isShiftHeld()
			? Math.abs(deltaX) >= Math.abs(deltaY)
				? "x"
				: "y"
			: null;
		const proposedPosition = {
			x: drag.anchor.x + (lockAxis === "y" ? 0 : deltaX),
			y: drag.anchor.y + (lockAxis === "x" ? 0 : deltaY),
		};

		const shouldSnap = !this.deps.input.isSnapBypassHeld();
		const snapThreshold = this.deps.viewport.screenPixelsToLogicalThreshold({
			screenPixels: SNAP_THRESHOLD_SCREEN_PIXELS,
		});
		const canvasSize = this.deps.scene.getCanvasSize();
		const draggedIds = new Set(drag.elements.map((element) => element.elementId));
		const targets =
			this.deps.preview.isSmartGuidesEnabled?.() === false
				? []
				: this.getVisibleElementsWithBounds()
						.filter((item) => !draggedIds.has(item.elementId))
						.map((item) => rectFromBounds({ bounds: item.bounds, canvasSize }));
		const { snappedPosition, activeLines, spacingGuides } = shouldSnap
			? snapPosition({
					proposedPosition,
					canvasSize,
					targets,
					elementSize: drag.bounds,
					rotation: drag.bounds.rotation,
					snapThreshold,
				})
			: {
					snappedPosition: proposedPosition,
					activeLines: [] as SnapLine[],
					spacingGuides: [] as SpacingGuide[],
				};

		this.deps.preview.onSnapLinesChange?.(activeLines, spacingGuides);

		const deltaSnappedX = snappedPosition.x - drag.anchor.x;
		const deltaSnappedY = snappedPosition.y - drag.anchor.y;

		this.deps.timeline.previewElements(
			drag.elements.map((snapshot) => ({
				trackId: snapshot.trackId,
				elementId: snapshot.elementId,
				updates: buildMoveUpdates({
					snapshot,
					delta: { x: deltaSnappedX, y: deltaSnappedY },
				}),
			})),
		);
	}
}
