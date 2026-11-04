import type { MediaAsset } from "@/media/types";
import { getSourceSpanAtClipTime, getTimelineDurationForSourceSpan } from "@/retime";
import type { ImageElement, TimelineElement, UploadAudioElement, VideoElement } from "@/timeline";
import { toElementDurationTicks } from "@/timeline/creation";
import { ZERO_MEDIA_TIME, roundMediaTime, type MediaTime } from "@/wasm";

type MediaElement = UploadAudioElement | VideoElement | ImageElement;

/** Visual clips swap freely between image and video; audio stays audio. */
export function canReplaceMedia({
	element,
	mediaType,
}: {
	element: MediaElement;
	mediaType: MediaAsset["type"];
}): boolean {
	return element.type === "audio" ? mediaType === "audio" : mediaType !== "audio";
}

export function getReplaceMediaAccept({ element }: { element: MediaElement }): string {
	return element.type === "audio" ? "audio/*" : "image/*,video/*";
}

/**
 * Points a clip at another file. Everything applied to the clip stays; the new
 * file plays from its start, and a clip longer than the file shortens to fit.
 */
export function buildMediaReplacementPatch({
	element,
	asset,
}: {
	element: MediaElement;
	asset: Pick<MediaAsset, "id" | "name" | "type" | "duration">;
}): Partial<TimelineElement> {
	const shared = {
		mediaId: asset.id,
		name: asset.name,
		trimStart: ZERO_MEDIA_TIME,
	};

	if (asset.type === "image") {
		return {
			...shared,
			type: "image",
			trimEnd: ZERO_MEDIA_TIME,
			sourceDuration: undefined,
			isSourceAudioEnabled: undefined,
			...("retime" in element && { retime: undefined }),
		} as Partial<TimelineElement>;
	}

	const retime = "retime" in element ? element.retime : undefined;
	const sourceDuration =
		asset.duration == null
			? element.duration
			: toElementDurationTicks({ seconds: asset.duration });
	const duration = Math.min(
		element.duration,
		roundMediaTime({
			time: getTimelineDurationForSourceSpan({ sourceSpan: sourceDuration, retime }),
		}),
	) as MediaTime;
	const usedSourceSpan = getSourceSpanAtClipTime({ clipTime: duration, retime });

	return {
		...shared,
		type: asset.type,
		duration,
		sourceDuration,
		trimEnd: roundMediaTime({ time: Math.max(0, sourceDuration - usedSourceSpan) }),
		...(asset.type === "video" && {
			isSourceAudioEnabled:
				element.type === "video" ? element.isSourceAudioEnabled : true,
		}),
		...(element.type === "audio" && { buffer: undefined }),
	} as Partial<TimelineElement>;
}
