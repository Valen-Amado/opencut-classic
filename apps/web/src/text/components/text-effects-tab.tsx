"use client";

import type { CSSProperties } from "react";
import {
	Section,
	SectionContent,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { useEditor } from "@/editor/use-editor";
import {
	TEXT_FX_DEFINITIONS,
	TEXT_FX_TYPES,
	isTextFxType,
	type TextFxType,
} from "@/text/effects";
import type { TextElement } from "@/timeline";
import { cn } from "@/utils/ui";
import { ParamField, SliderParamField, useTextParams } from "./style-fields";

/** Live CSS preview of each effect on its tile. */
const TILE_PREVIEW: Record<TextFxType, (color: string) => CSSProperties> = {
	none: () => ({}),
	neon: (c) => ({ textShadow: `0 0 3px ${c}, 0 0 8px ${c}, 0 0 14px ${c}` }),
	glow: (c) => ({ textShadow: `0 0 6px ${c}, 0 0 12px ${c}` }),
	hollow: () => ({ color: "transparent", WebkitTextStroke: "1.2px #fff" }),
	hard: (c) => ({ textShadow: `3px 3px 0 ${c}` }),
	lift: (c) => ({
		textShadow: `1px 1px 0 ${c}, 2px 2px 0 ${c}, 3px 3px 0 ${c}, 4px 4px 0 ${c}`,
	}),
	echo: (c) => ({ textShadow: `3px 3px 0 ${c}99, 6px 6px 0 ${c}55` }),
	glitch: () => ({ textShadow: "-2px 0 #00e5ff, 2px 0 #ff2d55" }),
	gradient: (c) => ({
		background: `linear-gradient(#fff, ${c})`,
		WebkitBackgroundClip: "text",
		backgroundClip: "text",
		color: "transparent",
	}),
};

export function TextEffectsTab({
	element: committedElement,
	trackId,
}: {
	element: TextElement;
	trackId: string;
}) {
	const editor = useEditor();
	const { shared, values, getParam } = useTextParams({
		element: committedElement,
		trackId,
	});
	const { element } = shared;
	const rawType = values["fx.type"];
	const current: TextFxType = isTextFxType(rawType) ? rawType : "none";
	const definition = TEXT_FX_DEFINITIONS[current];
	const currentColor =
		typeof values["fx.color"] === "string" ? values["fx.color"] : definition.defaultColor;

	const choose = ({ type }: { type: TextFxType }) => {
		if (type === current) return;
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					patch: {
						params: {
							...element.params,
							"fx.type": type,
							"fx.color": TEXT_FX_DEFINITIONS[type].defaultColor,
						},
					},
				},
			],
		});
	};

	const hasOptions = definition.usesColor || definition.usesIntensity;

	return (
		<>
			<Section sectionKey={`${element.id}:text-effects`}>
				<SectionHeader>
					<SectionTitle>Efectos de texto</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<div className="flex flex-col gap-3">
						<div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
							{TEXT_FX_TYPES.map((type) => {
								const tile = TEXT_FX_DEFINITIONS[type];
								const isActive = type === current;
								return (
									<button
										key={type}
										type="button"
										aria-pressed={isActive}
										onClick={() => choose({ type })}
										className={cn(
											"text-muted-foreground hover:bg-accent hover:text-foreground flex cursor-pointer flex-col items-center gap-1.5 rounded-md border px-1 py-1.5 text-xs",
											isActive &&
												"border-primary bg-secondary text-secondary-foreground hover:bg-secondary",
										)}
									>
										<span className="flex h-[38px] w-full items-center justify-center overflow-hidden rounded-[5px] bg-[#1b1d21]">
											<span
												className="text-lg leading-none font-extrabold text-white"
												style={TILE_PREVIEW[type](isActive ? currentColor : tile.defaultColor)}
											>
												Aa
											</span>
										</span>
										<span>{tile.label}</span>
									</button>
								);
							})}
						</div>
						<p className="text-muted-foreground text-xs">
							Se combinan con la sombra y el trazo de la pestaña Texto.
						</p>
					</div>
				</SectionContent>
			</Section>
			{hasOptions && (
				<Section sectionKey={`${element.id}:text-effects-options`}>
					<SectionContent className="pt-4">
						<SectionFields>
							{definition.usesColor && <ParamField param={getParam("fx.color")} {...shared} />}
							{definition.usesIntensity && (
								<SliderParamField param={getParam("fx.intensity")} suffix="%" {...shared} />
							)}
						</SectionFields>
					</SectionContent>
				</Section>
			)}
		</>
	);
}
