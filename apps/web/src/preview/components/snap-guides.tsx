"use client";

import { usePreviewViewport } from "@/preview/components/preview-viewport";
import type { SnapLine, SpacingGuide } from "@/preview/preview-snap";
import { cn } from "@/utils/ui";

const ELEMENT_GUIDE_COLOR = "#ff2e93";
const DISTANCE_COLOR = "#f24822";

export function SnapGuides({
	lines,
	spacing = [],
}: {
	lines: SnapLine[];
	spacing?: SpacingGuide[];
}) {
	const viewport = usePreviewViewport();

	if (lines.length === 0 && spacing.length === 0) {
		return null;
	}

	const toOverlay = ({ x, y }: { x: number; y: number }) =>
		viewport.positionToOverlay({ positionX: x, positionY: y });

	return (
		<div className="pointer-events-none absolute inset-0" aria-hidden>
			{lines.map((line) => {
				const isElement = line.source === "element";
				const hasSpan = line.start !== undefined && line.end !== undefined;
				if (line.type === "vertical") {
					const top = hasSpan ? toOverlay({ x: line.position, y: line.start ?? 0 }).y : undefined;
					const bottom = hasSpan ? toOverlay({ x: line.position, y: line.end ?? 0 }).y : undefined;
					return (
						<div
							key={`vertical-${line.position}`}
							className={cn("absolute w-px", !hasSpan && "top-0 bottom-0", !isElement && "bg-white/70")}
							style={{
								left: toOverlay({ x: line.position, y: 0 }).x,
								top,
								height: top !== undefined && bottom !== undefined ? bottom - top : undefined,
								backgroundColor: isElement ? ELEMENT_GUIDE_COLOR : undefined,
							}}
						/>
					);
				}
				const left = hasSpan ? toOverlay({ x: line.start ?? 0, y: line.position }).x : undefined;
				const right = hasSpan ? toOverlay({ x: line.end ?? 0, y: line.position }).x : undefined;
				return (
					<div
						key={`horizontal-${line.position}`}
						className={cn("absolute h-px", !hasSpan && "left-0 right-0", !isElement && "bg-white/70")}
						style={{
							top: toOverlay({ x: 0, y: line.position }).y,
							left,
							width: left !== undefined && right !== undefined ? right - left : undefined,
							backgroundColor: isElement ? ELEMENT_GUIDE_COLOR : undefined,
						}}
					/>
				);
			})}
			{spacing.map((guide) => {
				const color = guide.isEqual ? ELEMENT_GUIDE_COLOR : DISTANCE_COLOR;
				const start = guide.axis === "x" ? toOverlay({ x: guide.from, y: guide.at }) : toOverlay({ x: guide.at, y: guide.from });
				const end = guide.axis === "x" ? toOverlay({ x: guide.to, y: guide.at }) : toOverlay({ x: guide.at, y: guide.to });
				const isHorizontal = guide.axis === "x";
				const label = `${guide.isEqual ? "= " : ""}${Math.round(guide.to - guide.from)}`;
				return (
					<div key={`${guide.axis}-${guide.from}-${guide.to}-${guide.at}`}>
						<div
							className="absolute"
							style={{
								left: isHorizontal ? start.x : start.x - 4,
								top: isHorizontal ? start.y - 4 : start.y,
								width: isHorizontal ? end.x - start.x : 9,
								height: isHorizontal ? 9 : end.y - start.y,
								borderColor: color,
								borderStyle: "solid",
								borderWidth: isHorizontal ? "0 1px" : "1px 0",
								background: isHorizontal
									? `linear-gradient(${color}, ${color}) center / 100% 1px no-repeat`
									: `linear-gradient(${color}, ${color}) center / 1px 100% no-repeat`,
							}}
						/>
						<span
							className="absolute rounded px-1 text-[10.5px] leading-4 font-semibold text-white tabular-nums"
							style={{
								left: (start.x + end.x) / 2,
								top: (start.y + end.y) / 2,
								transform: "translate(-50%, -50%)",
								backgroundColor: color,
							}}
						>
							{label}
						</span>
					</div>
				);
			})}
		</div>
	);
}
