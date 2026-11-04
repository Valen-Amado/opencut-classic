"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { KeyframeBar } from "./components/keyframe-bar";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { usePropertiesStore } from "./stores/properties-store";
import { getGroupPropertiesConfig, getPropertiesConfig } from "./registry";
import { cn } from "@/utils/ui";
import { EmptyView } from "./empty-view";
import { MultiSelectionPanel } from "./components/multi-selection-panel";
import { ElementGroupProvider } from "./element-group";
import type { ElementType } from "@/timeline";

const GROUP_LABELS: Record<ElementType, string> = {
	text: "textos",
	video: "videos",
	image: "imágenes",
	sticker: "stickers",
	graphic: "gráficos",
	audio: "audios",
	effect: "efectos",
};

export function PropertiesPanel() {
	const editor = useEditor();
	useEditor((e) => e.scenes.getActiveSceneOrNull());
	useEditor((e) => e.media.getAssets());
	const { selectedElements } = useElementSelection();
	const { activeTabPerType, setActiveTab } = usePropertiesStore();

	if (selectedElements.length === 0) {
		return (
			<div className="panel bg-background flex h-full flex-col items-center justify-center overflow-hidden rounded-sm border">
				<EmptyView />
			</div>
		);
	}

	const mediaAssets = editor.media.getAssets();

	const elementsWithTracks = editor.timeline.getElementsWithTracks({
		elements: selectedElements,
	});
	const elementWithTrack = elementsWithTracks[0];

	if (!elementWithTrack) return null;

	const { element, track } = elementWithTrack;
	const isGroup = selectedElements.length > 1;
	const isSameType = elementsWithTracks.every((item) => item.element.type === element.type);
	const config = isGroup
		? isSameType
			? getGroupPropertiesConfig({ element, selectedElements })
			: null
		: getPropertiesConfig({ element, mediaAssets });

	if (!config) {
		return (
			<div className="panel bg-background flex h-full flex-col overflow-hidden rounded-sm border">
				<ScrollArea className="flex-1">
					<MultiSelectionPanel selectedElements={selectedElements} />
				</ScrollArea>
			</div>
		);
	}

	const visibleTabs = config.tabs;

	const storedTabId = activeTabPerType[element.type];
	const isStoredTabVisible = visibleTabs.some((t) => t.id === storedTabId);
	const activeTabId = isStoredTabVisible ? storedTabId : config.defaultTab;
	const activeTab =
		visibleTabs.find((t) => t.id === activeTabId) ?? visibleTabs[0];

	if (!activeTab) return null;

	return (
		<div className="panel bg-background flex h-full overflow-hidden rounded-sm border">
			<TooltipProvider delayDuration={0}>
				<div className="flex shrink-0 flex-col gap-0.5 border-r p-1 scrollbar-hidden overflow-y-auto">
					{visibleTabs.map((tab) => (
						<Tooltip key={tab.id}>
							<TooltipTrigger asChild>
								<Button
									variant={tab.id === activeTab.id ? "secondary" : "ghost"}
									size="icon"
									onClick={() =>
										setActiveTab({
											elementType: element.type,
											tabId: tab.id,
										})
									}
									aria-label={tab.label}
									className={cn(
										"shrink-0",
										"h-8 w-8",
										tab.id !== activeTab.id && "text-muted-foreground",
									)}
								>
									{tab.icon}
								</Button>
							</TooltipTrigger>
							<TooltipContent side="right">{tab.label}</TooltipContent>
						</Tooltip>
					))}
				</div>
			</TooltipProvider>
			<ScrollArea className="min-w-0 flex-1 overflow-x-hidden scrollbar-hidden">
				{isGroup ? (
					<ElementGroupProvider elements={selectedElements}>
						{activeTab.id !== "arrange" && (
							<p className="text-muted-foreground border-b px-3.5 py-2.5 text-xs">
								Editando {selectedElements.length} {GROUP_LABELS[element.type]}. Los cambios se aplican a todos.
							</p>
						)}
						{activeTab.content({ trackId: track.id })}
					</ElementGroupProvider>
				) : (
					<>
						<KeyframeBar element={element} trackId={track.id} />
						{activeTab.content({ trackId: track.id })}
					</>
				)}
			</ScrollArea>
		</div>
	);
}
