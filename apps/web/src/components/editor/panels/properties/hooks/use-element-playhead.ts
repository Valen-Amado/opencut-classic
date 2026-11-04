import { useEditor } from "@/editor/use-editor";
import { resolveElementPlayhead } from "@/components/editor/panels/properties/param-write";
import type { MediaTime } from "@/wasm";

export function useElementPlayhead({
	startTime,
	duration,
}: {
	startTime: MediaTime;
	duration: MediaTime;
}) {
	const playheadTime = useEditor((editor) => editor.playback.getCurrentTime());
	return resolveElementPlayhead({ startTime, duration, playheadTime });
}
