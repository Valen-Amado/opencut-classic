import { mediaTime, TICKS_PER_SECOND, type MediaTime } from "@/wasm";
import { getTimelinePixelsPerSecond } from "./pixel-utils";

/**
 * Timeline time (ticks) under the pointer for skimming, snapped to a frame
 * and clamped to the timeline. `offsetX` is the pointer's x inside the
 * timeline content (container x + horizontal scroll).
 */
export function getSkimTime({
	offsetX,
	zoomLevel,
	ticksPerFrame,
	duration,
}: {
	offsetX: number;
	zoomLevel: number;
	ticksPerFrame: number;
	duration: number;
}): MediaTime {
	const seconds = Math.max(0, offsetX) / getTimelinePixelsPerSecond({ zoomLevel });
	const frame = Math.round((seconds * TICKS_PER_SECOND) / ticksPerFrame);
	return mediaTime({ ticks: Math.min(Math.max(0, duration), frame * ticksPerFrame) });
}
