import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { BridgeServer, type ToolResult } from "./bridge-server";
import { MediaPathError, resolveInsideMediaRoot } from "./media-path";

export const NO_TAB_HINT =
	"No editor tab is connected. Open OpenCut (http://localhost:3000 with `bun dev:web`, or http://localhost:3100 under Docker) and make sure NEXT_PUBLIC_AGENT_BRIDGE=1.";

/**
 * `import_media` is the one tool a browser tab cannot satisfy on its own: it
 * cannot read a path off the disk. Read it here, inside the allowed media root,
 * and hand the bytes over so the agent can just say `path`.
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

	const resolved = resolveInsideMediaRoot({ path });
	const file = Bun.file(resolved);
	if (!(await file.exists())) {
		throw new Error(`No file at "${path}".`);
	}

	const bytes = new Uint8Array(await file.arrayBuffer());
	const { path: _dropped, ...rest } = input;
	return {
		...rest,
		dataBase64: Buffer.from(bytes).toString("base64"),
		filename: (input.filename as string | undefined) ?? resolved.split("/").pop(),
	};
}

export function buildServer({ bridge }: { bridge: BridgeServer }): Server {
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
			const message =
				error instanceof MediaPathError
					? error.message
					: error instanceof Error
						? error.message
						: String(error);
			return {
				content: [{ type: "text" as const, text: message }],
				isError: true,
			};
		}
	});

	return server;
}
