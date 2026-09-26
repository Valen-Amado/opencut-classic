"use client";

import { createContext, useContext } from "react";
import { useEditor } from "@/editor/use-editor";
import { EditorCore } from "@/core";
import { requestCanvasTextEdit } from "@/preview/text-edit-request";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { AudioWaveform, WAVEFORM_GAIN_SAMPLE_COUNT } from "./audio-waveform";
import { AudioVolumeLine } from "./audio-volume-line";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import {
	useKeyframeDrag,
	type KeyframeDragState,
} from "@/timeline/hooks/element/use-keyframe-drag";
import { useKeyframeSelection } from "@/timeline/hooks/element/use-keyframe-selection";
import { useKeyframeBoxSelect } from "@/timeline/hooks/element/use-keyframe-box-select";
import { SelectionBox } from "@/selection/selection-box";
import { getElementKeyframes } from "@/animation";
import {
	canElementHaveAudio,
	canElementBeHidden,
	hasElementEffects,
	hasMediaId,
	timelineTimeToPixels,
	timelineTimeToSnappedPixels,
} from "@/timeline";
import { getTrackHeight } from "./track-layout";
import { VideoFilmstrip } from "./video-filmstrip";
import {
	getFilmstripTileWidth,
	getSourceAspectRatio,
} from "@/timeline/filmstrip";
import { getEffectiveRateAt } from "@/retime";
import { formatClipDuration, formatClipSpeedLabel } from "@/timeline/clip-chips";
import { getTimelineElementClassName, TIMELINE_TRACK_THEME } from "./theme";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { getEasingAtTime } from "@/animation/keyframe-easing";
import { BUILTIN_PRESETS } from "@/timeline/components/graph-editor/easing-presets";
import { matchEasingPreset } from "@/timeline/components/graph-editor/easing-match";
import { EasingCurveIcon } from "@/timeline/components/graph-editor/easing-curve-icon";
import { applyEasingAtTimes } from "@/timeline/keyframe-actions";
import type { SelectionBoxBounds } from "@/selection/types";
import type {
	TimelineElement as TimelineElementType,
	TimelineTrack,
	ElementDragView,
	VideoElement,
	ImageElement,
	AudioElement,
} from "@/timeline";
import type { MediaAsset } from "@/media/types";
import { mediaSupportsAudio } from "@/media/media-utils";
import {
	canToggleSourceAudio,
	getSourceAudioActionLabel,
	isSourceAudioSeparated,
} from "@/timeline/audio-separation";
import { buildWaveformGainSamples, isElementMuted } from "@/timeline/audio-state";
import { getTimelinePixelsPerSecond } from "@/timeline";
import { buildWaveformSourceKey } from "@/media/waveform-summary";
import { addMediaTime, type MediaTime, TICKS_PER_SECOND } from "@/wasm";
import {
	getActionDefinition,
	type TAction,
	type TActionWithOptionalArgs,
	invokeAction,
} from "@/actions";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { resolveStickerId } from "@/stickers";
import { buildGraphicPreviewUrl } from "@/graphics";
import Image from "next/image";
import {
	ScissorIcon,
	Delete02Icon,
	Copy01Icon,
	ViewIcon,
	ViewOffSlashIcon,
	VolumeHighIcon,
	VolumeOffIcon,
	VolumeMute02Icon,
	Search01Icon,
	Exchange01Icon,
	KeyframeIcon,
	MagicWand05Icon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { uppercase } from "@/utils/string";
import { useMemo, type ComponentProps, type ReactNode } from "react";
import type { SelectedKeyframeRef, ElementKeyframe } from "@/animation/types";
import { cn } from "@/utils/ui";
import { usePropertiesStore } from "@/components/editor/panels/properties/stores/properties-store";
import { getTrackTypeForElementType } from "@/timeline/placement/compatibility";
import { useTimelineStore } from "@/timeline/timeline-store";
import { KEYFRAME_LANE_HEIGHT_PX } from "./layout";
import {
	getExpandedRows,
	getExpansionHeight,
	type ExpandedRow,
} from "./expanded-layout";

const KEYFRAME_INDICATOR_MIN_WIDTH_PX = 40;
const ELEMENT_RING_WIDTH_PX = 1.5;

const PixelsPerSecondContext = createContext<number | null>(null);

interface KeyframeIndicator {
	time: MediaTime;
	offsetPx: number;
	keyframes: SelectedKeyframeRef[];
}

export function buildKeyframeIndicator({
	keyframe,
	trackId,
	elementId,
	displayedStartTime,
	zoomLevel,
	elementLeft,
}: {
	keyframe: ElementKeyframe;
	trackId: string;
	elementId: string;
	displayedStartTime: MediaTime;
	zoomLevel: number;
	elementLeft: number;
}): {
	time: MediaTime;
	offsetPx: number;
	keyframeRef: SelectedKeyframeRef;
} {
	const keyframeRef = {
		trackId,
		elementId,
		propertyPath: keyframe.propertyPath,
		keyframeId: keyframe.id,
	};
	const keyframeLeft = timelineTimeToSnappedPixels({
		time: displayedStartTime + keyframe.time,
		zoomLevel,
	});
	return {
		time: keyframe.time,
		offsetPx: keyframeLeft - elementLeft,
		keyframeRef,
	};
}

export function getKeyframeIndicators({
	keyframes,
	trackId,
	elementId,
	displayedStartTime,
	zoomLevel,
	elementLeft,
	elementWidth,
}: {
	keyframes: ElementKeyframe[];
	trackId: string;
	elementId: string;
	displayedStartTime: MediaTime;
	zoomLevel: number;
	elementLeft: number;
	elementWidth: number;
}): KeyframeIndicator[] {
	if (elementWidth < KEYFRAME_INDICATOR_MIN_WIDTH_PX) {
		return [];
	}

	const keyframesByTime = new Map<MediaTime, KeyframeIndicator>();
	for (const keyframe of keyframes) {
		const indicator = buildKeyframeIndicator({
			keyframe,
			trackId,
			elementId,
			displayedStartTime,
			zoomLevel,
			elementLeft,
		});
		const existingIndicator = keyframesByTime.get(indicator.time);
		if (!existingIndicator) {
			keyframesByTime.set(indicator.time, {
				time: indicator.time,
				offsetPx: indicator.offsetPx,
				keyframes: [indicator.keyframeRef],
			});
			continue;
		}

		existingIndicator.keyframes.push(indicator.keyframeRef);
	}

	return [...keyframesByTime.values()].sort((a, b) => a.time - b.time);
}

export function getDisplayShortcut({ action }: { action: TAction }) {
	const defaultShortcuts = getActionDefinition({ action }).defaultShortcuts;
	if (!defaultShortcuts?.length) {
		return "";
	}

	return uppercase({
		string: defaultShortcuts[0].replace("+", " "),
	});
}

interface TimelineElementProps {
	element: TimelineElementType;
	track: TimelineTrack;
	zoomLevel: number;
	isSelected: boolean;
	onResizeStart: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrack;
		side: "left" | "right";
	}) => void;
	onElementMouseDown: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
	}) => void;
	onElementClick: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
	}) => void;
	dragView: ElementDragView;
	isDropTarget?: boolean;
}

