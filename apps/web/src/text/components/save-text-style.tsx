"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { useTextStylesStore } from "@/text/text-styles-store";
import { getNextStyleName } from "@/text/text-styles";
import type { TextElement } from "@/timeline";
import { HugeiconsIcon } from "@hugeicons/react";
import { BookmarkAdd02Icon } from "@hugeicons/core-free-icons";

/** "Save style" row at the top of the text tab; saved styles live in the Text assets view. */
export function SaveTextStyleSection({ element }: { element: TextElement }) {
	const styles = useTextStylesStore((state) => state.styles);
	const addStyle = useTextStylesStore((state) => state.addStyle);
	const setActiveTab = useAssetsPanelStore((state) => state.setActiveTab);
	const [isNaming, setIsNaming] = useState(false);
	const [name, setName] = useState("");

	const startNaming = () => {
		setName(getNextStyleName({ styles }));
		setIsNaming(true);
	};

	const save = () => {
		const finalName = name.trim() || getNextStyleName({ styles });
		addStyle({ name: finalName, params: element.params });
		setIsNaming(false);
		setActiveTab("text");
		toast.success("Estilo guardado", {
			description: `“${finalName}” está en Texto → Estilos guardados.`,
		});
	};

	return (
		<div className="flex flex-col gap-2 border-b px-3.5 py-2.5">
			<div className="flex h-7 items-center justify-between gap-2">
				<span className="text-muted-foreground text-sm font-medium">Estilo</span>
				{!isNaming && (
					<Button variant="outline" size="sm" className="gap-1.5" onClick={startNaming}>
						<HugeiconsIcon icon={BookmarkAdd02Icon} className="size-3.5" />
						Guardar estilo
					</Button>
				)}
			</div>
			{isNaming && (
				<form
					className="flex items-center gap-1.5"
					onSubmit={(event) => {
						event.preventDefault();
						save();
					}}
				>
					<Input
						ref={(node) => {
							if (node && document.activeElement !== node) {
								node.focus();
								node.select();
							}
						}}
						size="sm"
						value={name}
						onChange={(event) => setName(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape") setIsNaming(false);
						}}
						aria-label="Nombre del estilo"
						className="min-w-0 flex-1"
					/>
					<Button type="submit" size="sm">
						Guardar
					</Button>
					<Button type="button" variant="ghost" size="sm" onClick={() => setIsNaming(false)}>
						Cancelar
					</Button>
				</form>
			)}
		</div>
	);
}
