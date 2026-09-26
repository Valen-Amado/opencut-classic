"use client";

import { useState } from "react";
import { useEditor } from "@/editor/use-editor";
import type { EditorCore } from "@/core";
import { Slider } from "@/components/ui/slider";
import { NumberField } from "@/components/ui/number-field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	getAnimationPresetLabel,
	listAnimationPresets,
	type AnimationPresetSlot,
} from "@/animation/presets/catalog";
import { applyAnimationPreset } from "@/animation/presets/apply";
import type { TimelineElement } from "@/timeline";
import { usePropertiesStore } from "@/components/editor/panels/properties/stores/properties-store";
import { TICKS_PER_SECOND, addMediaTime, mediaTime, type MediaTime } from "@/wasm";
import { cn } from "@/utils/ui";

const SLOTS: { value: AnimationPresetSlot; label: string }[] = [
	{ value: "in", label: "Entrada" },
	{ value: "out", label: "Salida" },
	{ value: "loop", label: "Bucle" },
];

const DURATION_RANGE = { min: 0.1, max: 3, step: 0.1 } as const;
const DEFAULT_DURATION: Record<AnimationPresetSlot, number> = { in: 0.5, out: 0.5, loop: 1 };

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Plays the timeline between two times, then pauses. */
function playRange({
	editor,
	from,
	to,
}: {
	editor: EditorCore;
	from: MediaTime;
	to: MediaTime;
}) {
	editor.playback.seek({ time: from });
	editor.playback.play();
	const check = () => {
		if (!editor.playback.getIsPlaying()) return;
		if (editor.playback.getCurrentTime() >= to) {
			editor.playback.pause();
			editor.playback.seek({ time: to });
			return;
		}
		requestAnimationFrame(check);
	};
	requestAnimationFrame(check);
}

