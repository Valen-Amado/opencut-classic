"use client";

import { usePreviewViewport } from "@/preview/components/preview-viewport";
import { getVisibleElementsWithBounds } from "@/preview/element-bounds";
import { getGroupRect, type CanvasRect } from "@/preview/multi-select";
import { useEditor } from "@/editor/use-editor";

/**
 * Multi-selection feedback on the canvas: an outline on each selected
 * element, a dashed box around the group with its count, and the selection
 * marquee while dragging one out. Single selections keep their handles.
 */
export function SelectionGroupOverlay({ marquee }: { marquee: CanvasRect | null }) {
	const viewport = usePreviewViewport();
	const [selected, tracks, currentTime, mediaAssets, canvasSize] = useEditor(
		(e) =>
			[
				e.selection.getSelectedElements(),
				e.timeline.getPreviewTracks() ?? e.scenes.getActiveSceneOrNull()?.tracks ?? null,
				e.playback.getCurrentTime(),
				e.media.getAssets(),
				e.project.getActive().settings.canvasSize,
			] as const,
	);

	const items =
		selected.length > 1 && tracks
			? getVisibleElementsWithBounds({ tracks, currentTime, canvasSize, mediaAssets }).filter(
					(item) =>
						selected.some(
							(ref) => ref.trackId === item.trackId && ref.elementId === item.elementId,
						),
				)
			: [];
	const group = items.length > 1 ? getGroupRect({ items }) : null;
	if (!group && !marquee) return null;

	const { x: scale } = viewport.getDisplayScale();
	const toOverlayRect = (rect: CanvasRect) => {
		const topLeft = viewport.canvasToOverlay({ canvasX: rect.left, canvasY: rect.top });
		return {
			left: topLeft.x,
			top: topLeft.y,
			width: (rect.right - rect.left) * scale,
			height: (rect.bottom - rect.top) * scale,
		};
	};

	return (
		<div className="pointer-events-none absolute inset-0" aria-hidden>
			{items.map((item) => {
				const center = viewport.canvasToOverlay({ canvasX: item.bounds.cx, canvasY: item.bounds.cy });
				return (
					<div
						key={`${item.trackId}:${item.elementId}`}
						className="border-primary absolute border"
						style={{
							left: center.x,
							top: center.y,
							width: Math.abs(item.bounds.width) * scale,
							height: Math.abs(item.bounds.height) * scale,
							transform: `translate(-50%, -50%) rotate(${item.bounds.rotation}deg)`,
						}}
					/>
				);
			})}
			{group && (
				<div
					className="border-primary/80 absolute border border-dashed"
					style={toOverlayRect({
						left: group.left,
						top: group.top,
						right: group.right,
						bottom: group.bottom,
					})}
				>
					<span className="bg-primary text-primary-foreground absolute -top-6 left-0 rounded-sm px-1.5 text-[11px] leading-5 whitespace-nowrap">
						{items.length} elementos
					</span>
				</div>
			)}
			{marquee && (
				<div
					className="border-primary bg-primary/10 absolute border"
					style={toOverlayRect(marquee)}
				/>
			)}
		</div>
	);
}
