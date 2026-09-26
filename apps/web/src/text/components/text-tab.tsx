"use client";

import type { ReactNode } from "react";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
} from "@/components/section";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import {
	ElementParamField,
	buildValues,
	isVisible,
	useElementParamControl,
} from "@/components/editor/panels/properties/components/element-params-tab";
import { NumberParamField } from "@/components/editor/panels/properties/components/property-param-field";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import { getElementParams, type ElementParamDefinition } from "@/params/registry";
import type { TextElement } from "@/timeline";
import type { MediaTime } from "@/wasm";
import {
	TEXT_FORMATS,
	isTextFormatActive,
	toggleTextFormat,
	type TextFormat,
} from "@/text/format";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	TextAlignCenterIcon,
	TextAlignLeftIcon,
	TextAlignRightIcon,
	TextBoldIcon,
	TextItalicIcon,
	TextStrikethroughIcon,
	TextUnderlineIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";
import { TEXT_FX_PARAM_KEYS } from "@/text/effects";
import {
	ParamField,
	SliderParamField,
	ToggleSection,
	keyframeToggle,
} from "./style-fields";

export const SHADOW_PARAM_KEYS = [
	"shadow.color",
	"shadow.opacity",
	"shadow.blur",
	"shadow.distance",
	"shadow.angle",
] as const;

export const STROKE_PARAM_KEYS = ["stroke.color", "stroke.width"] as const;

export const FONT_SIZE_SLIDER_RANGE = { min: 1, max: 120 } as const;

const SEGMENT_GROUP_CLASS =
	"bg-accent border-border grid h-7 w-full gap-0.5 rounded-md border p-0.5";
const SEGMENT_ITEM_CLASS =
	"text-muted-foreground hover:text-foreground h-full min-w-0 rounded-sm px-0 hover:bg-transparent data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm [&_svg]:size-3.5";

const ALIGN_OPTIONS = [
	{ value: "left", label: "Alinear a la izquierda", icon: TextAlignLeftIcon },
	{ value: "center", label: "Centrar", icon: TextAlignCenterIcon },
	{ value: "right", label: "Alinear a la derecha", icon: TextAlignRightIcon },
] as const;

const FORMAT_OPTIONS: Record<
	TextFormat,
	{ label: string; shortcut: string; icon: typeof TextBoldIcon }
> = {
	bold: { label: "Negrita", shortcut: "Ctrl+B", icon: TextBoldIcon },
	italic: { label: "Cursiva", shortcut: "Ctrl+I", icon: TextItalicIcon },
	underline: { label: "Subrayado", shortcut: "Ctrl+U", icon: TextUnderlineIcon },
	strikethrough: {
		label: "Tachado",
		shortcut: "Ctrl+Shift+X",
		icon: TextStrikethroughIcon,
	},
};

/** Params shown by dedicated controls instead of the generic field list. */
const CUSTOM_KEYS = new Set([
	"content",
	"fontFamily",
	"fontSize",
	"color",
	"textAlign",
	"fontWeight",
	"fontStyle",
	"textDecoration",
	"letterSpacing",
	"lineHeight",
	// Driven by the typewriter / word presets in the Animation tab.
	"revealCharacters",
	"revealWords",
	// "Sombra" section.
	"shadow.enabled",
	...SHADOW_PARAM_KEYS,
	// "Trazo" section.
	"stroke.enabled",
	...STROKE_PARAM_KEYS,
	// Edited in the "Efectos de texto" tab.
	...TEXT_FX_PARAM_KEYS,
]);

export function TextTab({
	element: committedElement,
	trackId,
	contentActions,
	header,
}: {
	element: TextElement;
	trackId: string;
	/** Extra controls rendered next to the Content label. */
	contentActions?: ReactNode;
	/** Rendered above the text fields (e.g. saved styles). */
	header?: ReactNode;
}) {
	// Read the preview-aware element so a dragged slider follows the pointer
	// instead of snapping back to the last committed value.
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
	const requireParam = (key: string): ElementParamDefinition => {
		const param = byKey.get(key);
		if (!param) throw new Error(`Text element is missing the "${key}" param`);
		return param;
	};
	const values = buildValues({ element, params });
	const shared = { element, trackId, localTime, isPlayheadWithinElementRange };

	const field = (key: string) => {
		const param = byKey.get(key);
		return param ? <ElementParamField key={key} param={param} {...shared} /> : null;
	};

	const remaining = params.filter(
		(param) => !CUSTOM_KEYS.has(param.key) && isVisible({ param, values }),
	);

	return (
		<>
			{header}
			<Section sectionKey={`${element.id}:text`}>
				<SectionContent className="pt-4">
					<SectionFields>
						{contentActions ? (
							<ContentField param={byKey.get("content")} actions={contentActions} {...shared} />
						) : (
							field("content")
						)}
						{field("fontFamily")}
						<FontSizeField param={requireParam("fontSize")} {...shared} />
						{field("color")}
						<TextAlignField param={requireParam("textAlign")} {...shared} />
						<TextFormatField
							fontWeight={requireParam("fontWeight")}
							fontStyle={requireParam("fontStyle")}
							textDecoration={requireParam("textDecoration")}
							values={values}
							{...shared}
						/>
						<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
							{field("letterSpacing")}
							{field("lineHeight")}
						</div>
						{remaining.map((param) => field(param.key))}
					</SectionFields>
				</SectionContent>
			</Section>
			<ToggleSection
				title="Sombra"
				enabledParam={byKey.get("shadow.enabled")}
				resetKeys={SHADOW_PARAM_KEYS}
				{...shared}
			>
				<ParamField param={byKey.get("shadow.color")} {...shared} />
				<SliderParamField param={byKey.get("shadow.opacity")} suffix="%" {...shared} />
				<SliderParamField param={byKey.get("shadow.blur")} suffix="%" {...shared} />
				<SliderParamField param={byKey.get("shadow.distance")} {...shared} />
				<SliderParamField param={byKey.get("shadow.angle")} suffix="°" {...shared} />
			</ToggleSection>
			<ToggleSection
				title="Trazo"
				enabledParam={byKey.get("stroke.enabled")}
				resetKeys={STROKE_PARAM_KEYS}
				{...shared}
			>
				<ParamField param={byKey.get("stroke.color")} {...shared} />
				<SliderParamField param={byKey.get("stroke.width")} {...shared} />
			</ToggleSection>
		</>
	);
}

