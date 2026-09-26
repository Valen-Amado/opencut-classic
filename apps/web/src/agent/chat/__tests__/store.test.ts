import { afterEach, describe, expect, test } from "bun:test";
import { getConversation, useAgentChatStore } from "../store";

const realFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = realFetch;
});

function stubFetch({ response }: { response: () => Response }) {
	const bodies: unknown[] = [];
	globalThis.fetch = Object.assign(
		async (_input: RequestInfo | URL, init?: RequestInit) => {
			bodies.push(JSON.parse(String(init?.body)));
			return response();
		},
		{ preconnect: realFetch.preconnect },
	);
	return { bodies };
}

describe("useAgentChatStore", () => {
	test("sends the registry tools and shows a setup notice without a key", async () => {
		const { bodies } = stubFetch({
			response: () =>
				Response.json({ error: "missing_api_key" }, { status: 503 }),
		});

		await useAgentChatStore
			.getState()
			.send({ projectId: "p1", text: "¿Qué hay en mi línea de tiempo?" });

		const conversation = getConversation({
			conversations: useAgentChatStore.getState().conversations,
			projectId: "p1",
		});
		expect(conversation.status).toBe("idle");
		expect(conversation.items.map((item) => item.kind)).toEqual([
			"user",
			"notice",
		]);
		expect(conversation.items[1]).toMatchObject({ variant: "missing_api_key" });

		// Tools are registered for the chat even with the MCP bridge disabled.
		const [body] = bodies;
		expect(body).toMatchObject({
			tools: expect.arrayContaining([
				expect.objectContaining({ name: "get_timeline" }),
			]),
		});
	});

	test("keeps conversations per project and resets one", async () => {
		stubFetch({
			response: () =>
				new Response(
					`${JSON.stringify({
						type: "message",
						message: {
							content: [{ type: "text", text: "Hola", citations: null }],
							stop_reason: "end_turn",
						},
					})}\n`,
				),
		});

		const store = useAgentChatStore.getState();
		await store.send({ projectId: "a", text: "Hola" });
		await store.send({ projectId: "b", text: "Hola" });
		store.reset({ projectId: "a" });

		const { conversations } = useAgentChatStore.getState();
		expect(getConversation({ conversations, projectId: "a" }).items).toEqual(
			[],
		);
		expect(
			getConversation({ conversations, projectId: "b" }).messages,
		).toHaveLength(2);
	});
});
