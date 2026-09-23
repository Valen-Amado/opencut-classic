import { z } from "zod";
import type { TimelineElement, TimelineTrack } from "@/timeline";
import { jsonResult, registerAgentTool } from "../registry";
import { defineTool } from "../types";
import {
	getEditor,
	listTracks,
	requireActiveProject,
	roundSeconds,
	toSeconds,
} from "./helpers";

const emptyInput = z.object({});

/**
 * Timeline elements carry buffers, animation curves and mask geometry that the
 * agent cannot act on and that would dominate the payload. Keep the fields that
 * identify a clip and place it in time.
 */
function serializeElement({ element }: { element: TimelineElement }) {
	const startSeconds = toSeconds({ time: element.startTime });
	const durationSeconds = toSeconds({ time: element.duration });

	return {
		id: element.id,
		type: element.type,
		name: element.name,
		startSeconds: roundSeconds({ seconds: startSeconds }),
		durationSeconds: roundSeconds({ seconds: durationSeconds }),
		endSeconds: roundSeconds({ seconds: startSeconds + durationSeconds }),
		trimStartSeconds: roundSeconds({
			seconds: toSeconds({ time: element.trimStart }),
		}),
		trimEndSeconds: roundSeconds({
			seconds: toSeconds({ time: element.trimEnd }),
		}),
		...("mediaId" in element ? { mediaId: element.mediaId } : {}),
		...("hidden" in element && element.hidden ? { hidden: true } : {}),
		...("retime" in element && element.retime
			? { speed: element.retime.rate }
			: {}),
		...("effects" in element && element.effects?.length
			? { effects: element.effects.map((effect) => effect.type) }
			: {}),
		...("masks" in element && element.masks?.length
			? { maskCount: element.masks.length }
			: {}),
		params: element.params,
	};
}

function serializeTrack({ track }: { track: TimelineTrack }) {
	return {
		id: track.id,
		type: track.type,
		name: track.name,
		...("muted" in track ? { muted: track.muted } : {}),
		...("hidden" in track ? { hidden: track.hidden } : {}),
		elements: track.elements.map((element) => serializeElement({ element })),
	};
}

const getProjectInfo = defineTool({
	name: "get_project_info",
	description:
		"Project name, canvas size, frame rate, background and total duration. Call this first to learn the aspect ratio you are editing for.",
	inputSchema: emptyInput,
	handler: () => {
		const editor = getEditor();
		const project = requireActiveProject();
		const { canvasSize, fps, background } = project.settings;
		const scenes = editor.scenes.getScenes();

		return jsonResult({
			value: {
				id: project.metadata.id,
				name: project.metadata.name,
				canvas: {
					width: canvasSize.width,
					height: canvasSize.height,
					aspectRatio: describeAspectRatio({
						width: canvasSize.width,
						height: canvasSize.height,
					}),
				},
				fps,
				background,
				totalDurationSeconds: roundSeconds({
					seconds: toSeconds({ time: editor.timeline.getTotalDuration() }),
				}),
				scenes: scenes.map((scene) => ({ id: scene.id, name: scene.name })),
				activeSceneId: project.currentSceneId,
			},
		});
	},
});

const getTimeline = defineTool({
	name: "get_timeline",
	description:
		"Every track and clip in the active scene with ids, times in seconds, effects and speed. Use the returned ids with the editing tools.",
	inputSchema: emptyInput,
	handler: () => {
		const editor = getEditor();
		return jsonResult({
			value: {
				totalDurationSeconds: roundSeconds({
					seconds: toSeconds({ time: editor.timeline.getTotalDuration() }),
				}),
				tracks: listTracks().map((track) => serializeTrack({ track })),
			},
		});
	},
});

const listMedia = defineTool({
	name: "list_media",
	description:
		"Media assets imported into the project, with the ids that add_clip expects.",
	inputSchema: emptyInput,
	handler: () => {
		const assets = getEditor().media.getAssets();
		return jsonResult({
			value: {
				assets: assets.map((asset) => ({
					id: asset.id,
					name: asset.name,
					type: asset.type,
					width: asset.width,
					height: asset.height,
					durationSeconds:
						asset.duration === undefined
							? undefined
							: roundSeconds({ seconds: asset.duration }),
					fps: asset.fps,
					hasAudio: asset.hasAudio,
				})),
			},
		});
	},
});

const getSelection = defineTool({
	name: "get_selection",
	description: "Which elements are currently selected in the editor.",
	inputSchema: emptyInput,
	handler: () => {
		const selected = getEditor().selection.getSelectedElements();
		return jsonResult({
			value: {
				elements: selected.map((ref) => ({
					elementId: ref.elementId,
					trackId: ref.trackId,
				})),
			},
		});
	},
});

/** Name the common social formats; fall back to the reduced ratio. */
function describeAspectRatio({
	width,
	height,
}: {
	width: number;
	height: number;
}): string {
	const divisor = greatestCommonDivisor({ a: width, b: height });
	return `${width / divisor}:${height / divisor}`;
}

function greatestCommonDivisor({ a, b }: { a: number; b: number }): number {
	return b === 0 ? a : greatestCommonDivisor({ a: b, b: a % b });
}

export function registerReadTools(): void {
	for (const tool of [getProjectInfo, getTimeline, listMedia, getSelection]) {
		registerAgentTool({ tool });
	}
}
