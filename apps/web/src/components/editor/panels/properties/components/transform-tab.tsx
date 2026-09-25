"use client";

import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import { useRef } from "react";
import { useEditor } from "@/editor/use-editor";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { NumberField } from "@/components/ui/number-field";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import { usePropertyDraft } from "@/components/editor/panels/properties/hooks/use-property-draft";
import {
	useElementParamControl,
	type ElementParamControl,
} from "@/components/editor/panels/properties/components/element-params-tab";
import { NumberParamField } from "@/components/editor/panels/properties/components/property-param-field";
import { KeyframeToggle } from "@/components/editor/panels/properties/components/keyframe-toggle";
import { usePropertiesStore } from "@/components/editor/panels/properties/stores/properties-store";
import { buildParamWritePatch } from "@/components/editor/panels/properties/param-write";
import { getElementParams, type ElementParamDefinition } from "@/params/registry";
import type { NumberParamDefinition } from "@/params";
import { getVisibleElementsWithBounds } from "@/preview/element-bounds";
import { rectFromBounds } from "@/preview/preview-snap";
import {
	getAlignedPosition,
	getFramingScale,
	normalizeRotation,
	type CanvasAlignment,
} from "@/preview/transform-align";
import type { TimelineElement } from "@/timeline";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	AlignBottomIcon,
	AlignHorizontalCenterIcon,
	AlignLeftIcon,
	AlignRightIcon,
	AlignTopIcon,
	AlignVerticalCenterIcon,
	ArrowExpand01Icon,
	ArrowTurnBackwardIcon,
	FitToScreenIcon,
	Link01Icon,
	Maximize01Icon,
	RotateLeft01Icon,
	RotateRight01Icon,
	Unlink01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";

const SCALE_SLIDER_RANGE = { min: 1, max: 300 } as const;
const GROUPS = {
	position: ["transform.positionX", "transform.positionY"],
	scale: ["transform.scaleX", "transform.scaleY"],
	rotate: ["transform.rotate"],
} as const;

const ALIGNMENTS: { value: CanvasAlignment; label: string; icon: typeof AlignLeftIcon }[] = [
	{ value: "left", label: "Alinear a la izquierda", icon: AlignLeftIcon },
	{ value: "center-x", label: "Centrar horizontalmente", icon: AlignHorizontalCenterIcon },
	{ value: "right", label: "Alinear a la derecha", icon: AlignRightIcon },
	{ value: "top", label: "Alinear arriba", icon: AlignTopIcon },
	{ value: "center-y", label: "Centrar verticalmente", icon: AlignVerticalCenterIcon },
	{ value: "bottom", label: "Alinear abajo", icon: AlignBottomIcon },
];

function requireParam({
	params,
	key,
}: {
	params: readonly ElementParamDefinition[];
	key: string;
}): NumberParamDefinition & ElementParamDefinition {
	const param = params.find((candidate) => candidate.key === key);
	if (!param || param.type !== "number") {
		throw new Error(`Element is missing the numeric "${key}" param`);
	}
	return param;
}

