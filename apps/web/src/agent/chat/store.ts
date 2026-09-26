import type Anthropic from "@anthropic-ai/sdk";
import { create } from "zustand";
import { agentToolRegistry } from "../registry";
import { registerAgentTools } from "../tools";
import { getEditor, roundSeconds, toSeconds } from "../tools/helpers";
import { toAnthropicTools } from "./anthropic";
import {
	AgentChatRequestError,
	DEFAULT_MAX_ITERATIONS,
	runAgentLoop,
	type AgentLoopOutcome,
} from "./loop";
import {
	applyLoopEvent,
	noticeItem,
	settleTools,
	userItem,
	type ChatItem,
} from "./transcript";

export interface AgentConversation {
	items: ChatItem[];
	/** API history; diverges from `items` (thinking blocks, pruned images). */
	messages: Anthropic.MessageParam[];
	status: "idle" | "running";
	draft: string;
	/** Bumped on every run and reset, so a stale run cannot write back. */
	runId: number;
}

interface AgentChatStore {
	conversations: Record<string, AgentConversation>;
	send: ({
		projectId,
		text,
	}: {
		projectId: string;
		text: string;
	}) => Promise<void>;
	stop: ({ projectId }: { projectId: string }) => void;
	reset: ({ projectId }: { projectId: string }) => void;
	setDraft: ({
		projectId,
		draft,
	}: {
		projectId: string;
		draft: string;
	}) => void;
}

const EMPTY_CONVERSATION: AgentConversation = {
	items: [],
	messages: [],
	status: "idle",
	draft: "",
	runId: 0,
};

export function getConversation({
	conversations,
	projectId,
}: {
	conversations: Record<string, AgentConversation>;
	projectId: string | null;
}): AgentConversation {
	return (projectId && conversations[projectId]) || EMPTY_CONVERSATION;
}

// Not state: nothing renders from them.
const controllers = new Map<string, AbortController>();

let cachedTools: Anthropic.Tool[] | null = null;

/**
 * The chat needs the tools whether or not the MCP bridge is enabled, so it
 * registers them itself. Both paths are idempotent.
 */
function getChatTools(): Anthropic.Tool[] {
	registerAgentTools();
	cachedTools ??= toAnthropicTools({
		descriptors: agentToolRegistry.describeAll(),
	});
	return cachedTools;
}

/**
 * What the person sees in the footer chips, sent along with their message so
 * "split at the playhead" or "this clip" resolve without a round trip.
 */
function describeEditorContext(): string | null {
	try {
		const editor = getEditor();
		const seconds = roundSeconds({
			seconds: toSeconds({ time: editor.playback.getCurrentTime() }),
		});
		const selected = editor.timeline.getElementsWithTracks({
			elements: editor.selection.getSelectedElements(),
		});
		const selection =
			selected.length === 0
				? "nada seleccionado"
				: selected
						.slice(0, 5)
						.map(
							({ element, track }) =>
								`“${element.name}” (elementId ${element.id}, trackId ${track.id})`,
						)
						.join(", ");
		return `[Contexto del editor] Cabezal en ${seconds} s. Selección: ${selection}.`;
	} catch {
		return null;
	}
}

export const useAgentChatStore = create<AgentChatStore>()((set, get) => {
	const update = ({
		projectId,
		runId,
		patch,
	}: {
		projectId: string;
		runId?: number;
		patch: (conversation: AgentConversation) => Partial<AgentConversation>;
	}) => {
		set((state) => {
			const current = getConversation({
				conversations: state.conversations,
				projectId,
			});
			if (runId !== undefined && current.runId !== runId) {
				return state;
			}
			return {
				conversations: {
					...state.conversations,
					[projectId]: { ...current, ...patch(current) },
				},
			};
		});
	};

	return {
		conversations: {},

		send: async ({ projectId, text }) => {
			const trimmed = text.trim();
			const conversation = getConversation({
				conversations: get().conversations,
				projectId,
			});
			if (!trimmed || conversation.status === "running") {
				return;
			}

			const runId = conversation.runId + 1;
			const context = describeEditorContext();
			const userMessage: Anthropic.MessageParam = {
				role: "user",
				content: context
					? [
							{ type: "text", text: trimmed },
							{ type: "text", text: context },
						]
					: trimmed,
			};
			const messages = [...conversation.messages, userMessage];

			update({
				projectId,
				patch: (current) => ({
					items: [...current.items, userItem({ text: trimmed })],
					messages,
					status: "running",
					draft: "",
					runId,
				}),
			});

			const controller = new AbortController();
			controllers.set(projectId, controller);

			let outcome: AgentLoopOutcome | null = null;
			let failure: ChatItem | null = null;
			try {
				outcome = await runAgentLoop({
					messages,
					tools: getChatTools(),
					callTool: ({ name, input }) =>
						agentToolRegistry.call({ name, input }),
					signal: controller.signal,
					onEvent: (event) =>
						update({
							projectId,
							runId,
							patch: (current) =>
								event.type === "history"
									? { messages: event.messages }
									: { items: applyLoopEvent({ items: current.items, event }) },
						}),
				});
			} catch (error) {
				failure =
					error instanceof AgentChatRequestError
						? noticeItem({ variant: error.kind, text: error.message })
						: noticeItem({
								variant: "unknown",
								text:
									error instanceof Error
										? error.message
										: "Algo salió mal al hablar con el asistente.",
							});
			} finally {
				if (controllers.get(projectId) === controller) {
					controllers.delete(projectId);
				}
			}

			const notice = failure ?? outcomeNotice({ outcome });
			update({
				projectId,
				runId,
				patch: (current) => ({
					items: [
						...settleTools({ items: current.items }),
						...(notice ? [notice] : []),
					],
					status: "idle",
				}),
			});
		},

		stop: ({ projectId }) => {
			controllers.get(projectId)?.abort();
		},

		reset: ({ projectId }) => {
			controllers.get(projectId)?.abort();
			controllers.delete(projectId);
			update({
				projectId,
				patch: (current) => ({
					...EMPTY_CONVERSATION,
					draft: current.draft,
					runId: current.runId + 1,
				}),
			});
		},

		setDraft: ({ projectId, draft }) => {
			update({ projectId, patch: () => ({ draft }) });
		},
	};
});

function outcomeNotice({
	outcome,
}: {
	outcome: AgentLoopOutcome | null;
}): ChatItem | null {
	if (!outcome) {
		return null;
	}
	switch (outcome.status) {
		case "cancelled":
			return noticeItem({ variant: "stopped", text: "Detenido." });
		case "max_iterations":
			return noticeItem({
				variant: "max_iterations",
				text: `Me detuve tras ${DEFAULT_MAX_ITERATIONS} pasos seguidos. Pídeme que continúe si hace falta.`,
			});
		case "done":
			if (outcome.stopReason === "refusal") {
				return noticeItem({
					variant: "refusal",
					text: "Claude no quiso continuar con esta petición.",
				});
			}
			if (outcome.stopReason === "max_tokens") {
				return noticeItem({
					variant: "truncated",
					text: "La respuesta se cortó por largo. Pídeme que continúe.",
				});
			}
			return null;
	}
}

export function selectIsAnyConversationRunning(state: AgentChatStore): boolean {
	return Object.values(state.conversations).some(
		(conversation) => conversation.status === "running",
	);
}
