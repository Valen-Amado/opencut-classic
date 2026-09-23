#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { BridgeServer, log, type ToolResult } from "./bridge-server";

const PORT = Number(process.env.OPENCUT_AGENT_PORT ?? 7801);
const TOKEN = process.env.OPENCUT_AGENT_TOKEN ?? "opencut-local-dev";
const CALL_TIMEOUT_MS = Number(process.env.OPENCUT_AGENT_TIMEOUT_MS ?? 120_000);

const NO_TAB_HINT =
	"No editor tab is connected. Open OpenCut (http://localhost:3000 with `bun dev:web`, or http://localhost:3100 under Docker) and make sure NEXT_PUBLIC_AGENT_BRIDGE=1.";

const bridge = new BridgeServer({
	port: PORT,
	token: TOKEN,
	callTimeoutMs: CALL_TIMEOUT_MS,
});

/**
 * `import_media` is the one tool the browser cannot satisfy on its own: a tab
 * cannot read an arbitrary path off the disk. Read it here and hand the bytes
 * over, so the agent can just say `path`.
 */
async function resolveLocalPath({
	input,
}: {
	input: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
	const path = input.path;
	if (typeof path !== "string" || path.length === 0) {
		return input;
	}

	const file = Bun.file(path);
	if (!(await file.exists())) {
		throw new Error(`No file at "${path}".`);
	}

	const bytes = new Uint8Array(await file.arrayBuffer());
	const { path: _dropped, ...rest } = input;
	return {
		...rest,
		dataBase64: Buffer.from(bytes).toString("base64"),
		filename: (input.filename as string | undefined) ?? path.split("/").pop(),
	};
}

const server = new Server(
	{ name: "opencut", version: "0.1.0" },
	{ capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
	const tools = bridge.listTools();
	if (tools.length === 0) {
		// An empty list is the only honest answer, but say why in a tool the
		// agent can read, otherwise it looks like the server is broken.
		return {
			tools: [
				{
					name: "opencut_status",
					description: NO_TAB_HINT,
					inputSchema: { type: "object", properties: {} },
				},
			],
		};
	}

	return {
		tools: tools.map((tool) => ({
			name: tool.name,
			description: tool.description,
			inputSchema: tool.inputSchema,
		})),
	};
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params;

	if (name === "opencut_status") {
		return {
			content: [
				{
					type: "text" as const,
					text: bridge.isConnected()
						? "An editor tab is connected."
						: NO_TAB_HINT,
				},
			],
		};
	}

	try {
		const input =
			name === "import_media"
				? await resolveLocalPath({
						input: (args ?? {}) as Record<string, unknown>,
					})
				: (args ?? {});

		const result: ToolResult = await bridge.callTool({ name, input });
		return { content: result.content, isError: result.isError };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { content: [{ type: "text" as const, text: message }], isError: true };
	}
});

bridge.listen();

const transport = new StdioServerTransport();
await server.connect(transport);
log({ message: "MCP server ready on stdio." });
