import { afterAll, describe, expect, test } from "bun:test";
import type { Subprocess } from "bun";

/**
 * Drives the real server the way Claude does: spawn it, speak MCP over stdio,
 * and attach a tab over the WebSocket bridge.
 *
 * Everything here is real except the editor tab, which is simulated — the tools
 * themselves need a browser (WASM, IndexedDB), so this covers the wiring up to
 * the point where EditorCore takes over.
 */

const PORT = 7951;
const TOKEN = "e2e-token";
const ENTRY = new URL("../index.ts", import.meta.url).pathname;

const TOOLS = [
	{
		name: "get_timeline",
		description: "Tracks and clips.",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: "add_text",
		description: "Add a text overlay.",
		inputSchema: {
			type: "object",
			properties: { content: { type: "string" } },
			required: ["content"],
		},
	},
];

let child: Subprocess<"pipe", "pipe", "pipe"> | null = null;
let tab: WebSocket | null = null;

afterAll(() => {
	tab?.close();
	child?.kill();
});

function startServer(): Subprocess<"pipe", "pipe", "pipe"> {
	return Bun.spawn([process.execPath, ENTRY], {
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			OPENCUT_AGENT_PORT: String(PORT),
			OPENCUT_AGENT_TOKEN: TOKEN,
			OPENCUT_AGENT_TIMEOUT_MS: "5000",
		},
	});
}

/** Read newline-delimited JSON-RPC until the reply with `id` shows up. */
async function readUntilId({
	reader,
	id,
	buffer,
}: {
	reader: ReadableStreamDefaultReader<Uint8Array>;
	id: number;
	buffer: { text: string };
}): Promise<Record<string, unknown>> {
	const decoder = new TextDecoder();

	for (;;) {
		const lines = buffer.text.split("\n");
		buffer.text = lines.pop() ?? "";
		for (const line of lines) {
			if (!line.trim()) continue;
			const message = JSON.parse(line) as Record<string, unknown>;
			if (message.id === id) {
				return message;
			}
		}

		const { value, done } = await reader.read();
		if (done) {
			throw new Error("server closed stdout");
		}
		buffer.text += decoder.decode(value, { stream: true });
	}
}

function send({
	proc,
	message,
}: {
	proc: Subprocess<"pipe", "pipe", "pipe">;
	message: unknown;
}): void {
	proc.stdin.write(`${JSON.stringify(message)}\n`);
	proc.stdin.flush();
}

function connectTab(): Promise<WebSocket> {
	const socket = new WebSocket(`ws://127.0.0.1:${PORT}`);

	return new Promise((resolve, reject) => {
		socket.addEventListener("open", () => {
			socket.send(JSON.stringify({ type: "hello", token: TOKEN, tools: TOOLS }));
		});
		socket.addEventListener("message", (event) => {
			const message = JSON.parse(String(event.data));
			if (message.type === "welcome") {
				resolve(socket);
				return;
			}
			if (message.type === "call") {
				socket.send(
					JSON.stringify({
						type: "result",
						id: message.id,
						result: {
							content: [
								{
									type: "text",
									text: `ran ${message.name} with ${JSON.stringify(message.input)}`,
								},
							],
						},
					}),
				);
			}
		});
		socket.addEventListener("error", () => reject(new Error("tab failed")));
	});
}

describe("MCP server end to end", () => {
	test("hands Claude the tab's tools and routes a call to it", async () => {
		child = startServer();
		const reader = child.stdout.getReader();
		const buffer = { text: "" };

		send({
			proc: child,
			message: {
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "e2e", version: "1" },
				},
			},
		});
		const initialized = await readUntilId({ reader, id: 1, buffer });
		expect(
			(initialized.result as { serverInfo: { name: string } }).serverInfo.name,
		).toBe("opencut");

		send({
			proc: child,
			message: { jsonrpc: "2.0", method: "notifications/initialized" },
		});

		// Before a tab connects, the only tool is the one that says so.
		send({ proc: child, message: { jsonrpc: "2.0", id: 2, method: "tools/list" } });
		const empty = await readUntilId({ reader, id: 2, buffer });
		const emptyTools = (empty.result as { tools: Array<{ name: string }> }).tools;
		expect(emptyTools.map((tool) => tool.name)).toEqual(["opencut_status"]);

		tab = await connectTab();

		send({ proc: child, message: { jsonrpc: "2.0", id: 3, method: "tools/list" } });
		const listed = await readUntilId({ reader, id: 3, buffer });
		const tools = (listed.result as { tools: Array<{ name: string }> }).tools;
		expect(tools.map((tool) => tool.name)).toEqual(["get_timeline", "add_text"]);

		send({
			proc: child,
			message: {
				jsonrpc: "2.0",
				id: 4,
				method: "tools/call",
				params: { name: "add_text", arguments: { content: "Woaly" } },
			},
		});
		const called = await readUntilId({ reader, id: 4, buffer });
		const content = (called.result as { content: Array<{ text: string }> })
			.content;
		expect(content[0].text).toBe('ran add_text with {"content":"Woaly"}');
	}, 20_000);
});