export function TimelineElement({
	element,
	track,
	zoomLevel,
	isSelected,
	onResizeStart,
	onElementMouseDown,
	onElementClick,
	dragView,
	isDropTarget = false,
}: TimelineElementProps) {
	const mediaAssets = useEditor((e) => e.media.getAssets());
	const { selectedElements } = useElementSelection();
	const requestRevealMedia = useAssetsPanelStore((s) => s.requestRevealMedia);
	const { renderElement } = useElementPreview({
		trackId: track.id,
		elementId: element.id,
		fallback: element,
	});

	let mediaAsset: MediaAsset | null = null;

	if (hasMediaId(element)) {
		mediaAsset =
			mediaAssets.find((asset) => asset.id === element.mediaId) ?? null;
	}

	const hasAudio = mediaSupportsAudio({ media: mediaAsset });

	const isCurrentElementSelected = selectedElements.some(
		(selected) =>
			selected.elementId === element.id && selected.trackId === track.id,
	);

	const isDragging = dragView.kind === "dragging";
	const dragTimeOffset = isDragging
		? dragView.memberTimeOffsets.get(element.id)
		: undefined;
	const isBeingDragged = dragTimeOffset !== undefined;
	const dragOffsetY =
		isDragging && isBeingDragged
			? dragView.currentMouseY - dragView.startMouseY
			: 0;
	const elementStartTime =
		isDragging && isBeingDragged
			? addMediaTime({ a: dragView.currentTime, b: dragTimeOffset })
			: renderElement.startTime;
	const displayedStartTime = elementStartTime;
	const displayedDuration = renderElement.duration;
	const elementWidth = timelineTimeToPixels({
		time: displayedDuration,
		zoomLevel,
	});
	const timelinePixelsPerSecond = getTimelinePixelsPerSecond({ zoomLevel });
	const elementLeft = timelineTimeToSnappedPixels({
		time: displayedStartTime,
		zoomLevel,
	});
	const keyframeIndicators = isSelected
		? getKeyframeIndicators({
				keyframes: getElementKeyframes({ animations: element.animations }),
				trackId: track.id,
				elementId: element.id,
				displayedStartTime,
				zoomLevel,
				elementLeft,
				elementWidth,
			})
		: [];

	const {
		keyframeDragState,
		handleKeyframeMouseDown,
		handleKeyframeClick,
		getVisualOffsetPx,
	} = useKeyframeDrag({ zoomLevel, element, displayedStartTime });

	const elementKeyframes = getElementKeyframes({
		animations: element.animations,
	});

	const isExpanded = useTimelineStore((s) =>
		s.expandedElementIds.has(element.id),
	);
	const toggleElementExpanded = useTimelineStore(
		(s) => s.toggleElementExpanded,
	);
	const expandedRows = useMemo(
		() =>
			isExpanded ? getExpandedRows({ animations: element.animations }) : [],
		[isExpanded, element.animations],
	);

	const {
		containerRef: expandedLanesRef,
		selectionBox: keyframeSelectionBox,
		isBoxSelecting: isKeyframeBoxSelecting,
		handleExpandedAreaMouseDown,
		handleExpandedAreaClick,
	} = useKeyframeBoxSelect({
		trackId: track.id,
		elementId: element.id,
		rows: expandedRows,
		keyframes: elementKeyframes,
		displayedStartTime,
		zoomLevel,
		elementLeft,
	});

	const handleRevealInMedia = ({ event }: { event: React.MouseEvent }) => {
		event.stopPropagation();
		if (hasMediaId(element)) {
			requestRevealMedia(element.mediaId);
		}
	};

	const isMuted = canElementHaveAudio(element) && isElementMuted({ element });
	const canToggleCurrentSourceAudio =
		selectedElements.length === 1 &&
		isCurrentElementSelected &&
		canToggleSourceAudio(element, mediaAsset);
	const sourceAudioLabel =
		element.type === "video"
			? getSourceAudioActionLabel({ element })
			: "Extract audio";
	const isElementSourceAudioSeparated =
		element.type === "video" && isSourceAudioSeparated({ element });
	const hasKeyframes = elementKeyframes.length > 0;
	const expansionHeight = getExpansionHeight({ rows: expandedRows });
	const baseTrackHeight = getTrackHeight({ type: track.type });

	const expandedContent =
		isExpanded && expandedRows.length > 0 ? (
			<ExpandedKeyframeLanes
				rows={expandedRows}
				keyframes={elementKeyframes}
				trackId={track.id}
				elementId={element.id}
				displayedStartTime={displayedStartTime}
				zoomLevel={zoomLevel}
				elementLeft={elementLeft}
				keyframeDragState={keyframeDragState}
				onKeyframeMouseDown={handleKeyframeMouseDown}
				onKeyframeClick={handleKeyframeClick}
				getVisualOffsetPx={getVisualOffsetPx}
				containerRef={expandedLanesRef}
				onLaneMouseDown={handleExpandedAreaMouseDown}
				onLaneClick={handleExpandedAreaClick}
				selectionBox={keyframeSelectionBox}
				isBoxSelecting={isKeyframeBoxSelecting}
			/>
		) : null;

	return (
		<PixelsPerSecondContext.Provider value={timelinePixelsPerSecond}>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<div
						className="absolute top-0 select-none"
						style={{
							left: `${elementLeft}px`,
							width: `${elementWidth}px`,
							height:
								expandedRows.length > 0
									? `${baseTrackHeight + expansionHeight}px`
									: "100%",
							transform:
								isDragging && isBeingDragged
									? `translate3d(0, ${dragOffsetY}px, 0)`
									: undefined,
						}}
					>
						<ElementInner
							element={element}
							displayElement={renderElement}
							track={track}
							isSelected={isSelected}
							isExpanded={expandedRows.length > 0}
							baseTrackHeight={baseTrackHeight}
							expandedContent={expandedContent}
							onElementClick={onElementClick}
							onElementMouseDown={onElementMouseDown}
							onResizeStart={onResizeStart}
							isDropTarget={isDropTarget}
						/>
						{isSelected && (
							<div
								className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden"
								style={{ height: `${baseTrackHeight}px` }}
							>
								<KeyframeIndicators
									indicators={keyframeIndicators}
									dragState={keyframeDragState}
									displayedStartTime={displayedStartTime}
									elementLeft={elementLeft}
									onKeyframeMouseDown={handleKeyframeMouseDown}
									onKeyframeClick={handleKeyframeClick}
									getVisualOffsetPx={getVisualOffsetPx}
								/>
							</div>
						)}
					</div>
				</ContextMenuTrigger>
				<ContextMenuContent className="w-64">
					<ActionMenuItem
						action="split"
						icon={<HugeiconsIcon icon={ScissorIcon} />}
					>
						Dividir
					</ActionMenuItem>
					<CopyMenuItem />
					{selectedElements.length === 1 && (
						<ActionMenuItem
							action="duplicate-selected"
							icon={<HugeiconsIcon icon={Copy01Icon} />}
						>
							Duplicar
						</ActionMenuItem>
					)}
					{canElementHaveAudio(element) && hasAudio && (
						<MuteMenuItem
							isMultipleSelected={selectedElements.length > 1}
							isCurrentElementSelected={isCurrentElementSelected}
							isMuted={isMuted}
						/>
					)}
					{canToggleCurrentSourceAudio && (
						<ContextMenuItem
							icon={
								<HugeiconsIcon
									icon={
										isElementSourceAudioSeparated ? ScissorIcon : ScissorIcon
									}
								/>
							}
							onClick={(event: React.MouseEvent) => {
								event.stopPropagation();
								invokeAction("toggle-source-audio");
							}}
						>
							{sourceAudioLabel}
						</ContextMenuItem>
					)}
					{canElementBeHidden(element) && (
						<VisibilityMenuItem
							element={element}
							isMultipleSelected={selectedElements.length > 1}
							isCurrentElementSelected={isCurrentElementSelected}
						/>
					)}
					{hasKeyframes && (
						<ContextMenuItem
							icon={<HugeiconsIcon icon={KeyframeIcon} />}
							onClick={(event: React.MouseEvent) => {
								event.stopPropagation();
								toggleElementExpanded(element.id);
							}}
						>
							{isExpanded ? "Collapse keyframes" : "Expand keyframes"}
						</ContextMenuItem>
					)}
					{selectedElements.length === 1 && hasMediaId(element) && (
						<>
							<ContextMenuItem
								icon={<HugeiconsIcon icon={Search01Icon} />}
								onClick={(event: React.MouseEvent) =>
									handleRevealInMedia({ event })
								}
							>
								Mostrar el archivo
							</ContextMenuItem>
							<ContextMenuItem
								icon={<HugeiconsIcon icon={Exchange01Icon} />}
								disabled
							>
								Reemplazar el archivo
							</ContextMenuItem>
						</>
					)}
					<ContextMenuSeparator />
					<DeleteMenuItem
						isMultipleSelected={selectedElements.length > 1}
						isCurrentElementSelected={isCurrentElementSelected}
						elementType={element.type}
						selectedCount={selectedElements.length}
					/>
				</ContextMenuContent>
			</ContextMenu>
		</PixelsPerSecondContext.Provider>
	);
}

