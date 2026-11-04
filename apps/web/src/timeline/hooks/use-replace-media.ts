import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { getMediaTypeFromFile } from "@/media/media-utils";
import { processMediaAssets } from "@/media/processing";
import { showMediaUploadToast } from "@/media/upload-toast";
import type { UploadAudioElement, ImageElement, VideoElement } from "@/timeline";
import { hasMediaId } from "@/timeline/element-utils";
import {
	buildMediaReplacementPatch,
	canReplaceMedia,
	getReplaceMediaAccept,
} from "@/timeline/replace-media";

function pickFile({ accept }: { accept: string }): Promise<File | null> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = accept;
		input.onchange = () => resolve(input.files?.[0] ?? null);
		input.oncancel = () => resolve(null);
		input.click();
	});
}

export function useReplaceMedia() {
	const editor = useEditor();

	const replaceMedia = async ({
		trackId,
		element,
	}: {
		trackId: string;
		element: UploadAudioElement | VideoElement | ImageElement;
	}) => {
		const file = await pickFile({ accept: getReplaceMediaAccept({ element }) });
		if (!file) return;

		const mediaType = getMediaTypeFromFile({ file });
		if (!mediaType || !canReplaceMedia({ element, mediaType })) {
			toast.error(
				element.type === "audio"
					? "Un clip de audio solo se puede reemplazar por otro audio"
					: "Una imagen o video solo se puede reemplazar por otra imagen o video",
			);
			return;
		}

		const projectId = editor.project.getActive().metadata.id;
		await showMediaUploadToast({
			filesCount: 1,
			promise: async () => {
				const [processed] = await processMediaAssets({ files: [file] });
				const asset = processed
					? await editor.media.addMediaAsset({ projectId, asset: processed })
					: null;
				// The clip may have changed or been deleted while the file processed.
				const current = editor.timeline.getElementsWithTracks({
					elements: [{ trackId, elementId: element.id }],
				})[0]?.element;
				if (asset && current && hasMediaId(current)) {
					editor.timeline.updateElements({
						updates: [
							{
								trackId,
								elementId: element.id,
								patch: buildMediaReplacementPatch({ element: current, asset }),
							},
						],
					});
				}
				return {
					uploadedCount: asset ? 1 : 0,
					assetNames: asset ? [asset.name] : [],
				};
			},
		});
	};

	return { replaceMedia };
}
