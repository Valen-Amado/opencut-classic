"use client";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { NumberField } from "@/components/ui/number-field";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { useEditor } from "@/editor/use-editor";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import {
	ADJUSTMENT_GROUPS,
	ADJUSTMENT_META,
	getColorPreset,
	type AdjustmentKey,
} from "@/effects/color-adjust";
import {
	buildColorPresetPatch,
	getClipColorAdjustEffect,
	type ColorAdjustTarget,
} from "@/effects/color-adjust-actions";
import { PresetThumbnail } from "@/effects/components/adjustment-view";
import type { ParamDefinition, ParamValues } from "@/params";
import { buildEffectParamPath } from "@/animation/effect-param-channel";
import { resolveAnimationPathValueAtTime } from "@/animation/resolve";
import { colorAdjustEffectDefinition } from "@/effects/definitions/color-adjust";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import { useKeyframedParamProperty } from "@/components/editor/panels/properties/hooks/use-keyframed-param-property";
import { KeyframeToggle } from "@/components/editor/panels/properties/components/keyframe-toggle";
import type { MediaTime } from "@/wasm";
import type { EffectElement, TimelineElement, VisualElement } from "@/timeline";
import { isVisualElement } from "@/timeline/element-utils";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowTurnBackwardIcon,
	Cancel01Icon,
	Delete02Icon,
	SlidersHorizontalIcon,
	ViewIcon,
} from "@hugeicons/core-free-icons";

const NEUTRAL_PARAMS: ParamValues = { preset: "none", intensity: 0 };

function getAdjustParam(key: string): ParamDefinition {
	const param = colorAdjustEffectDefinition.params.find((candidate) => candidate.key === key);
	if (!param) throw new Error(`Color adjust is missing the "${key}" param`);
	return param;
}

/** Everything a row needs to read and keyframe one color-adjust param. */
interface AdjustChannel {
	element: TimelineElement;
	trackId: string;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
	/** Animation path of a param key: the key itself on a layer, an effect path on a clip. */
	pathFor: (key: string) => string;
	buildBaseUpdates: (update: { key: string; value: number }) => Partial<TimelineElement>;
}

