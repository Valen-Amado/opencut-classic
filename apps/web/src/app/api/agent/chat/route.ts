import { createAgentChatHandler, streamClaudeReply } from "@/agent/chat/server";
import { checkRateLimit } from "@/auth/rate-limit";
import { auth } from "@/auth/server";
import { webEnv } from "@/env/web";

// Streams for as long as Claude takes to answer; never prerender or cache.
export const dynamic = "force-dynamic";

const handler = createAgentChatHandler({
	getApiKey: () => webEnv.ANTHROPIC_API_KEY || undefined,
	isSignedIn: async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		return session !== null;
	},
	isRateLimited: async ({ request }) => {
		const { limited } = await checkRateLimit({ request });
		return limited;
	},
	streamReply: streamClaudeReply,
});

export async function POST(request: Request) {
	return handler(request);
}
