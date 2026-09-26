import { useEffect, useSyncExternalStore } from "react";
import { frameThumbnails } from "@/services/frame-thumbnails/service";

const getServerSnapshot = () => null;

/**
 * Returns the cached thumbnail URL for a video frame, requesting it lazily
 * while the caller is mounted. Returns null until it is ready.
 */
export function useFrameThumbnail({
	mediaId,
	file,
	time,
	enabled = true,
}: {
	mediaId: string | null;
	file: File | null;
	time: number;
	enabled?: boolean;
}): string | null {
	const url = useSyncExternalStore(
		frameThumbnails.subscribe,
		() =>
			mediaId ? frameThumbnails.getThumbnailUrl({ mediaId, time }) : null,
		getServerSnapshot,
	);

	useEffect(() => {
		if (!enabled || !mediaId || !file || url) return;
		return frameThumbnails.requestThumbnail({ mediaId, file, time });
	}, [enabled, file, mediaId, time, url]);

	return url;
}
