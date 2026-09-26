"use client";

import { useState, type ReactNode } from "react";
import { SectionField, SectionFields } from "@/components/section";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useEditor } from "@/editor/use-editor";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import {
	ElementParamField,
	buildValues,
	useElementParamControl,
	type ElementParamControl,
} from "@/components/editor/panels/properties/components/element-params-tab";
import { KeyframeToggle } from "@/components/editor/panels/properties/components/keyframe-toggle";
import { NumberParamField } from "@/components/editor/panels/properties/components/property-param-field";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import { getElementParams, type ElementParamDefinition } from "@/params/registry";
import type { ParamValues } from "@/params";
import type { TextElement } from "@/timeline";
import type { MediaTime } from "@/wasm";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDownIcon, ArrowTurnBackwardIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";

export type TextParamShared = {
	element: TextElement;
	trackId: string;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
};

/**
 * Preview-aware element, playhead info and param lookup shared by the text
 * tabs, so a dragged slider follows the pointer instead of snapping back to
 * the last committed value.
 */
export function useTextParams({
	element: committedElement,
	trackId,
}: {
	element: TextElement;
	trackId: string;
}): {
	shared: TextParamShared;
	values: ParamValues;
	getParam: (key: string) => ElementParamDefinition | undefined;
} {
	const { renderElement: element } = useElementPreview({
		trackId,
		elementId: committedElement.id,
		fallback: committedElement,
	});
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});
	const params = getElementParams({ element });
	const byKey = new Map(params.map((param) => [param.key, param]));
	return {
		shared: { element, trackId, localTime, isPlayheadWithinElementRange },
		values: buildValues({ element, params }),
		getParam: (key) => byKey.get(key),
	};
}

export function keyframeToggle({
	control,
	label,
}: {
	control: ElementParamControl;
	label: string;
}) {
	if (!control.keyframe) return undefined;
	return (
		<KeyframeToggle
			isActive={control.keyframe.isActive}
			isDisabled={control.keyframe.isDisabled}
			title={`Toggle ${label.toLowerCase()} keyframe`}
			onToggle={control.keyframe.onToggle}
		/>
	);
}

/** Slider + number input + keyframe toggle for one numeric param. */
export function SliderParamField({
	param,
	range,
	suffix,
	...shared
}: TextParamShared & {
	param: ElementParamDefinition | undefined;
	/** Slider range; defaults to the param's min/max. */
	range?: { min: number; max: number };
	suffix?: string;
}) {
	if (!param || param.type !== "number") return null;
	return <SliderParamFieldInner param={param} range={range} suffix={suffix} {...shared} />;
}

function SliderParamFieldInner({
	param,
	range,
	suffix,
	...shared
}: TextParamShared & {
	param: ElementParamDefinition & { type: "number" };
	range?: { min: number; max: number };
	suffix?: string;
}) {
	const control = useElementParamControl({ ...shared, param });
	const value = Number(control.value);
	const min = range?.min ?? param.min;
	const max = range?.max ?? param.max ?? 100;

	return (
		<SectionField label={param.label} beforeLabel={keyframeToggle({ control, label: param.label })}>
			<div className="flex items-center gap-2.5">
				<Slider
					className="flex-1"
					min={min}
					max={max}
					step={param.step}
					value={[Math.min(max, Math.max(min, value))]}
					onValueChange={([next]) => control.onPreview(next)}
					onValueCommit={() => control.onCommit()}
					aria-label={param.label}
				/>
				<div className="w-16 shrink-0">
					<NumberParamField
						param={param}
						value={value}
						suffix={suffix}
						onPreview={control.onPreview}
						onCommit={control.onCommit}
					/>
				</div>
			</div>
		</SectionField>
	);
}

/** Generic field (color, select…) for one param, if it exists. */
export function ParamField({
	param,
	...shared
}: TextParamShared & { param: ElementParamDefinition | undefined }) {
	if (!param) return null;
	return <ElementParamField param={param} {...shared} />;
}

/** Label on the left, switch on the right, for a boolean param. */
export function SwitchParamRow({
	param,
	...shared
}: TextParamShared & { param: ElementParamDefinition | undefined }) {
	if (!param || param.type !== "boolean") return null;
	return <SwitchParamRowInner param={param} {...shared} />;
}

