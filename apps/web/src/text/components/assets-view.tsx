import { useState } from "react";
import { toast } from "sonner";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import type { ParamValues } from "@/params";
import { DEFAULTS } from "@/timeline/defaults";
import { buildTextElement } from "@/timeline/element-utils";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { applyTextStyle, type SavedTextStyle } from "@/text/text-styles";
import {
	getDefaultTextStyleParams,
	useTextStylesStore,
} from "@/text/text-styles-store";
import type { MediaTime } from "@/wasm";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Delete02Icon,
	Edit02Icon,
	MoreHorizontalIcon,
	PlusSignIcon,
	RefreshIcon,
	StarIcon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";

export function TextView() {
	const editor = useEditor();
	const styles = useTextStylesStore((state) => state.styles);
	const defaultStyleId = useTextStylesStore((state) => state.defaultStyleId);
	const [renaming, setRenaming] = useState<SavedTextStyle | null>(null);

	const addText = ({
		currentTime,
		styleParams,
	}: {
		currentTime: MediaTime;
		styleParams: ParamValues;
	}) => {
		const activeScene = editor.scenes.getActiveScene();
		if (!activeScene) return;

		const element = buildTextElement({
			raw: {
				...DEFAULTS.text.element,
				params: { ...DEFAULTS.text.element.params, ...styleParams },
			},
			startTime: currentTime,
		});

		editor.timeline.insertElement({
			element,
			placement: { mode: "auto" },
		});
	};

	const defaultStyleParams = styles.find((style) => style.id === defaultStyleId)?.params ?? {};

	return (
		<PanelView title="Texto">
			<div className="flex flex-col gap-5">
				<DraggableItem
					name="Default text"
					preview={
						<div className="bg-accent flex size-full items-center justify-center rounded">
							<span className="text-xs select-none">Texto predeterminado</span>
						</div>
					}
					dragData={{
						id: "temp-text-id",
						type: DEFAULTS.text.element.type,
						name: DEFAULTS.text.element.name,
						content: "Default text",
						params: defaultStyleParams,
					}}
					aspectRatio={1}
					onAddToTimeline={({ currentTime }) =>
						addText({ currentTime, styleParams: getDefaultTextStyleParams() })
					}
					shouldShowLabel={false}
				/>

				<section className="flex flex-col gap-2.5" aria-label="Estilos guardados">
					<div className="text-muted-foreground flex items-center justify-between px-0.5 text-sm">
						<span>Estilos guardados</span>
						{styles.length > 0 && <span className="tabular-nums">{styles.length}</span>}
					</div>
					{styles.length === 0 ? (
						<p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs leading-relaxed">
							Todavía no tienes estilos. Selecciona un texto y usa{" "}
							<span className="text-foreground font-medium">Guardar estilo</span> en el
							panel de propiedades.
						</p>
					) : (
						<div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, 7rem)" }}>
							{styles.map((style) => (
								<SavedStyleCard
									key={style.id}
									style={style}
									isDefault={style.id === defaultStyleId}
									onAdd={(currentTime) => addText({ currentTime, styleParams: style.params })}
									onRename={() => setRenaming(style)}
								/>
							))}
						</div>
					)}
				</section>
			</div>
			<RenameStyleDialog style={renaming} onClose={() => setRenaming(null)} />
		</PanelView>
	);
}

function StylePreview({ style }: { style: SavedTextStyle }) {
	const params = style.params;
	const hasBackground = params["background.enabled"] === true;
	return (
		<div className="flex size-full items-center justify-center bg-[#16181b]">
			<span
				className="max-w-[88%] truncate rounded-[3px] px-1.5 text-[15px] leading-tight select-none"
				style={{
					fontFamily: `"${String(params.fontFamily ?? "Arial")}", sans-serif`,
					color: String(params.color ?? "#ffffff"),
					fontWeight: params.fontWeight === "bold" ? 700 : 400,
					fontStyle: String(params.fontStyle ?? "normal"),
					textDecoration: String(params.textDecoration ?? "none"),
					background: hasBackground ? String(params["background.color"]) : undefined,
				}}
			>
				Aa Texto
			</span>
		</div>
	);
}

