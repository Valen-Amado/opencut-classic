#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BridgeServer, log } from "./bridge-server";
import { startHttpServer } from "./http";
import { getMediaRoot } from "./media-path";
import { buildServer } from "./server";

const PORT = Number(process.env.OPENCUT_AGENT_PORT ?? 7801);
const TOKEN = process.env.OPENCUT_AGENT_TOKEN ?? "opencut-local-dev";
const CALL_TIMEOUT_MS = Number(process.env.OPENCUT_AGENT_TIMEOUT_MS ?? 120_000);

const HTTP_ENABLED = process.env.OPENCUT_MCP_HTTP === "1";
const HTTP_PORT = Number(process.env.OPENCUT_MCP_HTTP_PORT ?? 7802);
const HTTP_SECRET = process.env.OPENCUT_MCP_HTTP_SECRET ?? "";

const bridge = new BridgeServer({
	port: PORT,
	token: TOKEN,
	callTimeoutMs: CALL_TIMEOUT_MS,
});

bridge.listen();

if (HTTP_ENABLED) {
	if (HTTP_SECRET.length < 24) {
		log({
			message:
				"Refusing to start the HTTP transport: set OPENCUT_MCP_HTTP_SECRET to at least 24 random characters. It is the only thing guarding the endpoint.",
		});
		process.exit(1);
	}

	log({ message: `Local media reads are confined to ${getMediaRoot()}.` });
	startHttpServer({ bridge, port: HTTP_PORT, secret: HTTP_SECRET });
}

// stdio is always available: it costs nothing when nobody is attached, and it
// is how Claude Code and Claude Desktop launch this process.
const server = buildServer({ bridge });
const transport = new StdioServerTransport();
await server.connect(transport);
log({ message: "MCP server ready on stdio." });
