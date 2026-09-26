"use client";

import {
	useEffect,
	useLayoutEffect,
	useRef,
	useSyncExternalStore,
	type KeyboardEvent,
} from "react";
import {
	AlertCircleIcon,
	BubbleChatAddIcon,
	Cancel01Icon,
	CursorPointer01Icon,
	Key01Icon,
	SentIcon,
	StopIcon,
	Target02Icon,
	Tick02Icon,
	Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { ReactMarkdownWrapper } from "@/components/ui/react-markdown-wrapper";
import { Spinner } from "@/components/ui/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditor } from "@/editor/use-editor";
import { getPlatformSpecialKey } from "@/utils/platform";
import { cn } from "@/utils/ui";
import { mediaTimeToSeconds } from "@/wasm";
import { getConversation, useAgentChatStore } from "../chat/store";
import {
	describeToolInput,
	describeToolResult,
	formatSeconds,
	type ChatItem,
	type ToolChatItem,
	type ToolStepStatus,
} from "../chat/transcript";

const SUGGESTIONS = [
	"¿Qué hay en mi línea de tiempo?",
	"Divide el clip en el cabezal",
	"Agrega el título “Bienvenidos” en el cabezal con animación de máquina de escribir",
	"Aplica un look cálido al primer clip",
	"Pon el clip seleccionado a velocidad 2x",
];

const TEXTAREA_MAX_HEIGHT = 140;

const subscribeNone = () => () => {};

/**
 * Chat with Claude about the open project. Claude answers through
 * /api/agent/chat and every tool call runs here, against the live editor, with
 * the same tools the MCP connector uses.
 */
export function AssistantView() {
	const projectId = useEditor(
		(editor) => editor.project.getActiveOrNull()?.metadata.id ?? null,
	);
	const conversation = useAgentChatStore((state) =>
		getConversation({ conversations: state.conversations, projectId }),
	);
	const reset = useAgentChatStore((state) => state.reset);
	const send = useAgentChatStore((state) => state.send);

	const isRunning = conversation.status === "running";
	const hasItems = conversation.items.length > 0;

	const sendText = ({ text }: { text: string }) => {
		if (projectId) {
			void send({ projectId, text });
		}
	};

	return (
		<div className="flex h-full flex-col" aria-label="Asistente">
			<div className="bg-background flex h-11 shrink-0 items-center justify-between border-b pr-2 pl-3">
				<span className="text-muted-foreground text-sm">Asistente</span>
				<Tooltip delayDuration={200}>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							aria-label="Nueva conversación"
							disabled={!projectId || (!hasItems && !isRunning)}
							onClick={() => projectId && reset({ projectId })}
						>
							<HugeiconsIcon icon={BubbleChatAddIcon} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Nueva conversación</TooltipContent>
				</Tooltip>
			</div>

			<ChatBody
				items={conversation.items}
				isRunning={isRunning}
				onSuggestion={(text) => sendText({ text })}
			/>

			<ChatFooter
				projectId={projectId}
				isRunning={isRunning}
				draft={conversation.draft}
				onSend={(text) => sendText({ text })}
			/>
		</div>
	);
}

function ChatBody({
	items,
	isRunning,
	onSuggestion,
}: {
	items: ChatItem[];
	isRunning: boolean;
	onSuggestion: (text: string) => void;
}) {
	const scrollRef = useRef<HTMLDivElement>(null);

	// Follow the stream as it grows; the panel is short and replies are too.
	useLayoutEffect(() => {
		const element = scrollRef.current;
		if (element && items.length > 0) {
			element.scrollTop = element.scrollHeight;
		}
	}, [items]);

	const last = items.at(-1);
	const isWaiting =
		isRunning && (last?.kind === "user" || last?.kind === "tool");

	return (
		<div
			ref={scrollRef}
			className="scrollbar-hidden flex flex-1 flex-col gap-3 overflow-y-auto p-3.5"
		>
			{items.length === 0 ? (
				<EmptyState onSuggestion={onSuggestion} />
			) : (
				items.map((item) => <ChatRow key={item.id} item={item} />)
			)}
			{isWaiting && (
				<div className="text-muted-foreground flex items-center gap-2 text-xs">
					<Spinner className="size-3.5" />
					Pensando…
				</div>
			)}
		</div>
	);
}

function EmptyState({
	onSuggestion,
}: {
	onSuggestion: (text: string) => void;
}) {
	return (
		<div className="my-auto flex flex-col gap-3.5">
			<div className="flex flex-col gap-1.5">
				<h3 className="text-base font-semibold">¿Qué quieres editar?</h3>
				<p className="text-muted-foreground text-sm leading-relaxed">
					Pídeme cambios en lenguaje natural. Uso las mismas herramientas que el
					conector de Claude Desktop, directo sobre este proyecto, y todo se
					puede deshacer.
				</p>
			</div>
			<div className="flex flex-col gap-1.5">
				{SUGGESTIONS.map((suggestion) => (
					<button
						key={suggestion}
						type="button"
						className="hover:bg-accent rounded-md border px-2.5 py-2 text-left text-sm transition-colors"
						onClick={() => onSuggestion(suggestion)}
					>
						{suggestion}
					</button>
				))}
			</div>
		</div>
	);
}

function ChatRow({ item }: { item: ChatItem }) {
	switch (item.kind) {
		case "user":
			return (
				<div className="bg-secondary text-secondary-foreground border-secondary-border max-w-[92%] self-end rounded-[14px] rounded-br-[4px] border px-3 py-2 text-sm leading-normal whitespace-pre-wrap">
					{item.text}
				</div>
			);
		case "assistant":
			return (
				<div className="max-w-[92%] self-start text-sm leading-normal [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&>div>*+*]:mt-2">
					<div>
						<ReactMarkdownWrapper>{item.text}</ReactMarkdownWrapper>
					</div>
				</div>
			);
		case "tool":
			return <ToolRow item={item} />;
		case "notice":
			return <NoticeRow item={item} />;
	}
}

const STATUS_ICON: Record<
	Exclude<ToolStepStatus, "pending" | "running">,
	{ icon: IconSvgElement; className: string; label: string }
> = {
	done: { icon: Tick02Icon, className: "text-emerald-500", label: "Hecho" },
	error: {
		icon: AlertCircleIcon,
		className: "text-destructive",
		label: "Falló",
	},
	cancelled: {
		icon: Cancel01Icon,
		className: "text-muted-foreground",
		label: "Cancelado",
	},
};

function ToolRow({ item }: { item: ToolChatItem }) {
	const label = describeToolInput({ input: item.input });
	const status =
		item.status === "pending" || item.status === "running"
			? null
			: STATUS_ICON[item.status];

	return (
		<details className="bg-accent max-w-full self-start overflow-hidden rounded-md border text-xs">
			<summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 [&::-webkit-details-marker]:hidden">
				<span className="flex shrink-0">
					{status ? (
						<HugeiconsIcon
							icon={status.icon}
							className={cn("size-3.5", status.className)}
							aria-label={status.label}
						/>
					) : (
						<Spinner className="size-3.5" />
					)}
				</span>
				<HugeiconsIcon
					icon={Wrench01Icon}
					className="text-muted-foreground size-3.5 shrink-0"
				/>
				<span className="text-foreground shrink-0 font-mono">{item.name}</span>
				{label && (
					<span className="text-muted-foreground truncate">{label}</span>
				)}
			</summary>
			<pre className="text-muted-foreground max-h-60 overflow-auto border-t px-2.5 py-2 font-mono text-[11px] leading-snug whitespace-pre-wrap">
				{item.input === undefined ? "…" : JSON.stringify(item.input, null, 2)}
				{item.result && `\n→ ${describeToolResult({ result: item.result })}`}
			</pre>
		</details>
	);
}

function NoticeRow({ item }: { item: Extract<ChatItem, { kind: "notice" }> }) {
	if (item.variant === "missing_api_key") {
		return (
			<div className="flex flex-col gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
				<div className="flex items-center gap-2 font-medium">
					<HugeiconsIcon icon={Key01Icon} className="size-4" />
					Falta configurar la clave de Claude
				</div>
				<p className="text-muted-foreground leading-relaxed">
					El asistente llama a la API de Claude desde el servidor. Define{" "}
					<code className="font-mono text-xs">ANTHROPIC_API_KEY</code> en el
					entorno del servidor (por ejemplo en{" "}
					<code className="font-mono text-xs">apps/web/.env.local</code> o en
					docker-compose) y reinicia la app. La clave nunca llega al navegador.
				</p>
			</div>
		);
	}

	const isError =
		item.variant !== "stopped" &&
		item.variant !== "max_iterations" &&
		item.variant !== "truncated";

	return (
		<div
			className={cn(
				"flex items-start gap-2 self-start text-xs",
				isError ? "text-destructive" : "text-muted-foreground",
			)}
		>
			{isError && (
				<HugeiconsIcon
					icon={AlertCircleIcon}
					className="mt-px size-3.5 shrink-0"
				/>
			)}
			<span>{item.text}</span>
		</div>
	);
}

function ChatFooter({
	projectId,
	isRunning,
	draft,
	onSend,
}: {
	projectId: string | null;
	isRunning: boolean;
	draft: string;
	onSend: (text: string) => void;
}) {
	const setDraft = useAgentChatStore((state) => state.setDraft);
	const stop = useAgentChatStore((state) => state.stop);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const modifierKey = useSyncExternalStore(
		subscribeNone,
		getPlatformSpecialKey,
		() => "⌘",
	);

	useEffect(() => {
		const element = textareaRef.current;
		if (!element) return;
		element.style.height = "auto";
		element.style.height = `${Math.min(TEXTAREA_MAX_HEIGHT, element.scrollHeight)}px`;
	}, [draft]);

	const canSend = !!projectId && !isRunning && draft.trim().length > 0;

	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (
			event.key !== "Enter" ||
			event.shiftKey ||
			event.nativeEvent.isComposing
		) {
			return;
		}
		event.preventDefault();
		if (canSend) {
			onSend(draft);
		}
	};

	return (
		<div className="flex shrink-0 flex-col gap-2 border-t px-3 pt-2.5 pb-3">
			<ContextChips />
			<div className="bg-accent focus-within:border-primary flex items-end gap-1.5 rounded-lg border py-1.5 pr-1.5 pl-2.5">
				<textarea
					ref={textareaRef}
					rows={1}
					value={draft}
					disabled={!projectId}
					placeholder="Pide un cambio… (Enter para enviar)"
					aria-label="Mensaje para el asistente"
					className="placeholder:text-muted-foreground max-h-[140px] min-w-0 flex-1 resize-none border-0 bg-transparent py-1 text-sm leading-snug outline-none"
					onChange={(event) =>
						projectId && setDraft({ projectId, draft: event.target.value })
					}
					onKeyDown={handleKeyDown}
				/>
				{isRunning ? (
					<Button
						size="icon"
						className="size-[30px] shrink-0 rounded-full"
						aria-label="Detener"
						onClick={() => projectId && stop({ projectId })}
					>
						<HugeiconsIcon icon={StopIcon} />
					</Button>
				) : (
					<Button
						size="icon"
						className="size-[30px] shrink-0 rounded-full"
						aria-label="Enviar"
						disabled={!canSend}
						onClick={() => onSend(draft)}
					>
						<HugeiconsIcon icon={SentIcon} />
					</Button>
				)}
			</div>
			<p className="text-muted-foreground text-center text-[11px]">
				Claude puede equivocarse. Deshaz cualquier cambio con {modifierKey}Z.
			</p>
		</div>
	);
}

