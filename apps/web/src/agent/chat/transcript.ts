import type { AgentToolResult } from "../types";
import type { AgentChatErrorKind, AgentLoopEvent } from "./loop";

/**
 * What the panel renders, as opposed to the API history the loop sends. Kept
 * separate because the two diverge: the transcript has notices and tool rows
 * with their results, the history has thinking blocks and pruned images.
 */

export type ToolStepStatus =
	| "pending"
	| "running"
	| "done"
	| "error"
	| "cancelled";

export type ChatNoticeVariant =
	| AgentChatErrorKind
	| "stopped"
	| "max_iterations"
	| "refusal"
	| "truncated"
	| "unknown";

export type ChatItem =
	| { kind: "user"; id: string; text: string }
	| { kind: "assistant"; id: string; text: string }
	| {
			kind: "tool";
			/** The tool_use id, so stream events can find their row. */
			id: string;
			name: string;
			input?: unknown;
			result?: AgentToolResult;
			status: ToolStepStatus;
	  }
	| { kind: "notice"; id: string; variant: ChatNoticeVariant; text: string };

export type ToolChatItem = Extract<ChatItem, { kind: "tool" }>;

function newId(): string {
	return crypto.randomUUID();
}

/** Fold one loop event into the transcript. Returns a new array. */
export function applyLoopEvent({
	items,
	event,
}: {
	items: ChatItem[];
	event: AgentLoopEvent;
}): ChatItem[] {
	switch (event.type) {
		case "text": {
			const last = items.at(-1);
			if (last?.kind === "assistant") {
				return [
					...items.slice(0, -1),
					{ ...last, text: last.text + event.text },
				];
			}
			return [...items, { kind: "assistant", id: newId(), text: event.text }];
		}
		case "tool_pending":
			if (findTool({ items, id: event.id })) {
				return items;
			}
			return [
				...items,
				{ kind: "tool", id: event.id, name: event.name, status: "pending" },
			];
		case "tool_call":
			return upsertTool({
				items,
				id: event.id,
				name: event.name,
				patch: { input: event.input, status: "running" },
			});
		case "tool_result":
			return updateTool({
				items,
				id: event.id,
				patch: {
					result: event.result,
					status: event.result.isError ? "error" : "done",
				},
			});
		case "history":
			return items;
	}
}

/** Rows still spinning when the run ended never got to run. */
export function settleTools({ items }: { items: ChatItem[] }): ChatItem[] {
	return items.map((item) =>
		item.kind === "tool" &&
		(item.status === "pending" || item.status === "running")
			? { ...item, status: "cancelled" }
			: item,
	);
}

export function userItem({ text }: { text: string }): ChatItem {
	return { kind: "user", id: newId(), text };
}

export function noticeItem({
	variant,
	text,
}: {
	variant: ChatNoticeVariant;
	text: string;
}): ChatItem {
	return { kind: "notice", id: newId(), variant, text };
}

function findTool({
	items,
	id,
}: {
	items: ChatItem[];
	id: string;
}): ToolChatItem | undefined {
	return items.find(
		(item): item is ToolChatItem => item.kind === "tool" && item.id === id,
	);
}

function updateTool({
	items,
	id,
	patch,
}: {
	items: ChatItem[];
	id: string;
	patch: Partial<Omit<ToolChatItem, "kind" | "id">>;
}): ChatItem[] {
	return items.map((item) =>
		item.kind === "tool" && item.id === id ? { ...item, ...patch } : item,
	);
}

function upsertTool({
	items,
	id,
	name,
	patch,
}: {
	items: ChatItem[];
	id: string;
	name: string;
	patch: Partial<Omit<ToolChatItem, "kind" | "id">>;
}): ChatItem[] {
	if (findTool({ items, id })) {
		return updateTool({ items, id, patch });
	}
	return [...items, { kind: "tool", id, name, status: "pending", ...patch }];
}

const LABEL_MAX_LENGTH = 48;

/**
 * A one-line hint of what a call does, from its input: the text being added,
 * the time being split at. Generic on purpose so new tools get one for free.
 */
export function describeToolInput({ input }: { input: unknown }): string {
	if (typeof input !== "object" || input === null) {
		return "";
	}
	const parts: string[] = [];
	for (const [key, value] of Object.entries(input)) {
		if (typeof value === "string" && value) {
			parts.push(
				key.toLowerCase().endsWith("id") ? value.slice(0, 8) : `“${value}”`,
			);
		} else if (typeof value === "number") {
			parts.push(
				/seconds|time|start|end|duration/i.test(key)
					? formatSeconds({ seconds: value })
					: `${key} ${value}`,
			);
		} else if (typeof value === "boolean") {
			parts.push(`${key} ${value ? "sí" : "no"}`);
		}
	}
	const label = parts.join(" · ");
	return label.length > LABEL_MAX_LENGTH
		? `${label.slice(0, LABEL_MAX_LENGTH - 1)}…`
		: label;
}

export function formatSeconds({ seconds }: { seconds: number }): string {
	return `${(Math.round(seconds * 10) / 10).toFixed(1).replace(".", ",")} s`;
}

/** Tool output as readable text for the expanded row. */
export function describeToolResult({
	result,
}: {
	result: AgentToolResult;
}): string {
	return result.content
		.map((item) => (item.type === "text" ? item.text : "[imagen]"))
		.join("\n");
}