type SharedProps = {
	element: TextElement;
	trackId: string;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
};

function ContentField({
	param,
	actions,
	...shared
}: SharedProps & { param?: ElementParamDefinition; actions: ReactNode }) {
	if (!param) return null;
	return (
		<div className="relative">
			<div className="absolute top-0 right-0 z-10 flex h-4 items-center">{actions}</div>
			<ElementParamField param={param} {...shared} />
		</div>
	);
}

function FontSizeField({
	param,
	...shared
}: SharedProps & { param: ElementParamDefinition }) {
	const control = useElementParamControl({ ...shared, param });
	if (param.type !== "number") return null;
	const value = Number(control.value);

	return (
		<SectionField label={param.label} beforeLabel={keyframeToggle({ control, label: param.label })}>
			<div className="flex items-center gap-2.5">
				<Slider
					className="flex-1"
					min={FONT_SIZE_SLIDER_RANGE.min}
					max={FONT_SIZE_SLIDER_RANGE.max}
					step={1}
					value={[
						Math.min(FONT_SIZE_SLIDER_RANGE.max, Math.max(FONT_SIZE_SLIDER_RANGE.min, value)),
					]}
					onValueChange={([next]) => control.onPreview(next)}
					onValueCommit={() => control.onCommit()}
					aria-label={param.label}
				/>
				<div className="w-16 shrink-0">
					<NumberParamField
						param={param}
						value={value}
						onPreview={control.onPreview}
						onCommit={control.onCommit}
					/>
				</div>
			</div>
		</SectionField>
	);
}

function TextAlignField({
	param,
	...shared
}: SharedProps & { param: ElementParamDefinition }) {
	const control = useElementParamControl({ ...shared, param });

	return (
		<SectionField label={param.label}>
			<ToggleGroup
				type="single"
				value={String(control.value)}
				onValueChange={(next) => {
					if (!next) return;
					control.onPreview(next);
					control.onCommit();
				}}
				className={cn(SEGMENT_GROUP_CLASS, "grid-cols-3")}
				aria-label={param.label}
			>
				{ALIGN_OPTIONS.map((option) => (
					<ToggleGroupItem
						key={option.value}
						value={option.value}
						aria-label={option.label}
						title={option.label}
						className={SEGMENT_ITEM_CLASS}
					>
						<HugeiconsIcon icon={option.icon} />
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</SectionField>
	);
}

function TextFormatField({
	fontWeight,
	fontStyle,
	textDecoration,
	values,
	...shared
}: SharedProps & {
	fontWeight: ElementParamDefinition;
	fontStyle: ElementParamDefinition;
	textDecoration: ElementParamDefinition;
	values: Record<string, string | number | boolean>;
}) {
	const controls = {
		fontWeight: useElementParamControl({ ...shared, param: fontWeight }),
		fontStyle: useElementParamControl({ ...shared, param: fontStyle }),
		textDecoration: useElementParamControl({ ...shared, param: textDecoration }),
	};
	const current = {
		...values,
		fontWeight: controls.fontWeight.value,
		fontStyle: controls.fontStyle.value,
		textDecoration: controls.textDecoration.value,
	};

	return (
		<SectionField label="Formato">
			<div className={cn(SEGMENT_GROUP_CLASS, "grid-cols-4")} role="group" aria-label="Formato">
				{TEXT_FORMATS.map((format) => {
					const option = FORMAT_OPTIONS[format];
					return (
						<Toggle
							key={format}
							pressed={isTextFormatActive({ params: current, format })}
							onPressedChange={() => {
								const { key, value } = toggleTextFormat({ params: current, format });
								controls[key].onPreview(value);
								controls[key].onCommit();
							}}
							aria-label={option.label}
							title={`${option.label} (${option.shortcut})`}
							className={SEGMENT_ITEM_CLASS}
						>
							<HugeiconsIcon icon={option.icon} />
						</Toggle>
					);
				})}
			</div>
		</SectionField>
	);
}