function ElementInner({
	element,
	displayElement,
	track,
	isSelected,
	isExpanded,
	baseTrackHeight,
	expandedContent,
	onElementClick,
	onElementMouseDown,
	onResizeStart,
	isDropTarget = false,
}: {
	element: TimelineElementType;
	displayElement?: TimelineElementType;
	track: TimelineTrack;
	isSelected: boolean;
	isExpanded: boolean;
	baseTrackHeight: number;
	expandedContent: React.ReactNode;
	onElementClick: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
	}) => void;
	onElementMouseDown: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
	}) => void;
	onResizeStart: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrack;
		side: "left" | "right";
	}) => void;
	isDropTarget?: boolean;
}) {
	const visibleElement = displayElement ?? element;
	const isReducedOpacity =
		(canElementBeHidden(visibleElement) && visibleElement.hidden) ||
		isDropTarget;
	return (
		<div
			className="absolute top-0 bottom-0"
			style={{
				left: `${ELEMENT_RING_WIDTH_PX}px`,
				right: `${ELEMENT_RING_WIDTH_PX}px`,
			}}
		>
			<div
				className="absolute inset-0 rounded-sm"
				style={
					isSelected
						? {
								boxShadow: `0 0 0 ${ELEMENT_RING_WIDTH_PX}px var(--primary)`,
							}
						: undefined
				}
			>
				<div
					className={cn(
						"absolute inset-0 overflow-hidden rounded-sm",
						isExpanded && "bg-background",
					)}
				>
					<button
						type="button"
						tabIndex={-1}
						className="absolute inset-0 size-full flex flex-col"
						onClick={(event) => onElementClick({ event, element })}
						onDoubleClick={() => {
							if (element.type !== "text") return;
							requestCanvasTextEdit({
								editor: EditorCore.getInstance(),
								trackId: track.id,
								element,
							});
						}}
						onMouseDown={(event) => onElementMouseDown({ event, element })}
					>
						<div
							className={cn(
								"flex shrink-0 items-center overflow-hidden",
								getTimelineElementClassName({
									type: getTrackTypeForElementType({
										elementType: element.type,
									}),
								}),
								isReducedOpacity && "opacity-50",
							)}
							style={{ height: `${baseTrackHeight}px` }}
						>
							<div className="flex flex-1 min-h-0 h-full items-center overflow-hidden">
								<ElementContent element={visibleElement} track={track} />
							</div>
						</div>
						{expandedContent}
					</button>
				</div>
			</div>

			{isSelected && (
				<>
					<ResizeHandle
						side="left"
						element={element}
						track={track}
						onResizeStart={onResizeStart}
					/>
					<ResizeHandle
						side="right"
						element={element}
						track={track}
						onResizeStart={onResizeStart}
					/>
				</>
			)}
		</div>
	);
}

