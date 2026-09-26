"use client";

import { useSyncExternalStore, type CSSProperties } from "react";
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
import {
	subjectSegmentation,
	type SubjectDetection,
} from "@/services/subject-segmentation/service";
import { cn } from "@/utils/ui";
import {
	ParamField,
	SliderParamField,
	SwitchParamRow,
	useTextParams,
} from "./style-fields";

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
	wrap: () => ({
		display: "inline-block",
		animation: "text-fx-wrap-spin 2.4s linear infinite",
	}),
};

const TILE_KEYFRAMES =
	"@keyframes text-fx-wrap-spin { from { transform: perspective(90px) rotateY(0deg); } to { transform: perspective(90px) rotateY(360deg); } }";

const SUBJECT_HINTS: Record<SubjectDetection, string> = {
	detected:
		"Sujeto detectado en este fotograma: la parte trasera del anillo queda detrás de él.",
	none: "No hay un sujeto detectado en este fotograma; el anillo se ve completo.",
	"no-video": "No hay un video debajo del texto en este fotograma; el anillo se ve completo.",
	loading: "Cargando la detección de sujetos…",
	unavailable:
		"La detección de sujetos no está disponible en este navegador; el anillo se ve completo.",
};

function useSubjectDetection({ elementId }: { elementId: string }): SubjectDetection | null {
	return useSyncExternalStore(
		(listener) => subjectSegmentation.subscribe(listener),
		() => subjectSegmentation.getDetection({ elementId }),
		() => null,
	);
}

function SubjectHint({ elementId }: { elementId: string }) {
	const detection = useSubjectDetection({ elementId });
	return (
		<p className="text-muted-foreground text-xs">
			{detection ? `${SUBJECT_HINTS[detection]} ` : ""}
			La detección es automática sobre el video de abajo.
		</p>
	);
}

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
			<style>{TILE_KEYFRAMES}</style>
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
			{current === "wrap" && (
				<Section sectionKey={`${element.id}:text-effects-wrap`}>
					<SectionContent className="pt-4">
						<SectionFields>
							<SliderParamField param={getParam("fx.radius")} suffix="%" {...shared} />
							<SliderParamField param={getParam("fx.tilt")} suffix="°" {...shared} />
							<SliderParamField param={getParam("fx.spin")} suffix="°/s" {...shared} />
							<SwitchParamRow param={getParam("fx.repeat")} {...shared} />
							<SwitchParamRow param={getParam("fx.occlude")} {...shared} />
							{values["fx.occlude"] !== false && <SubjectHint elementId={element.id} />}
						</SectionFields>
					</SectionContent>
				</Section>
			)}
		</>
	);
}
