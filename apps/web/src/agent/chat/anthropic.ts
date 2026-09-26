import type Anthropic from "@anthropic-ai/sdk";
import type { AgentToolDescriptor, AgentToolResult } from "../types";

/**
 * Translation between the transport-agnostic tool registry and the Messages
 * API shapes. Pure functions only, so they run the same in the browser and in
 * tests.
 */

const IMAGE_MEDIA_TYPES = [
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
] as const;

type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

function isImageMediaType(value: string): value is ImageMediaType {
	return IMAGE_MEDIA_TYPES.some((type) => type === value);
}

/** Registry descriptors → Anthropic tool definitions (`$schema` dropped). */
export function toAnthropicTools({
	descriptors,
}: {
	descriptors: AgentToolDescriptor[];
}): Anthropic.Tool[] {
	return descriptors.map((descriptor) => {
		const { $schema: _schema, type: _type, ...schema } = descriptor.inputSchema;
		return {
			name: descriptor.name,
			description: descriptor.description,
			input_schema: { ...schema, type: "object" },
		};
	});
}

/** A registry result → the tool_result block Claude reads. */
export function toToolResultBlock({
	toolUseId,
	result,
}: {
	toolUseId: string;
	result: AgentToolResult;
}): Anthropic.ToolResultBlockParam {
	const content: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> =
		[];

	for (const item of result.content) {
		if (item.type === "text") {
			if (item.text) {
				content.push({ type: "text", text: item.text });
			}
			continue;
		}
		if (isImageMediaType(item.mimeType)) {
			content.push({
				type: "image",
				source: { type: "base64", media_type: item.mimeType, data: item.data },
			});
		} else {
			content.push({
				type: "text",
				text: `[Imagen en formato ${item.mimeType} no admitido]`,
			});
		}
	}

	return {
		type: "tool_result",
		tool_use_id: toolUseId,
		content: content.length > 0 ? content : "(sin salida)",
		...(result.isError ? { is_error: true } : {}),
	};
}

/**
 * Response blocks → request blocks for the history. Drops fields the request
 * does not accept (citations and the like) and blocks with nothing in them;
 * thinking blocks stay, signature included, because the API wants them back.
 */
export function toHistoryContent({
	content,
}: {
	content: Anthropic.ContentBlock[];
}): Anthropic.ContentBlockParam[] {
	const blocks: Anthropic.ContentBlockParam[] = [];
	for (const block of content) {
		switch (block.type) {
			case "text":
				if (block.text) {
					blocks.push({ type: "text", text: block.text });
				}
				break;
			case "tool_use":
				blocks.push({
					type: "tool_use",
					id: block.id,
					name: block.name,
					input: block.input,
				});
				break;
			case "thinking":
				blocks.push({
					type: "thinking",
					thinking: block.thinking,
					signature: block.signature,
				});
				break;
			case "redacted_thinking":
				blocks.push({ type: "redacted_thinking", data: block.data });
				break;
			default:
				break;
		}
	}
	return blocks;
}

export const PRUNED_IMAGE_TEXT =
	"[Imagen anterior omitida para aligerar la conversación]";

/**
 * Keep only the newest `keep` images in the history. Frames from capture_frame
 * are hundreds of kilobytes each and are rarely useful once Claude has looked
 * at them, so older ones become a short placeholder.
 */
export function pruneImages({
	messages,
	keep,
}: {
	messages: Anthropic.MessageParam[];
	keep: number;
}): Anthropic.MessageParam[] {
	let remaining = keep;
	const pruned = [...messages];

	for (let index = pruned.length - 1; index >= 0; index--) {
		const message = pruned[index];
		if (!message || typeof message.content === "string") {
			continue;
		}

		let changed = false;
		const content = [...message.content].reverse().map((block) => {
			if (block.type === "image") {
				if (remaining > 0) {
					remaining--;
					return block;
				}
				changed = true;
				return { type: "text" as const, text: PRUNED_IMAGE_TEXT };
			}
			if (block.type === "tool_result" && Array.isArray(block.content)) {
				const inner = [...block.content].reverse().map((item) => {
					if (item.type !== "image") {
						return item;
					}
					if (remaining > 0) {
						remaining--;
						return item;
					}
					changed = true;
					return { type: "text" as const, text: PRUNED_IMAGE_TEXT };
				});
				return { ...block, content: inner.reverse() };
			}
			return block;
		});

		if (changed) {
			pruned[index] = { ...message, content: content.reverse() };
		}
	}

	return pruned;
}

/**
 * Every tool_use needs a matching tool_result at the start of the next user
 * message or the API rejects the whole history. After a cancel, a truncated
 * turn or a crash mid-tool, answer the leftovers with an error so the
 * conversation can continue.
 */
export function closeDanglingToolUses({
	messages,
	reason,
}: {
	messages: Anthropic.MessageParam[];
	reason: string;
}): Anthropic.MessageParam[] {
	const result: Anthropic.MessageParam[] = [];

	for (let index = 0; index < messages.length; index++) {
		const message = messages[index];
		if (!message) {
			continue;
		}
		result.push(message);

		if (message.role !== "assistant" || typeof message.content === "string") {
			continue;
		}
		const toolUseIds = message.content
			.filter((block) => block.type === "tool_use")
			.map((block) => block.id);
		if (toolUseIds.length === 0) {
			continue;
		}

		const next = messages[index + 1];
		const nextBlocks: Anthropic.ContentBlockParam[] =
			next?.role !== "user"
				? []
				: typeof next.content === "string"
					? [{ type: "text", text: next.content }]
					: next.content;
		const answered = new Set(
			nextBlocks
				.filter((block) => block.type === "tool_result")
				.map((block) => block.tool_use_id),
		);
		const missing = toolUseIds.filter((id) => !answered.has(id));
		if (missing.length === 0) {
			continue;
		}

		const errors: Anthropic.ToolResultBlockParam[] = missing.map((id) => ({
			type: "tool_result",
			tool_use_id: id,
			content: reason,
			is_error: true,
		}));

		if (next?.role === "user") {
			// Results first: the API wants them ahead of any text in the message.
			const results = nextBlocks.filter(
				(block) => block.type === "tool_result",
			);
			const rest = nextBlocks.filter((block) => block.type !== "tool_result");
			result.push({ role: "user", content: [...results, ...errors, ...rest] });
			index++;
		} else {
			result.push({ role: "user", content: errors });
		}
	}

	return result;
}
