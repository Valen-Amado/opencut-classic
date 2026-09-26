import Anthropic from "@anthropic-ai/sdk";
import {
	AGENT_CHAT_ERRORS,
	MAX_CHAT_BODY_BYTES,
	agentChatRequestSchema,
	encodeWireEvent,
	type AgentChatErrorCode,
	type AgentChatRequest,
	type AgentChatWireEvent,
} from "./protocol";

export const AGENT_CHAT_MODEL = "claude-sonnet-5";
const AGENT_CHAT_MAX_TOKENS = 32_000;

/**
 * Frozen on purpose: it sits in the cached prefix with the tools, so anything
 * that changes per request (time, project name) must go in the messages.
 */
export const AGENT_CHAT_SYSTEM_PROMPT = `Eres el asistente de edición de OpenCut, un editor de video que corre en el navegador. Trabajas sobre el proyecto que la persona tiene abierto, usando las herramientas disponibles, que se ejecutan directamente en su editor.

Cómo trabajar:
- Antes de editar, inspecciona el proyecto con las herramientas de lectura (get_project_info, get_timeline, list_media, get_selection) para conocer los ids reales, los tiempos y el formato. Nunca inventes ids.
- Los tiempos se expresan en segundos.
- Si una petición es ambigua y equivocarte costaría trabajo, pregunta antes de editar. Si es razonable deducirla, hazla y di qué supusiste.
- Cuando una herramienta falle, lee el mensaje de error, corrige y vuelve a intentarlo si tiene sentido.
- Usa capture_frame cuando necesites ver cómo queda un fotograma de verdad.
- No exportes el video a menos que te lo pidan.

Cómo responder:
- Responde en el idioma de la persona (por defecto, español), en frases cortas y concretas.
- Al terminar, resume en una o dos frases qué cambiaste y dónde (clip, tiempo).
- Todo cambio se puede deshacer con ⌘Z / Ctrl+Z o con la herramienta undo; recuérdalo solo si viene al caso.`;

export interface AgentChatHandlerDeps {
	/** The server key, or undefined when the deployment has none configured. */
	getApiKey: () => string | undefined;
	isSignedIn: ({ request }: { request: Request }) => Promise<boolean>;
	isRateLimited: ({ request }: { request: Request }) => Promise<boolean>;
	streamReply: ({
		apiKey,
		body,
		signal,
	}: {
		apiKey: string;
		body: AgentChatRequest;
		signal: AbortSignal;
	}) => AsyncIterable<AgentChatWireEvent>;
}

/**
 * Build the route handler around its dependencies so the checks (session,
 * rate limit, key, body) can be tested without Next, a database or the network.
 *
 * The route never executes tools: it relays one Claude turn and ends. The
 * browser runs any tool_use against the live editor and calls back.
 */
export function createAgentChatHandler({
	getApiKey,
	isSignedIn,
	isRateLimited,
	streamReply,
}: AgentChatHandlerDeps): (request: Request) => Promise<Response> {
	return async (request) => {
		if (!(await isSignedIn({ request }))) {
			return errorResponse({
				error: AGENT_CHAT_ERRORS.unauthorized,
				status: 401,
			});
		}

		if (await isRateLimited({ request })) {
			return errorResponse({
				error: AGENT_CHAT_ERRORS.rateLimited,
				status: 429,
			});
		}

		const apiKey = getApiKey();
		if (!apiKey) {
			return errorResponse({
				error: AGENT_CHAT_ERRORS.missingApiKey,
				status: 503,
			});
		}

		const declaredLength = Number(request.headers.get("content-length") ?? 0);
		if (declaredLength > MAX_CHAT_BODY_BYTES) {
			return errorResponse({
				error: AGENT_CHAT_ERRORS.payloadTooLarge,
				status: 413,
			});
		}

		let json: unknown;
		try {
			json = await request.json();
		} catch {
			return errorResponse({
				error: AGENT_CHAT_ERRORS.invalidInput,
				status: 400,
			});
		}

		const parsed = agentChatRequestSchema.safeParse(json);
		if (!parsed.success) {
			return Response.json(
				{
					error: AGENT_CHAT_ERRORS.invalidInput,
					details: parsed.error.issues.slice(0, 10).map((issue) => ({
						path: issue.path.join("."),
						message: issue.message,
					})),
				},
				{ status: 400 },
			);
		}

		const events = streamReply({
			apiKey,
			body: parsed.data,
			signal: request.signal,
		});

		return new Response(toNdjsonStream({ events }), {
			status: 200,
			headers: {
				"Content-Type": "application/x-ndjson; charset=utf-8",
				"Cache-Control": "no-cache, no-transform",
				"X-Accel-Buffering": "no",
			},
		});
	};
}