export function TransformTab({
	element: committedElement,
	trackId,
}: {
	element: TimelineElement;
	trackId: string;
}) {
	const editor = useEditor();
	// Preview-aware, so sliders and canvas drags show live values.
	const { renderElement: element } = useElementPreview({
		trackId,
		elementId: committedElement.id,
		fallback: committedElement,
	});
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});
	const shared = { element, trackId, localTime, isPlayheadWithinElementRange };
	const params = getElementParams({ element });
	const paramDefs = {
		positionX: requireParam({ params, key: "transform.positionX" }),
		positionY: requireParam({ params, key: "transform.positionY" }),
		scaleX: requireParam({ params, key: "transform.scaleX" }),
		scaleY: requireParam({ params, key: "transform.scaleY" }),
		rotate: requireParam({ params, key: "transform.rotate" }),
	};
	const controls = {
		"transform.positionX": useElementParamControl({ ...shared, param: paramDefs.positionX }),
		"transform.positionY": useElementParamControl({ ...shared, param: paramDefs.positionY }),
		"transform.scaleX": useElementParamControl({ ...shared, param: paramDefs.scaleX }),
		"transform.scaleY": useElementParamControl({ ...shared, param: paramDefs.scaleY }),
		"transform.rotate": useElementParamControl({ ...shared, param: paramDefs.rotate }),
	};
	const value = (key: keyof typeof controls) => Number(controls[key].value);
	const isScaleLocked = usePropertiesStore((state) => state.isTransformScaleLocked);
	const setScaleLocked = usePropertiesStore((state) => state.setTransformScaleLocked);

	const canvasSize = editor.project.getActive().settings.canvasSize;
	const bounds = getVisibleElementsWithBounds({
		tracks: editor.scenes.getActiveScene().tracks,
		currentTime: editor.playback.getCurrentTime(),
		canvasSize,
		mediaAssets: editor.media.getAssets(),
	}).find((item) => item.elementId === element.id)?.bounds;

	const write = ({ values, preview = false }: { values: Record<string, number>; preview?: boolean }) => {
		const patch = buildParamWritePatch({ element, values, localTime, isPlayheadWithinElementRange });
		if (preview) {
			editor.timeline.previewElements({ updates: [{ trackId, elementId: element.id, updates: patch }] });
		} else {
			editor.timeline.updateElements({ updates: [{ trackId, elementId: element.id, patch }] });
		}
	};

	const toggleGroupKeyframe = (keys: readonly (keyof typeof controls)[]) => {
		const isOn = keys.some((key) => controls[key].keyframe?.isActive);
		for (const key of keys) {
			const keyframe = controls[key].keyframe;
			if (keyframe && keyframe.isActive === isOn) keyframe.onToggle();
		}
	};

	const align = (alignment: CanvasAlignment) => {
		if (!bounds) return;
		const next = getAlignedPosition({
			rect: rectFromBounds({ bounds, canvasSize }),
			position: { x: value("transform.positionX"), y: value("transform.positionY") },
			canvasSize,
			alignment,
		});
		write({ values: { "transform.positionX": Math.round(next.x), "transform.positionY": Math.round(next.y) } });
	};

	const frame = (mode: "fit" | "fill") => {
		if (!bounds) return;
		const scale = getFramingScale({
			unscaledSize: {
				width: Math.abs(bounds.width) / Math.abs(value("transform.scaleX") || 1),
				height: Math.abs(bounds.height) / Math.abs(value("transform.scaleY") || 1),
			},
			canvasSize,
			mode,
		});
		write({
			values: {
				"transform.positionX": 0,
				"transform.positionY": 0,
				"transform.rotate": 0,
				"transform.scaleX": Number(scale.toFixed(4)),
				"transform.scaleY": Number(scale.toFixed(4)),
			},
		});
	};

	const scaleAxesDiffer = Math.abs(value("transform.scaleX") - value("transform.scaleY")) > 1e-4;
	const isLinked = isScaleLocked && !scaleAxesDiffer;
	const isMedia = element.type === "video" || element.type === "image";

	return (
		<div className="flex flex-col">
			<TabSection title="Alinear en el lienzo">
				<div className="bg-accent grid h-7.5 grid-cols-[repeat(3,1fr)_1px_repeat(3,1fr)] gap-0.5 rounded-md border p-0.5" role="group" aria-label="Alinear en el lienzo">
					{ALIGNMENTS.map((alignment, index) => (
						<AlignButton key={alignment.value} index={index} {...alignment} onClick={() => align(alignment.value)} />
					))}
				</div>
			</TabSection>

			<TabSection
				title="Posición"
				keyframe={groupKeyframe({ controls, keys: GROUPS.position, onToggle: () => toggleGroupKeyframe(GROUPS.position) })}
				onReset={
					value("transform.positionX") !== paramDefs.positionX.default ||
					value("transform.positionY") !== paramDefs.positionY.default
						? () => write({ values: { "transform.positionX": 0, "transform.positionY": 0 } })
						: undefined
				}
			>
				<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
					<NumberParamField
						param={{ ...paramDefs.positionX, shortLabel: "X" }}
						value={value("transform.positionX")}
						onPreview={controls["transform.positionX"].onPreview}
						onCommit={controls["transform.positionX"].onCommit}
						suffix="px"
					/>
					<NumberParamField
						param={{ ...paramDefs.positionY, shortLabel: "Y" }}
						value={value("transform.positionY")}
						onPreview={controls["transform.positionY"].onPreview}
						onCommit={controls["transform.positionY"].onCommit}
						suffix="px"
					/>
				</div>
			</TabSection>

			<TabSection
				title="Escala"
				meta={bounds ? `${Math.round(Math.abs(bounds.width))} × ${Math.round(Math.abs(bounds.height))} px` : undefined}
				keyframe={groupKeyframe({ controls, keys: GROUPS.scale, onToggle: () => toggleGroupKeyframe(GROUPS.scale) })}
				actions={
					<Button
						variant="ghost"
						size="icon"
						className={cn("size-5.5", isLinked ? "text-primary" : "text-muted-foreground")}
						onClick={() => {
							const nextLocked = !isLinked;
							setScaleLocked({ locked: nextLocked });
							if (nextLocked && scaleAxesDiffer) {
								write({ values: { "transform.scaleY": value("transform.scaleX") } });
							}
						}}
						aria-pressed={isLinked}
						aria-label="Mantener la proporción"
						title={isLinked ? "Proporción bloqueada" : "Proporción libre"}
					>
						<HugeiconsIcon icon={isLinked ? Link01Icon : Unlink01Icon} className="size-3.5" />
					</Button>
				}
				onReset={
					value("transform.scaleX") !== 1 || value("transform.scaleY") !== 1
						? () => write({ values: { "transform.scaleX": 1, "transform.scaleY": 1 } })
						: undefined
				}
			>
				{isLinked ? (
					<LinkedScaleField
						scale={value("transform.scaleX")}
						onPreview={(scale) => write({ values: { "transform.scaleX": scale, "transform.scaleY": scale }, preview: true })}
						onCommit={() => editor.timeline.commitPreview()}
						param={paramDefs.scaleX}
					/>
				) : (
					<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
						<NumberParamField
							param={{ ...paramDefs.scaleX, shortLabel: "W", displayMultiplier: 100, step: 1 }}
							value={value("transform.scaleX")}
							onPreview={controls["transform.scaleX"].onPreview}
							onCommit={controls["transform.scaleX"].onCommit}
							suffix="%"
						/>
						<NumberParamField
							param={{ ...paramDefs.scaleY, shortLabel: "H", displayMultiplier: 100, step: 1 }}
							value={value("transform.scaleY")}
							onPreview={controls["transform.scaleY"].onPreview}
							onCommit={controls["transform.scaleY"].onCommit}
							suffix="%"
						/>
					</div>
				)}
			</TabSection>

			<TabSection
				title="Rotación"
				keyframe={groupKeyframe({ controls, keys: GROUPS.rotate, onToggle: () => toggleGroupKeyframe(GROUPS.rotate) })}
				onReset={value("transform.rotate") !== 0 ? () => write({ values: { "transform.rotate": 0 } }) : undefined}
				isLast={!isMedia}
			>
				<div className="flex min-w-0 items-center gap-2">
					<RotationDial
						rotation={value("transform.rotate")}
						onPreview={controls["transform.rotate"].onPreview}
						onCommit={controls["transform.rotate"].onCommit}
					/>
					<div className="min-w-0 flex-1">
						<NumberParamField
							param={{ ...paramDefs.rotate, shortLabel: "°" }}
							value={value("transform.rotate")}
							onPreview={controls["transform.rotate"].onPreview}
							onCommit={controls["transform.rotate"].onCommit}
						/>
					</div>
					<div className="@max-[200px]:hidden flex shrink-0 gap-0.5">
						{[-90, 90].map((delta) => (
							<Button
								key={delta}
								variant="outline"
								size="icon"
								className="bg-accent size-7"
								onClick={() => write({ values: { "transform.rotate": normalizeRotation(value("transform.rotate") + delta) } })}
								aria-label={delta < 0 ? "Girar 90° a la izquierda" : "Girar 90° a la derecha"}
								title={delta < 0 ? "Girar 90° a la izquierda" : "Girar 90° a la derecha"}
							>
								<HugeiconsIcon icon={delta < 0 ? RotateLeft01Icon : RotateRight01Icon} className="size-3.5" />
							</Button>
						))}
					</div>
				</div>
			</TabSection>

			{isMedia && (
				<TabSection title="Encuadre" isLast>
					<div className="grid grid-cols-2 gap-2">
						<Button variant="outline" size="sm" className="h-7.5 gap-1.5 font-normal" onClick={() => frame("fit")} title="Todo el contenido visible dentro del lienzo">
							<HugeiconsIcon icon={FitToScreenIcon} className="size-3.5" />
							Ajustar
						</Button>
						<Button variant="outline" size="sm" className="h-7.5 gap-1.5 font-normal" onClick={() => frame("fill")} title="Cubre todo el lienzo, puede recortar los bordes">
							<HugeiconsIcon icon={Maximize01Icon} className="size-3.5" />
							Rellenar
						</Button>
					</div>
				</TabSection>
			)}
		</div>
	);
}

