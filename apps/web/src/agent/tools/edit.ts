import { z } from "zod";
import { AddMediaAssetCommand } from "@/commands/media";
import { UpdateProjectSettingsCommand } from "@/commands/project";
import { BatchCommand } from "@/commands";
import { effectsRegistry } from "@/effects";
import { processMediaAssets } from "@/media/processing";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { toElementDurationTicks } from "@/timeline/creation";
import { DEFAULTS } from "@/timeline/defaults";
import type { TrackType } from "@/timeline";
import type { ParamValues } from "@/params";
import type { TCanvasSize } from "@/project/types";
import { jsonResult, registerAgentTool, textResult } from "../registry";
import { AgentToolError, defineTool } from "../types";
import {
	getEditor,
	listTracks,
	requireActiveProject,
	requireElement,
	requireTrack,
	roundSeconds,
	toMediaTime,
	toSeconds,
} from "./helpers";

/**
 * The aspect ratios the brief targets. 4:5 is not one of the editor's built-in
 * presets, so it is applied as a custom canvas size.
 */
const CANVAS_PRESETS: Record<string, TCanvasSize> = {
	"16:9": { width: 1920, height: 1080 },
	"9:16": { width: 1080, height: 1920 },
	"1:1": { width: 1080, height: 1080 },
	"4:5": { width: 1080, height: 1350 },
};

const BUILT_IN_RATIOS = new Set(["16:9", "9:16", "1:1"]);

const importMedia = defineTool({
	name: "import_media",
	description:
		"Import a video, image or audio file into the project library. Pass `url` for a remote file, or `dataBase64` with `filename` for local bytes (the MCP server turns a local path into these). Returns the media id for add_clip.",
	inputSchema: z
		.object({
			url: z.string().optional(),
			dataBase64: z.string().optional(),
			filename: z.string().optional(),
		})
		.refine((value) => Boolean(value.url) !== Boolean(value.dataBase64), {
			message: "Pass exactly one of `url` or `dataBase64`",
		}),
	handler: async ({ input }) => {
		const editor = getEditor();
		const project = requireActiveProject();
		const file = input.url
			? await fileFromUrl({ url: input.url, filename: input.filename })
			: fileFromBase64({
					dataBase64: input.dataBase64 ?? "",
					filename: input.filename ?? "import",
				});

		const processed = await processMediaAssets({ files: [file] });
		if (processed.length === 0) {
			throw new AgentToolError(
				`"${file.name}" was rejected: unsupported file type, or not enough browser storage.`,
			);
		}

		const commands = processed.map(
			(asset) =>
				new AddMediaAssetCommand({
					projectId: project.metadata.id,
					asset,
				}),
		);
		editor.command.execute({
			command: commands.length === 1 ? commands[0] : new BatchCommand(commands),
		});

		// AddMediaAssetCommand appends, so the new assets are the last ones.
		const imported = editor.media.getAssets().slice(-processed.length);

		return jsonResult({
			value: {
				imported: imported.map((asset) => ({
					id: asset.id,
					name: asset.name,
					type: asset.type,
					durationSeconds: asset.duration,
				})),
			},
		});
	},
});

const addClip = defineTool({
	name: "add_clip",
	description:
		"Place an imported media asset on the timeline. Defaults to the end of the timeline and the track type that matches the media.",
	inputSchema: z.object({
		mediaId: z.string(),
		startSeconds: z.number().min(0).optional(),
		trackId: z.string().optional(),
		durationSeconds: z.number().positive().optional(),
	}),
	handler: ({ input }) => {
		const editor = getEditor();
		const asset = editor.media
			.getAssets()
			.find((candidate) => candidate.id === input.mediaId);

		if (!asset) {
			const available = editor.media
				.getAssets()
				.map((candidate) => `${candidate.id} (${candidate.name})`)
				.join(", ");
			throw new AgentToolError(
				available
					? `No media asset with id "${input.mediaId}". Imported assets: ${available}`
					: `No media asset with id "${input.mediaId}". Import one with import_media first.`,
			);
		}

		const startTime =
			input.startSeconds === undefined
				? editor.timeline.getTotalDuration()
				: toMediaTime({ seconds: input.startSeconds });

		const element = buildElementFromMedia({
			mediaId: asset.id,
			mediaType: asset.type,
			name: asset.name,
			duration:
				input.durationSeconds === undefined
					? toElementDurationTicks({ seconds: asset.duration })
					: toMediaTime({ seconds: input.durationSeconds }),
			startTime,
		});

		const trackType: TrackType = asset.type === "audio" ? "audio" : "video";
		editor.timeline.insertElement({
			element,
			placement: input.trackId
				? { mode: "explicit", trackId: requireTrack({ trackId: input.trackId }).id }
				: { mode: "auto", trackType },
		});

		return textResult({
			text: `Added "${asset.name}" at ${roundSeconds({
				seconds: toSeconds({ time: startTime }),
			})}s. Call get_timeline for the new element id.`,
		});
	},
});

