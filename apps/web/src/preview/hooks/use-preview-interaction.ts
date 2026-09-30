import { useEffect, useReducer, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { useCommittedRef } from "@/hooks/use-committed-ref";
import { useModifierKeysRef } from "@/hooks/use-modifier-keys";
import { usePreviewViewport } from "@/preview/components/preview-viewport";
import type { SnapLine, SpacingGuide } from "@/preview/preview-snap";
import { registerCanceller } from "@/editor/cancel-interaction";
import { usePreviewStore } from "@/preview/preview-store";
import {
	PreviewInteractionController,
	type PreviewInteractionDeps,
	type PreviewInteractionDepsRef,
} from "@/preview/controllers/preview-interaction-controller";

export type OnSnapLinesChange = (lines: SnapLine[], spacing?: SpacingGuide[]) => void;

export function usePreviewInteraction({
	onSnapLinesChange,
	isMaskMode = false,
}: {
	onSnapLinesChange?: OnSnapLinesChange;
	isMaskMode?: boolean;
}) {
	const editor = useEditor();
	const modifiersRef = useModifierKeysRef();
	const smartGuides = usePreviewStore((state) => state.smartGuides);
	const viewport = usePreviewViewport();
	const deps: PreviewInteractionDeps = {
		viewport: {
			screenToCanvas: viewport.screenToCanvas,
			screenPixelsToLogicalThreshold: viewport.screenPixelsToLogicalThreshold,
		},
		input: {
			isShiftHeld: () => modifiersRef.current.shift,
			isSnapBypassHeld: () => modifiersRef.current.mod,
		},
		scene: {
			getTracks: () => editor.scenes.getActiveScene().tracks,
			getCurrentTime: () => editor.playback.getCurrentTime(),
			getMediaAssets: () => editor.media.getAssets(),
			getCanvasSize: () => editor.project.getActive().settings.canvasSize,
		},
		selection: {
			getSelected: () => editor.selection.getSelectedElements(),
			setSelected: (elements) =>
				editor.selection.setSelectedElements({ elements: [...elements] }),
			clearSelection: () => editor.selection.clearSelection(),
		},
		timeline: {
			getElementsWithTracks: ({ elements }) =>
				editor.timeline.getElementsWithTracks({ elements: [...elements] }),
			previewElements: (updates) =>
				editor.timeline.previewElements({ updates: [...updates] }),
			commitPreview: () => editor.timeline.commitPreview(),
			discardPreview: () => editor.timeline.discardPreview(),
		},
		playback: {
			getIsPlaying: () => editor.playback.getIsPlaying(),
			subscribe: (listener) => editor.playback.subscribe(listener),
		},
		preview: {
			isMaskMode: () => isMaskMode,
			isSmartGuidesEnabled: () => smartGuides,
			onSnapLinesChange,
		},
	};
	const depsRef = useCommittedRef(deps) as PreviewInteractionDepsRef;
	const [controller] = useState(
		() => new PreviewInteractionController({ depsRef }),
	);

	const [, rerender] = useReducer((n: number) => n + 1, 0);
	useEffect(
		() => controller.subscribe({ listener: rerender }),
		[controller],
	);

	useEffect(() => {
		if (!controller.isDragging) return;
		return registerCanceller({ fn: () => controller.cancel() });
	}, [controller.isDragging, controller]);

	useEffect(() => () => controller.destroy(), [controller]);

	const textEditRequest = usePreviewStore((state) => state.textEditRequest);
	useEffect(() => {
		if (!textEditRequest) return;
		controller.startTextEdit(textEditRequest);
		usePreviewStore.getState().clearTextEditRequest();
	}, [textEditRequest, controller]);

	return {
		onPointerDown: controller.onPointerDown,
		onPointerMove: controller.onPointerMove,
		onPointerUp: controller.onPointerUp,
		onDoubleClick: controller.onDoubleClick,
		editingText: controller.editingText,
		marquee: controller.marquee,
		nudgeSelection: controller.nudgeSelection.bind(controller),
		getMeasureGuides: controller.getMeasureGuides.bind(controller),
		commitTextEdit: controller.commitTextEdit,
	};
}
