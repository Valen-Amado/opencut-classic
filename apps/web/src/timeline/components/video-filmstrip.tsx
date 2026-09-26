"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useResizeObserver } from "@/hooks/use-resize-observer";
import { useFrameThumbnail } from "@/media/use-frame-thumbnail";
import { getFilmstripTiles } from "@/timeline/filmstrip";
import { findScrollParent } from "@/utils/browser";

/** Visible range is snapped to this many pixels so scrolling re-renders rarely. */
const VISIBLE_RANGE_SNAP_PX = 64;

interface VisibleRange {
	startPx: number;
	endPx: number;
	widthPx: number;
}

function measureVisibleRange({
	container,
	scrollParent,
}: {
	container: HTMLElement;
	scrollParent: HTMLElement | null;
}): VisibleRange {
	const rect = container.getBoundingClientRect();
	const viewLeft = scrollParent
		? scrollParent.getBoundingClientRect().left
		: 0;
	const viewRight = scrollParent
		? scrollParent.getBoundingClientRect().right
		: window.innerWidth;
	const start = Math.max(0, viewLeft - rect.left);
	const end = Math.min(rect.width, viewRight - rect.left);
	return {
		startPx:
			Math.floor(start / VISIBLE_RANGE_SNAP_PX) * VISIBLE_RANGE_SNAP_PX,
		endPx: Math.ceil(end / VISIBLE_RANGE_SNAP_PX) * VISIBLE_RANGE_SNAP_PX,
		widthPx: Math.round(rect.width),
	};
}

/**
 * Timeline filmstrip for a video clip: every tile shows the source frame at
 * the time where the tile starts on the clip. Only visible tiles decode
 * frames; the clip's single thumbnail stays underneath as a placeholder.
 */
export function VideoFilmstrip({
	mediaId,
	file,
	placeholderUrl,
	tileWidthPx,
	trackHeight,
	pixelsPerSecond,
	trimStartSec,
	playbackRate,
	sourceDurationSec,
}: {
	mediaId: string;
	file: File | null;
	placeholderUrl?: string;
	tileWidthPx: number;
	trackHeight: number;
	pixelsPerSecond: number;
	trimStartSec: number;
	playbackRate: number;
	sourceDurationSec?: number;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const scrollParentRef = useRef<HTMLElement | null>(null);
	const [visibleRange, setVisibleRange] = useState<VisibleRange | null>(null);

	const updateVisibleRange = useCallback(() => {
		const container = containerRef.current;
		if (!container) return;
		const next = measureVisibleRange({
			container,
			scrollParent: scrollParentRef.current,
		});
		setVisibleRange((previous) =>
			previous &&
			previous.startPx === next.startPx &&
			previous.endPx === next.endPx &&
			previous.widthPx === next.widthPx
				? previous
				: next,
		);
	}, []);

	useResizeObserver({ ref: containerRef, onResize: updateVisibleRange });

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const scrollParent = findScrollParent({ element: container });
		scrollParentRef.current = scrollParent;
		if (!scrollParent) return;
		scrollParent.addEventListener("scroll", updateVisibleRange, {
			passive: true,
		});
		return () =>
			scrollParent.removeEventListener("scroll", updateVisibleRange);
	}, [updateVisibleRange]);

	const tiles = visibleRange
		? getFilmstripTiles({
				clipWidthPx: visibleRange.widthPx,
				tileWidthPx,
				pixelsPerSecond,
				trimStartSec,
				playbackRate,
				sourceDurationSec,
				visibleStartPx: visibleRange.startPx,
				visibleEndPx: visibleRange.endPx,
			})
		: [];

	return (
		<div
			ref={containerRef}
			className="pointer-events-none absolute inset-0"
			style={{
				backgroundColor: "var(--muted)",
				backgroundImage: placeholderUrl ? `url(${placeholderUrl})` : undefined,
				backgroundRepeat: "repeat-x",
				backgroundSize: `${tileWidthPx}px ${trackHeight}px`,
				backgroundPosition: "left center",
			}}
		>
			{tiles.map((tile) => (
				<FilmstripTile
					key={tile.index}
					mediaId={mediaId}
					file={file}
					time={tile.sourceTimeSec}
					leftPx={tile.leftPx}
					widthPx={tile.widthPx}
					tileWidthPx={tileWidthPx}
				/>
			))}
		</div>
	);
}

function FilmstripTile({
	mediaId,
	file,
	time,
	leftPx,
	widthPx,
	tileWidthPx,
}: {
	mediaId: string;
	file: File | null;
	time: number;
	leftPx: number;
	widthPx: number;
	tileWidthPx: number;
}) {
	const url = useFrameThumbnail({ mediaId, file, time });
	if (!url) return null;

	return (
		<div
			className="absolute inset-y-0 border-r border-black/35"
			style={{
				left: `${leftPx}px`,
				width: `${widthPx}px`,
				backgroundImage: `url(${url})`,
				backgroundSize: `${tileWidthPx}px 100%`,
				backgroundPosition: "left center",
				backgroundRepeat: "no-repeat",
			}}
		/>
	);
}
