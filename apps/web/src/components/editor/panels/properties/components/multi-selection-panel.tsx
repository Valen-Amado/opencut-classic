"use client";

import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditor } from "@/editor/use-editor";
import { getVisibleElementsWithBounds } from "@/preview/element-bounds";
import { buildMoveUpdates } from "@/preview/controllers/preview-interaction-controller";
import {
	getAlignDeltas,
	getDistributeDeltas,
	type AlignMode,
	type DistributeAxis,
	type PositionDelta,
} from "@/preview/multi-select";
import type { ElementRef } from "@/timeline";
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

const DISTRIBUTE_ACTIONS: { axis: DistributeAxis; label: string; icon: typeof AlignLeftIcon }[] = [
	{ axis: "horizontal", label: "Distribuir horizontalmente", icon: DistributeHorizontalCenterIcon },
	{ axis: "vertical", label: "Distribuir verticalmente", icon: DistributeVerticalCenterIcon },
];

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Properties for several selected elements: align them to each other and space them evenly. */
export function MultiSelectionPanel({ selectedElements }: { selectedElements: readonly ElementRef[] }) {
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

	const visible = tracks
		? getVisibleElementsWithBounds({ tracks, currentTime, canvasSize, mediaAssets }).filter(
				(item) =>
					isVisualElement(item.element) &&
					selectedElements.some(
						(ref) => ref.trackId === item.trackId && ref.elementId === item.elementId,
					),
			)
		: [];
	const canAlign = visible.length >= 2;
	const canDistribute = visible.length >= 3;

	const apply = (deltas: PositionDelta[]) => {
		const updates = deltas
			.filter((delta) => Math.abs(delta.dx) > 1e-6 || Math.abs(delta.dy) > 1e-6)
			.flatMap((delta) => {
				const item = visible.find(
					(candidate) =>
						candidate.trackId === delta.trackId && candidate.elementId === delta.elementId,
				);
				if (!item || !isVisualElement(item.element)) return [];
				return [
					{
						trackId: delta.trackId,
						elementId: delta.elementId,
						patch: buildMoveUpdates({
							snapshot: {
								initialParams: item.element.params,
								initialAnimations: item.element.animations,
							},
							delta: { x: delta.dx, y: delta.dy },
						}),
					},
				];
			});
		if (updates.length > 0) editor.timeline.updateElements({ updates });
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
				<div className="flex flex-col gap-2 border-b p-3.5">
					<span className="text-sm font-medium">Alinear entre sí</span>
					<div className="flex flex-wrap gap-1.5">
						{ALIGN_ACTIONS.map((action) =>
							actionButton({
								key: action.mode,
								label: action.label,
								icon: action.icon,
								disabled: !canAlign,
								onClick: () => apply(getAlignDeltas({ items: visible, mode: action.mode })),
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
								onClick: () => apply(getDistributeDeltas({ items: visible, axis: action.axis })),
							}),
						)}
					</div>
					{!canDistribute && (
						<p className="text-muted-foreground text-xs">Selecciona 3 o más elementos visibles.</p>
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
