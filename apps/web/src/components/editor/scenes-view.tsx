"use client";

import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ListCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/utils/ui";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	canDeleteScene,
	countSceneElements,
	getMainScene,
	getNextSceneName,
	getSceneDisplayName,
} from "@/timeline/scenes";
import { calculateTotalDuration, type TScene } from "@/timeline";
import { mediaTimeToSeconds } from "@/wasm";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";

function formatSceneDuration({ scene }: { scene: TScene }): string {
	const seconds = Math.round(
		mediaTimeToSeconds({ time: calculateTotalDuration({ tracks: scene.tracks }) }),
	);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ScenesView({ children }: { children: React.ReactNode }) {
	const editor = useEditor();
	// Tuple: useEditor compares array snapshots item by item.
	const [scenes, currentScene] = useEditor(
		(e) => [e.scenes.getScenes(), e.scenes.getActiveSceneOrNull()] as const,
	);
	const [isSelectMode, setIsSelectMode] = useState(false);
	const [selectedScenes, setSelectedScenes] = useState<Set<string>>(new Set());
	const [renamingId, setRenamingId] = useState<string | null>(null);

	const handleSceneSwitch = async (sceneId: string) => {
		if (isSelectMode) {
			toggleSceneSelection({ sceneId });
			return;
		}

		try {
			await editor.scenes.switchToScene({ sceneId });
		} catch (error) {
			console.error("Failed to switch scene:", error);
		}
	};

	const handleCreateScene = async () => {
		try {
			const sceneId = await editor.scenes.createScene({
				name: getNextSceneName({ scenes }),
				isMain: false,
			});
			await editor.scenes.switchToScene({ sceneId });
			setIsSelectMode(false);
			setRenamingId(sceneId);
		} catch (error) {
			console.error("Failed to create scene:", error);
			toast.error("No se pudo crear la escena");
		}
	};

	const handleRename = async ({
		scene,
		name,
	}: {
		scene: TScene;
		name: string;
	}) => {
		setRenamingId(null);
		const trimmed = name.trim();
		if (!trimmed || trimmed === scene.name) return;
		try {
			await editor.scenes.renameScene({ sceneId: scene.id, name: trimmed });
		} catch (error) {
			console.error("Failed to rename scene:", error);
		}
	};

	const deleteScenes = async ({ sceneIds }: { sceneIds: Iterable<string> }) => {
		for (const sceneId of sceneIds) {
			const scene = scenes.find((scene) => scene.id === sceneId);
			if (!scene) {
				continue;
			}

			const { canDelete } = canDeleteScene({ scene });
			if (!canDelete) {
				toast.error("La escena principal no se puede eliminar");
				continue;
			}

			try {
				if (currentScene?.id === sceneId) {
					const fallback = getMainScene({ scenes });
					if (fallback) await editor.scenes.switchToScene({ sceneId: fallback.id });
				}
				await editor.scenes.deleteScene({ sceneId });
			} catch (error) {
				console.error("Failed to delete scene:", error);
			}
		}
	};

	const toggleSceneSelection = ({ sceneId }: { sceneId: string }) => {
		setSelectedScenes((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(sceneId)) {
				newSet.delete(sceneId);
			} else {
				newSet.add(sceneId);
			}
			return newSet;
		});
	};

	const handleSelectMode = () => {
		setIsSelectMode(!isSelectMode);
		setSelectedScenes(new Set());
		setRenamingId(null);
	};

	const handleDeleteSelected = async () => {
		await deleteScenes({ sceneIds: selectedScenes });
		setSelectedScenes(new Set());
		setIsSelectMode(false);
	};

	const isMainSceneSelected = (() => {
		const mainScene = getMainScene({ scenes });
		return Boolean(mainScene?.id && selectedScenes.has(mainScene.id));
	})();

	return (
		<Sheet>
			<SheetTrigger asChild>{children}</SheetTrigger>
			<SheetContent>
				<SheetHeader>
					<SheetTitle>
						{isSelectMode
							? `Seleccionar escenas (${selectedScenes.size})`
							: "Escenas"}
					</SheetTitle>
					<SheetDescription>
						{isSelectMode
							? "Elige las escenas que quieres eliminar"
							: "Cada escena tiene su propia línea de tiempo; los medios se comparten."}
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-4 py-4">
					<div className="flex items-center gap-2">
						{!isSelectMode && (
							<Button className="rounded-md" size="sm" onClick={handleCreateScene}>
								<Plus />
								Nueva escena
							</Button>
						)}
						<Button
							className="rounded-md"
							variant={isSelectMode ? "default" : "outline"}
							size="sm"
							onClick={handleSelectMode}
						>
							<ListCheck />
							{isSelectMode ? "Cancelar" : "Seleccionar"}
						</Button>
						{isSelectMode && (
							<DeleteDialog
								count={selectedScenes.size}
								onDelete={handleDeleteSelected}
								disabled={isMainSceneSelected}
								trigger={
									<Button
										className="rounded-md"
										variant="destructive"
										disabled={isMainSceneSelected || selectedScenes.size === 0}
										size="sm"
									>
										<Trash2 />
										Eliminar ({selectedScenes.size})
									</Button>
								}
							/>
						)}
					</div>
					{scenes.length === 0 ? (
						<div className="text-muted-foreground text-sm">No hay escenas</div>
					) : (
						<div className="space-y-2">
							{scenes.map((scene) => {
								const isCurrent = currentScene?.id === scene.id;
								const isChecked = isSelectMode
									? selectedScenes.has(scene.id)
									: isCurrent;
								const elementCount = countSceneElements({ scene });
								const meta = `${formatSceneDuration({ scene })} · ${elementCount} ${elementCount === 1 ? "elemento" : "elementos"}${scene.isMain ? " · Principal" : ""}`;

								if (renamingId === scene.id) {
									return (
										<Input
											key={scene.id}
											ref={(node) => {
												if (node && document.activeElement !== node) {
													node.focus();
													node.select();
												}
											}}
											defaultValue={scene.name}
											aria-label="Nombre de la escena"
											onBlur={(event) =>
												handleRename({ scene, name: event.currentTarget.value })
											}
											onKeyDown={(event) => {
												event.stopPropagation();
												if (event.key === "Enter") event.currentTarget.blur();
												if (event.key === "Escape") setRenamingId(null);
											}}
										/>
									);
								}

								return (
									<div
										key={scene.id}
										className={cn(
											"group flex items-center rounded-md border",
											isCurrent && !isSelectMode && "border-primary",
											isSelectMode && isChecked && "bg-accent border-foreground/30",
										)}
									>
										<button
											type="button"
											className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-3 py-2 text-left"
											onClick={() => handleSceneSwitch(scene.id)}
											onDoubleClick={() => {
												if (!isSelectMode) setRenamingId(scene.id);
											}}
										>
											<span
												className={cn(
													"w-full truncate text-sm",
													isCurrent && !isSelectMode && "text-primary",
												)}
											>
												{getSceneDisplayName({ scene })}
											</span>
											<span className="text-muted-foreground text-xs">{meta}</span>
										</button>
										{!isSelectMode && (
											<div className="flex items-center gap-0.5 pr-1.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
												<Button
													variant="ghost"
													size="icon"
													className="size-7"
													aria-label="Renombrar escena"
													title="Renombrar"
													onClick={() => setRenamingId(scene.id)}
												>
													<Pencil className="size-3.5" />
												</Button>
												{!scene.isMain && (
													<DeleteDialog
														count={1}
														onDelete={() => deleteScenes({ sceneIds: [scene.id] })}
														trigger={
															<Button
																variant="ghost"
																size="icon"
																className="size-7"
																aria-label="Eliminar escena"
																title="Eliminar"
															>
																<Trash2 className="size-3.5" />
															</Button>
														}
													/>
												)}
											</div>
										)}
										{isChecked && (
											<Check className="text-primary mr-3 size-4 shrink-0" />
										)}
									</div>
								);
							})}
						</div>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}

function DeleteDialog({
	count,
	onDelete,
	disabled,
	trigger,
}: {
	count: number;
	onDelete: () => void;
	disabled?: boolean;
	trigger: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);

	const handleDelete = () => {
		onDelete();
		setOpen(false);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Eliminar escenas</DialogTitle>
					<DialogDescription>
						¿Eliminar {count === 1 ? "esta escena" : `${count} escenas`} con todo su
						contenido de la línea de tiempo? Puedes deshacerlo con ⌘Z.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancelar
					</Button>
					<Button
						variant="destructive"
						onClick={handleDelete}
						disabled={disabled}
					>
						Eliminar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
