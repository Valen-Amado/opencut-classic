import { useState } from "react";
import { usePreviewViewport } from "@/preview/components/preview-viewport";
import { usePreviewInteraction } from "@/preview/hooks/use-preview-interaction";
import type { SnapLine, SpacingGuide } from "@/preview/preview-snap";
import { useAltKeyHeld } from "@/hooks/use-modifier-keys";
import { TransformHandles } from "./transform-handles";
import { MaskHandles } from "./mask-handles";
import { SnapGuides } from "./snap-guides";
import { TextEditOverlay } from "./text-edit-overlay";
import { SelectionGroupOverlay } from "./selection-group-overlay";
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
		marquee,
		nudgeSelection,
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
		// Focus the canvas so arrow keys move the selection.
		if (event.currentTarget instanceof HTMLElement) {
			event.currentTarget.focus({ preventScroll: true });
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
			{/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the canvas is a spatial editing surface (role=application): it takes focus so arrow keys move the selection. */}
			<div
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
				// eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so arrow keys can move the selection
				tabIndex={0}
				data-canvas-keyboard=""
				className="absolute inset-0 pointer-events-auto outline-none"
				onKeyDown={(event) => {
					const step = event.shiftKey ? 10 : 1;
					const offsets: Record<string, [number, number]> = {
						ArrowLeft: [-step, 0],
						ArrowRight: [step, 0],
						ArrowUp: [0, -step],
						ArrowDown: [0, step],
					};
					const offset = offsets[event.key];
					if (!offset || event.metaKey || event.ctrlKey || event.altKey) return;
					if (nudgeSelection({ dx: offset[0], dy: offset[1] })) {
						event.preventDefault();
					}
				}}
			/>
			<SelectionGroupOverlay marquee={marquee} />
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
