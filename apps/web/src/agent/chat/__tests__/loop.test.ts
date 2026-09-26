import { describe, expect, test } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import type { AgentToolResult } from "../../types";
import {
	AgentChatRequestError,
	CANCELLED_TOOL_TEXT,
	runAgentLoop,
	type AgentChatFetch,
	type AgentLoopEvent,
} from "../loop";
import { encodeWireEvent, type AgentChatWireEvent } from "../protocol";

const tools: Anthropic.Tool[] = [
	{
		name: "get_timeline",
		description: "Every track and clip.",
		input_schema: { type: "object", properties: {} },
	},
];

const userTurn: Anthropic.MessageParam[] = [
	{ role: "user", content: "Divide el clip en el cabezal" },
];

function ndjsonResponse({
	events,
}: {
	events: AgentChatWireEvent[];
}): Response {
	const body = events.map((event) => encodeWireEvent({ event })).join("");
	return new Response(body, {
		status: 200,
		headers: { "Content-Type": "application/x-ndjson" },
	});
}

function textMessage({ text }: { text: string }): AgentChatWireEvent {
	return {
		type: "message",
		message: {
			content: [{ type: "text", text, citations: null }],
			stop_reason: "end_turn",
		},
	};
}

interface RecordedRequest {
	messages: Anthropic.MessageParam[];
	tools: Anthropic.Tool[];
}

/** A fetch that answers each call with the next scripted response. */
function scriptedFetch({ responses }: { responses: Array<() => Response> }) {
	const requests: RecordedRequest[] = [];
	const fetchImpl: AgentChatFetch = async ({ init }) => {
		const parsed: RecordedRequest = JSON.parse(String(init.body));
		requests.push(parsed);
		const next = responses[requests.length - 1];
		if (!next) {
			throw new Error("Unexpected request");
		}
		return next();
	};
	return { fetchImpl, requests };
}

function recordEvents() {
	const events: AgentLoopEvent[] = [];
	return { events, onEvent: (event: AgentLoopEvent) => events.push(event) };
}

const okTool = async (): Promise<AgentToolResult> => ({
	content: [{ type: "text", text: '{"tracks":[]}' }],
});

