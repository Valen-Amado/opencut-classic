import { z } from "zod";
import {
	EXPORT_FORMAT_VALUES,
	EXPORT_QUALITY_VALUES,
	getExportFileExtension,
	getExportMimeType,
	downloadBuffer,
} from "@/export";
import { jsonResult, registerAgentTool } from "../registry";
import { AgentToolError, defineTool, type AgentToolResult } from "../types";
import { getEditor, toMediaTime } from "./helpers";

const captureFrame = defineTool({
	name: "capture_frame",
	description:
		"Render a single frame at the given time and return it as a PNG. Use it to check your work — what the frame actually looks like, not what the timeline says.",
	inputSchema: z.object({
		seconds: z.number().min(0).optional(),
	}),
	handler: async ({ input }): Promise<AgentToolResult> => {
		const editor = getEditor();

		if (input.seconds !== undefined) {
			// createSnapshot renders at the playhead, so move it first.
			editor.playback.seek({ time: toMediaTime({ seconds: input.seconds }) });
		}

		const snapshot = await editor.renderer.createSnapshot();
		if (!snapshot.success) {
			throw new AgentToolError(`Could not capture a frame: ${snapshot.error}`);
		}

		const buffer = await snapshot.blob.arrayBuffer();
		return {
			content: [
				{
					type: "image",
					data: toBase64({ buffer }),
					mimeType: snapshot.blob.type || "image/png",
				},
			],
		};
	},
});

const exportVideo = defineTool({
	name: "export",
	description:
		"Render the project to a video file and download it through the browser. Blocks until the render finishes, which can take a while.",
	inputSchema: z.object({
		format: z.enum(EXPORT_FORMAT_VALUES).default("mp4"),
		quality: z.enum(EXPORT_QUALITY_VALUES).default("high"),
		filename: z.string().optional(),
		includeAudio: z.boolean().default(true),
	}),
	handler: async ({ input }) => {
		const editor = getEditor();

		if (editor.project.getExportState().isExporting) {
			throw new AgentToolError(
				"An export is already running in the editor tab. Wait for it to finish.",
			);
		}

		const result = await editor.project.export({
			options: {
				format: input.format,
				quality: input.quality,
				includeAudio: input.includeAudio,
			},
		});

		if (!result.success || !result.buffer) {
			throw new AgentToolError(
				result.cancelled
					? "The export was cancelled in the editor."
					: `Export failed: ${result.error ?? "unknown error"}`,
			);
		}

		const extension = getExportFileExtension({ format: input.format });
		const filename = input.filename?.endsWith(`.${extension}`)
			? input.filename
			: `${input.filename ?? "opencut-export"}.${extension}`;

		downloadBuffer({
			buffer: result.buffer,
			filename,
			mimeType: getExportMimeType({ format: input.format }),
		});

		return jsonResult({
			value: {
				filename,
				format: input.format,
				quality: input.quality,
				bytes: result.buffer.byteLength,
				note: "The file was downloaded by the browser, so it landed in the editor tab's download folder.",
			},
		});
	},
});

/** Chunked so a large frame does not blow the argument limit of String.fromCharCode. */
function toBase64({ buffer }: { buffer: ArrayBuffer }): string {
	const bytes = new Uint8Array(buffer);
	const chunkSize = 0x8000;
	let binary = "";
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	return btoa(binary);
}

export function registerOutputTools(): void {
	for (const tool of [captureFrame, exportVideo]) {
		registerAgentTool({ tool });
	}
}