function ResizeHandle({
	side,
	element,
	track,
	onResizeStart,
}: {
	side: "left" | "right";
	element: TimelineElementType;
	track: TimelineTrack;
	onResizeStart: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrack;
		side: "left" | "right";
	}) => void;
}) {
	const isLeft = side === "left";
	return (
		<button
			type="button"
			className={cn(
				"absolute top-0 bottom-0 w-2",
				isLeft ? "-left-1 cursor-w-resize" : "-right-1 cursor-e-resize",
			)}
			onMouseDown={(event) => onResizeStart({ event, element, track, side })}
			onClick={(event) => event.stopPropagation()}
			aria-label={`${isLeft ? "Left" : "Right"} resize handle`}
		></button>
	);
}

function KeyframeIndicators({
	indicators,
	dragState,
	displayedStartTime,
	elementLeft,
	onKeyframeMouseDown,
	onKeyframeClick,
	getVisualOffsetPx,
}: {
	indicators: KeyframeIndicator[];
	dragState: KeyframeDragState;
	displayedStartTime: MediaTime;
	elementLeft: number;
	onKeyframeMouseDown: (params: {
		event: React.MouseEvent;
		keyframes: SelectedKeyframeRef[];
	}) => void;
	onKeyframeClick: (params: {
		event: React.MouseEvent;
		keyframes: SelectedKeyframeRef[];
		orderedKeyframes: SelectedKeyframeRef[];
		indicatorTime: MediaTime;
	}) => void;
	getVisualOffsetPx: (params: {
		indicatorTime: MediaTime;
		indicatorOffsetPx: number;
		isBeingDragged: boolean;
		displayedStartTime: MediaTime;
		elementLeft: number;
	}) => number;
}) {
	const { isKeyframeSelected } = useKeyframeSelection();
	const orderedKeyframes = indicators.flatMap(
		(indicator) => indicator.keyframes,
	);

	return indicators.map((indicator) => {
		const isIndicatorSelected = indicator.keyframes.some((keyframe) =>
			isKeyframeSelected({ keyframe }),
		);
		const isBeingDragged = indicator.keyframes.some((keyframe) =>
			dragState.draggingKeyframeIds.has(keyframe.keyframeId),
		);
		const visualOffsetPx = getVisualOffsetPx({
			indicatorTime: indicator.time,
			indicatorOffsetPx: indicator.offsetPx,
			isBeingDragged,
			displayedStartTime,
			elementLeft,
		});

		return (
			<KeyframeIndicatorContextMenu
				key={indicator.time}
				keyframes={indicator.keyframes}
				time={indicator.time}
			>
			<button
				type="button"
				className="pointer-events-auto absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-grab p-1 transition-transform hover:scale-110"
				style={{ left: visualOffsetPx }}
				onMouseDown={(event) =>
					onKeyframeMouseDown({ event, keyframes: indicator.keyframes })
				}
				onClick={(event) =>
					onKeyframeClick({
						event,
						keyframes: indicator.keyframes,
						orderedKeyframes,
						indicatorTime: indicator.time,
					})
				}
				aria-label="Seleccionar el fotograma clave"
			>
				<HugeiconsIcon
					icon={KeyframeIcon}
					className={cn(
						"size-4.5 text-black",
						isIndicatorSelected ? "fill-primary" : "fill-white",
					)}
					strokeWidth={1.5}
				/>
			</button>
			</KeyframeIndicatorContextMenu>
		);
	});
}

