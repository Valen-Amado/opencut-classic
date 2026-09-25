"use client";

import { useSyncExternalStore } from "react";
import { useEditor } from "@/editor/use-editor";
import { getElementKeyframes } from "@/animation/keyframe-query";
import { getEasingAtTime } from "@/animation/keyframe-easing";
import {
	getAdjacentKeyframeTimes,
	getUniqueKeyframeTimes,
} from "@/animation/keyframe-navigation";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BUILTIN_PRESETS } from "@/timeline/components/graph-editor/easing-presets";
import { matchEasingPreset } from "@/timeline/components/graph-editor/easing-match";
import { EasingCurveIcon } from "@/timeline/components/graph-editor/easing-curve-icon";
import { applyEasingAtTimes, getKeyframeRefsAtTimes } from "@/timeline/keyframe-actions";
import type { TimelineElement } from "@/timeline";
import { TICKS_PER_SECOND, addMediaTime, mediaTime } from "@/wasm";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowDown01Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	Delete02Icon,
	KeyframeIcon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";

const formatSeconds = (ticks: number) => `${(ticks / TICKS_PER_SECOND).toFixed(2)} s`;

/**
 * Compact bar above the properties of an animated element: jump between
 * keyframes, and change the curve or delete the keyframes at the playhead.
 * Collapses its labels as the panel narrows (container queries).
 */
export function KeyframeBar({
	element,
	trackId,
}: {
	element: TimelineElement;
	trackId: string;
}) {
	const editor = useEditor();
	const playhead = useEditor((e) => e.playback.getCurrentTime());
	const selectedKeyframes = useSyncExternalStore(
		(listener) => editor.selection.subscribe(listener),
		() => editor.selection.getSelectedKeyframes(),
	);

	const keyframes = getElementKeyframes({ animations: element.animations });
	if (keyframes.length === 0) return null;

	const times = getUniqueKeyframeTimes({ keyframes });
	const localTime = playhead - element.startTime;
	const { previous, next, atCurrent } = getAdjacentKeyframeTimes({ times, current: localTime });

	const selectedIds = new Set(
		selectedKeyframes
			.filter((keyframe) => keyframe.elementId === element.id)
			.map((keyframe) => keyframe.keyframeId),
	);
	const selectedTimes = getUniqueKeyframeTimes({
		keyframes: keyframes.filter((keyframe) => selectedIds.has(keyframe.id)),
	});
	const activeTimes = selectedTimes.length > 0 ? selectedTimes : atCurrent ? [localTime] : [];
	const currentPreset = activeTimes.length
		? matchEasingPreset({
				cubicBezier: getEasingAtTime({ animations: element.animations, time: activeTimes[0] }),
			})
		: null;

	const goTo = (time: number) => {
		editor.playback.seek({
			time: addMediaTime({ a: element.startTime, b: mediaTime({ ticks: time }) }),
		});
		editor.selection.setSelectedKeyframes({
			keyframes: getKeyframeRefsAtTimes({ element, trackId, times: [time] }),
		});
	};

	const label =
		activeTimes.length > 1
			? `${activeTimes.length} seleccionados`
			: activeTimes.length === 1
				? formatSeconds(activeTimes[0])
				: `${times.length}`;

	return (
		<div className="@container border-b">
			<div className="flex min-w-0 items-center gap-1 px-2 py-1.5">
				<div className="bg-accent flex h-6.5 min-w-0 items-center rounded-md border px-px">
					<Button
						variant="ghost"
						size="icon"
						className="size-5.5 shrink-0"
						disabled={previous === null}
						onClick={() => previous !== null && goTo(previous)}
						aria-label="Keyframe anterior"
						title="Keyframe anterior"
					>
						<HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
					</Button>
					<span
						className={cn(
							"flex min-w-0 items-center gap-1.5 px-1 text-xs tabular-nums whitespace-nowrap",
							activeTimes.length ? "text-primary" : "text-muted-foreground",
						)}
						title={
							activeTimes.length
								? `Keyframe en ${formatSeconds(activeTimes[0])}`
								: `${times.length} keyframes en este elemento`
						}
					>
						<HugeiconsIcon
							icon={KeyframeIcon}
							className={cn("size-2.5 shrink-0", activeTimes.length && "fill-current")}
						/>
						<span className="@max-[190px]:hidden truncate">{label}</span>
					</span>
					<Button
						variant="ghost"
						size="icon"
						className="size-5.5 shrink-0"
						disabled={next === null}
						onClick={() => next !== null && goTo(next)}
						aria-label="Keyframe siguiente"
						title="Keyframe siguiente"
					>
						<HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
					</Button>
				</div>
				<span className="min-w-0 flex-1" />
				{activeTimes.length > 0 && (
					<>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="sm"
									className="h-6.5 shrink-0 gap-1 px-1.5 font-normal"
									title="Curva hacia el siguiente keyframe"
								>
									<EasingCurveIcon cubicBezier={currentPreset?.value ?? [0, 0, 1, 1]} />
									<span className="@max-[250px]:hidden text-xs">
										{currentPreset?.label ?? "Personalizada"}
									</span>
									<HugeiconsIcon icon={ArrowDown01Icon} className="size-3 opacity-50" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-52">
								<DropdownMenuLabel>Curva</DropdownMenuLabel>
								{BUILTIN_PRESETS.map((preset) => (
									<DropdownMenuItem
										key={preset.id}
										onClick={() =>
											applyEasingAtTimes({
												editor,
												element,
												trackId,
												times: activeTimes,
												cubicBezier: preset.value,
											})
										}
									>
										<EasingCurveIcon cubicBezier={preset.value} />
										<span className="flex-1">{preset.label}</span>
										{currentPreset?.id === preset.id && (
											<HugeiconsIcon icon={Tick02Icon} className="size-3.5" />
										)}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
						<Button
							variant="ghost"
							size="icon"
							className="size-6.5 shrink-0"
							onClick={() =>
								editor.timeline.removeKeyframes({
									keyframes: getKeyframeRefsAtTimes({ element, trackId, times: activeTimes }),
								})
							}
							aria-label="Eliminar keyframe"
							title="Eliminar keyframe"
						>
							<HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
						</Button>
					</>
				)}
			</div>
		</div>
	);
}
