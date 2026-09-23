import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { AgentToolRegistry, textResult } from "../registry";
import { AgentToolError, defineTool } from "../types";

function buildRegistry(): AgentToolRegistry {
	const registry = new AgentToolRegistry();

	registry.register({
		key: "echo",
		definition: defineTool({
			name: "echo",
			description: "Echo a message back.",
			inputSchema: z.object({ message: z.string() }),
			handler: ({ input }) => textResult({ text: input.message }),
		}),
	});

	registry.register({
		key: "explode",
		definition: defineTool({
			name: "explode",
			description: "Always fails.",
			inputSchema: z.object({}),
			handler: () => {
				throw new AgentToolError("clip X does not exist, available: a, b");
			},
		}),
	});

	registry.register({
		key: "crash",
		definition: defineTool({
			name: "crash",
			description: "Throws something that is not an AgentToolError.",
			inputSchema: z.object({}),
			handler: () => {
				throw new TypeError("undefined is not a function");
			},
		}),
	});

	return registry;
}

describe("AgentToolRegistry", () => {
	test("runs a tool and returns its content", async () => {
		const result = await buildRegistry().call({
			name: "echo",
			input: { message: "hola" },
		});

		expect(result.isError).toBeUndefined();
		expect(result.content).toEqual([{ type: "text", text: "hola" }]);
	});

	test("names the available tools when one is unknown", async () => {
		const result = await buildRegistry().call({ name: "nope", input: {} });

		expect(result.isError).toBe(true);
		const [content] = result.content;
		expect(content.type).toBe("text");
		expect(content.type === "text" && content.text).toContain("crash, echo, explode");
	});

	test("reports which field failed validation instead of throwing", async () => {
		const result = await buildRegistry().call({
			name: "echo",
			input: { message: 42 },
		});

		expect(result.isError).toBe(true);
		const [content] = result.content;
		expect(content.type === "text" && content.text).toContain("message");
	});

	test("passes an AgentToolError message through verbatim", async () => {
		const result = await buildRegistry().call({ name: "explode", input: {} });

		expect(result.isError).toBe(true);
		const [content] = result.content;
		expect(content.type === "text" && content.text).toBe(
			"clip X does not exist, available: a, b",
		);
	});

	test("turns an unexpected throw into an error result, not a rejection", async () => {
		const result = await buildRegistry().call({ name: "crash", input: {} });

		expect(result.isError).toBe(true);
		const [content] = result.content;
		expect(content.type === "text" && content.text).toContain(
			"undefined is not a function",
		);
	});

	test("treats missing input as an empty object", async () => {
		const registry = new AgentToolRegistry();
		registry.register({
			key: "ping",
			definition: defineTool({
				name: "ping",
				description: "No input needed.",
				inputSchema: z.object({}),
				handler: () => textResult({ text: "pong" }),
			}),
		});

		const result = await registry.call({ name: "ping", input: undefined });
		expect(result.content).toEqual([{ type: "text", text: "pong" }]);
	});

	test("describes tools as JSON Schema for the agent", () => {
		const described = buildRegistry().describeAll();
		const echo = described.find((tool) => tool.name === "echo");

		expect(echo).toBeDefined();
		expect(echo?.description).toBe("Echo a message back.");
		expect(echo?.inputSchema).toMatchObject({
			type: "object",
			properties: { message: { type: "string" } },
		});
	});
});