/** Right-click menu of a keyframe diamond: curve presets and delete. */
function KeyframeIndicatorContextMenu({
	keyframes,
	time,
	children,
}: {
	keyframes: SelectedKeyframeRef[];
	time: MediaTime;
	children: ReactNode;
}) {
	const editor = useEditor();
	const { isKeyframeSelected } = useKeyframeSelection();
	const [first] = keyframes;
	const getElement = () =>
		first
			? editor.timeline.getElementsWithTracks({
					elements: [{ trackId: first.trackId, elementId: first.elementId }],
				})[0]?.element
			: undefined;
	const element = getElement();
	const currentPreset = element
		? matchEasingPreset({
				cubicBezier: getEasingAtTime({ animations: element.animations, time }),
			})
		: null;

	return (
		<ContextMenu
			onOpenChange={(open) => {
				if (open && !keyframes.some((keyframe) => isKeyframeSelected({ keyframe }))) {
					editor.selection.setSelectedKeyframes({ keyframes });
				}
			}}
		>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-56">
				<ContextMenuLabel>Curva</ContextMenuLabel>
				{BUILTIN_PRESETS.map((preset) => (
					<ContextMenuItem
						key={preset.id}
						onClick={(event: React.MouseEvent) => {
							event.stopPropagation();
							const target = getElement();
							if (!target || !first) return;
							applyEasingAtTimes({
								editor,
								element: target,
								trackId: first.trackId,
								times: [time],
								cubicBezier: preset.value,
							});
						}}
					>
						<EasingCurveIcon cubicBezier={preset.value} />
						<span className="flex-1">{preset.label}</span>
						{currentPreset?.id === preset.id && (
							<HugeiconsIcon icon={Tick02Icon} className="size-3.5" />
						)}
					</ContextMenuItem>
				))}
				<ContextMenuSeparator />
				<ContextMenuItem
					variant="destructive"
					icon={<HugeiconsIcon icon={Delete02Icon} />}
					onClick={(event: React.MouseEvent) => {
						event.stopPropagation();
						editor.timeline.removeKeyframes({ keyframes });
					}}
				>
					Eliminar {keyframes.length > 1 ? `${keyframes.length} keyframes` : "keyframe"}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

function ExpandedKeyframeLanes({
	rows,
	keyframes,
	trackId,
	elementId,
	displayedStartTime,
	zoomLevel,
	elementLeft,
	keyframeDragState,
	onKeyframeMouseDown,
	onKeyframeClick,
	getVisualOffsetPx,
	containerRef,
	onLaneMouseDown,
	onLaneClick,
	selectionBox,
	isBoxSelecting,
}: {
	rows: ExpandedRow[];
	keyframes: ElementKeyframe[];
	trackId: string;
	elementId: string;
	displayedStartTime: MediaTime;
	zoomLevel: number;
	elementLeft: number;
	keyframeDragState: KeyframeDragState;
	onKeyframeMouseDown: (params: {
		event: React.MouseEvent;
		keyframes: SelectedKeyframeRef[];
	}) => void;
	containerRef: React.RefObject<HTMLDivElement | null>;
	onLaneMouseDown: (event: React.MouseEvent) => void;
	onLaneClick: (event: React.MouseEvent) => void;
	selectionBox: {
		bounds: SelectionBoxBounds;
	} | null;
	isBoxSelecting: boolean;
	onKeyframeClick: (params: {
		event: React.MouseEvent;
		keyframes: SelectedKeyframeRef[];
		orderedKeyframes: SelectedKeyframeRef[];
		indicatorTime: MediaTime;
	}) => void;
	getVisualOffsetPx: (params: {
		indicatorTime: MediaTime;
		indicatorOffsetPx: number;
		isBeingDragged: boolean;
		displayedStartTime: MediaTime;
		elementLeft: number;
	}) => number;
}) {
	const { isKeyframeSelected } = useKeyframeSelection();

	const orderedKeyframes = useMemo(
		() =>
			[...keyframes]
				.sort(
					(a, b) =>
						a.time - b.time || a.propertyPath.localeCompare(b.propertyPath),
				)
				.map((kf) => ({
					trackId,
					elementId,
					propertyPath: kf.propertyPath,
					keyframeId: kf.id,
				})),
		[keyframes, trackId, elementId],
	);

	return (
		// eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- spatial gesture surface (keyframe lanes); keyboard control over keyframes is via global timeline shortcuts, not per-element focus.
		<div
			ref={containerRef}
			className="relative flex flex-col"
			onMouseDown={onLaneMouseDown}
			onClick={onLaneClick}
		>
			{rows.map((row) => {
				const laneKeyframes = keyframes.filter(
					(kf) => kf.propertyPath === row.propertyPath,
				);
				return (
					<div
						key={row.propertyPath}
						className={cn("relative flex items-center bg-muted/50")}
						style={{ height: `${KEYFRAME_LANE_HEIGHT_PX}px` }}
					>
						{laneKeyframes.map((kf) => {
							const keyframeRef: SelectedKeyframeRef = {
								trackId,
								elementId,
								propertyPath: row.propertyPath,
								keyframeId: kf.id,
							};
							const isBeingDragged = keyframeDragState.draggingKeyframeIds.has(
								kf.id,
							);
							const kfLeft = timelineTimeToSnappedPixels({
								time: displayedStartTime + kf.time,
								zoomLevel,
							});
							const offsetPx = kfLeft - elementLeft;
							const visualOffset = getVisualOffsetPx({
								indicatorTime: kf.time,
								indicatorOffsetPx: offsetPx,
								isBeingDragged,
								displayedStartTime,
								elementLeft,
							});
							const isSelected = isKeyframeSelected({
								keyframe: keyframeRef,
							});

							return (
								<button
									key={kf.id}
									type="button"
									className={cn(
										"pointer-events-auto absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-grab",
										isBoxSelecting && "pointer-events-none",
									)}
									style={{ left: visualOffset }}
									onMouseDown={(event) => {
										event.stopPropagation();
										onKeyframeMouseDown({
											event,
											keyframes: [keyframeRef],
										});
									}}
									onClick={(event) => {
										event.stopPropagation();
										onKeyframeClick({
											event,
											keyframes: [keyframeRef],
											orderedKeyframes,
											indicatorTime: kf.time,
										});
									}}
									aria-label="Seleccionar el fotograma clave"
								>
									<HugeiconsIcon
										icon={KeyframeIcon}
										className={cn(
											"size-3.5 text-black mr-1",
											isSelected ? "fill-primary" : "fill-white",
										)}
										strokeWidth={1.5}
									/>
								</button>
							);
						})}
					</div>
				);
			})}
			{selectionBox && <SelectionBox bounds={selectionBox.bounds} />}
		</div>
	);
}

interface ElementContentProps {
	element: TimelineElementType;
	track: TimelineTrack;
}

function TextElementContent({
	element,
}: {
	element: Extract<TimelineElementType, { type: "text" }>;
}) {
	return (
		<div className="flex size-full items-center justify-start pl-2">
			<span className="truncate text-xs text-white">
				{typeof element.params.content === "string" ? element.params.content : ""}
			</span>
		</div>
	);
}

function EffectElementContent({
	element,
}: {
	element: Extract<TimelineElementType, { type: "effect" }>;
}) {
	return (
		<div className="flex size-full items-center justify-start gap-1 pl-2">
			<HugeiconsIcon
				icon={MagicWand05Icon}
				className="size-4 shrink-0 text-white"
			/>
			<span className="truncate text-xs text-white">{element.name}</span>
		</div>
	);
}

function StickerElementContent({
	element,
}: {
	element: Extract<TimelineElementType, { type: "sticker" }>;
}) {
	return (
		<div className="flex size-full items-center gap-2 pl-2">
			<Image
				src={resolveStickerId({
					stickerId: element.stickerId,
					options: { width: 20, height: 20 },
				})}
				alt={element.name}
				className="size-4 shrink-0"
				width={20}
				height={20}
				unoptimized
			/>
			<span className="truncate text-xs text-white">{element.name}</span>
		</div>
	);
}

function GraphicElementContent({
	element,
}: {
	element: Extract<TimelineElementType, { type: "graphic" }>;
}) {
	return (
		<div className="flex size-full items-center gap-2 pl-2">
			<Image
				src={buildGraphicPreviewUrl({
					definitionId: element.definitionId,
					params: element.params,
					size: 20,
				})}
				alt={element.name}
				className="size-4 shrink-0"
				width={20}
				height={20}
				unoptimized
			/>
			<span className="truncate text-xs text-white">{element.name}</span>
		</div>
	);
}

function AudioElementContent({
	element,
	trackId,
}: {
	element: AudioElement;
	trackId: string;
}) {
	const pixelsPerSecond = useContext(PixelsPerSecondContext);
	if (pixelsPerSecond === null) {
		throw new Error(
			"AudioElementContent must be rendered inside PixelsPerSecondContext.Provider",
		);
	}
	const mediaAssets = useEditor((e) => e.media.getAssets());
	const fps = useEditor((e) => e.project.getActive().settings.fps);
	const mediaAsset =
		element.sourceType === "upload"
			? (mediaAssets.find((asset) => asset.id === element.mediaId) ?? null)
			: null;

	const audioBuffer =
		element.sourceType === "library" ? element.buffer : undefined;
	const audioUrl =
		element.sourceType === "library" ? element.sourceUrl : mediaAsset?.url;
	const sourceFile =
		element.sourceType === "upload" ? mediaAsset?.file : undefined;
	const sourceKey =
		element.sourceType === "upload"
			? buildWaveformSourceKey({ kind: "media", id: element.mediaId })
			: buildWaveformSourceKey({ kind: "library", id: element.sourceUrl });
	const mediaLabel = mediaAsset?.name ?? element.name;
	const gainSamples = useMemo(
		() =>
			buildWaveformGainSamples({
				element,
				count: WAVEFORM_GAIN_SAMPLE_COUNT,
			}),
		[element],
	);
	if (audioBuffer || audioUrl || sourceFile) {
		return (
			<div className="group/audio relative size-full">
				<MediaElementHeader
					name={mediaLabel}
					durationLabel={formatClipDuration({ duration: element.duration, fps })}
					hasFade={false}
					chipTone="light"
				/>
				<div className="absolute inset-x-0 top-5 bottom-0 overflow-hidden">
					<AudioWaveform
						sourceKey={sourceKey}
						sourceFile={sourceFile}
						audioBuffer={audioBuffer}
						audioUrl={audioUrl}
						gainSamples={gainSamples}
						pixelsPerSecond={pixelsPerSecond}
						clipDurationSec={element.duration / TICKS_PER_SECOND}
						retime={element.retime}
						sourceStartSec={element.trimStart / TICKS_PER_SECOND}
						color={TIMELINE_TRACK_THEME.audio.waveformColor}
					/>
					<AudioVolumeLine element={element} trackId={trackId} />
				</div>
			</div>
		);
	}

	return (
		<div className="group/audio relative size-full">
			<div className="flex size-full items-center pl-2">
				<span className="text-foreground/80 truncate text-xs">
					{element.name}
				</span>
			</div>
			<AudioVolumeLine element={element} trackId={trackId} />
		</div>
	);
}

function EffectsButton({
	element,
	track,
}: {
	element: VideoElement | ImageElement;
	track: TimelineTrack;
}) {
	const editor = useEditor();
	const setActiveTab = usePropertiesStore((s) => s.setActiveTab);

	const handleClick = (event: React.MouseEvent) => {
		event.stopPropagation();
		editor.selection.setSelectedElements({
			elements: [{ trackId: track.id, elementId: element.id }],
		});
		setActiveTab({ elementType: element.type, tabId: "effects" });
	};

	return (
		<button
			type="button"
			className="flex shrink-0 justify-center text-white cursor-pointer"
			onMouseDown={(event) => event.stopPropagation()}
			onClick={handleClick}
		>
			<HugeiconsIcon icon={MagicWand05Icon} size={12} />
		</button>
	);
}

function TiledMediaContent({
	element,
	track,
}: {
	element: VideoElement | ImageElement;
	track: TimelineTrack;
}) {
	const pixelsPerSecond = useContext(PixelsPerSecondContext);
	const mediaAssets = useEditor((e) => e.media.getAssets());
	const fps = useEditor((e) => e.project.getActive().settings.fps);

	const mediaAsset = mediaAssets.find((asset) => asset.id === element.mediaId);
	const imageUrl =
		element.type === "video"
			? mediaAsset?.thumbnailUrl
			: (mediaAsset?.thumbnailUrl ?? mediaAsset?.url);

	if (!imageUrl) {
		return (
			<span className="text-foreground/80 truncate text-xs">
				{element.name}
			</span>
		);
	}

	const trackHeight = getTrackHeight({ type: track.type });
	const tileWidth = getFilmstripTileWidth({
		trackHeight,
		aspectRatio: getSourceAspectRatio({
			width: mediaAsset?.width,
			height: mediaAsset?.height,
		}),
	});

	return (
		<>
			{element.type === "video" && mediaAsset && pixelsPerSecond !== null ? (
				<VideoFilmstrip
					mediaId={mediaAsset.id}
					file={mediaAsset.file}
					placeholderUrl={imageUrl}
					tileWidthPx={tileWidth}
					trackHeight={trackHeight}
					pixelsPerSecond={pixelsPerSecond}
					trimStartSec={element.trimStart / TICKS_PER_SECOND}
					playbackRate={getEffectiveRateAt({ retime: element.retime })}
					sourceDurationSec={
						mediaAsset.duration ??
						(element.sourceDuration !== undefined
							? element.sourceDuration / TICKS_PER_SECOND
							: undefined)
					}
				/>
			) : (
				<div
					className="absolute inset-0"
					style={{
						backgroundColor: "var(--muted)",
						backgroundImage: `url(${imageUrl})`,
						backgroundRepeat: "repeat-x",
						backgroundSize: `${tileWidth}px ${trackHeight}px`,
						backgroundPosition: "left center",
						pointerEvents: "none",
					}}
				/>
			)}
			<MediaElementHeader
				name={mediaAsset?.name}
				leading={
					hasElementEffects({ element }) ? (
						<EffectsButton element={element} track={track} />
					) : null
				}
				speedLabel={
					element.type === "video"
						? formatClipSpeedLabel({
								rate: getEffectiveRateAt({ retime: element.retime }),
							})
						: null
				}
				durationLabel={formatClipDuration({ duration: element.duration, fps })}
				hasFade={true}
			/>
		</>
	);
}

const HEADER_CHIP_CLASS_NAME =
	"ml-1 shrink-0 rounded px-[5px] text-[0.6rem] leading-[14px] text-white tabular-nums";

function MediaElementHeader({
	name,
	leading,
	speedLabel,
	durationLabel,
	hasFade,
	chipTone = "dark",
}: {
	name?: string | null;
	leading?: ReactNode;
	speedLabel?: string | null;
	durationLabel?: string | null;
	hasFade?: boolean;
	chipTone?: "dark" | "light";
}) {
	if (!name && !leading && !durationLabel) {
		return null;
	}

	const chipBackground = chipTone === "dark" ? "bg-black/50" : "bg-black/25";

	return (
		<div
			className={cn(
				"absolute top-0 left-0 flex h-5 w-full items-start overflow-hidden bg-linear-to-b pt-1 pr-1",
				hasFade && "from-black/30 to-transparent",
			)}
		>
			{leading && (
				<div
					className={cn(
						HEADER_CHIP_CLASS_NAME,
						chipBackground,
						"flex h-3.5 items-center px-[3px]",
					)}
				>
					{leading}
				</div>
			)}
			{speedLabel && (
				<span className={cn(HEADER_CHIP_CLASS_NAME, chipBackground)}>
					{speedLabel}
				</span>
			)}
			{name && (
				<span
					className={cn(
						HEADER_CHIP_CLASS_NAME,
						chipBackground,
						"min-w-0 shrink truncate",
					)}
				>
					{name}
				</span>
			)}
			{durationLabel && (
				<span className={cn(HEADER_CHIP_CLASS_NAME, chipBackground)}>
					{durationLabel}
				</span>
			)}
		</div>
	);
}

function ElementContent({ element, track }: ElementContentProps) {
	switch (element.type) {
		case "text":
			return <TextElementContent element={element} />;
		case "effect":
			return <EffectElementContent element={element} />;
		case "sticker":
			return <StickerElementContent element={element} />;
		case "graphic":
			return <GraphicElementContent element={element} />;
		case "audio":
			return <AudioElementContent element={element} trackId={track.id} />;
		case "video":
		case "image":
			return <TiledMediaContent element={element} track={track} />;
	}
}

function CopyMenuItem() {
	return (
		<ActionMenuItem
			action="copy-selected"
			icon={<HugeiconsIcon icon={Copy01Icon} />}
		>
			Copiar
		</ActionMenuItem>
	);
}

function MuteMenuItem({
	isMultipleSelected,
	isCurrentElementSelected,
	isMuted,
}: {
	isMultipleSelected: boolean;
	isCurrentElementSelected: boolean;
	isMuted: boolean;
}) {
	const getIcon = () => {
		if (isMultipleSelected && isCurrentElementSelected) {
			return <HugeiconsIcon icon={VolumeMute02Icon} />;
		}
		return isMuted ? (
			<HugeiconsIcon icon={VolumeOffIcon} />
		) : (
			<HugeiconsIcon icon={VolumeHighIcon} />
		);
	};

	return (
		<ActionMenuItem action="toggle-elements-muted-selected" icon={getIcon()}>
			{isMuted ? "Unmute" : "Mute"}
		</ActionMenuItem>
	);
}

function VisibilityMenuItem({
	element,
	isMultipleSelected,
	isCurrentElementSelected,
}: {
	element: TimelineElementType;
	isMultipleSelected: boolean;
	isCurrentElementSelected: boolean;
}) {
	const isHidden = canElementBeHidden(element) && element.hidden;

	const getIcon = () => {
		if (isMultipleSelected && isCurrentElementSelected) {
			return <HugeiconsIcon icon={ViewOffSlashIcon} />;
		}
		return isHidden ? (
			<HugeiconsIcon icon={ViewIcon} />
		) : (
			<HugeiconsIcon icon={ViewOffSlashIcon} />
		);
	};

	return (
		<ActionMenuItem
			action="toggle-elements-visibility-selected"
			icon={getIcon()}
		>
			{isHidden ? "Show" : "Hide"}
		</ActionMenuItem>
	);
}

function DeleteMenuItem({
	isMultipleSelected,
	isCurrentElementSelected,
	elementType,
	selectedCount,
}: {
	isMultipleSelected: boolean;
	isCurrentElementSelected: boolean;
	elementType: TimelineElementType["type"];
	selectedCount: number;
}) {
	return (
		<ActionMenuItem
			action="delete-selected"
			variant="destructive"
			icon={<HugeiconsIcon icon={Delete02Icon} />}
		>
			{isMultipleSelected && isCurrentElementSelected
				? `Delete ${selectedCount} elements`
				: `Delete ${elementType === "text" ? "text" : "clip"}`}
		</ActionMenuItem>
	);
}

function ActionMenuItem({
	action,
	children,
	...props
}: Omit<ComponentProps<typeof ContextMenuItem>, "onClick" | "textRight"> & {
	action: TActionWithOptionalArgs;
	children: ReactNode;
}) {
	return (
		<ContextMenuItem
			onClick={(event: React.MouseEvent) => {
				event.stopPropagation();
				invokeAction(action);
			}}
			textRight={getDisplayShortcut({ action })}
			{...props}
		>
			{children}
		</ContextMenuItem>
	);
}
