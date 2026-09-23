import type { ServerWebSocket } from "bun";

/**
 * Wire contract with the editor tab.
 *
 * Source of truth: `apps/web/src/agent/protocol.ts`. It is restated here rather
 * than imported because this package must not pull in the Next app.
 */
export interface ToolDescriptor {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

export interface ToolResult {
	content: Array<
		{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
	>;
	isError?: boolean;
}

type ClientMessage =
	| { type: "hello"; token: string; tools: ToolDescriptor[] }
	| { type: "result"; id: string; result: ToolResult };

interface Pending {
	resolve: (result: ToolResult) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

export class BridgeServer {
	private tab: ServerWebSocket<unknown> | null = null;
	private tools: ToolDescriptor[] = [];
	private pending = new Map<string, Pending>();
	private nextId = 1;

	constructor(
		private options: {
			port: number;
			token: string;
			callTimeoutMs: number;
		},
	) {}

	listen(): void {
		Bun.serve({
			hostname: "127.0.0.1",
			port: this.options.port,
			fetch: (request, server) =>
				server.upgrade(request)
					? undefined
					: new Response("This port serves the OpenCut agent bridge.", {
							status: 426,
						}),
			websocket: {
				message: (socket, raw) => {
					this.handleMessage({ socket, raw: String(raw) });
				},
				close: (socket) => {
					if (this.tab === socket) {
						this.tab = null;
						this.tools = [];
						log({ message: "Editor tab disconnected." });
					}
				},
			},
		});

		log({
			message: `Bridge listening on ws://127.0.0.1:${this.options.port} (loopback only).`,
		});
	}

	isConnected(): boolean {
		return this.tab !== null;
	}

	listTools(): ToolDescriptor[] {
		return this.tools;
	}

	/** Forward a tool call to the editor tab and wait for its answer. */
	callTool({
		name,
		input,
	}: {
		name: string;
		input: unknown;
	}): Promise<ToolResult> {
		const tab = this.tab;
		if (!tab) {
			return Promise.reject(
				new Error(
					"No editor tab is connected. Open OpenCut at http://localhost:3000 (or :3100 under Docker) with NEXT_PUBLIC_AGENT_BRIDGE=1.",
				),
			);
		}

		const id = String(this.nextId++);
		return new Promise<ToolResult>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(
					new Error(
						`"${name}" did not answer within ${this.options.callTimeoutMs}ms. The tab may be busy rendering.`,
					),
				);
			}, this.options.callTimeoutMs);

			this.pending.set(id, { resolve, reject, timer });
			tab.send(JSON.stringify({ type: "call", id, name, input }));
		});
	}

	private handleMessage({
		socket,
		raw,
	}: {
		socket: ServerWebSocket<unknown>;
		raw: string;
	}): void {
		let message: ClientMessage;
		try {
			message = JSON.parse(raw) as ClientMessage;
		} catch {
			return;
		}

		if (message.type === "hello") {
			if (message.token !== this.options.token) {
				socket.send(
					JSON.stringify({ type: "error", message: "Invalid bridge token." }),
				);
				socket.close();
				log({ message: "Rejected a tab: wrong token." });
				return;
			}

			this.tab = socket;
			this.tools = message.tools;
			socket.send(JSON.stringify({ type: "welcome" }));
			log({
				message: `Editor tab connected with ${message.tools.length} tools.`,
			});
			return;
		}

		if (message.type === "result") {
			const pending = this.pending.get(message.id);
			if (!pending) {
				return;
			}
			clearTimeout(pending.timer);
			this.pending.delete(message.id);
			pending.resolve(message.result);
		}
	}
}

/** stdout carries the MCP protocol, so every log line goes to stderr. */
export function log({ message }: { message: string }): void {
	process.stderr.write(`[opencut-mcp] ${message}\n`);
}
