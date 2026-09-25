"use client";

import { useEffect, useRef } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { effectPreviewService } from "@/services/renderer/effect-preview";
import {
	COLOR_ADJUST_EFFECT_TYPE,
	COLOR_PRESETS,
	type ColorPreset,
} from "@/effects/color-adjust";
import {
	applyColorPreset,
	buildColorPresetPatch,
	getClipColorAdjustEffect,
	getColorAdjustTarget,
	insertAdjustmentLayer,
	type ColorAdjustTarget,
} from "@/effects/color-adjust-actions";
import { HugeiconsIcon } from "@hugeicons/react";
import { Layers01Icon, PlusSignIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";

function currentPresetId({ target }: { target: ColorAdjustTarget | null }): string | null {
	if (!target) return null;
	if (target.kind === "layer") return String(target.element.params.preset ?? "none");
	return String(getClipColorAdjustEffect({ element: target.element })?.params.preset ?? "none");
}

export function AdjustmentView() {
	const editor = useEditor();
	useElementSelection();
	useEditor((e) => e.scenes.getActiveScene().tracks);
	const target = getColorAdjustTarget({ editor });
	const activePreset = currentPresetId({ target });

	const groups = new Map<string, ColorPreset[]>();
	for (const preset of COLOR_PRESETS) {
		groups.set(preset.group, [...(groups.get(preset.group) ?? []), preset]);
	}

	const choose = (presetId: string) => {
		if (target) applyColorPreset({ editor, target, presetId });
		else insertAdjustmentLayer({ editor, presetId });
	};

	const previewOnTarget = (presetId: string | null) => {
		if (!target) return;
		if (!presetId) {
			editor.timeline.discardPreview();
			return;
		}
		editor.timeline.previewElements({
			updates: [
				{
					trackId: target.trackId,
					elementId: target.element.id,
					updates: buildColorPresetPatch({ target, presetId }),
				},
			],
		});
	};

	return (
		<PanelView
			title="Ajustes"
			actions={
				<Button
					variant="outline"
					size="sm"
					className="gap-1.5"
					onClick={() => insertAdjustmentLayer({ editor })}
					title="Afecta a todas las capas que están debajo"
				>
					<HugeiconsIcon icon={PlusSignIcon} />
					Capa de ajuste
				</Button>
			}
		>
			<div className="flex flex-col gap-4 pb-4">
				<div className="bg-accent text-muted-foreground flex items-start gap-2 rounded-md px-2.5 py-2 text-xs leading-relaxed">
					<HugeiconsIcon icon={Layers01Icon} className="mt-0.5 size-3.5 shrink-0" />
					{target ? (
						<span>
							Se aplica a{" "}
							<span className="text-foreground font-medium">
								{target.kind === "layer" ? "la capa de ajuste" : target.element.name}
							</span>
						</span>
					) : (
						<span>
							Sin clip seleccionado: se creará una{" "}
							<span className="text-foreground font-medium">capa de ajuste</span> sobre la
							línea de tiempo.
						</span>
					)}
				</div>

				{[...groups].map(([group, presets]) => (
					<section key={group} className="flex flex-col gap-2" aria-label={group}>
						<span className="text-muted-foreground px-0.5 text-sm">{group}</span>
						<div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(6.5rem, 1fr))" }}>
							{presets.map((preset) => (
								<PresetCard
									key={preset.id}
									preset={preset}
									isActive={activePreset === preset.id}
									hasTarget={target !== null}
									onChoose={() => choose(preset.id)}
									onHover={(hovering) => previewOnTarget(hovering ? preset.id : null)}
								/>
							))}
						</div>
					</section>
				))}
			</div>
		</PanelView>
	);
}

export function PresetThumbnail({ presetId }: { presetId: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const render = () => {
			if (!canvasRef.current) return;
			effectPreviewService.renderPreview({
				effectType: COLOR_ADJUST_EFFECT_TYPE,
				params: { preset: presetId, intensity: 100 },
				targetCanvas: canvasRef.current,
			});
		};
		render();
		return effectPreviewService.onPreviewImageReady({ callback: render });
	}, [presetId]);

	return <canvas ref={canvasRef} className="size-full object-cover" />;
}

function PresetCard({
	preset,
	isActive,
	hasTarget,
	onChoose,
	onHover,
}: {
	preset: ColorPreset;
	isActive: boolean;
	hasTarget: boolean;
	onChoose: () => void;
	onHover: (hovering: boolean) => void;
}) {
	return (
		<button
			type="button"
			className="group flex flex-col gap-1 text-left"
			onClick={onChoose}
			onPointerEnter={() => onHover(true)}
			onPointerLeave={() => onHover(false)}
			aria-pressed={isActive}
			title={hasTarget ? `Aplicar ${preset.label}` : `Crear una capa de ajuste ${preset.label}`}
		>
			<span
				className={cn(
					"bg-accent relative aspect-video w-full overflow-hidden rounded-sm",
					isActive && "ring-primary ring-2",
				)}
			>
				<PresetThumbnail presetId={preset.id} />
				<span className="bg-background text-foreground absolute right-1.5 bottom-1.5 flex size-5 items-center justify-center rounded-sm opacity-0 group-hover:opacity-100">
					<HugeiconsIcon icon={hasTarget ? Tick02Icon : PlusSignIcon} className="size-3" />
				</span>
			</span>
			<span className={cn("truncate text-[0.7rem]", isActive ? "text-primary" : "text-muted-foreground")}>
				{preset.label}
			</span>
		</button>
	);
}