function SavedStyleCard({
	style,
	isDefault,
	onAdd,
	onRename,
}: {
	style: SavedTextStyle;
	isDefault: boolean;
	onAdd: (currentTime: MediaTime) => void;
	onRename: () => void;
}) {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	const updateStyle = useTextStylesStore((state) => state.updateStyle);
	const removeStyle = useTextStylesStore((state) => state.removeStyle);
	const setDefaultStyle = useTextStylesStore((state) => state.setDefaultStyle);

	const selectedTexts = editor.timeline
		.getElementsWithTracks({ elements: selectedElements })
		.filter(({ element }) => element.type === "text");

	const applyToSelection = () => {
		editor.timeline.updateElements({
			updates: selectedTexts.map(({ track, element }) => ({
				trackId: track.id,
				elementId: element.id,
				patch: { params: applyTextStyle({ params: element.params, style: style.params }) },
			})),
		});
		toast.success(`Estilo “${style.name}” aplicado`);
	};

	return (
		<div className="group relative">
			<DraggableItem
				name={style.name}
				preview={<StylePreview style={style} />}
				dragData={{
					id: `text-style-${style.id}`,
					type: "text",
					name: style.name,
					content: "Default text",
					params: style.params,
				}}
				onAddToTimeline={({ currentTime }) => onAdd(currentTime)}
			/>
			{isDefault && (
				<span
					className="bg-primary text-primary-foreground pointer-events-none absolute top-1 left-1 rounded-full px-1.5 text-[9px] leading-[14px]"
					title="Los textos nuevos usan este estilo"
				>
					Predet.
				</span>
			)}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						size="icon"
						className="bg-background hover:bg-background text-foreground absolute top-1 right-1 size-5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
						aria-label={`Opciones de ${style.name}`}
					>
						<HugeiconsIcon icon={MoreHorizontalIcon} className="size-3.5" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-60">
					<DropdownMenuItem
						icon={<HugeiconsIcon icon={PlusSignIcon} />}
						onClick={() => onAdd(editor.playback.getCurrentTime())}
					>
						Añadir a la línea de tiempo
					</DropdownMenuItem>
					<DropdownMenuItem
						icon={<HugeiconsIcon icon={Tick02Icon} />}
						disabled={selectedTexts.length === 0}
						onClick={applyToSelection}
					>
						Aplicar al texto seleccionado
					</DropdownMenuItem>
					<DropdownMenuItem
						icon={<HugeiconsIcon icon={RefreshIcon} />}
						disabled={selectedTexts.length !== 1}
						onClick={() => {
							const [selected] = selectedTexts;
							if (!selected) return;
							updateStyle({ id: style.id, params: selected.element.params });
							toast.success(`“${style.name}” actualizado`);
						}}
					>
						Actualizar con el texto seleccionado
					</DropdownMenuItem>
					<DropdownMenuItem
						icon={<HugeiconsIcon icon={StarIcon} />}
						onClick={() => setDefaultStyle(isDefault ? null : style.id)}
					>
						{isDefault ? "Quitar como predeterminado" : "Usar para textos nuevos"}
					</DropdownMenuItem>
					<DropdownMenuItem icon={<HugeiconsIcon icon={Edit02Icon} />} onClick={onRename}>
						Renombrar
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						icon={<HugeiconsIcon icon={Delete02Icon} />}
						onClick={() => removeStyle(style.id)}
					>
						Eliminar estilo
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

function RenameStyleDialog({
	style,
	onClose,
}: {
	style: SavedTextStyle | null;
	onClose: () => void;
}) {
	const renameStyle = useTextStylesStore((state) => state.renameStyle);
	const [name, setName] = useState("");
	const [lastStyleId, setLastStyleId] = useState<string | null>(null);
	if (style && style.id !== lastStyleId) {
		setLastStyleId(style.id);
		setName(style.name);
	}

	const confirm = () => {
		if (style && name.trim()) renameStyle({ id: style.id, name: name.trim() });
		onClose();
	};

	return (
		<Dialog open={style !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Renombrar el estilo</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<Input
						value={name}
						onChange={(event) => setName(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								confirm();
							}
						}}
						aria-label="Nombre del estilo"
					/>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button onClick={confirm}>Renombrar</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
