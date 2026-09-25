"use client";

import { useEditor } from "@/editor/use-editor";
import { requestCanvasTextEdit } from "@/preview/text-edit-request";
import type { TextElement } from "@/timeline";
import { HugeiconsIcon } from "@hugeicons/react";
import { TextIcon } from "@hugeicons/core-free-icons";

export function EditOnCanvasButton({
	element,
	trackId,
}: {
	element: TextElement;
	trackId: string;
}) {
	const editor = useEditor();
	return (
		<button
			type="button"
			className="text-primary flex items-center gap-1 text-xs hover:underline"
			title="También con doble clic sobre el texto en el preview"
			onClick={() => requestCanvasTextEdit({ editor, trackId, element })}
		>
			<HugeiconsIcon icon={TextIcon} className="size-3" />
			Editar en el preview
		</button>
	);
}
