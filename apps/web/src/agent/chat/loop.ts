import type Anthropic from "@anthropic-ai/sdk";
import type { AgentToolResult } from "../types";
import {
	closeDanglingToolUses,
	pruneImages,
	toHistoryContent,
	toToolResultBlock,
} from "./anthropic";
import {
	AGENT_CHAT_ENDPOINT,
	readWireEvents,
	type AgentChatFinalMessage,
} from "./protocol";

/**
 * The browser half of the assistant: send the history to the route, stream the
 * reply, run any tool calls against the live editor, send the results back,
 * repeat until Claude stops asking for tools.
 *
 * Nothing here touches React or the editor directly; tools and fetch come in as
 * parameters, which is what keeps it testable.
 */

export const DEFAULT_MAX_ITERATIONS = 20;
/** Newest frames kept in the history; older ones become a placeholder. */
export const KEPT_IMAGES = 2;
export const CANCELLED_TOOL_TEXT = "Cancelado por el usuario.";

export type AgentLoopEvent =
	/** Text delta for the assistant message being written. */
	| { type: "text"; text: string }
	/** Claude started a tool call; its input is still streaming. */
	| { type: "tool_pending"; id: string; name: string }
	/** The call is about to run with its final input. */
	| { type: "tool_call"; id: string; name: string; input: unknown }
	| { type: "tool_result"; id: string; result: AgentToolResult }
	/** The history changed; persist it so the next turn starts from here. */
	| { type: "history"; messages: Anthropic.MessageParam[] };

export type AgentLoopOutcome =
	| { status: "done"; stopReason: Anthropic.StopReason | null }
	| { status: "cancelled" }
	| { status: "max_iterations" };

export type AgentChatErrorKind =
	| "missing_api_key"
	| "unauthorized"
	| "rate_limited"
	| "http"
	| "stream";

/** A failure the panel shows as a notice rather than as assistant text. */
export class AgentChatRequestError extends Error {
	readonly kind: AgentChatErrorKind;
	readonly status: number | null;

	constructor({
		kind,
		message,
		status = null,
	}: {
		kind: AgentChatErrorKind;
		message: string;
		status?: number | null;
	}) {
		super(message);
		this.name = "AgentChatRequestError";
		this.kind = kind;
		this.status = status;
	}
}

/** fetch, reduced to what the loop uses so tests can stand in for it. */
export type AgentChatFetch = ({
	url,
	init,
}: {
	url: string;
	init: RequestInit;
}) => Promise<Response>;

const browserFetch: AgentChatFetch = ({ url, init }) => fetch(url, init);

export interface RunAgentLoopParams {
	/** Full history, ending with the user's new message. */
	messages: Anthropic.MessageParam[];
	tools: Anthropic.Tool[];
	callTool: ({
		name,
		input,
	}: {
		name: string;
		input: unknown;
	}) => Promise<AgentToolResult>;
	onEvent: (event: AgentLoopEvent) => void;
	signal?: AbortSignal;
	fetchImpl?: AgentChatFetch;
	endpoint?: string;
	maxIterations?: number;
}

