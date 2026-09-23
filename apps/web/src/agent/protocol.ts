import type { AgentToolDescriptor, AgentToolResult } from "./types";

export const AGENT_BRIDGE_DEFAULT_PORT = 7801;
export const AGENT_BRIDGE_DEFAULT_TOKEN = "opencut-local-dev";

/**
 * Messages exchanged between the editor tab and the local MCP server.
 *
 * The editor tab is the one that connects out, so the server never has to reach
 * into the browser: it just waits for a tab to show up and announce its tools.
 */
export type BridgeClientMessage =
	| { type: "hello"; token: string; tools: AgentToolDescriptor[] }
	| { type: "result"; id: string; result: AgentToolResult };

export type BridgeServerMessage =
	| { type: "welcome" }
	| { type: "error"; message: string }
	| { type: "call"; id: string; name: string; input: unknown };

export function parseServerMessage({
	data,
}: {
	data: string;
}): BridgeServerMessage | null {
	try {
		const parsed = JSON.parse(data) as BridgeServerMessage;
		return typeof parsed?.type === "string" ? parsed : null;
	} catch {
		return null;
	}
}

export function parseClientMessage({
	data,
}: {
	data: string;
}): BridgeClientMessage | null {
	try {
		const parsed = JSON.parse(data) as BridgeClientMessage;
		return typeof parsed?.type === "string" ? parsed : null;
	} catch {
		return null;
	}
}
