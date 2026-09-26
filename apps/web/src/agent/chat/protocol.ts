import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Wire contract between the assistant panel and `POST /api/agent/chat`.
 *
 * The browser owns the conversation and the tools; the route only relays one
 * Claude turn at a time. The request carries the whole history in Messages API
 * shape, and the response is NDJSON: one `AgentChatWireEvent` per line.
 */

export const AGENT_CHAT_ENDPOINT = "/api/agent/chat";

/** Error codes the route returns as `{ error }` with a non-2xx status. */
export const AGENT_CHAT_ERRORS = {
	unauthorized: "unauthorized",
	rateLimited: "rate_limited",
	missingApiKey: "missing_api_key",
	invalidInput: "invalid_input",
	payloadTooLarge: "payload_too_large",
} as const;

export type AgentChatErrorCode =
	(typeof AGENT_CHAT_ERRORS)[keyof typeof AGENT_CHAT_ERRORS];

/**
 * The final assistant message of a turn, trimmed to what the loop needs. The
 * content goes back into the history verbatim on the next request (thinking
 * blocks included, since the API expects their signatures back).
 */
export interface AgentChatFinalMessage {
	content: Anthropic.ContentBlock[];
	stop_reason: Anthropic.StopReason | null;
}

export type AgentChatWireEvent =
	| { type: "text"; text: string }
	| { type: "tool_use_start"; id: string; name: string }
	| { type: "message"; message: AgentChatFinalMessage }
	| { type: "error"; message: string };

const textBlockSchema = z.object({
	type: z.literal("text"),
	text: z.string(),
});

const imageBlockSchema = z.object({
	type: z.literal("image"),
	source: z.object({
		type: z.literal("base64"),
		media_type: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]),
		data: z.string(),
	}),
});

const toolUseBlockSchema = z.object({
	type: z.literal("tool_use"),
	id: z.string().min(1),
	name: z.string().min(1),
	input: z.unknown(),
});

const toolResultBlockSchema = z.object({
	type: z.literal("tool_result"),
	tool_use_id: z.string().min(1),
	content: z
		.union([z.string(), z.array(z.union([textBlockSchema, imageBlockSchema]))])
		.optional(),
	is_error: z.boolean().optional(),
});

const thinkingBlockSchema = z.object({
	type: z.literal("thinking"),
	thinking: z.string(),
	signature: z.string(),
});

const redactedThinkingBlockSchema = z.object({
	type: z.literal("redacted_thinking"),
	data: z.string(),
});

const contentBlockSchema = z.discriminatedUnion("type", [
	textBlockSchema,
	imageBlockSchema,
	toolUseBlockSchema,
	toolResultBlockSchema,
	thinkingBlockSchema,
	redactedThinkingBlockSchema,
]);

const messageSchema = z.object({
	role: z.enum(["user", "assistant"]),
	content: z.union([z.string().min(1), z.array(contentBlockSchema).min(1)]),
});

const toolSchema = z.object({
	name: z
		.string()
		.regex(/^[a-zA-Z0-9_-]{1,64}$/, "Tool names are 1-64 word characters"),
	description: z.string().max(4_000),
	input_schema: z.looseObject({
		type: z.literal("object"),
		properties: z.record(z.string(), z.unknown()).optional(),
		required: z.array(z.string()).optional(),
	}),
});

export const MAX_CHAT_MESSAGES = 400;
export const MAX_CHAT_TOOLS = 64;
/** Frames from capture_frame are the big items; the client prunes old ones. */
export const MAX_CHAT_BODY_BYTES = 16 * 1024 * 1024;

export const agentChatRequestSchema = z.object({
	messages: z
		.array(messageSchema)
		.min(1)
		.max(MAX_CHAT_MESSAGES)
		.refine((messages) => messages[0]?.role === "user", {
			message: "The first message must come from the user",
		}),
	tools: z.array(toolSchema).max(MAX_CHAT_TOOLS),
});

export type AgentChatRequest = z.infer<typeof agentChatRequestSchema>;

// Compile-time checks: what the schema accepts is something the SDK accepts.
// If the SDK narrows a field, these stop compiling instead of failing at runtime.
type AssertAssignable<T extends U, U> = T;
export type _MessagesAreSdkMessages = AssertAssignable<
	AgentChatRequest["messages"][number],
	Anthropic.MessageParam
>;
export type _ToolsAreSdkTools = AssertAssignable<
	AgentChatRequest["tools"][number],
	Anthropic.Tool
>;

export function encodeWireEvent({
	event,
}: {
	event: AgentChatWireEvent;
}): string {
	return `${JSON.stringify(event)}\n`;
}

/**
 * Split an NDJSON byte stream into wire events. Lines that do not parse are
 * skipped rather than fatal: a half-written line can only happen when the
 * connection drops, and the missing `message` event already reports that.
 */
export async function* readWireEvents({
	body,
}: {
	body: ReadableStream<Uint8Array>;
}): AsyncGenerator<AgentChatWireEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			buffer += decoder.decode(value, { stream: true });

			let newline = buffer.indexOf("\n");
			while (newline !== -1) {
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				const event = parseWireLine({ line });
				if (event) {
					yield event;
				}
				newline = buffer.indexOf("\n");
			}
		}

		buffer += decoder.decode();
		const event = parseWireLine({ line: buffer });
		if (event) {
			yield event;
		}
	} finally {
		reader.releaseLock();
	}
}

function parseWireLine({ line }: { line: string }): AgentChatWireEvent | null {
	const trimmed = line.trim();
	if (!trimmed) {
		return null;
	}
	try {
		const parsed: unknown = JSON.parse(trimmed);
		return isWireEvent(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function isWireEvent(value: unknown): value is AgentChatWireEvent {
	if (typeof value !== "object" || value === null || !("type" in value)) {
		return false;
	}
	return (
		value.type === "text" ||
		value.type === "tool_use_start" ||
		value.type === "message" ||
		value.type === "error"
	);
}
