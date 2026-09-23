import {
	AGENT_BRIDGE_DEFAULT_PORT,
	AGENT_BRIDGE_DEFAULT_TOKEN,
	parseServerMessage,
	type BridgeClientMessage,
} from "./protocol";
import { agentToolRegistry } from "./registry";
import { registerAgentTools } from "./tools";

export type BridgeStatus = "disabled" | "connecting" | "connected" | "offline";

export interface BridgeLogEntry {
	id: string;
	toolName: string;
	at: number;
	isError: boolean;
	summary: string;
}

const MAX_LOG_ENTRIES = 50;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

function isEnabled(): boolean {
	return process.env.NEXT_PUBLIC_AGENT_BRIDGE === "1";
}

function bridgeUrl(): string {
	return (
		process.env.NEXT_PUBLIC_AGENT_BRIDGE_URL ??
		`ws://127.0.0.1:${AGENT_BRIDGE_DEFAULT_PORT}`
	);
}

function bridgeToken(): string {
	return (
		process.env.NEXT_PUBLIC_AGENT_BRIDGE_TOKEN ?? AGENT_BRIDGE_DEFAULT_TOKEN
	);
}

/**
 * Connects the editor tab to the local MCP server and runs whatever the agent
 * asks for.
 *
 * The tab dials out rather than listening, so nothing about the editor is
 * reachable from outside the machine: close the tab and the tools are gone.
 */
class AgentBridge {
	private socket: WebSocket | null = null;
	private status: BridgeStatus = isEnabled() ? "connecting" : "disabled";
	private log: BridgeLogEntry[] = [];
	private listeners = new Set<() => void>();
	private reconnectDelay = RECONNECT_MIN_MS;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private started = false;

	start(): void {
		if (this.started || !isEnabled() || typeof window === "undefined") {
			return;
		}
		this.started = true;
		registerAgentTools();
		this.connect();
	}

	stop(): void {
		this.started = false;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.socket?.close();
		this.socket = null;
		this.setStatus({ status: isEnabled() ? "offline" : "disabled" });
	}

	getStatus(): BridgeStatus {
		return this.status;
	}

	getLog(): BridgeLogEntry[] {
		return this.log;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private connect(): void {
		if (!this.started) {
			return;
		}

		this.setStatus({ status: "connecting" });

		let socket: WebSocket;
		try {
			socket = new WebSocket(bridgeUrl());
		} catch {
			this.scheduleReconnect();
			return;
		}
		this.socket = socket;

		socket.addEventListener("open", () => {
			this.reconnectDelay = RECONNECT_MIN_MS;
			this.send({
				message: {
					type: "hello",
					token: bridgeToken(),
					tools: agentToolRegistry.describeAll(),
				},
			});
			this.setStatus({ status: "connected" });
		});

		socket.addEventListener("message", (event) => {
			void this.handleMessage({ data: String(event.data) });
		});

		socket.addEventListener("close", () => {
			this.socket = null;
			this.setStatus({ status: "offline" });
			this.scheduleReconnect();
		});

		// `error` is always followed by `close`, which is where reconnect happens.
		socket.addEventListener("error", () => {});
	}

	private async handleMessage({ data }: { data: string }): Promise<void> {
		const message = parseServerMessage({ data });
		if (!message) {
			return;
		}

		if (message.type === "error") {
			this.appendLog({
				entry: {
					id: crypto.randomUUID(),
					toolName: "bridge",
					at: Date.now(),
					isError: true,
					summary: message.message,
				},
			});
			return;
		}

		if (message.type !== "call") {
			return;
		}

		const result = await agentToolRegistry.call({
			name: message.name,
			input: message.input,
		});

		this.appendLog({
			entry: {
				id: message.id,
				toolName: message.name,
				at: Date.now(),
				isError: result.isError === true,
				summary: summarize({ result }),
			},
		});

		this.send({ message: { type: "result", id: message.id, result } });
	}

	private send({ message }: { message: BridgeClientMessage }): void {
		if (this.socket?.readyState !== WebSocket.OPEN) {
			return;
		}
		this.socket.send(JSON.stringify(message));
	}

	private scheduleReconnect(): void {
		if (!this.started || this.reconnectTimer) {
			return;
		}
		const delay = this.reconnectDelay;
		this.reconnectDelay = Math.min(delay * 2, RECONNECT_MAX_MS);
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, delay);
	}

	private setStatus({ status }: { status: BridgeStatus }): void {
		if (this.status === status) {
			return;
		}
		this.status = status;
		this.notify();
	}

	private appendLog({ entry }: { entry: BridgeLogEntry }): void {
		this.log = [entry, ...this.log].slice(0, MAX_LOG_ENTRIES);
		this.notify();
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}

function summarize({
	result,
}: {
	result: { content: Array<{ type: string; text?: string }> };
}): string {
	const first = result.content[0];
	if (!first) {
		return "(no output)";
	}
	if (first.type === "image") {
		return "(image)";
	}
	const text = first.text ?? "";
	return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

export const agentBridge = new AgentBridge();
export { isEnabled as isAgentBridgeEnabled };