export function AdjustTab({
	element,
	trackId,
}: {
	element: VisualElement | EffectElement;
	trackId: string;
}) {
	const editor = useEditor();
	const setAssetsTab = useAssetsPanelStore((state) => state.setActiveTab);
	const { renderElement, previewUpdates, commit } = useElementPreview<TimelineElement>({
		trackId,
		elementId: element.id,
		fallback: element,
	});

	const isLayer = renderElement.type === "effect";
	const clipEffect = isLayer ? null : getClipColorAdjustEffect({ element: renderElement });
	const params: ParamValues | null = isLayer ? renderElement.params : (clipEffect?.params ?? null);

	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});

	const target: ColorAdjustTarget =
		element.type === "effect"
			? { kind: "layer", trackId, element }
			: { kind: "clip", trackId, element };

	if (!params) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
				<HugeiconsIcon icon={SlidersHorizontalIcon} className="text-muted-foreground size-10" strokeWidth={1} />
				<div className="flex flex-col gap-1.5">
					<h3 className="text-foreground font-medium">Sin ajustes de color</h3>
					<p className="text-muted-foreground max-w-52 text-sm text-balance">
						Elige un preset o ajusta la luz y el color a mano.
					</p>
				</div>
				<div className="flex gap-2">
					<Button size="sm" onClick={() => setAssetsTab("adjustment")}>
						Elegir un preset
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={() =>
							editor.timeline.updateElements({
								updates: [{ trackId, elementId: element.id, patch: buildColorPresetPatch({ target, presetId: "none" }) }],
							})
						}
					>
						Ajustar a mano
					</Button>
				</div>
			</div>
		);
	}

	const setParams = (next: ParamValues) => {
		if (isLayer) {
			previewUpdates({ params: { ...params, ...next } });
			return;
		}
		const effects = isVisualElement(renderElement) ? (renderElement.effects ?? []) : [];
		previewUpdates({
			effects: effects.map((effect) =>
				effect.id === clipEffect?.id ? { ...effect, params: { ...effect.params, ...next } } : effect,
			),
		});
	};
	const setAndCommit = (next: ParamValues) => {
		setParams(next);
		commit();
	};

	const preset = getColorPreset(params.preset);
	const channel: AdjustChannel = {
		element: renderElement,
		trackId,
		localTime,
		isPlayheadWithinElementRange,
		pathFor: (key) =>
			isLayer || !clipEffect ? key : buildEffectParamPath({ effectId: clipEffect.id, paramKey: key }),
		buildBaseUpdates: ({ key, value }) => {
			if (isLayer) return { params: { ...params, [key]: value } };
			const effects = isVisualElement(renderElement) ? (renderElement.effects ?? []) : [];
			return {
				effects: effects.map((effect) =>
					effect.id === clipEffect?.id ? { ...effect, params: { ...effect.params, [key]: value } } : effect,
				),
			};
		},
	};

	const showOriginal = (isHeld: boolean) => {
		if (!isHeld) {
			editor.timeline.discardPreview();
			return;
		}
		if (isLayer) previewUpdates({ params: { ...params, ...NEUTRAL_PARAMS } });
		else if (isVisualElement(renderElement)) {
			previewUpdates({
				effects: (renderElement.effects ?? []).map((effect) =>
					effect.id === clipEffect?.id ? { ...effect, enabled: false } : effect,
				),
			});
		}
	};

	return (
		<div className="flex flex-col">
			<div className="flex flex-col gap-3 border-b p-3.5">
				<div className="flex min-w-0 items-center gap-2.5">
					<span className="bg-accent h-8 w-14 shrink-0 overflow-hidden rounded-sm border">
						<PresetThumbnail presetId={preset?.id ?? "none"} />
					</span>
					<div className="flex min-w-0 flex-1 flex-col">
						<span className="text-muted-foreground text-xs">Preset</span>
						<span className="truncate text-sm font-medium">{preset?.label ?? "Ninguno"}</span>
					</div>
					<Button variant="outline" size="sm" onClick={() => setAssetsTab("adjustment")}>
						{preset ? "Cambiar" : "Elegir"}
					</Button>
					{preset && (
						<Button
							variant="ghost"
							size="icon"
							className="size-7"
							onClick={() => setAndCommit({ preset: "none" })}
							aria-label="Quitar el preset"
							title="Quitar el preset"
						>
							<HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
						</Button>
					)}
				</div>
				{preset && (
					<AdjustRow
						label="Intensidad"
						paramKey="intensity"
						baseValue={Number(params.intensity ?? 100)}
						min={0}
						max={100}
						defaultValue={100}
						channel={channel}
					/>
				)}
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						className="h-7.5 flex-1 gap-1.5 font-normal select-none"
						onPointerDown={() => showOriginal(true)}
						onPointerUp={() => showOriginal(false)}
						onPointerLeave={() => showOriginal(false)}
						title="Mantén presionado para ver el original"
					>
						<HugeiconsIcon icon={ViewIcon} className="size-3.5" />
						Mantener para comparar
					</Button>
					{!isLayer && clipEffect && (
						<Button
							variant="ghost"
							size="icon"
							className="size-7.5"
							onClick={() => editor.timeline.removeClipEffect({ trackId, elementId: element.id, effectId: clipEffect.id })}
							aria-label="Quitar los ajustes de color"
							title="Quitar los ajustes de color"
						>
							<HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
						</Button>
					)}
				</div>
			</div>

			{ADJUSTMENT_GROUPS.map((group, index) => {
				const isDirty = group.keys.some((key) => Number(params[key] ?? 0) !== 0);
				return (
					<section
						key={group.label}
						className={index < ADJUSTMENT_GROUPS.length - 1 ? "flex flex-col gap-3 border-b p-3.5" : "flex flex-col gap-3 p-3.5"}
					>
						<div className="flex h-5 items-center justify-between">
							<span className="text-sm font-medium">{group.label}</span>
							{isDirty && (
								<Button
									variant="ghost"
									size="icon"
									className="text-muted-foreground size-5.5"
									onClick={() =>
										setAndCommit(Object.fromEntries(group.keys.map((key) => [key, 0])))
									}
									aria-label={`Restablecer ${group.label.toLowerCase()}`}
									title="Restablecer"
								>
									<HugeiconsIcon icon={ArrowTurnBackwardIcon} className="size-3.5" />
								</Button>
							)}
						</div>
						{group.keys.map((key) => (
							<AdjustRow
								key={key}
								label={ADJUSTMENT_META[key].label}
								paramKey={key satisfies AdjustmentKey}
								baseValue={Number(params[key] ?? 0)}
								min={ADJUSTMENT_META[key].min}
								max={ADJUSTMENT_META[key].max}
								defaultValue={0}
								channel={channel}
							/>
						))}
					</section>
				);
			})}
		</div>
	);
}