export function AnimationTab({
	element,
	trackId,
}: {
	element: TimelineElement;
	trackId: string;
}) {
	const editor = useEditor();
	const slot = usePropertiesStore((state) => state.animationSlot);
	const setSlot = usePropertiesStore((state) => state.setAnimationSlot);
	const applied = element.animationPresets?.[slot];
	const appliedSeconds = applied ? applied.duration / TICKS_PER_SECOND : DEFAULT_DURATION[slot];
	const [draftSeconds, setDraftSeconds] = useState<number | null>(null);
	const seconds = draftSeconds ?? appliedSeconds;

	const presets = listAnimationPresets({ slot, isText: element.type === "text" });
	const groups = new Map<string, typeof presets>();
	for (const preset of presets) {
		groups.set(preset.group, [...(groups.get(preset.group) ?? []), preset]);
	}

	const apply = ({ presetId, durationSeconds }: { presetId: string; durationSeconds: number }) => {
		const animationPresets = applyAnimationPreset({
			animationPresets: element.animationPresets,
			slot,
			presetId,
			durationTicks: Math.round(durationSeconds * TICKS_PER_SECOND),
			elementDuration: element.duration,
		});
		// Presets only edit `animationPresets`; keyframes are left untouched.
		const patch = { animationPresets };
		editor.timeline.updateElements({
			updates: [{ trackId, elementId: element.id, patch }],
		});
		setDraftSeconds(null);

		const result = animationPresets[slot];
		if (!result) return;
		const end = addMediaTime({ a: element.startTime, b: element.duration });
		const span = result.duration;
		const lead = mediaTime({ ticks: Math.round(TICKS_PER_SECOND * 0.25) });
		if (slot === "out") {
			const from = Math.max(element.startTime, end - span - lead);
			playRange({ editor, from: mediaTime({ ticks: from }), to: mediaTime({ ticks: end - 1 }) });
		} else {
			const previewSpan = slot === "loop" ? Math.round(TICKS_PER_SECOND * 2.2) : result.duration + lead;
			playRange({
				editor,
				from: element.startTime,
				to: mediaTime({ ticks: Math.min(end, element.startTime + previewSpan) }),
			});
		}
	};

	const summary = (["in", "out", "loop"] as const)
		.flatMap((key) => {
			const entry = element.animationPresets?.[key];
			if (!entry) return [];
			const label = getAnimationPresetLabel({ slot: key, presetId: entry.presetId });
			return label ? [`${SLOTS.find((s) => s.value === key)?.label}: ${label}`] : [];
		})
		.join(" · ");

	return (
		<div className="flex flex-col">
			<div className="bg-background sticky top-0 z-10 flex flex-col gap-3 border-b p-3.5">
				<ToggleGroup
					type="single"
					value={slot}
					onValueChange={(next) => {
						const match = SLOTS.find((item) => item.value === next);
						if (!match) return;
						setSlot({ slot: match.value });
						setDraftSeconds(null);
					}}
					className="bg-accent border-border grid h-7 w-full grid-cols-3 gap-0.5 rounded-md border p-0.5"
					aria-label="Momento de la animación"
				>
					{SLOTS.map((item) => (
						<ToggleGroupItem
							key={item.value}
							value={item.value}
							className="text-muted-foreground hover:text-foreground h-full min-w-0 gap-1.5 rounded-sm px-0 text-sm hover:bg-transparent data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
						>
							{item.label}
							{element.animationPresets?.[item.value] && (
								<span className="bg-primary size-1.5 rounded-full" aria-label="con animación" />
							)}
						</ToggleGroupItem>
					))}
				</ToggleGroup>

				{applied && (
					<div className="flex flex-col gap-2">
						<span className="text-sm">{slot === "loop" ? "Duración del ciclo" : "Duración"}</span>
						<div className="flex items-center gap-2.5">
							<Slider
								className="flex-1"
								min={DURATION_RANGE.min}
								max={DURATION_RANGE.max}
								step={DURATION_RANGE.step}
								value={[Math.min(DURATION_RANGE.max, Math.max(DURATION_RANGE.min, seconds))]}
								onValueChange={([next]) => setDraftSeconds(round1(next))}
								onValueCommit={([next]) => apply({ presetId: applied.presetId, durationSeconds: round1(next) })}
								aria-label="Duración de la animación"
							/>
							<div className="w-20 shrink-0">
								<NumberField
									value={seconds.toFixed(1)}
									suffix="s"
									step={DURATION_RANGE.step}
									onKeyboardStep={(next) =>
										apply({
											presetId: applied.presetId,
											durationSeconds: Math.min(DURATION_RANGE.max, Math.max(DURATION_RANGE.min, round1(next))),
										})
									}
									onChange={(event) => {
										const parsed = parseFloat(event.target.value);
										if (!Number.isNaN(parsed)) setDraftSeconds(parsed);
									}}
									onBlur={() => {
										if (draftSeconds === null) return;
										apply({
											presetId: applied.presetId,
											durationSeconds: Math.min(DURATION_RANGE.max, Math.max(DURATION_RANGE.min, round1(draftSeconds))),
										});
									}}
									aria-label="Duración en segundos"
								/>
							</div>
						</div>
					</div>
				)}
				{summary && <p className="text-muted-foreground text-xs">{summary}</p>}
			</div>

			<div className="flex flex-col gap-4 p-3.5">
				<PresetGrid>
					<PresetTile
						label="Ninguna"
						isActive={!applied}
						slot={slot}
						presetId="none"
						onSelect={() => apply({ presetId: "none", durationSeconds: seconds })}
					/>
				</PresetGrid>
				{[...groups].map(([group, items]) => (
					<div key={group} className="flex flex-col gap-2">
						<span className="text-muted-foreground text-xs">{group}</span>
						<PresetGrid>
							{items.map((preset) => (
								<PresetTile
									key={preset.id}
									label={preset.label}
									slot={slot}
									presetId={preset.id}
									isActive={applied?.presetId === preset.id}
									onSelect={() =>
										apply({ presetId: preset.id, durationSeconds: applied ? appliedSeconds : DEFAULT_DURATION[slot] })
									}
								/>
							))}
						</PresetGrid>
					</div>
				))}
			</div>
		</div>
	);
}

function PresetGrid({ children }: { children: React.ReactNode }) {
	return (
		<div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(76px, 1fr))" }}>
			{children}
		</div>
	);
}

function PresetTile({
	label,
	slot,
	presetId,
	isActive,
	onSelect,
}: {
	label: string;
	slot: AnimationPresetSlot;
	presetId: string;
	isActive: boolean;
	onSelect: () => void;
}) {
	const animationName =
		presetId === "none" ? "none" : slot === "loop" ? `oc-anim-loop-${presetId}` : `oc-anim-${presetId}`;
	return (
		<button
			type="button"
			data-state={isActive ? "on" : "off"}
			aria-pressed={isActive}
			onClick={onSelect}
			className={cn(
				"group flex flex-col items-center gap-1.5 rounded-md border px-1 pt-2 pb-1.5 text-xs",
				isActive
					? "border-primary bg-secondary text-secondary-foreground"
					: "text-muted-foreground hover:bg-accent hover:text-foreground",
			)}
		>
			<span className="bg-accent flex h-8.5 w-13 items-center justify-center overflow-hidden rounded-[5px]">
				<span
					className="anim-demo text-foreground text-[13px] leading-none font-bold"
					data-slot={slot}
					data-preset={presetId}
					style={{ animationName }}
				>
					Aa
				</span>
			</span>
			<span className="text-center leading-tight">{label}</span>
		</button>
	);
}
