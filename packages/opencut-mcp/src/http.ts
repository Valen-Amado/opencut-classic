import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { BridgeServer } from "./bridge-server";
import { log } from "./bridge-server";
import { buildServer } from "./server";

/**
 * Serve MCP over HTTP so claude.ai can reach it through a tunnel.
 *
 * Anthropic connects from their cloud, not from this machine, so the endpoint
 * has to be publicly reachable. Claude's connector UI sends no custom headers,
 * which leaves the URL itself as the only place to put a secret: the path
 * carries an unguessable token and anything else gets a flat 404.
 *
 * That is weaker than a real OAuth handshake. It is paired with two other
 * limits: reads are confined to OPENCUT_MEDIA_ROOT, and the tools only exist
 * while an editor tab is connected.
 */
export function startHttpServer({
	bridge,
	port,
	secret,
}: {
	bridge: BridgeServer;
	port: number;
	secret: string;
}): void {
	const expectedPath = `/mcp/${secret}`;

	const httpServer = createServer(
		(request: IncomingMessage, response: ServerResponse) => {
			void handle({ bridge, request, response, expectedPath });
		},
	);

	httpServer.listen(port, "127.0.0.1", () => {
		log({
			message: `HTTP transport on http://127.0.0.1:${port}${expectedPath} (expose it with a tunnel).`,
		});
	});
}

async function handle({
	bridge,
	request,
	response,
	expectedPath,
}: {
	bridge: BridgeServer;
	request: IncomingMessage;
	response: ServerResponse;
	expectedPath: string;
}): Promise<void> {
	const url = new URL(request.url ?? "/", "http://127.0.0.1");

	// Same answer for a wrong secret and a wrong route, so probing the endpoint
	// tells an attacker nothing about whether they found the right host.
	if (url.pathname !== expectedPath) {
		response.writeHead(404, { "content-type": "text/plain" });
		response.end("Not found");
		return;
	}

	let body: unknown;
	if (request.method === "POST") {
		body = await readJsonBody({ request });
	}

	// Stateless: every request builds its own server and transport, so there is
	// no session to hijack and no state to leak between callers.
	const server = buildServer({ bridge });
	const transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
	});

	response.on("close", () => {
		void transport.close();
		void server.close();
	});

	try {
		await server.connect(transport);
		await transport.handleRequest(request, response, body);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log({ message: `HTTP request failed: ${message}` });
		if (!response.headersSent) {
			response.writeHead(500, { "content-type": "application/json" });
			response.end(
				JSON.stringify({
					jsonrpc: "2.0",
					error: { code: -32603, message: "Internal server error" },
					id: null,
				}),
			);
		}
	}
}

function readJsonBody({
	request,
}: {
	request: IncomingMessage;
}): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;

		request.on("data", (chunk: Buffer) => {
			size += chunk.length;
			// A tool call carries base64 media, so the cap is generous, but it is
			// still a cap: this port may face the internet.
			if (size > 64 * 1024 * 1024) {
				reject(new Error("Request body too large"));
				request.destroy();
				return;
			}
			chunks.push(chunk);
		});
		request.on("end", () => {
			const raw = Buffer.concat(chunks).toString("utf8");
			if (raw.length === 0) {
				resolve(undefined);
				return;
			}
			try {
				resolve(JSON.parse(raw));
			} catch {
				reject(new Error("Body is not valid JSON"));
			}
		});
		request.on("error", reject);
	});
}
