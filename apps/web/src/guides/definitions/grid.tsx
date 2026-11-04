import {
	GridTableIcon,
	LayoutThreeColumnIcon,
	LayoutThreeRowIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { NumberField } from "@/components/ui/number-field";
import { usePropertyDraft } from "@/components/editor/panels/properties/hooks/use-property-draft";
import {
	GRID_MIN,
	GRID_MAX,
	DEFAULT_GRID_CONFIG,
} from "@/guides/grid";
import { usePreviewStore } from "@/preview/preview-store";
import { clampRound } from "@/utils/math";
import { cn } from "@/utils/ui";
import type { GuideDefinition } from "@/guides/types";

function GridLines({
	rows,
	cols,
	color,
}: {
	rows: number;
	cols: number;
	color: string;
}) {
	const verticals = Array.from(
		{ length: cols - 1 },
		(_, i) => ((i + 1) / cols) * 100,
	);
	const horizontals = Array.from(
		{ length: rows - 1 },
		(_, i) => ((i + 1) / rows) * 100,
	);

	return (
		<>
			{verticals.map((pct) => (
				<div
					key={`v-${pct}`}
					className={cn("absolute top-0 bottom-0 w-px", color)}
					style={{ left: `${pct}%` }}
				/>
			))}
			{horizontals.map((pct) => (
				<div
					key={`h-${pct}`}
					className={cn("absolute left-0 right-0 h-px", color)}
					style={{ top: `${pct}%` }}
				/>
			))}
		</>
	);
}

function GridGuidePreview() {
	return (
		<div className="relative aspect-video w-full">
			<GridLines rows={3} cols={4} color="bg-foreground/15" />
		</div>
	);
}

function GridGuideOverlay() {
	const { rows, cols } = usePreviewStore((s) => s.gridConfig);

	return (
		<div className="absolute inset-0">
			<GridLines rows={rows} cols={cols} color="bg-white/35" />
		</div>
	);
}

function GridGuideOptions() {
	const rows = usePreviewStore((s) => s.gridConfig.rows);
	const cols = usePreviewStore((s) => s.gridConfig.cols);
	const setGridConfig = usePreviewStore((s) => s.setGridConfig);

	const clampGridValue = (value: number) =>
		clampRound({ value, min: GRID_MIN, max: GRID_MAX });
	const parseGridValue = (input: string) => {
		const parsed = Number.parseInt(input, 10);
		return Number.isNaN(parsed) ? null : clampGridValue(parsed);
	};
	const rowsDraft = usePropertyDraft({
		displayValue: String(rows),
		parse: parseGridValue,
		onPreview: (value) => setGridConfig({ rows: value }),
		onCommit: () => {},
		supportsExpressions: false,
	});
	const colsDraft = usePropertyDraft({
		displayValue: String(cols),
		parse: parseGridValue,
		onPreview: (value) => setGridConfig({ cols: value }),
		onCommit: () => {},
		supportsExpressions: false,
	});

	return (
		<div className="flex gap-2">
			<NumberField
				icon={<HugeiconsIcon icon={LayoutThreeRowIcon} />}
				value={rowsDraft.displayValue}
				min={GRID_MIN}
				max={GRID_MAX}
				isDefault={rows === DEFAULT_GRID_CONFIG.rows}
				onReset={() => setGridConfig({ rows: DEFAULT_GRID_CONFIG.rows })}
				onScrub={(value) => setGridConfig({ rows: clampGridValue(value) })}
				onFocus={rowsDraft.onFocus}
				onChange={rowsDraft.onChange}
				onBlur={rowsDraft.onBlur}
				className="flex-1"
			/>
			<NumberField
				icon={<HugeiconsIcon icon={LayoutThreeColumnIcon} />}
				value={colsDraft.displayValue}
				min={GRID_MIN}
				max={GRID_MAX}
				isDefault={cols === DEFAULT_GRID_CONFIG.cols}
				onReset={() => setGridConfig({ cols: DEFAULT_GRID_CONFIG.cols })}
				onScrub={(value) => setGridConfig({ cols: clampGridValue(value) })}
				onFocus={colsDraft.onFocus}
				onChange={colsDraft.onChange}
				onBlur={colsDraft.onBlur}
				className="flex-1"
			/>
		</div>
	);
}

export const gridGuide = {
	id: "grid",
	label: "Grid",
	renderPreview: () => <GridGuidePreview />,
	renderTriggerIcon: () => <HugeiconsIcon icon={GridTableIcon} />,
	renderOverlay: () => <GridGuideOverlay />,
	renderOptions: () => <GridGuideOptions />,
} as const satisfies GuideDefinition;
