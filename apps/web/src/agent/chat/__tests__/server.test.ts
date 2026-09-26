import { describe, expect, test } from "bun:test";
import {
	readWireEvents,
	type AgentChatRequest,
	type AgentChatWireEvent,
} from "../protocol";
import { createAgentChatHandler, type AgentChatHandlerDeps } from "../server";

const validBody: AgentChatRequest = {
	messages: [{ role: "user", content: "Divide el clip en el cabezal" }],
	tools: [
		{
			name: "get_timeline",
			description: "Every track and clip.",
			input_schema: { type: "object", properties: {} },
		},
	],
};

function buildHandler(overrides: Partial<AgentChatHandlerDeps> = {}) {
	const calls: AgentChatRequest[] = [];
	const handler = createAgentChatHandler({
		getApiKey: () => "sk-test",
		isSignedIn: async () => true,
		isRateLimited: async () => false,
		streamReply: async function* ({ body }) {
			calls.push(body);
			yield { type: "text", text: "Hola" };
			yield {
				type: "message",
				message: {
					content: [{ type: "text", text: "Hola", citations: null }],
					stop_reason: "end_turn",
				},
			};
		},
		...overrides,
	});
	return { handler, calls };
}

function post({ body }: { body: unknown }): Request {
	return new Request("http://localhost/api/agent/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

async function collect({
	response,
}: {
	response: Response;
}): Promise<AgentChatWireEvent[]> {
	const events: AgentChatWireEvent[] = [];
	if (!response.body) {
		return events;
	}
	for await (const event of readWireEvents({ body: response.body })) {
		events.push(event);
	}
	return events;
}

describe("POST /api/agent/chat handler", () => {
	test("rejects requests without a session", async () => {
		const { handler, calls } = buildHandler({ isSignedIn: async () => false });
		const response = await handler(post({ body: validBody }));

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "unauthorized" });
		expect(calls).toHaveLength(0);
	});

	test("rejects rate-limited requests", async () => {
		const { handler } = buildHandler({ isRateLimited: async () => true });
		const response = await handler(post({ body: validBody }));

		expect(response.status).toBe(429);
	});

	test("reports a missing API key with 503", async () => {
		const { handler, calls } = buildHandler({ getApiKey: () => undefined });
		const response = await handler(post({ body: validBody }));

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: "missing_api_key" });
		expect(calls).toHaveLength(0);
	});

	test("rejects malformed JSON", async () => {
		const { handler } = buildHandler();
		const response = await handler(post({ body: "{not json" }));

		expect(response.status).toBe(400);
	});

	test("rejects a history that does not start with the user", async () => {
		const { handler, calls } = buildHandler();
		const response = await handler(
			post({
				body: {
					...validBody,
					messages: [{ role: "assistant", content: "Hola" }],
				},
			}),
		);

		expect(response.status).toBe(400);
		expect(calls).toHaveLength(0);
	});

	test("rejects unknown block types and bad tool schemas", async () => {
		const { handler } = buildHandler();

		const badBlock = await handler(
			post({
				body: {
					...validBody,
					messages: [
						{ role: "user", content: [{ type: "server_secret", x: 1 }] },
					],
				},
			}),
		);
		expect(badBlock.status).toBe(400);

		const badTool = await handler(
			post({
				body: {
					...validBody,
					tools: [
						{ name: "x y", description: "", input_schema: { type: "array" } },
					],
				},
			}),
		);
		expect(badTool.status).toBe(400);
	});

	test("accepts a full tool round trip and streams NDJSON", async () => {
		const { handler, calls } = buildHandler();
		const response = await handler(
			post({
				body: {
					...validBody,
					messages: [
						{ role: "user", content: "¿Qué hay en mi línea de tiempo?" },
						{
							role: "assistant",
							content: [
								{ type: "thinking", thinking: "", signature: "sig" },
								{ type: "text", text: "Miro.", citations: null },
								{
									type: "tool_use",
									id: "toolu_1",
									name: "get_timeline",
									input: {},
								},
							],
						},
						{
							role: "user",
							content: [
								{
									type: "tool_result",
									tool_use_id: "toolu_1",
									content: [
										{ type: "text", text: "{}" },
										{
											type: "image",
											source: {
												type: "base64",
												media_type: "image/png",
												data: "AAAA",
											},
										},
									],
								},
							],
						},
					],
				},
			}),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain(
			"application/x-ndjson",
		);
		const events = await collect({ response });
		expect(events.map((event) => event.type)).toEqual(["text", "message"]);

		// Extra fields from response blocks (citations: null) are stripped.
		const assistant = calls[0]?.messages[1];
		expect(assistant?.content).toEqual([
			{ type: "thinking", thinking: "", signature: "sig" },
			{ type: "text", text: "Miro." },
			{ type: "tool_use", id: "toolu_1", name: "get_timeline", input: {} },
		]);
	});

	test("turns a failure mid-stream into a final error line", async () => {
		const { handler } = buildHandler({
			streamReply: async function* () {
				yield { type: "text", text: "Emp" };
				throw new Error("boom");
			},
		});
		const response = await handler(post({ body: validBody }));

		expect(response.status).toBe(200);
		const events = await collect({ response });
		expect(events[0]).toEqual({ type: "text", text: "Emp" });
		expect(events[1]?.type).toBe("error");
	});
});
