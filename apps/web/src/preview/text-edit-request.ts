import type { EditorCore } from "@/core";
import { usePreviewStore } from "@/preview/preview-store";
import type { TextElement } from "@/timeline";
import { addMediaTime } from "@/wasm";

/**
 * Opens the on-canvas text editor for an element: pauses playback and moves
 * the playhead inside the element first so it is visible.
 */
export function requestCanvasTextEdit({
	editor,
	trackId,
	element,
}: {
	editor: EditorCore;
	trackId: string;
	element: TextElement;
}): void {
	if (editor.playback.getIsPlaying()) editor.playback.pause();

	const now = editor.playback.getCurrentTime();
	const end = addMediaTime({ a: element.startTime, b: element.duration });
	if (now < element.startTime || now >= end) {
		editor.playback.seek({ time: element.startTime });
	}

	usePreviewStore.getState().requestTextEdit({ trackId, elementId: element.id });
}
