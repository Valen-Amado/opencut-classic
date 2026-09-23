import { afterEach, describe, expect, test } from "bun:test";
import { BridgeServer, type ToolDescriptor } from "../bridge-server";

const TOKEN = "test-token";

const ECHO_TOOL: ToolDescriptor = {
	name: "echo",
	description: "Echo a message.",
	inputSchema: { type: "object", properties: { message: { type: "string" } } },
};

let port = 7900;
const openSockets: WebSocket[] = [];

function startServer({
	callTimeoutMs = 2_000,
}: { callTimeoutMs?: number } = {}): {
	bridge: BridgeServer;
	url: string;
} {
	port++;
	const bridge = new BridgeServer({ port, token: TOKEN, callTimeoutMs });
	bridge.listen();
	return { bridge, url: `ws://127.0.0.1:${port}` };
}

/** Stand-in for the editor tab: says hello, then answers calls. */
function connectFakeTab({
	url,
	token = TOKEN,
	onCall,
}: {
	url: string;
	token?: string;
	onCall?: (call: { id: string; name: string; input: unknown }) => void;
}): Promise<WebSocket> {
	const socket = new WebSocket(url);
	openSockets.push(socket);

	return new Promise((resolve, reject) => {
		socket.addEventListener("open", () => {
			socket.send(JSON.stringify({ type: "hello", token, tools: [ECHO_TOOL] }));
		});
		socket.addEventListener("message", (event) => {
			const message = JSON.parse(String(event.data));
			if (message.type === "welcome") {
				resolve(socket);
				return;
			}
			if (message.type === "error") {
				reject(new Error(message.message));
				return;
			}
			if (message.type === "call") {
				onCall?.(message);
			}
		});
		socket.addEventListener("error", () => reject(new Error("socket error")));
	});
}

afterEach(() => {
	for (const socket of openSockets.splice(0)) {
		socket.close();
	}
});

describe("BridgeServer", () => {
	test("has no tools until a tab connects", () => {
		const { bridge } = startServer();
		expect(bridge.isConnected()).toBe(false);
		expect(bridge.listTools()).toEqual([]);
	});

	test("registers the tools a tab announces", async () => {
		const { bridge, url } = startServer();
		await connectFakeTab({ url });

		expect(bridge.isConnected()).toBe(true);
		expect(bridge.listTools()).toEqual([ECHO_TOOL]);
	});

	test("rejects a tab with the wrong token", async () => {
		const { bridge, url } = startServer();

		await expect(
			connectFakeTab({ url, token: "wrong" }),
		).rejects.toThrow("Invalid bridge token");
		expect(bridge.isConnected()).toBe(false);
	});

	test("round-trips a tool call to the tab", async () => {
		const { bridge, url } = startServer();
		const socket = await connectFakeTab({
			url,
			onCall: ({ id, input }) => {
				socket.send(
					JSON.stringify({
						type: "result",
						id,
						result: {
							content: [
								{
									type: "text",
									text: (input as { message: string }).message,
								},
							],
						},
					}),
				);
			},
		});

		const result = await bridge.callTool({
			name: "echo",
			input: { message: "hola" },
		});
		expect(result.content).toEqual([{ type: "text", text: "hola" }]);
	});

	test("explains what to open when no tab is connected", async () => {
		const { bridge } = startServer();

		await expect(
			bridge.callTool({ name: "echo", input: {} }),
		).rejects.toThrow("No editor tab is connected");
	});

	test("times out instead of hanging when the tab never answers", async () => {
		const { bridge, url } = startServer({ callTimeoutMs: 150 });
		await connectFakeTab({ url });

		await expect(
			bridge.callTool({ name: "echo", input: {} }),
		).rejects.toThrow("did not answer within 150ms");
	});
});