function SwitchParamRowInner({
	param,
	...shared
}: TextParamShared & { param: ElementParamDefinition }) {
	const control = useElementParamControl({ ...shared, param });
	const id = `${shared.element.id}-${param.key}`;
	return (
		<div className="flex items-center justify-between gap-2.5">
			<Label htmlFor={id}>{param.label}</Label>
			<Switch
				id={id}
				checked={control.value === true}
				onCheckedChange={(checked) => {
					control.onPreview(checked);
					control.onCommit();
				}}
			/>
		</div>
	);
}

/** Removes params (and their keyframes) so they fall back to their defaults. */
export function useResetParams({
	element,
	trackId,
}: {
	element: TextElement;
	trackId: string;
}) {
	const editor = useEditor();
	return ({ keys }: { keys: readonly string[] }) => {
		const params = { ...element.params };
		const animations = element.animations ? { ...element.animations } : undefined;
		for (const key of keys) {
			delete params[key];
			if (animations) delete animations[key];
		}
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					patch: animations ? { params, animations } : { params },
				},
			],
		});
	};
}

const openSections = new Map<string, boolean>();

/**
 * CapCut-style section: a checkbox in the header turns the style on, the
 * title collapses it and a reset button restores its defaults.
 */
export function ToggleSection({
	title,
	enabledParam,
	resetKeys,
	children,
	...shared
}: TextParamShared & {
	title: string;
	enabledParam: ElementParamDefinition | undefined;
	/** Params restored by the reset button. */
	resetKeys: readonly string[];
	children: ReactNode;
}) {
	if (!enabledParam) return null;
	return (
		<ToggleSectionInner
			title={title}
			enabledParam={enabledParam}
			resetKeys={resetKeys}
			{...shared}
		>
			{children}
		</ToggleSectionInner>
	);
}

function ToggleSectionInner({
	title,
	enabledParam,
	resetKeys,
	children,
	...shared
}: TextParamShared & {
	title: string;
	enabledParam: ElementParamDefinition;
	resetKeys: readonly string[];
	children: ReactNode;
}) {
	const control = useElementParamControl({ ...shared, param: enabledParam });
	const reset = useResetParams({ element: shared.element, trackId: shared.trackId });
	const cacheKey = `${shared.element.id}:${enabledParam.key}`;
	const [isOpen, setIsOpen] = useState(openSections.get(cacheKey) ?? true);
	const isEnabled = control.value === true;
	const isExpanded = isEnabled && isOpen;

	const toggleOpen = () => {
		const next = !isOpen;
		openSections.set(cacheKey, next);
		setIsOpen(next);
	};

	return (
		<div className="flex flex-col border-b">
			<div className="flex h-11 w-full items-center gap-2 pr-2 pl-3.5">
				<Checkbox
					checked={isEnabled}
					onCheckedChange={(checked) => {
						control.onPreview(checked === true);
						control.onCommit();
					}}
					aria-label={title}
				/>
				<button
					type="button"
					className={cn(
						"flex min-w-0 flex-1 items-center gap-1 text-left text-sm font-medium",
						isEnabled ? "text-foreground cursor-pointer" : "text-muted-foreground",
					)}
					disabled={!isEnabled}
					aria-expanded={isExpanded}
					onClick={toggleOpen}
				>
					{title}
					<HugeiconsIcon
						icon={ArrowDownIcon}
						className={cn(
							"size-3.5 shrink-0 opacity-60 transition-transform duration-150",
							!isExpanded && "-rotate-90",
						)}
					/>
				</button>
				{isEnabled && (
					<Button
						variant="ghost"
						size="icon"
						title={`Restablecer ${title.toLowerCase()}`}
						aria-label={`Restablecer ${title.toLowerCase()}`}
						onClick={() => reset({ keys: resetKeys })}
					>
						<HugeiconsIcon icon={ArrowTurnBackwardIcon} className="size-3.5" />
					</Button>
				)}
			</div>
			{isExpanded && (
				<div className="p-4 pt-0">
					<SectionFields>{children}</SectionFields>
				</div>
			)}
		</div>
	);
}
