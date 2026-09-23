"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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
	const [isLogOpen, setIsLogOpen] = useState(false);

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

	const errorCount = log.filter((entry) => entry.isError).length;

	return (
		<div className="pointer-events-none fixed bottom-3 left-3 z-50 flex max-w-xs flex-col-reverse gap-2">
			{/* Collapsed by default: expanded, the log covers the timeline underneath. */}
			<button
				type="button"
				onClick={() => setIsLogOpen((open) => !open)}
				aria-expanded={isLogOpen}
				className="bg-background/90 pointer-events-auto flex w-fit items-center gap-2 rounded-md border px-3 py-1.5 text-xs shadow-sm backdrop-blur"
			>
				<span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
				<span className="text-muted-foreground">{STATUS_LABEL[status]}</span>
				{log.length > 0 && (
					<span
						className={
							errorCount > 0
								? "text-red-500 tabular-nums"
								: "text-muted-foreground tabular-nums"
						}
					>
						· {log.length}
					</span>
				)}
			</button>

			{isLogOpen && log.length > 0 && (
				<ul className="bg-background/90 pointer-events-auto max-h-48 overflow-y-auto rounded-md border text-xs shadow-sm backdrop-blur">
					{log.map((entry) => (
						<li
							key={entry.id}
							className="flex gap-2 border-b px-3 py-1.5 last:border-b-0"
						>
							<span
								className={
									entry.isError
										? "text-red-500 shrink-0 font-medium"
										: "text-foreground shrink-0 font-medium"
								}
							>
								{entry.toolName}
							</span>
							<span className="text-muted-foreground truncate">
								{entry.summary}
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