describe("runAgentLoop", () => {
	test("streams a text-only turn and stops", async () => {
		const { fetchImpl, requests } = scriptedFetch({
			responses: [
				() =>
					ndjsonResponse({
						events: [
							{ type: "text", text: "Ho" },
							{ type: "text", text: "la" },
							textMessage({ text: "Hola" }),
						],
					}),
			],
		});
		const { events, onEvent } = recordEvents();

		const outcome = await runAgentLoop({
			messages: userTurn,
			tools,
			callTool: okTool,
			onEvent,
			fetchImpl,
		});

		expect(outcome).toEqual({ status: "done", stopReason: "end_turn" });
		expect(requests).toHaveLength(1);
		expect(requests[0]?.tools).toEqual(tools);
		expect(
			events.filter((event) => event.type === "text").map((e) => e.text),
		).toEqual(["Ho", "la"]);

		const history = events.findLast((event) => event.type === "history");
		expect(history?.type === "history" && history.messages).toEqual([
			...userTurn,
			{ role: "assistant", content: [{ type: "text", text: "Hola" }] },
		]);
	});

	test("runs a tool call, sends the result back and finishes", async () => {
		const { fetchImpl, requests } = scriptedFetch({
			responses: [
				() =>
					ndjsonResponse({
						events: [
							{ type: "text", text: "Miro la línea de tiempo." },
							{ type: "tool_use_start", id: "toolu_1", name: "get_timeline" },
							{
								type: "message",
								message: {
									content: [
										{ type: "thinking", thinking: "", signature: "sig" },
										{
											type: "text",
											text: "Miro la línea de tiempo.",
											citations: null,
										},
										{
											type: "tool_use",
											id: "toolu_1",
											name: "get_timeline",
											input: {},
											caller: { type: "direct" },
										},
									],
									stop_reason: "tool_use",
								},
							},
						],
					}),
				() =>
					ndjsonResponse({
						events: [
							{ type: "text", text: "Está vacía." },
							textMessage({ text: "Está vacía." }),
						],
					}),
			],
		});
		const calls: Array<{ name: string; input: unknown }> = [];
		const { events, onEvent } = recordEvents();

		const outcome = await runAgentLoop({
			messages: userTurn,
			tools,
			callTool: async (call) => {
				calls.push(call);
				return okTool();
			},
			onEvent,
			fetchImpl,
		});

		expect(outcome).toEqual({ status: "done", stopReason: "end_turn" });
		expect(calls).toEqual([{ name: "get_timeline", input: {} }]);
		expect(events.map((event) => event.type)).toEqual([
			"text",
			"tool_pending",
			"history",
			"tool_call",
			"tool_result",
			"history",
			"text",
			"history",
		]);

		const second = requests[1];
		expect(second?.messages).toHaveLength(3);
		// Thinking signatures go back untouched; response-only fields do not.
		expect(second?.messages[1]).toEqual({
			role: "assistant",
			content: [
				{ type: "thinking", thinking: "", signature: "sig" },
				{ type: "text", text: "Miro la línea de tiempo." },
				{ type: "tool_use", id: "toolu_1", name: "get_timeline", input: {} },
			],
		});
		expect(second?.messages[2]).toEqual({
			role: "user",
			content: [
				{
					type: "tool_result",
					tool_use_id: "toolu_1",
					content: [{ type: "text", text: '{"tracks":[]}' }],
				},
			],
		});
	});

	test("reports a missing API key as a typed error", async () => {
		const { fetchImpl } = scriptedFetch({
			responses: [
				() => Response.json({ error: "missing_api_key" }, { status: 503 }),
			],
		});

		const promise = runAgentLoop({
			messages: userTurn,
			tools,
			callTool: okTool,
			onEvent: () => {},
			fetchImpl,
		});

		await expect(promise).rejects.toBeInstanceOf(AgentChatRequestError);
		await promise.catch((error: AgentChatRequestError) => {
			expect(error.kind).toBe("missing_api_key");
			expect(error.status).toBe(503);
		});
	});

	test("surfaces a stream error line", async () => {
		const { fetchImpl } = scriptedFetch({
			responses: [
				() =>
					ndjsonResponse({
						events: [{ type: "error", message: "Claude no respondió" }],
					}),
			],
		});

		await expect(
			runAgentLoop({
				messages: userTurn,
				tools,
				callTool: okTool,
				onEvent: () => {},
				fetchImpl,
			}),
		).rejects.toThrow("Claude no respondió");
	});

	test("cancels while the reply is streaming", async () => {
		const controller = new AbortController();
		const fetchImpl: AgentChatFetch = async ({ init }) => {
			const encoder = new TextEncoder();
			const signal = init.signal;
			const body = new ReadableStream<Uint8Array>({
				start(stream) {
					stream.enqueue(
						encoder.encode(
							encodeWireEvent({ event: { type: "text", text: "Empie" } }),
						),
					);
					signal?.addEventListener("abort", () => {
						stream.error(new DOMException("Aborted", "AbortError"));
					});
				},
			});
			return new Response(body, { status: 200 });
		};

		const outcome = await runAgentLoop({
			messages: userTurn,
			tools,
			callTool: okTool,
			onEvent: (event) => {
				if (event.type === "text") {
					controller.abort();
				}
			},
			fetchImpl,
			signal: controller.signal,
		});

		expect(outcome).toEqual({ status: "cancelled" });
	});

	test("cancels between tool calls and keeps the history valid", async () => {
		const controller = new AbortController();
		const { fetchImpl, requests } = scriptedFetch({
			responses: [
				() =>
					ndjsonResponse({
						events: [
							{
								type: "message",
								message: {
									content: [
										{
											type: "tool_use",
											id: "toolu_a",
											name: "get_timeline",
											input: {},
											caller: { type: "direct" },
										},
										{
											type: "tool_use",
											id: "toolu_b",
											name: "get_timeline",
											input: {},
											caller: { type: "direct" },
										},
									],
									stop_reason: "tool_use",
								},
							},
						],
					}),
			],
		});
		let callCount = 0;
		const { events, onEvent } = recordEvents();

		const outcome = await runAgentLoop({
			messages: userTurn,
			tools,
			callTool: async () => {
				callCount++;
				controller.abort();
				return okTool();
			},
			onEvent,
			fetchImpl,
			signal: controller.signal,
		});

		expect(outcome).toEqual({ status: "cancelled" });
		expect(callCount).toBe(1);
		expect(requests).toHaveLength(1);

		const history = events.findLast((event) => event.type === "history");
		const last =
			history?.type === "history" ? history.messages.at(-1) : undefined;
		expect(last).toEqual({
			role: "user",
			content: [
				{
					type: "tool_result",
					tool_use_id: "toolu_a",
					content: [{ type: "text", text: '{"tracks":[]}' }],
				},
				{
					type: "tool_result",
					tool_use_id: "toolu_b",
					content: CANCELLED_TOOL_TEXT,
					is_error: true,
				},
			],
		});
	});

	test("stops after the iteration limit", async () => {
		const toolTurn = () =>
			ndjsonResponse({
				events: [
					{
						type: "message",
						message: {
							content: [
								{
									type: "tool_use",
									id: crypto.randomUUID(),
									name: "get_timeline",
									input: {},
									caller: { type: "direct" },
								},
							],
							stop_reason: "tool_use",
						},
					},
				],
			});
		const { fetchImpl, requests } = scriptedFetch({
			responses: [toolTurn, toolTurn, toolTurn],
		});

		const outcome = await runAgentLoop({
			messages: userTurn,
			tools,
			callTool: okTool,
			onEvent: () => {},
			fetchImpl,
			maxIterations: 2,
		});

		expect(outcome).toEqual({ status: "max_iterations" });
		expect(requests).toHaveLength(2);
	});

	test("answers tool calls left over from a cancelled turn", async () => {
		const { fetchImpl, requests } = scriptedFetch({
			responses: [
				() => ndjsonResponse({ events: [textMessage({ text: "Ok" })] }),
			],
		});

		await runAgentLoop({
			messages: [
				...userTurn,
				{
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id: "toolu_x",
							name: "get_timeline",
							input: {},
						},
					],
				},
				{ role: "user", content: "Mejor no" },
			],
			tools,
			callTool: okTool,
			onEvent: () => {},
			fetchImpl,
		});

		expect(requests[0]?.messages[2]).toEqual({
			role: "user",
			content: [
				{
					type: "tool_result",
					tool_use_id: "toolu_x",
					content: CANCELLED_TOOL_TEXT,
					is_error: true,
				},
				{ type: "text", text: "Mejor no" },
			],
		});
	});
});
