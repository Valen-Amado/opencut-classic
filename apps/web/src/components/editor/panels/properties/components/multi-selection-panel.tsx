"use client";

import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditor } from "@/editor/use-editor";
import {
	getElementsWithBounds,
	getVisibleElementsWithBounds,
	type ElementWithBounds,
} from "@/preview/element-bounds";
import { rectFromBounds } from "@/preview/preview-snap";
import { getAlignedPosition, type CanvasAlignment } from "@/preview/transform-align";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import { useElementParamControl } from "@/components/editor/panels/properties/components/element-params-tab";
import { NumberParamField } from "@/components/editor/panels/properties/components/property-param-field";
import { requireParam } from "@/components/editor/panels/properties/components/transform-tab";
import { getElementParams } from "@/params/registry";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import { buildMoveUpdates, toDragElementSnapshot } from "@/preview/controllers/preview-interaction-controller";
import {
	getAlignDeltas,
	getDistributeDeltas,
	type AlignMode,
	type DistributeAxis,
	type PositionDelta,
} from "@/preview/multi-select";
import type { ElementRef, TimelineElement } from "@/timeline";
import { isVisualElement } from "@/timeline/element-utils";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	AlignBottomIcon,
	AlignHorizontalCenterIcon,
	AlignLeftIcon,
	AlignRightIcon,
	AlignTopIcon,
	AlignVerticalCenterIcon,
	DistributeHorizontalCenterIcon,
	DistributeVerticalCenterIcon,
} from "@hugeicons/core-free-icons";

const ALIGN_ACTIONS: { mode: AlignMode; label: string; icon: typeof AlignLeftIcon }[] = [
	{ mode: "left", label: "Alinear a la izquierda", icon: AlignLeftIcon },
	{ mode: "hcenter", label: "Centrar horizontalmente", icon: AlignHorizontalCenterIcon },
	{ mode: "right", label: "Alinear a la derecha", icon: AlignRightIcon },
	{ mode: "top", label: "Alinear arriba", icon: AlignTopIcon },
	{ mode: "vcenter", label: "Centrar verticalmente", icon: AlignVerticalCenterIcon },
	{ mode: "bottom", label: "Alinear abajo", icon: AlignBottomIcon },
];

const CANVAS_ALIGNMENTS: Record<AlignMode, CanvasAlignment> = {
	left: "left",
	hcenter: "center-x",
	right: "right",
	top: "top",
	vcenter: "center-y",
	bottom: "bottom",
};

const DISTRIBUTE_ACTIONS: { axis: DistributeAxis; label: string; icon: typeof AlignLeftIcon }[] = [
	{ axis: "horizontal", label: "Distribuir horizontalmente", icon: DistributeHorizontalCenterIcon },
	{ axis: "vertical", label: "Distribuir verticalmente", icon: DistributeVerticalCenterIcon },
];

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** One position for the whole group; each axis applies on its own. */
function GroupPositionSection({
	element: committedElement,
	trackId,
}: {
	element: TimelineElement;
	trackId: string;
}) {
	const { renderElement: element } = useElementPreview({
		trackId,
		elementId: committedElement.id,
		fallback: committedElement,
	});
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
		animations: element.animations,
	});
	const shared = { element, trackId, localTime, isPlayheadWithinElementRange };
	const params = getElementParams({ element });
	const paramX = requireParam({ params, key: "transform.positionX" });
	const paramY = requireParam({ params, key: "transform.positionY" });
	const controlX = useElementParamControl({ ...shared, param: paramX });
	const controlY = useElementParamControl({ ...shared, param: paramY });

	return (
		<div className="@container flex flex-col gap-2 border-b p-3.5">
			<span className="text-sm font-medium">Posición de todos</span>
			<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
				<NumberParamField
					param={{ ...paramX, shortLabel: "X" }}
					value={Number(controlX.value)}
					onPreview={controlX.onPreview}
					onCommit={controlX.onCommit}
					suffix="px"
				/>
				<NumberParamField
					param={{ ...paramY, shortLabel: "Y" }}
					value={Number(controlY.value)}
					onPreview={controlY.onPreview}
					onCommit={controlY.onCommit}
					suffix="px"
				/>
			</div>
		</div>
	);
}