function groupKeyframe({
	controls,
	keys,
	onToggle,
}: {
	controls: Record<string, ElementParamControl>;
	keys: readonly string[];
	onToggle: () => void;
}) {
	const keyframes = keys.map((key) => controls[key]?.keyframe).filter(Boolean);
	if (keyframes.length === 0) return undefined;
	return {
		isActive: keyframes.some((keyframe) => keyframe?.isActive),
		isDisabled: keyframes.every((keyframe) => keyframe?.isDisabled),
		onToggle,
	};
}

function TabSection({
	title,
	meta,
	keyframe,
	actions,
	onReset,
	isLast = false,
	children,
}: {
	title: string;
	meta?: string;
	keyframe?: { isActive: boolean; isDisabled: boolean; onToggle: () => void };
	actions?: React.ReactNode;
	onReset?: () => void;
	isLast?: boolean;
	children: React.ReactNode;
}) {
	return (
		<section className={cn("@container flex min-w-0 flex-col gap-2 px-3.5 py-3", !isLast && "border-b")}>
			<div className="flex h-5.5 min-w-0 items-center gap-1.5">
				{keyframe && (
					<KeyframeToggle
						isActive={keyframe.isActive}
						isDisabled={keyframe.isDisabled}
						title={`Keyframe de ${title.toLowerCase()}`}
						onToggle={keyframe.onToggle}
					/>
				)}
				<span className="text-sm font-medium">{title}</span>
				{meta && <span className="text-muted-foreground ml-auto truncate text-xs tabular-nums">{meta}</span>}
				<div className={cn("flex items-center gap-0.5", !meta && "ml-auto")}>
					{actions}
					{onReset && (
						<Button variant="ghost" size="icon" className="text-muted-foreground size-5.5" onClick={onReset} aria-label={`Restablecer ${title.toLowerCase()}`} title="Restablecer">
							<HugeiconsIcon icon={ArrowTurnBackwardIcon} className="size-3.5" />
						</Button>
					)}
				</div>
			</div>
			{children}
		</section>
	);
}

