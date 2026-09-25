import { useState } from "react";
import { usePreviewViewport } from "@/preview/components/preview-viewport";
import { usePreviewInteraction } from "@/preview/hooks/use-preview-interaction";
import type { SnapLine, SpacingGuide } from "@/preview/preview-snap";
import { useAltKeyHeld } from "@/hooks/use-modifier-keys";
import { TransformHandles } from "./transform-handles";
import { MaskHandles } from "./mask-handles";
import { SnapGuides } from "./snap-guides";
import { TextEditOverlay } from "./text-edit-overlay";
import { usePropertiesStore } from "@/components/editor/panels/properties/stores/properties-store";
import { useEditor } from "@/editor/use-editor";

export function PreviewInteractionOverlay() {
	const [snapLines, setSnapLines] = useState<SnapLine[]>([]);
	const [spacingGuides, setSpacingGuides] = useState<SpacingGuide[]>([]);
	const [measureGuides, setMeasureGuides] = useState<SpacingGuide[]>([]);
	const isAltHeld = useAltKeyHeld();
	const [lastPointer, setLastPointer] = useState<{ clientX: number; clientY: number } | null>(null);
	// OnSnapLinesChange callback signature: (lines, spacing?)
	// eslint-disable-next-line opencut/prefer-object-params
	const handleSnapChange = (lines: SnapLine[], spacing: SpacingGuide[] = []) => {
		setSnapLines(lines);
		setSpacingGuides(spacing);
	};
	const editor = useEditor();
	const viewport = usePreviewViewport();
	const selectedElements = useEditor((e) => e.selection.getSelectedElements());
	const activeTabPerType = usePropertiesStore((s) => s.activeTabPerType);

	const selectedRef =
		selectedElements.length === 1 ? selectedElements[0] : null;
	const activeTrack = selectedRef
		? editor.timeline.getTrackById({ trackId: selectedRef.trackId })
		: null;
	const activeElement =
		activeTrack?.elements.find(
			(element) => element.id === selectedRef?.elementId,
		) ?? null;
	const isMaskMode = activeElement
		? activeTabPerType[activeElement.type] === "masks"
		: false;

	const {
		onPointerDown,
		onPointerMove,
		onPointerUp,
		onDoubleClick,
		editingText,
		commitTextEdit,
		getMeasureGuides,
	} = usePreviewInteraction({
		onSnapLinesChange: handleSnapChange,
		isMaskMode,
	});

	const [wasAltHeld, setWasAltHeld] = useState(false);
	if (isAltHeld !== wasAltHeld) {
		setWasAltHeld(isAltHeld);
		setMeasureGuides(isAltHeld && lastPointer ? getMeasureGuides(lastPointer) : []);
	}

	const handlePointerDown = (event: React.PointerEvent) => {
		if (viewport.handlePanPointerDown({ event })) {
			return;
		}

		onPointerDown(event);
	};

	const handlePointerMove = (event: React.PointerEvent) => {
		if (viewport.handlePanPointerMove({ event })) {
			return;
		}

		onPointerMove(event);
		const pointer = { clientX: event.clientX, clientY: event.clientY };
		setLastPointer(pointer);
		if (isAltHeld) setMeasureGuides(getMeasureGuides(pointer));
	};

	const handlePointerUp = (event: React.PointerEvent) => {
		if (viewport.handlePanPointerUp({ event })) {
			return;
		}

		onPointerUp(event);
	};

	return (
		<div className="absolute inset-0">
			<div
				className="absolute inset-0 pointer-events-auto"
				role="application"
				aria-label="Lienzo de vista previa"
				style={{
					cursor: viewport.isPanning
						? "grabbing"
						: viewport.isSpacePanReady
							? "grab"
							: viewport.canPan
							? "default"
							: undefined,
				}}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerUp}
				onPointerLeave={() => setMeasureGuides([])}
				onDoubleClick={onDoubleClick}
				onDragStart={(e) => e.preventDefault()}
			/>
			{editingText ? (
				<TextEditOverlay
					trackId={editingText.trackId}
					elementId={editingText.elementId}
					element={editingText.element}
					onCommit={commitTextEdit}
				/>
			) : isMaskMode ? (
				<MaskHandles onSnapLinesChange={handleSnapChange} />
			) : (
				<TransformHandles onSnapLinesChange={handleSnapChange} />
			)}
			<SnapGuides
				lines={snapLines}
				spacing={isAltHeld && measureGuides.length > 0 ? measureGuides : spacingGuides}
			/>
		</div>
	);
}
