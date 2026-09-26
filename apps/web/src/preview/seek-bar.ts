import type { SceneTracks, VideoTrack, OverlayTrack } from "@/timeline";
import { getSourceTimeAtClipTime } from "@/retime";
import { clampSourceTime } from "@/timeline/filmstrip";
import { TICKS_PER_SECOND } from "@/wasm";

export const SEEK_KEY_STEP_SECONDS = 1;
export const SEEK_KEY_LARGE_STEP_SECONDS = 5;

export type SeekFrameSource =
	| { kind: "video"; mediaId: string; sourceTimeSec: number }
	| { kind: "image"; mediaId: string };

export function clampRatio({ value }: { value: number }): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

/** Position of a pointer along the seek track, 0 (start) to 1 (end). */
export function getSeekRatioAtPointer({
	clientX,
	trackLeft,
	trackWidth,
}: {
	clientX: number;
	trackLeft: number;
	trackWidth: number;
}): number {
	if (trackWidth <= 0) return 0;
	return clampRatio({ value: (clientX - trackLeft) / trackWidth });
}

export function getProgressRatio({
	time,
	duration,
}: {
	time: number;
	duration: number;
}): number {
	if (duration <= 0) return 0;
	return clampRatio({ value: time / duration });
}

/** Target time (ticks) for arrow-key seeking: 1 s per press, 5 s with Shift. */
export function getKeyboardSeekTime({
	key,
	shiftKey,
	currentTime,
	duration,
}: {
	key: string;
	shiftKey: boolean;
	currentTime: number;
	duration: number;
}): number | null {
	const direction = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
	if (direction === 0) return null;
	const stepSeconds = shiftKey
		? SEEK_KEY_LARGE_STEP_SECONDS
		: SEEK_KEY_STEP_SECONDS;
	const target = currentTime + direction * stepSeconds * TICKS_PER_SECOND;
	return Math.min(Math.max(0, duration), Math.max(0, target));
}

/** Keeps the hover tooltip inside the seek bar. */
export function getTooltipLeft({
	pointerX,
	containerWidth,
	halfTooltipWidth,
}: {
	pointerX: number;
	containerWidth: number;
	halfTooltipWidth: number;
}): number {
	if (containerWidth <= halfTooltipWidth * 2) return containerWidth / 2;
	return Math.min(
		containerWidth - halfTooltipWidth,
		Math.max(halfTooltipWidth, pointerX),
	);
}

function isTrackHidden({
	track,
}: {
	track: VideoTrack | OverlayTrack;
}): boolean {
	return "hidden" in track && track.hidden;
}

/**
 * The media frame visible at a timeline time (ticks): the top-most visible
 * video clip, or else the top-most image. Video clips resolve to the source
 * time that plays there, respecting trim and speed.
 */
export function findFrameSourceAtTime({
	tracks,
	time,
	sourceDurations,
}: {
	tracks: SceneTracks;
	time: number;
	sourceDurations?: ReadonlyMap<string, number>;
}): SeekFrameSource | null {
	let image: SeekFrameSource | null = null;
	const topToBottom = [...tracks.overlay, tracks.main];

	for (const track of topToBottom) {
		if (track.type !== "video" || isTrackHidden({ track })) continue;
		for (const element of track.elements) {
			if (element.hidden) continue;
			const start = element.startTime;
			const end = element.startTime + element.duration;
			if (time < start || time >= end) continue;

			if (element.type === "image") {
				image ??= { kind: "image", mediaId: element.mediaId };
				continue;
			}

			const clipTimeSec = (time - start) / TICKS_PER_SECOND;
			return {
				kind: "video",
				mediaId: element.mediaId,
				sourceTimeSec: clampSourceTime({
					time:
						element.trimStart / TICKS_PER_SECOND +
						getSourceTimeAtClipTime({
							clipTime: clipTimeSec,
							retime: element.retime,
						}),
					sourceDurationSec: sourceDurations?.get(element.mediaId),
				}),
			};
		}
	}

	return image;
}