const addText = defineTool({
	name: "add_text",
	description:
		"Add a text overlay. Position is in canvas units measured from the centre, so 0,0 is the middle of the frame.",
	inputSchema: z.object({
		content: z.string().min(1),
		startSeconds: z.number().min(0).default(0),
		durationSeconds: z.number().positive().default(5),
		fontSize: z.number().positive().optional(),
		color: z.string().optional(),
		positionX: z.number().optional(),
		positionY: z.number().optional(),
		trackId: z.string().optional(),
	}),
	handler: ({ input }) => {
		const editor = getEditor();
		const base = DEFAULTS.text.element;

		editor.timeline.insertElement({
			element: {
				...base,
				name: input.content.slice(0, 40),
				startTime: toMediaTime({ seconds: input.startSeconds }),
				duration: toMediaTime({ seconds: input.durationSeconds }),
				params: {
					...base.params,
					content: input.content,
					...(input.fontSize === undefined ? {} : { fontSize: input.fontSize }),
					...(input.color === undefined ? {} : { color: input.color }),
					...(input.positionX === undefined
						? {}
						: { "transform.positionX": input.positionX }),
					...(input.positionY === undefined
						? {}
						: { "transform.positionY": input.positionY }),
				},
			},
			placement: input.trackId
				? { mode: "explicit", trackId: requireTrack({ trackId: input.trackId }).id }
				: { mode: "auto", trackType: "text" },
		});

		return textResult({
			text: `Added text "${input.content}" at ${input.startSeconds}s for ${input.durationSeconds}s.`,
		});
	},
});

const updateText = defineTool({
	name: "update_text",
	description: "Change the content or styling of an existing text element.",
	inputSchema: z.object({
		elementId: z.string(),
		content: z.string().optional(),
		fontSize: z.number().positive().optional(),
		color: z.string().optional(),
		positionX: z.number().optional(),
		positionY: z.number().optional(),
	}),
	handler: ({ input }) => {
		const { track, element } = requireElement({ elementId: input.elementId });
		if (element.type !== "text") {
			throw new AgentToolError(
				`Element "${input.elementId}" is a ${element.type}, not text. update_text only works on text elements.`,
			);
		}

		const params: ParamValues = { ...element.params };
		let changed = 0;
		if (input.content !== undefined) {
			params.content = input.content;
			changed++;
		}
		if (input.fontSize !== undefined) {
			params.fontSize = input.fontSize;
			changed++;
		}
		if (input.color !== undefined) {
			params.color = input.color;
			changed++;
		}
		if (input.positionX !== undefined) {
			params["transform.positionX"] = input.positionX;
			changed++;
		}
		if (input.positionY !== undefined) {
			params["transform.positionY"] = input.positionY;
			changed++;
		}

		if (changed === 0) {
			throw new AgentToolError(
				"Nothing to update: pass at least one of content, fontSize, color, positionX, positionY.",
			);
		}

		getEditor().timeline.updateElements({
			updates: [
				{
					trackId: track.id,
					elementId: element.id,
					patch: { params },
				},
			],
		});

		return textResult({ text: `Updated text element "${element.id}".` });
	},
});

