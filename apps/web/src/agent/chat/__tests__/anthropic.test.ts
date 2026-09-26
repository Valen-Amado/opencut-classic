import { describe, expect, test } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AgentToolRegistry, textResult } from "../../registry";
import { defineTool } from "../../types";
import {
	PRUNED_IMAGE_TEXT,
	pruneImages,
	toAnthropicTools,
	toToolResultBlock,
} from "../anthropic";

describe("toAnthropicTools", () => {
	test("maps registry descriptors to input_schema without $schema", () => {
		const registry = new AgentToolRegistry();
		registry.register({
			key: "split_clip",
			definition: defineTool({
				name: "split_clip",
				description: "Split a clip at a time in seconds.",
				inputSchema: z.object({
					elementId: z.string(),
					seconds: z.number().min(0),
					keep: z.enum(["left", "right", "both"]).default("both"),
				}),
				handler: () => textResult({ text: "ok" }),
			}),
		});

		const [tool] = toAnthropicTools({ descriptors: registry.describeAll() });

		expect(tool?.name).toBe("split_clip");
		expect(tool?.description).toBe("Split a clip at a time in seconds.");
		expect(tool?.input_schema.type).toBe("object");
		expect(tool?.input_schema).not.toHaveProperty("$schema");
		expect(tool?.input_schema.properties).toHaveProperty("elementId");
		// io: "input" means defaulted fields are optional for Claude.
		expect(tool?.input_schema.required).toEqual(["elementId", "seconds"]);
	});

	test("forces an object schema even for an odd descriptor", () => {
		const [tool] = toAnthropicTools({
			descriptors: [{ name: "noop", description: "", inputSchema: {} }],
		});
		expect(tool?.input_schema).toEqual({ type: "object" });
	});
});

describe("toToolResultBlock", () => {
	test("maps text and PNG content, flags errors", () => {
		const block = toToolResultBlock({
			toolUseId: "toolu_1",
			result: {
				content: [
					{ type: "text", text: "Frame at 2s" },
					{ type: "image", data: "iVBOR", mimeType: "image/png" },
				],
				isError: true,
			},
		});

		expect(block).toEqual({
			type: "tool_result",
			tool_use_id: "toolu_1",
			is_error: true,
			content: [
				{ type: "text", text: "Frame at 2s" },
				{
					type: "image",
					source: { type: "base64", media_type: "image/png", data: "iVBOR" },
				},
			],
		});
	});

	test("replaces unsupported image types and empty output", () => {
		expect(
			toToolResultBlock({
				toolUseId: "a",
				result: {
					content: [{ type: "image", data: "x", mimeType: "image/bmp" }],
				},
			}).content,
		).toEqual([
			{ type: "text", text: "[Imagen en formato image/bmp no admitido]" },
		]);

		expect(
			toToolResultBlock({ toolUseId: "b", result: { content: [] } }).content,
		).toBe("(sin salida)");
	});
});

describe("pruneImages", () => {
	function frameResult({ id }: { id: string }): Anthropic.MessageParam {
		return {
			role: "user",
			content: [
				{
					type: "tool_result",
					tool_use_id: id,
					content: [
						{
							type: "image",
							source: { type: "base64", media_type: "image/png", data: id },
						},
					],
				},
			],
		};
	}

	test("keeps only the newest images", () => {
		const messages = [
			frameResult({ id: "old" }),
			frameResult({ id: "mid" }),
			frameResult({ id: "new" }),
		];

		const pruned = pruneImages({ messages, keep: 2 });

		expect(JSON.stringify(pruned[0])).toContain(PRUNED_IMAGE_TEXT);
		expect(pruned[1]).toBe(messages[1]);
		expect(pruned[2]).toBe(messages[2]);
		// The input is not mutated.
		expect(JSON.stringify(messages[0])).not.toContain(PRUNED_IMAGE_TEXT);
	});
});