function AlignButton({
	index,
	label,
	icon,
	onClick,
}: {
	index: number;
	label: string;
	icon: typeof AlignLeftIcon;
	onClick: () => void;
}) {
	return (
		<>
			{index === 3 && <span className="bg-border my-1" aria-hidden />}
			<button
				type="button"
				onClick={onClick}
				aria-label={label}
				title={label}
				className="text-muted-foreground hover:bg-background hover:text-foreground flex items-center justify-center rounded-sm hover:shadow-sm"
			>
				<HugeiconsIcon icon={icon} className="size-3.5" />
			</button>
		</>
	);
}

function LinkedScaleField({
	scale,
	param,
	onPreview,
	onCommit,
}: {
	scale: number;
	param: NumberParamDefinition;
	onPreview: (scale: number) => void;
	onCommit: () => void;
}) {
	const percent = Math.round(scale * 100);
	const toScale = (displayPercent: number) => Math.max(param.min, displayPercent / 100);
	const draft = usePropertyDraft({
		displayValue: String(percent),
		parse: (input) => {
			const parsed = parseFloat(input);
			return Number.isNaN(parsed) ? null : Math.max(1, parsed);
		},
		onPreview: (displayPercent) => onPreview(toScale(displayPercent)),
		onCommit,
	});

	return (
		<div className="flex min-w-0 items-center gap-2.5">
			<Slider
				className="min-w-0 flex-1"
				min={SCALE_SLIDER_RANGE.min}
				max={SCALE_SLIDER_RANGE.max}
				step={1}
				value={[Math.min(SCALE_SLIDER_RANGE.max, Math.max(SCALE_SLIDER_RANGE.min, percent))]}
				onValueChange={([next]) => onPreview(toScale(next))}
				onValueCommit={() => onCommit()}
				aria-label="Escala"
			/>
			<div className="w-24 shrink-0">
				<NumberField
					icon={<HugeiconsIcon icon={ArrowExpand01Icon} />}
					value={draft.displayValue}
					suffix="%"
					dragSensitivity="slow"
					onFocus={draft.onFocus}
					onChange={draft.onChange}
					onBlur={draft.onBlur}
					onScrub={(next) => onPreview(toScale(next))}
					onScrubEnd={onCommit}
					step={1}
					onKeyboardStep={(next) => draft.stepTo(String(Math.max(1, Math.round(next))))}
					aria-label="Escala en porcentaje"
				/>
			</div>
		</div>
	);
}