const splitClip = defineTool({
	name: "split_clip",
	description:
		"Split a clip in two at the given time. The time is absolute on the timeline, not relative to the clip.",
	inputSchema: z.object({
		elementId: z.string(),
		atSeconds: z.number().min(0),
	}),
	handler: ({ input }) => {
		const { track, element } = requireElement({ elementId: input.elementId });
		const start = toSeconds({ time: element.startTime });
		const end = start + toSeconds({ time: element.duration });

		if (input.atSeconds <= start || input.atSeconds >= end) {
			throw new AgentToolError(
				`Split time ${input.atSeconds}s is outside "${element.id}", which spans ${roundSeconds(
					{ seconds: start },
				)}s to ${roundSeconds({ seconds: end })}s.`,
			);
		}

		const created = getEditor().timeline.splitElements({
			elements: [{ trackId: track.id, elementId: element.id }],
			splitTime: toMediaTime({ seconds: input.atSeconds }),
		});

		return jsonResult({
			value: {
				splitAtSeconds: input.atSeconds,
				leftElementId: element.id,
				rightElementIds: created.map((ref) => ref.elementId),
			},
		});
	},
});

const trimClip = defineTool({
	name: "trim_clip",
	description:
		"Trim from the start or end of a clip. Values are in seconds removed from each side of the source media.",
	inputSchema: z.object({
		elementId: z.string(),
		trimStartSeconds: z.number().min(0).optional(),
		trimEndSeconds: z.number().min(0).optional(),
	}),
	handler: ({ input }) => {
		const { element } = requireElement({ elementId: input.elementId });
		if (
			input.trimStartSeconds === undefined &&
			input.trimEndSeconds === undefined
		) {
			throw new AgentToolError(
				"Nothing to trim: pass trimStartSeconds, trimEndSeconds, or both.",
			);
		}

		getEditor().timeline.updateElementTrim({
			elementId: element.id,
			trimStart:
				input.trimStartSeconds === undefined
					? element.trimStart
					: toMediaTime({ seconds: input.trimStartSeconds }),
			trimEnd:
				input.trimEndSeconds === undefined
					? element.trimEnd
					: toMediaTime({ seconds: input.trimEndSeconds }),
		});

		return textResult({ text: `Trimmed "${element.id}".` });
	},
});

const moveClip = defineTool({
	name: "move_clip",
	description:
		"Move a clip to a new start time, optionally onto a different track.",
	inputSchema: z.object({
		elementId: z.string(),
		startSeconds: z.number().min(0),
		trackId: z.string().optional(),
	}),
	handler: ({ input }) => {
		const { track, element } = requireElement({ elementId: input.elementId });
		const targetTrack = input.trackId
			? requireTrack({ trackId: input.trackId })
			: track;

		getEditor().timeline.moveElements({
			moves: [
				{
					sourceTrackId: track.id,
					targetTrackId: targetTrack.id,
					elementId: element.id,
					newStartTime: toMediaTime({ seconds: input.startSeconds }),
				},
			],
		});

		return textResult({
			text: `Moved "${element.id}" to ${input.startSeconds}s on track "${targetTrack.id}".`,
		});
	},
});

const deleteClip = defineTool({
	name: "delete_clip",
	description:
		"Remove one or more clips from the timeline. Deleting several at once is a single undo step.",
	inputSchema: z.object({
		elementIds: z.array(z.string()).min(1),
	}),
	handler: ({ input }) => {
		const located = input.elementIds.map((elementId) =>
			requireElement({ elementId }),
		);

		getEditor().timeline.deleteElements({
			elements: located.map(({ track, element }) => ({
				trackId: track.id,
				elementId: element.id,
			})),
		});

		return textResult({
			text: `Deleted ${located.length} element(s): ${input.elementIds.join(", ")}.`,
		});
	},
});

const setSpeed = defineTool({
	name: "set_speed",
	description:
		"Change playback speed of a clip. 1 is normal, 2 is twice as fast, 0.5 is half speed.",
	inputSchema: z.object({
		elementId: z.string(),
		rate: z.number().positive(),
		maintainPitch: z.boolean().optional(),
	}),
	handler: ({ input }) => {
		const { track, element } = requireElement({ elementId: input.elementId });

		getEditor().timeline.updateElementRetime({
			trackId: track.id,
			elementId: element.id,
			retime: { rate: input.rate, maintainPitch: input.maintainPitch },
		});

		return textResult({
			text: `Set "${element.id}" to ${input.rate}x speed.`,
		});
	},
});