/** Playhead and selection, the context sent along with each message. */
function ContextChips() {
	const seconds = useEditor((editor) =>
		mediaTimeToSeconds({ time: editor.playback.getCurrentTime() }),
	);
	const selectedName = useEditor((editor) => {
		const refs = editor.selection.getSelectedElements();
		if (refs.length !== 1) {
			return refs.length > 1 ? `${refs.length} elementos` : null;
		}
		const [selected] = editor.timeline.getElementsWithTracks({
			elements: refs,
		});
		return selected?.element.name ?? null;
	});

	return (
		<div className="flex flex-wrap gap-1.5">
			<Chip icon={Target02Icon}>Cabezal en {formatSeconds({ seconds })}</Chip>
			{selectedName && <Chip icon={CursorPointer01Icon}>{selectedName}</Chip>}
		</div>
	);
}

function Chip({
	icon,
	children,
}: {
	icon: IconSvgElement;
	children: React.ReactNode;
}) {
	return (
		<span className="text-muted-foreground inline-flex max-w-full items-center gap-1.5 overflow-hidden rounded-full border px-2 py-0.5 text-xs whitespace-nowrap">
			<HugeiconsIcon icon={icon} className="size-3 shrink-0" />
			<span className="truncate">{children}</span>
		</span>
	);
}
