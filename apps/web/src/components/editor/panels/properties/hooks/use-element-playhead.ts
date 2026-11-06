import { useEditor } from "@/editor/use-editor";
import { resolveElementPlayhead } from "@/components/editor/panels/properties/param-write";
import type { ElementAnimations } from "@/animation/types";
import type { MediaTime } from "@/wasm";

export function useElementPlayhead({
	startTime,
	duration,
	animations,
}: {
	startTime: MediaTime;
	duration: MediaTime;
	animations: ElementAnimations | undefined;
}) {
	const editor = useEditor();
	const playheadTime = useEditor((current) => current.playback.getCurrentTime());
	return resolveElementPlayhead({
		startTime,
		duration,
		playheadTime,
		animations,
		fps: editor.project.getActive().settings.fps,
	});
}
