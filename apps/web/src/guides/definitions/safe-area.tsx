import { CenterFocusIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { GuideDefinition } from "@/guides/types";

/** Action-safe (90 %) and title-safe (80 %) margins used in broadcast and social video. */
const SAFE_MARGINS = [
	{ inset: 5, className: "border-white/55" },
	{ inset: 10, className: "border-white/35" },
] as const;

function SafeAreaLines({ previewOnly = false }: { previewOnly?: boolean }) {
	return (
		<>
			{SAFE_MARGINS.map(({ inset, className }) => (
				<div
					key={inset}
					className={`absolute border border-dashed ${previewOnly ? "border-foreground/30" : className}`}
					style={{ inset: `${inset}%` }}
				/>
			))}
		</>
	);
}

export const safeAreaGuide = {
	id: "safe-area",
	label: "Márgenes seguros",
	renderPreview: () => (
		<div className="relative aspect-video w-full">
			<SafeAreaLines previewOnly />
		</div>
	),
	renderTriggerIcon: () => <HugeiconsIcon icon={CenterFocusIcon} />,
	renderOverlay: () => (
		<div className="absolute inset-0">
			<SafeAreaLines />
		</div>
	),
} as const satisfies GuideDefinition;
