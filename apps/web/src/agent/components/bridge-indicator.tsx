"use client";

import { useEffect, useSyncExternalStore } from "react";
import { agentBridge, isAgentBridgeEnabled, type BridgeStatus } from "../bridge";

const STATUS_LABEL: Record<BridgeStatus, string> = {
	disabled: "Agente desactivado",
	connecting: "Conectando con el agente...",
	connected: "Agente conectado",
	offline: "Agente desconectado",
};

const STATUS_DOT: Record<BridgeStatus, string> = {
	disabled: "bg-muted-foreground",
	connecting: "bg-amber-500 animate-pulse",
	connected: "bg-emerald-500",
	offline: "bg-red-500",
};

function subscribe(listener: () => void): () => void {
	return agentBridge.subscribe(listener);
}

/**
 * Shows whether the MCP server is attached and what it has been doing.
 *
 * Renders nothing unless NEXT_PUBLIC_AGENT_BRIDGE=1, so a normal build carries
 * no trace of the agent.
 */
export function AgentBridgeIndicator() {
	useEffect(() => {
		agentBridge.start();
	}, []);

	const status = useSyncExternalStore(
		subscribe,
		() => agentBridge.getStatus(),
		() => "disabled" as BridgeStatus,
	);
	const log = useSyncExternalStore(
		subscribe,
		() => agentBridge.getLog(),
		() => [],
	);

	if (!isAgentBridgeEnabled()) {
		return null;
	}

	return (
		<div className="pointer-events-none fixed bottom-3 left-3 z-50 flex max-w-sm flex-col gap-2">
			<div className="bg-background/90 pointer-events-auto flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs shadow-sm backdrop-blur">
				<span className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
				<span className="text-muted-foreground">{STATUS_LABEL[status]}</span>
			</div>

			{log.length > 0 && (
				<ul className="bg-background/90 pointer-events-auto max-h-56 overflow-y-auto rounded-md border text-xs shadow-sm backdrop-blur">
					{log.map((entry) => (
						<li
							key={entry.id}
							className="border-b px-3 py-1.5 last:border-b-0"
						>
							<span
								className={
									entry.isError
										? "text-red-500 font-medium"
										: "text-foreground font-medium"
								}
							>
								{entry.toolName}
							</span>
							<span className="text-muted-foreground ml-2">
								{entry.summary}
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
