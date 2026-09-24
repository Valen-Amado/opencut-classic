"use client";

import {
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { usePreviewViewport } from "@/preview/components/preview-viewport";
import { useEditor } from "@/editor/use-editor";
import type { PreviewOverlayControl } from "@/preview/overlays";
import { toast } from "sonner";

export function PreviewContextMenu({
	onToggleFullscreen,
	container,
	overlayControls,
	onOverlayVisibilityChange,
}: {
	onToggleFullscreen: () => void;
	container: HTMLElement | null;
	overlayControls: PreviewOverlayControl[];
	onOverlayVisibilityChange: (params: {
		overlayId: string;
		isVisible: boolean;
	}) => void;
}) {
	const editor = useEditor();
	const viewport = usePreviewViewport();

	const handleCopySnapshot = async () => {
		const result = await editor.renderer.copySnapshot();

		if (!result.success) {
			toast.error("No se pudo copiar la captura", {
				description: result.error ?? "Please try again",
			});
			return;
		}
	};

	const handleSaveSnapshot = async () => {
		const result = await editor.renderer.saveSnapshot();

		if (!result.success) {
			toast.error("No se pudo guardar la captura", {
				description: result.error ?? "Please try again",
			});
			return;
		}
	};

	return (
		<ContextMenuContent className="w-56" container={container}>
			<ContextMenuItem onClick={viewport.fitToScreen} inset>
				Ajustar a la pantalla
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem onClick={onToggleFullscreen} inset>
				Pantalla completa
			</ContextMenuItem>
			<ContextMenuItem onClick={handleSaveSnapshot} inset>
				Guardar la captura
			</ContextMenuItem>
			<ContextMenuItem onClick={handleCopySnapshot} inset>
				Copiar la captura
			</ContextMenuItem>
			{overlayControls.length > 0 ? <ContextMenuSeparator /> : null}
			{overlayControls.map((overlayControl) => (
				<ContextMenuCheckboxItem
					key={overlayControl.id}
					checked={overlayControl.isVisible}
					onCheckedChange={(checked) =>
						onOverlayVisibilityChange({
							overlayId: overlayControl.id,
							isVisible: !!checked,
						})
					}
				>
					{overlayControl.label}
				</ContextMenuCheckboxItem>
			))}
		</ContextMenuContent>
	);
}