/** Properties for several selected elements: align them to each other and space them evenly. */
export function MultiSelectionPanel({
	selectedElements,
	element,
	trackId,
}: {
	selectedElements: readonly ElementRef[];
	/** The element whose position shows when the whole selection can take one. */
	element?: TimelineElement;
	trackId?: string;
}) {
	const editor = useEditor();
	const [tracks, currentTime, mediaAssets, canvasSize] = useEditor(
		(e) =>
			[
				e.scenes.getActiveSceneOrNull()?.tracks ?? null,
				e.playback.getCurrentTime(),
				e.media.getAssets(),
				e.project.getActive().settings.canvasSize,
			] as const,
	);

	const getItems = () =>
		tracks
			? getElementsWithBounds({
					tracks,
					elements: selectedElements,
					currentTime,
					canvasSize,
					mediaAssets,
				}).filter((item) => isVisualElement(item.element))
			: [];
	// Subtitles rarely share a frame, so aligning can't depend on what's on screen.
	const canAlign = selectedElements.length >= 2;
	// Spacing only means something for elements seen together.
	const onScreen = tracks
		? getVisibleElementsWithBounds({ tracks, currentTime, canvasSize, mediaAssets }).filter(
				(item) =>
					isVisualElement(item.element) &&
					selectedElements.some(
						(ref) => ref.trackId === item.trackId && ref.elementId === item.elementId,
					),
			)
		: [];
	const canDistribute = onScreen.length >= 3;

	const apply = ({ items, deltas }: { items: ElementWithBounds[]; deltas: PositionDelta[] }) => {
		const updates = deltas
			.filter((delta) => Math.abs(delta.dx) > 1e-6 || Math.abs(delta.dy) > 1e-6)
			.flatMap((delta) => {
				const item = items.find(
					(candidate) =>
						candidate.trackId === delta.trackId && candidate.elementId === delta.elementId,
				);
				if (!item || !isVisualElement(item.element)) return [];
				return [
					{
						trackId: delta.trackId,
						elementId: delta.elementId,
						patch: buildMoveUpdates({
							snapshot: toDragElementSnapshot({
								trackId: delta.trackId,
								element: item.element,
								currentTime,
								fps: editor.project.getActive().settings.fps,
							}),
							delta: { x: delta.dx, y: delta.dy },
						}),
					},
				];
			});
		if (updates.length > 0) editor.timeline.updateElements({ updates });
	};

	const alignToEachOther = (mode: AlignMode) => {
		const items = getItems();
		apply({ items, deltas: getAlignDeltas({ items, mode }) });
	};

	const alignToCanvas = (alignment: CanvasAlignment) => {
		const items = getItems();
		apply({
			items,
			deltas: items.map((item) => {
				const { x, y } = getAlignedPosition({
					rect: rectFromBounds({ bounds: item.bounds, canvasSize }),
					position: { x: 0, y: 0 },
					canvasSize,
					alignment,
				});
				return { trackId: item.trackId, elementId: item.elementId, dx: x, dy: y };
			}),
		});
	};

	const actionButton = ({
		key,
		label,
		icon,
		disabled,
		onClick,
	}: {
		key: string;
		label: string;
		icon: typeof AlignLeftIcon;
		disabled: boolean;
		onClick: () => void;
	}) => (
		<Tooltip key={key}>
			<TooltipTrigger asChild>
				<Button
					variant="outline"
					size="icon"
					className="size-8"
					disabled={disabled}
					aria-label={label}
					onClick={onClick}
				>
					<HugeiconsIcon icon={icon} className="size-4" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);

	return (
		<TooltipProvider delayDuration={400}>
			<div className="flex flex-col">
				<div className="flex h-11 items-center border-b px-3.5">
					<span className="text-sm font-medium">
						{selectedElements.length} elementos seleccionados
					</span>
				</div>
				{element && trackId && <GroupPositionSection element={element} trackId={trackId} />}
				<div className="flex flex-col gap-2 border-b p-3.5">
					<span className="text-sm font-medium">Alinear en el lienzo</span>
					<div className="flex flex-wrap gap-1.5">
						{ALIGN_ACTIONS.map((action) =>
							actionButton({
								key: `canvas-${action.mode}`,
								label: action.label,
								icon: action.icon,
								disabled: false,
								onClick: () => alignToCanvas(CANVAS_ALIGNMENTS[action.mode]),
							}),
						)}
					</div>
				</div>
				<div className="flex flex-col gap-2 border-b p-3.5">
					<span className="text-sm font-medium">Alinear entre sí</span>
					<div className="flex flex-wrap gap-1.5">
						{ALIGN_ACTIONS.map((action) =>
							actionButton({
								key: action.mode,
								label: action.label,
								icon: action.icon,
								disabled: !canAlign,
								onClick: () => alignToEachOther(action.mode),
							}),
						)}
					</div>
				</div>
				<div className="flex flex-col gap-2 border-b p-3.5">
					<span className="text-sm font-medium">Distribuir</span>
					<div className="flex flex-wrap gap-1.5">
						{DISTRIBUTE_ACTIONS.map((action) =>
							actionButton({
								key: action.axis,
								label: action.label,
								icon: action.icon,
								disabled: !canDistribute,
								onClick: () =>
									apply({
										items: onScreen,
										deltas: getDistributeDeltas({ items: onScreen, axis: action.axis }),
									}),
							}),
						)}
					</div>
					{!canDistribute && (
						<p className="text-muted-foreground text-xs">
							Reparte 3 o más elementos que se vean a la vez en este momento.
						</p>
					)}
				</div>
				<ul className="text-muted-foreground flex flex-col gap-1.5 p-3.5 text-xs leading-relaxed">
					<li>
						<b className="text-foreground font-medium">Shift o {isMac ? "⌘" : "Ctrl"} + clic</b> en el lienzo para
						agregar o quitar elementos.
					</li>
					<li>
						<b className="text-foreground font-medium">Arrastra en un área vacía</b> para seleccionar con un
						recuadro.
					</li>
					<li>
						<b className="text-foreground font-medium">Arrastra dentro del grupo</b> para moverlos juntos;{" "}
						<b className="text-foreground font-medium">flechas</b> para moverlos 1 px (Shift: 10 px).
					</li>
				</ul>
			</div>
		</TooltipProvider>
	);
}