/** Circular control: drag around it to set the rotation (Shift: 15° steps). */
function RotationDial({
	rotation,
	onPreview,
	onCommit,
}: {
	rotation: number;
	onPreview: (value: number) => void;
	onCommit: () => void;
}) {
	const dialRef = useRef<HTMLButtonElement>(null);

	const angleFromPointer = (event: PointerEvent | React.PointerEvent) => {
		const rect = dialRef.current?.getBoundingClientRect();
		if (!rect) return rotation;
		const degrees =
			(Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2)) * 180) /
				Math.PI +
			90;
		const stepped = event.shiftKey ? Math.round(degrees / 15) * 15 : Math.round(degrees);
		return normalizeRotation(stepped);
	};

	return (
		<button
			ref={dialRef}
			type="button"
			className="bg-accent relative size-7 shrink-0 cursor-grab rounded-full border active:cursor-grabbing"
			aria-label="Arrastra para girar"
			title="Arrastra para girar · Shift: de 15° en 15°"
			onPointerDown={(event) => {
				event.preventDefault();
				onPreview(angleFromPointer(event));
				const handleMove = (moveEvent: PointerEvent) => onPreview(angleFromPointer(moveEvent));
				const handleUp = () => {
					document.removeEventListener("pointermove", handleMove);
					document.removeEventListener("pointerup", handleUp);
					onCommit();
				};
				document.addEventListener("pointermove", handleMove);
				document.addEventListener("pointerup", handleUp);
			}}
		>
			<span
				className="bg-foreground absolute top-[3px] left-1/2 h-[11px] w-0.5 -translate-x-1/2 rounded-full"
				style={{ transform: `translateX(-50%) rotate(${rotation}deg)`, transformOrigin: "50% 11px" }}
			/>
			<span className="bg-muted-foreground absolute top-1/2 left-1/2 size-1 -translate-1/2 rounded-full" />
		</button>
	);
}
