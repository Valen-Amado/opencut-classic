import { describe, expect, test } from "bun:test";
import {
	applyLoopEvent,
	describeToolInput,
	settleTools,
	userItem,
	type ChatItem,
} from "../transcript";
import type { AgentLoopEvent } from "../loop";

function fold({ events }: { events: AgentLoopEvent[] }): ChatItem[] {
	return events.reduce<ChatItem[]>(
		(items, event) => applyLoopEvent({ items, event }),
		[userItem({ text: "Divide el clip" })],
	);
}

describe("transcript", () => {
	test("streams text into the last assistant message", () => {
		const items = fold({
			events: [
				{ type: "text", text: "Mi" },
				{ type: "text", text: "ro." },
			],
		});

		expect(items).toHaveLength(2);
		expect(items[1]).toMatchObject({ kind: "assistant", text: "Miro." });
	});

	test("tracks a tool row from pending to done, then starts a new message", () => {
		const items = fold({
			events: [
				{ type: "text", text: "Miro." },
				{ type: "tool_pending", id: "t1", name: "split_clip" },
				{
					type: "tool_call",
					id: "t1",
					name: "split_clip",
					input: { elementId: "abc", seconds: 2 },
				},
				{
					type: "tool_result",
					id: "t1",
					result: { content: [{ type: "text", text: "ok" }] },
				},
				{ type: "text", text: "Listo." },
			],
		});

		expect(items.map((item) => item.kind)).toEqual([
			"user",
			"assistant",
			"tool",
			"assistant",
		]);
		expect(items[2]).toMatchObject({
			kind: "tool",
			status: "done",
			input: { elementId: "abc", seconds: 2 },
		});
		expect(items[3]).toMatchObject({ text: "Listo." });
	});

	test("marks failed and unfinished tools", () => {
		const failed = fold({
			events: [
				{ type: "tool_call", id: "t1", name: "x", input: {} },
				{
					type: "tool_result",
					id: "t1",
					result: { content: [{ type: "text", text: "no" }], isError: true },
				},
				{ type: "tool_pending", id: "t2", name: "y" },
			],
		});

		expect(failed[1]).toMatchObject({ status: "error" });
		expect(settleTools({ items: failed })[2]).toMatchObject({
			status: "cancelled",
		});
	});

	test("summarizes tool input in one short line", () => {
		expect(
			describeToolInput({
				input: { elementId: "0123456789", seconds: 2.34, content: "Hola" },
			}),
		).toBe("01234567 · 2,3 s · “Hola”");
		expect(describeToolInput({ input: {} })).toBe("");
		expect(
			describeToolInput({ input: { content: "x".repeat(100) } }),
		).toHaveLength(48);
	});
});
