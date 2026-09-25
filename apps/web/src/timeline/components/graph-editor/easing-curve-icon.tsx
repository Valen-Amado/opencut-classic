import type { NormalizedCubicBezier } from "@/animation/types";
import { cn } from "@/utils/ui";
import { getEasingCurvePath } from "./easing-match";

/** Small drawing of an easing curve, used next to curve names in menus. */
export function EasingCurveIcon({
	cubicBezier,
	className,
}: {
	cubicBezier: NormalizedCubicBezier;
	className?: string;
}) {
	return (
		<svg
			viewBox="0 0 20 20"
			aria-hidden="true"
			className={cn("size-4.5 shrink-0 fill-none stroke-current", className)}
			strokeWidth={1.6}
			strokeLinecap="round"
		>
			<path d="M3 3v14h14" className="stroke-muted-foreground/60" strokeWidth={1} />
			<path d={getEasingCurvePath({ cubicBezier })} />
		</svg>
	);
}
