"use client";

import { useScrollPosition } from "@/timeline/hooks/use-scroll-position";
import { useTimelineStore } from "@/timeline/timeline-store";
import { timelineTimeToSnappedPixels } from "@/timeline";
import { useEditor } from "@/editor/use-editor";
import { mediaTimeToSeconds } from "@/wasm";
import { TIMELINE_LAYERS } from "./layers";

function formatSkimTime({ seconds, fps }: { seconds: number; fps: number }): string {
	const frames = Math.round(seconds * fps);
	const whole = Math.floor(frames / fps);
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${pad(Math.floor(whole / 60))}:${pad(whole % 60)}:${pad(frames % fps)}`;
}

/** Secondary line that follows the pointer while skimming the timeline. */
export function TimelineSkimLine({
	zoomLevel,
	tracksScrollRef,
}: {
	zoomLevel: number;
	tracksScrollRef: React.RefObject<HTMLDivElement | null>;
}) {
	const skimTime = useTimelineStore((state) => state.skimTime);
	const fps = useEditor((editor) => {
		const rate = editor.project.getActive().settings.fps;
		return rate.numerator / rate.denominator;
	});
	const { scrollLeft } = useScrollPosition({ scrollRef: tracksScrollRef });
	if (skimTime === null) return null;

	const left = timelineTimeToSnappedPixels({ time: skimTime, zoomLevel }) - scrollLeft;
	const label = formatSkimTime({
		seconds: mediaTimeToSeconds({ time: skimTime }),
		fps: Math.round(fps),
	});

	return (
		<div
			aria-hidden
			className="pointer-events-none absolute top-0 bottom-0"
			style={{ left: `${left}px`, zIndex: TIMELINE_LAYERS.playhead }}
		>
			<div className="absolute top-0 bottom-0 left-0 w-px bg-orange-400/90" />
			<span className="absolute top-0.5 left-1.5 rounded-sm bg-orange-400 px-1 font-mono text-[10px] leading-4 text-black tabular-nums">
				{label}
			</span>
		</div>
	);
}