const applyEffect = defineTool({
	name: "apply_effect",
	description: "Apply a visual effect to a clip.",
	inputSchema: z.object({
		elementId: z.string(),
		effectType: z.string(),
	}),
	handler: ({ input }) => {
		const { track, element } = requireElement({ elementId: input.elementId });

		if (!effectsRegistry.has(input.effectType)) {
			const available = effectsRegistry
				.getAll()
				.map((definition) => definition.type)
				.join(", ");
			throw new AgentToolError(
				`Unknown effect "${input.effectType}". Available effects: ${available}`,
			);
		}

		const effectId = getEditor().timeline.addClipEffect({
			trackId: track.id,
			elementId: element.id,
			effectType: input.effectType,
		});

		return textResult({
			text: `Applied "${input.effectType}" to "${element.id}" (effect id ${effectId}).`,
		});
	},
});

const setCanvas = defineTool({
	name: "set_canvas",
	description:
		"Set the canvas aspect ratio. 9:16 for Reels and TikTok, 4:5 for the Instagram feed, 1:1 for square, 16:9 for landscape.",
	inputSchema: z.object({
		aspect: z.enum(["9:16", "1:1", "4:5", "16:9"]),
	}),
	handler: ({ input }) => {
		const canvasSize = CANVAS_PRESETS[input.aspect];
		const editor = getEditor();

		editor.command.execute({
			command: new UpdateProjectSettingsCommand({
				canvasSize,
				canvasSizeMode: BUILT_IN_RATIOS.has(input.aspect) ? "preset" : "custom",
				...(BUILT_IN_RATIOS.has(input.aspect)
					? {}
					: { lastCustomCanvasSize: canvasSize }),
			}),
		});

		return textResult({
			text: `Canvas set to ${input.aspect} (${canvasSize.width}x${canvasSize.height}).`,
		});
	},
});

const seek = defineTool({
	name: "seek",
	description: "Move the playhead to a time in seconds.",
	inputSchema: z.object({ seconds: z.number().min(0) }),
	handler: ({ input }) => {
		getEditor().playback.seek({ time: toMediaTime({ seconds: input.seconds }) });
		return textResult({ text: `Playhead at ${input.seconds}s.` });
	},
});

const undo = defineTool({
	name: "undo",
	description: "Undo the last change.",
	inputSchema: z.object({}),
	handler: () => {
		const editor = getEditor();
		if (!editor.command.canUndo()) {
			return textResult({ text: "Nothing to undo." });
		}
		editor.command.undo();
		return textResult({ text: "Undone." });
	},
});

const redo = defineTool({
	name: "redo",
	description: "Redo the change that was just undone.",
	inputSchema: z.object({}),
	handler: () => {
		const editor = getEditor();
		if (!editor.command.canRedo()) {
			return textResult({ text: "Nothing to redo." });
		}
		editor.command.redo();
		return textResult({ text: "Redone." });
	},
});

async function fileFromUrl({
	url,
	filename,
}: {
	url: string;
	filename?: string;
}): Promise<File> {
	let response: Response;
	try {
		response = await fetch(url);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new AgentToolError(`Could not fetch "${url}": ${detail}`);
	}

	if (!response.ok) {
		throw new AgentToolError(
			`Could not fetch "${url}": HTTP ${response.status} ${response.statusText}`,
		);
	}

	const blob = await response.blob();
	const name =
		filename ?? (decodeURIComponent(url.split("/").pop() ?? "") || "import");
	return new File([blob], name, { type: blob.type });
}

function fileFromBase64({
	dataBase64,
	filename,
}: {
	dataBase64: string;
	filename: string;
}): File {
	let binary: string;
	try {
		binary = atob(dataBase64);
	} catch {
		throw new AgentToolError("`dataBase64` is not valid base64.");
	}

	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new File([bytes], filename);
}

export function registerEditTools(): void {
	for (const tool of [
		importMedia,
		addClip,
		addText,
		updateText,
		splitClip,
		trimClip,
		moveClip,
		deleteClip,
		setSpeed,
		applyEffect,
		setCanvas,
		seek,
		undo,
		redo,
	]) {
		registerAgentTool({ tool });
	}
}

export { listTracks };