export async function runAgentLoop({
	messages: initialMessages,
	tools,
	callTool,
	onEvent,
	signal,
	fetchImpl = browserFetch,
	endpoint = AGENT_CHAT_ENDPOINT,
	maxIterations = DEFAULT_MAX_ITERATIONS,
}: RunAgentLoopParams): Promise<AgentLoopOutcome> {
	let messages = pruneImages({
		messages: closeDanglingToolUses({
			messages: initialMessages,
			reason: CANCELLED_TOOL_TEXT,
		}),
		keep: KEPT_IMAGES,
	});

	const commit = ({ next }: { next: Anthropic.MessageParam[] }) => {
		messages = next;
		onEvent({ type: "history", messages });
	};

	const cancel = (): AgentLoopOutcome => {
		commit({
			next: closeDanglingToolUses({ messages, reason: CANCELLED_TOOL_TEXT }),
		});
		return { status: "cancelled" };
	};

	for (let iteration = 0; iteration < maxIterations; iteration++) {
		if (signal?.aborted) {
			return cancel();
		}

		let final: AgentChatFinalMessage;
		try {
			final = await requestTurn({
				messages,
				tools,
				onEvent,
				signal,
				fetchImpl,
				endpoint,
			});
		} catch (error) {
			if (signal?.aborted) {
				return cancel();
			}
			throw error;
		}

		const content = toHistoryContent({ content: final.content });
		if (content.length > 0) {
			commit({ next: [...messages, { role: "assistant", content }] });
		}

		const toolUses = content.filter(
			(block): block is Anthropic.ToolUseBlockParam =>
				block.type === "tool_use",
		);

		if (final.stop_reason !== "tool_use" || toolUses.length === 0) {
			if (final.stop_reason === "max_tokens" && toolUses.length > 0) {
				// The input of the last call was cut off: do not run it, but keep
				// the history valid for the next message.
				commit({
					next: closeDanglingToolUses({
						messages,
						reason: "La llamada quedó truncada y no se ejecutó.",
					}),
				});
			}
			return { status: "done", stopReason: final.stop_reason };
		}

		// Sequential on purpose: edits depend on each other (split, then move).
		const results: Anthropic.ToolResultBlockParam[] = [];
		for (const toolUse of toolUses) {
			if (signal?.aborted) {
				results.push(cancelledResult({ toolUseId: toolUse.id }));
				continue;
			}
			onEvent({
				type: "tool_call",
				id: toolUse.id,
				name: toolUse.name,
				input: toolUse.input,
			});
			const result = await callTool({
				name: toolUse.name,
				input: toolUse.input,
			});
			onEvent({ type: "tool_result", id: toolUse.id, result });
			results.push(toToolResultBlock({ toolUseId: toolUse.id, result }));
		}

		commit({
			next: pruneImages({
				messages: [...messages, { role: "user", content: results }],
				keep: KEPT_IMAGES,
			}),
		});

		if (signal?.aborted) {
			return { status: "cancelled" };
		}
	}

	return { status: "max_iterations" };
}

function cancelledResult({
	toolUseId,
}: {
	toolUseId: string;
}): Anthropic.ToolResultBlockParam {
	return {
		type: "tool_result",
		tool_use_id: toolUseId,
		content: CANCELLED_TOOL_TEXT,
		is_error: true,
	};
}

async function requestTurn({
	messages,
	tools,
	onEvent,
	signal,
	fetchImpl,
	endpoint,
}: {
	messages: Anthropic.MessageParam[];
	tools: Anthropic.Tool[];
	onEvent: (event: AgentLoopEvent) => void;
	signal?: AbortSignal;
	fetchImpl: AgentChatFetch;
	endpoint: string;
}): Promise<AgentChatFinalMessage> {
	const response = await fetchImpl({
		url: endpoint,
		init: {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ messages, tools }),
			signal,
		},
	});

	if (!response.ok) {
		throw await toRequestError({ response });
	}
	if (!response.body) {
		throw new AgentChatRequestError({
			kind: "stream",
			message: "La respuesta llegó vacía.",
		});
	}

	for await (const event of readWireEvents({ body: response.body })) {
		switch (event.type) {
			case "text":
				onEvent({ type: "text", text: event.text });
				break;
			case "tool_use_start":
				onEvent({ type: "tool_pending", id: event.id, name: event.name });
				break;
			case "error":
				throw new AgentChatRequestError({
					kind: "stream",
					message: event.message,
				});
			case "message":
				return event.message;
		}
	}

	throw new AgentChatRequestError({
		kind: "stream",
		message: "La conexión se cortó antes de terminar la respuesta.",
	});
}

async function toRequestError({
	response,
}: {
	response: Response;
}): Promise<AgentChatRequestError> {
	let code: unknown = null;
	try {
		const body: unknown = await response.json();
		if (typeof body === "object" && body !== null && "error" in body) {
			code = body.error;
		}
	} catch {
		// Not JSON (a proxy error page, say); the status is all there is.
	}

	if (code === "missing_api_key") {
		return new AgentChatRequestError({
			kind: "missing_api_key",
			status: response.status,
			message: "El servidor no tiene configurada ANTHROPIC_API_KEY.",
		});
	}
	if (response.status === 401) {
		return new AgentChatRequestError({
			kind: "unauthorized",
			status: 401,
			message: "Inicia sesión para usar el asistente.",
		});
	}
	if (response.status === 429) {
		return new AgentChatRequestError({
			kind: "rate_limited",
			status: 429,
			message: "Demasiadas peticiones. Espera un momento e inténtalo de nuevo.",
		});
	}
	return new AgentChatRequestError({
		kind: "http",
		status: response.status,
		message: `El servidor respondió ${response.status}${
			typeof code === "string" ? ` (${code})` : ""
		}.`,
	});
}
