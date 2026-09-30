import { mediaTime, snapSeekMediaTime, TICKS_PER_SECOND, type MediaTime } from "@/wasm";
import type { FrameRate } from "opencut-wasm";
import { getTimelinePixelsPerSecond } from "./pixel-utils";

/**
 * Timeline time under the pointer for skimming. Uses the same frame snapping
 * as clicking the timeline, so the skim line shows exactly the frame a click
 * there would seek to. `offsetX` is the pointer's x inside the timeline
 * content (container x + horizontal scroll).
 */
export function getSkimTime({
	offsetX,
	zoomLevel,
	fps,
	duration,
}: {
	offsetX: number;
	zoomLevel: number;
	fps: FrameRate;
	duration: MediaTime;
}): MediaTime {
	const seconds = Math.max(0, offsetX) / getTimelinePixelsPerSecond({ zoomLevel });
	const raw = mediaTime({
		ticks: Math.min(Math.max(0, duration), Math.round(seconds * TICKS_PER_SECOND)),
	});
	return snapSeekMediaTime({ time: raw, duration, fps });
}