function errorResponse({
	error,
	status,
}: {
	error: AgentChatErrorCode;
	status: number;
}): Response {
	return Response.json({ error }, { status });
}

/**
 * Once the 200 is out the status can no longer carry a failure, so errors
 * from Claude become a final `error` line instead.
 */
function toNdjsonStream({
	events,
}: {
	events: AsyncIterable<AgentChatWireEvent>;
}): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	const iterator = events[Symbol.asyncIterator]();

	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { done, value } = await iterator.next();
				if (done) {
					controller.close();
					return;
				}
				controller.enqueue(encoder.encode(encodeWireEvent({ event: value })));
			} catch (error) {
				controller.enqueue(
					encoder.encode(
						encodeWireEvent({
							event: { type: "error", message: describeError({ error }) },
						}),
					),
				);
				controller.close();
			}
		},
		async cancel() {
			await iterator.return?.();
		},
	});
}

/** Readable, non-leaky messages: the client shows them as-is. */
export function describeError({ error }: { error: unknown }): string {
	if (error instanceof Anthropic.AuthenticationError) {
		return "La clave ANTHROPIC_API_KEY del servidor no es válida.";
	}
	if (error instanceof Anthropic.RateLimitError) {
		return "Claude está recibiendo demasiadas peticiones. Intenta de nuevo en un momento.";
	}
	if (error instanceof Anthropic.BadRequestError) {
		return `Claude rechazó la petición: ${error.message}`;
	}
	if (error instanceof Anthropic.APIConnectionError) {
		return "No se pudo conectar con Claude.";
	}
	if (error instanceof Anthropic.APIError) {
		return `Error de Claude (${error.status ?? "sin estado"}).`;
	}
	return "Error inesperado al hablar con Claude.";
}

/**
 * One streamed Claude turn, re-emitted as wire events: text deltas as they
 * arrive, a marker when a tool call starts (so the panel can show it early),
 * then the complete message with its stop reason.
 */
export async function* streamClaudeReply({
	apiKey,
	body,
	signal,
}: {
	apiKey: string;
	body: AgentChatRequest;
	signal: AbortSignal;
}): AsyncGenerator<AgentChatWireEvent> {
	const client = new Anthropic({ apiKey });

	// Tool inputs here are small, and the complete message is only forwarded
	// once the turn ends, so eager input streaming would buy nothing.
	const stream = client.messages.stream(
		{
			model: AGENT_CHAT_MODEL,
			max_tokens: AGENT_CHAT_MAX_TOKENS,
			thinking: { type: "adaptive" },
			output_config: { effort: "medium" },
			// Tools render before the system prompt, so this breakpoint caches both.
			system: [
				{
					type: "text",
					text: AGENT_CHAT_SYSTEM_PROMPT,
					cache_control: { type: "ephemeral" },
				},
			],
			tools: body.tools,
			messages: body.messages,
			// Moving breakpoint on the conversation, so each loop iteration reuses
			// the history the previous one already paid for.
			cache_control: { type: "ephemeral" },
		},
		{ signal },
	);

	for await (const event of stream) {
		if (
			event.type === "content_block_start" &&
			event.content_block.type === "tool_use"
		) {
			yield {
				type: "tool_use_start",
				id: event.content_block.id,
				name: event.content_block.name,
			};
		} else if (
			event.type === "content_block_delta" &&
			event.delta.type === "text_delta"
		) {
			yield { type: "text", text: event.delta.text };
		}
	}

	const message = await stream.finalMessage();
	yield {
		type: "message",
		message: { content: message.content, stop_reason: message.stop_reason },
	};
}
