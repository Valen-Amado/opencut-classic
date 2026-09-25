"use client";

import { AnimatePresence, motion } from "motion/react";
import { GUIDE_REGISTRY, getGuideById } from "@/guides";
import { usePreviewStore } from "@/preview/preview-store";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/utils/ui";

export function GridPopover({ children }: { children: React.ReactNode }) {
	const activeGuide = usePreviewStore((state) => state.activeGuide);
	const toggleGuide = usePreviewStore((state) => state.toggleGuide);
	const activeGuideDef = getGuideById(activeGuide);
	const smartGuides = usePreviewStore((state) => state.smartGuides);
	const setSmartGuides = usePreviewStore((state) => state.setSmartGuides);
	const options = activeGuideDef?.renderOptions?.();

	return (
		<Popover>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent sideOffset={8} className="w-64 px-0">
				<div className="flex items-start justify-between gap-3 px-4 pb-3">
					<div className="flex flex-col gap-0.5">
						<Label htmlFor="smart-guides">Guías inteligentes</Label>
						<span className="text-muted-foreground text-xs">
							Alinea y mide contra otros elementos al mover
						</span>
					</div>
					<Switch
						id="smart-guides"
						checked={smartGuides}
						onCheckedChange={setSmartGuides}
					/>
				</div>
				<Separator className="mb-3" />
				<div className="flex flex-col gap-2 px-4">
					<Label>Guías</Label>
					<div className="grid grid-cols-3 gap-1">
						{GUIDE_REGISTRY.map((guide) => (
							<GridItem
								key={guide.id}
								label={guide.label}
								preview={guide.renderPreview()}
								isSelected={activeGuide === guide.id}
								onClick={() => toggleGuide(guide.id)}
							/>
						))}
					</div>
				</div>
				<AnimatePresence>
					{options && (
						<motion.div
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{
								height: { type: "spring", duration: 0.2, bounce: 0 },
								opacity: { duration: 0.2 },
							}}
							className="overflow-hidden"
						>
							<Separator className="my-3" />
							<div className="px-4">{options}</div>
						</motion.div>
					)}
				</AnimatePresence>
				<Separator className="my-3" />
				<p className="text-muted-foreground px-4 text-xs leading-relaxed">
					Mantén <kbd className="font-sans">Ctrl/⌘</kbd> al arrastrar para mover sin ajuste,{" "}
					<kbd className="font-sans">Shift</kbd> para moverte en un solo eje y{" "}
					<kbd className="font-sans">Alt</kbd> para medir distancias.
				</p>
			</PopoverContent>
		</Popover>
	);
}

function GridItem({
	label,
	preview,
	isSelected,
	onClick,
}: {
	label: string;
	preview: React.ReactNode;
	isSelected?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={isSelected}
			className={cn(
				"flex cursor-pointer rounded-sm flex-col gap-2 px-1.5 py-1.5 hover:bg-foreground/5",
				isSelected && "bg-primary/5! text-primary",
			)}
		>
			<div
				className={cn(
					"aspect-video bg-foreground/5 flex items-center justify-center rounded-sm",
					isSelected && "bg-primary/5!",
				)}
			>
				{preview}
			</div>
			<span
				className={cn(
					"text-xs",
					isSelected ? "text-primary" : "text-muted-foreground",
				)}
			>
				{label}
			</span>
		</button>
	);
}
