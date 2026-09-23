import { z } from "zod";
import { DefinitionRegistry } from "@/params/definition-registry";
import {
	AgentToolError,
	type AgentTool,
	type AgentToolDescriptor,
	type AgentToolResult,
} from "./types";

export class AgentToolRegistry extends DefinitionRegistry<string, AgentTool> {
	constructor() {
		super("agent tool");
	}

	/** Tool definitions in the shape the agent expects, JSON Schema included. */
	describeAll(): AgentToolDescriptor[] {
		return this.getAll().map((tool) => ({
			name: tool.name,
			description: tool.description,
			inputSchema: z.toJSONSchema(tool.inputSchema, {
				io: "input",
			}) as Record<string, unknown>,
		}));
	}

	/**
	 * Validate `input` against the tool's schema and run it.
	 *
	 * Never throws: every failure comes back as a result with `isError`, because
	 * the agent recovers better from a readable message than from a dropped
	 * connection.
	 */
	async call({
		name,
		input,
	}: {
		name: string;
		input: unknown;
	}): Promise<AgentToolResult> {
		if (!this.has(name)) {
			const available = this.getAll()
				.map((tool) => tool.name)
				.sort()
				.join(", ");
			return errorResult({
				message: `Unknown tool "${name}". Available tools: ${available}`,
			});
		}

		const tool = this.get(name);
		const parsed = tool.inputSchema.safeParse(input ?? {});
		if (!parsed.success) {
			return errorResult({
				message: `Invalid input for "${name}": ${formatIssues({
					error: parsed.error,
				})}`,
			});
		}

		try {
			return await tool.handler({ input: parsed.data });
		} catch (error) {
			if (error instanceof AgentToolError) {
				return errorResult({ message: error.message });
			}
			const detail = error instanceof Error ? error.message : String(error);
			return errorResult({ message: `"${name}" failed: ${detail}` });
		}
	}
}

function formatIssues({ error }: { error: z.ZodError }): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.join(".");
			return path ? `${path}: ${issue.message}` : issue.message;
		})
		.join("; ");
}

export function errorResult({
	message,
}: {
	message: string;
}): AgentToolResult {
	return { content: [{ type: "text", text: message }], isError: true };
}

export function textResult({ text }: { text: string }): AgentToolResult {
	return { content: [{ type: "text", text }] };
}

export function jsonResult({ value }: { value: unknown }): AgentToolResult {
	return textResult({ text: JSON.stringify(value, null, 2) });
}

export const agentToolRegistry = new AgentToolRegistry();

export function registerAgentTool({ tool }: { tool: AgentTool }): void {
	agentToolRegistry.register({ key: tool.name, definition: tool });
}
