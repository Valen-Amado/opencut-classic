"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";
import {
	TAB_KEYS,
	tabs,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";
import {
	selectIsAnyConversationRunning,
	useAgentChatStore,
} from "@/agent/chat/store";

export function TabBar() {
	const { activeTab, setActiveTab } = useAssetsPanelStore();
	const isAssistantBusy = useAgentChatStore(selectIsAnyConversationRunning);
	const [showTopFade, setShowTopFade] = useState(false);
	const [showBottomFade, setShowBottomFade] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	const checkScrollPosition = useCallback(() => {
		const element = scrollRef.current;
		if (!element) return;

		const { scrollTop, scrollHeight, clientHeight } = element;
		setShowTopFade(scrollTop > 0);
		setShowBottomFade(scrollTop < scrollHeight - clientHeight - 1);
	}, []);

	useEffect(() => {
		const element = scrollRef.current;
		if (!element) return;

		checkScrollPosition();
		element.addEventListener("scroll", checkScrollPosition);

		const resizeObserver = new ResizeObserver(checkScrollPosition);
		resizeObserver.observe(element);

		return () => {
			element.removeEventListener("scroll", checkScrollPosition);
			resizeObserver.disconnect();
		};
	}, [checkScrollPosition]);

	return (
		<div className="relative flex">
			<div
				ref={scrollRef}
				className="scrollbar-hidden relative flex size-full p-1 flex-col items-center justify-start gap-0.5 overflow-y-auto"
			>
				{TAB_KEYS.map((tabKey) => {
					const tab = tabs[tabKey];
					const isAssistant = tabKey === "assistant";
					const showBusyDot =
						isAssistant && isAssistantBusy && activeTab !== tabKey;
					return (
						<Fragment key={tabKey}>
							<Tooltip delayDuration={10}>
								<TooltipTrigger asChild>
									<Button
										variant={activeTab === tabKey ? "secondary" : "ghost"}
										size="icon"
										aria-label={
											showBusyDot ? `${tab.label} (trabajando)` : tab.label
										}
										className={cn(
											"relative shrink-0",
											"h-8 w-8",
											activeTab !== tabKey && "text-muted-foreground",
										)}
										onClick={() => setActiveTab(tabKey)}
									>
										<tab.icon />
										{showBusyDot && (
											<span className="bg-primary absolute top-1 right-1 size-1.5 animate-pulse rounded-full" />
										)}
									</Button>
								</TooltipTrigger>
								<TooltipContent
									side="right"
									align="center"
									variant="sidebar"
									sideOffset={8}
								>
									<div className="text-foreground text-sm leading-none font-medium">
										{tab.label}
									</div>
								</TooltipContent>
							</Tooltip>
							{/* The assistant works across every other tab, so it sits apart. */}
							{isAssistant && (
								<div aria-hidden className="bg-border my-1 h-px w-5 shrink-0" />
							)}
						</Fragment>
					);
				})}
			</div>

			<FadeOverlay direction="top" show={showTopFade} />
			<FadeOverlay direction="bottom" show={showBottomFade} />
		</div>
	);
}

function FadeOverlay({
	direction,
	show,
}: {
	direction: "top" | "bottom";
	show: boolean;
}) {
	return (
		<div
			className={cn(
				"pointer-events-none absolute right-0 left-0 h-6",
				direction === "top" && show
					? "from-background top-0 bg-linear-to-b to-transparent"
					: "from-background bottom-0 bg-linear-to-t to-transparent",
			)}
		/>
	);
}