function AdjustRow({
	label,
	paramKey,
	baseValue,
	min,
	max,
	defaultValue,
	channel,
}: {
	label: string;
	paramKey: string;
	baseValue: number;
	min: number;
	max: number;
	defaultValue: number;
	channel: AdjustChannel;
}) {
	const propertyPath = channel.pathFor(paramKey);
	const value = resolveAnimationPathValueAtTime({
		animations: channel.element.animations,
		propertyPath,
		localTime: channel.localTime,
		fallbackValue: baseValue,
	});
	const keyframed = useKeyframedParamProperty({
		param: getAdjustParam(paramKey),
		trackId: channel.trackId,
		elementId: channel.element.id,
		animations: channel.element.animations,
		propertyPath,
		localTime: channel.localTime,
		isPlayheadWithinElementRange: channel.isPlayheadWithinElementRange,
		resolvedValue: value,
		buildBaseUpdates: ({ value: next }) => channel.buildBaseUpdates({ key: paramKey, value: Number(next) }),
	});
	const onPreview = (next: number) => keyframed.onPreview(next);
	const onCommit = keyframed.onCommit;
	const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)));
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex h-6 items-center gap-2">
				<span className="min-w-0 flex-1 truncate text-sm">{label}</span>
				{value !== defaultValue && (
					<button
						type="button"
						className="text-muted-foreground hover:text-foreground flex"
						onClick={() => {
							onPreview(defaultValue);
							onCommit();
						}}
						aria-label={`Restablecer ${label.toLowerCase()}`}
						title="Restablecer"
					>
						<HugeiconsIcon icon={ArrowTurnBackwardIcon} className="size-3.5" />
					</button>
				)}
				<KeyframeToggle
					isActive={keyframed.isKeyframedAtTime}
					isDisabled={!channel.isPlayheadWithinElementRange}
					title={`Keyframe de ${label.toLowerCase()}`}
					onToggle={keyframed.toggleKeyframe}
				/>
				<div className="w-16 shrink-0">
					<NumberField
						value={String(Math.round(value))}
						className="h-6"
						step={1}
						onKeyboardStep={(next) => {
							onPreview(clamp(next));
							onCommit();
						}}
						onChange={(event) => {
							const parsed = Number.parseFloat(event.target.value);
							if (!Number.isNaN(parsed)) onPreview(clamp(parsed));
						}}
						onBlur={onCommit}
						aria-label={label}
					/>
				</div>
			</div>
			<Slider
				min={min}
				max={max}
				step={1}
				value={[value]}
				onValueChange={([next]) => onPreview(next)}
				onValueCommit={() => onCommit()}
				onDoubleClick={() => {
					onPreview(defaultValue);
					onCommit();
				}}
				aria-label={label}
			/>
		</div>
	);
}
