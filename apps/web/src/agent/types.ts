import type { z } from "zod";

/**
 * A piece of content returned by a tool. Mirrors the MCP content shape so the
 * bridge can forward results without translating them.
 */
export type AgentToolContent =
	| { type: "text"; text: string }
	| { type: "image"; data: string; mimeType: string };

export interface AgentToolResult {
	content: AgentToolContent[];
	isError?: boolean;
}

/**
 * A tool the agent can call. Deliberately transport-agnostic: the registry
 * knows nothing about MCP or WebSockets, so the same tools back the MCP server
 * today and an embedded chat later.
 *
 * The stored handler takes `unknown` so tools with different schemas can live
 * in one registry; `defineTool` is what recovers the precise type at the
 * definition site.
 */
export interface AgentTool {
	name: string;
	description: string;
	inputSchema: z.ZodType;
	handler: ({
		input,
	}: {
		input: unknown;
	}) => Promise<AgentToolResult> | AgentToolResult;
}

/**
 * Declare a tool with its input type inferred from the zod schema. The registry
 * validates before calling the handler, so the cast below is only restating a
 * guarantee that has already been checked at runtime.
 */
export function defineTool<TSchema extends z.ZodType>({
	name,
	description,
	inputSchema,
	handler,
}: {
	name: string;
	description: string;
	inputSchema: TSchema;
	handler: ({
		input,
	}: {
		input: z.output<TSchema>;
	}) => Promise<AgentToolResult> | AgentToolResult;
}): AgentTool {
	return {
		name,
		description,
		inputSchema,
		handler: ({ input }) => handler({ input: input as z.output<TSchema> }),
	};
}

/** Shape sent to the agent when it asks which tools exist. */
export interface AgentToolDescriptor {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

/**
 * Thrown by tool handlers when the input is valid JSON but does not describe
 * something the editor can act on (a clip that does not exist, say). The
 * message reaches the agent verbatim, so it should name the alternatives.
 */
export class AgentToolError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentToolError";
	}
}
