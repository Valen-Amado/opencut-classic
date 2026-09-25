"use client";

import {
	useState,
	useMemo,
	useRef,
	useEffect,
	useCallback,
	type CSSProperties,
} from "react";
import { List, useListRef, type RowComponentProps } from "react-window";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loadAnyFont } from "@/fonts/google-fonts";
import { FONTSHARE_FONTS, loadFontshareFont } from "@/fonts/fontshare";
import {
	buildFontRows,
	type FontListRow,
	type FontSourceFilter,
} from "@/fonts/font-sources";
import { useFontPreferencesStore } from "@/fonts/font-preferences-store";
import type { FontAtlas, FontAtlasEntry } from "@/fonts/types";
import { useFontAtlas } from "@/fonts/use-font-atlas";
import { cn } from "@/utils/ui";
import { ChevronDown, Search } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { StarIcon, TextIcon, Tick02Icon } from "@hugeicons/core-free-icons";

const SOURCE_TABS: { key: FontSourceFilter; label: string }[] = [
	{ key: "all", label: "Todas" },
	{ key: "google", label: "Google" },
	{ key: "fontshare", label: "Fontshare" },
	{ key: "system", label: "Sistema" },
];

const FONT_ROW_HEIGHT = 32;
const HEADER_ROW_HEIGHT = 28;
const SPRITE_ROW_HEIGHT = 40;
const PREVIEW_SCALE = 0.62;
const LIST_WIDTH = 288;
const MAX_LIST_HEIGHT = 320;
const OVERSCAN = 15;

interface FontPickerProps {
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	className?: string;
}

export function FontPicker({
	defaultValue,
	onValueChange,
	className,
}: FontPickerProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [sourceFilter, setSourceFilter] = useState<FontSourceFilter>("all");
	const [highlighted, setHighlighted] = useState(-1);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const listRef = useListRef(null);
	const { atlas, status, fontNames, retry: handleRetry } = useFontAtlas({ open });
	const favorites = useFontPreferencesStore((state) => state.favorites);
	const recents = useFontPreferencesStore((state) => state.recents);
	const toggleFavorite = useFontPreferencesStore((state) => state.toggleFavorite);
	const addRecent = useFontPreferencesStore((state) => state.addRecent);

	const allFonts = useMemo(
		() => [...new Set([...fontNames, ...FONTSHARE_FONTS])].sort((a, b) => a.localeCompare(b)),
		[fontNames],
	);

	const rows = useMemo(
		() =>
			buildFontRows({
				allFonts,
				favorites,
				recents,
				query: search,
				sourceFilter,
			}),
		[allFonts, favorites, recents, search, sourceFilter],
	);

	const fontRowIndexes = useMemo(
		() => rows.flatMap((row, index) => (row.kind === "font" ? [index] : [])),
		[rows],
	);

	const listHeight = Math.min(
		MAX_LIST_HEIGHT,
		rows.reduce(
			(total, row) =>
				total + (row.kind === "header" ? HEADER_ROW_HEIGHT : FONT_ROW_HEIGHT),
			0,
		),
	);

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) {
			setSearch("");
			setSourceFilter("all");
			setHighlighted(-1);
		}
	};

	const handleSelect = useCallback(
		async ({ family }: { family: string }) => {
			addRecent(family);
			handleOpenChange(false);
			try {
				await loadAnyFont({ family });
			} catch {
				// ignore load failure, font will fall back to system default
			}
			onValueChange?.(family);
		},
		[onValueChange, addRecent],
	);


	const moveHighlight = (direction: 1 | -1) => {
		if (fontRowIndexes.length === 0) return;
		const position = fontRowIndexes.indexOf(highlighted);
		const next =
			position === -1
				? direction === 1
					? 0
					: fontRowIndexes.length - 1
				: (position + direction + fontRowIndexes.length) % fontRowIndexes.length;
		const rowIndex = fontRowIndexes[next];
		setHighlighted(rowIndex);
		listRef.current?.scrollToRow({ index: rowIndex, align: "smart" });
	};

	const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			moveHighlight(event.key === "ArrowDown" ? 1 : -1);
		} else if (event.key === "Enter") {
			const row = rows[highlighted];
			if (row?.kind === "font") {
				event.preventDefault();
				handleSelect({ family: row.family });
			}
		}
	};

	const isLoading = status === "loading" && !atlas;

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger
				className={cn(
					"border-border bg-accent flex h-7 w-full cursor-pointer items-center justify-between gap-1 rounded-md border px-2.5 text-sm whitespace-nowrap focus-visible:border-primary focus-visible:ring-0 focus:outline-hidden",
					className,
				)}
			>
				<div className="flex min-w-0 items-center gap-1.5">
					<span className="text-muted-foreground [&_svg]:size-3.5 shrink-0">
						<HugeiconsIcon icon={TextIcon} />
					</span>
					<span className="truncate" style={{ fontFamily: defaultValue }}>
						{defaultValue ?? "Elige una fuente"}
					</span>
				</div>
				<ChevronDown className="size-3 shrink-0 opacity-50" />
			</PopoverTrigger>
			<PopoverContent
				className="w-72 p-0 overflow-hidden"
				align="start"
				side="left"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					searchInputRef.current?.focus();
				}}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
			>
				<div className="relative px-3 py-1.5">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 shrink-0 opacity-50" />
					<Input
						ref={searchInputRef}
						placeholder="Buscar fuentes..."
						value={search}
						onChange={(event) => {
							setSearch(event.target.value);
							setHighlighted(-1);
						}}
						onKeyDown={handleSearchKeyDown}
						size="xs"
						className="w-full pl-5 bg-transparent border-none! shadow-none!"
						aria-label="Buscar fuentes"
					/>
				</div>
				<div className="flex border-b px-3" role="tablist" aria-label="Origen de las fuentes">
					{SOURCE_TABS.map((tab) => (
						<button
							key={tab.key}
							type="button"
							role="tab"
							aria-selected={sourceFilter === tab.key}
							className={cn(
								"px-2.5 py-1.5 text-xs border-b-2 -mb-px",
								sourceFilter === tab.key
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground",
							)}
							onClick={() => {
								setSourceFilter(tab.key);
								setHighlighted(-1);
								searchInputRef.current?.focus();
							}}
						>
							{tab.label}
						</button>
					))}
				</div>
				{isLoading && (
					<div className="py-8 text-center text-sm text-muted-foreground">
						Cargando fuentes...
					</div>
				)}
				{status === "error" && !atlas && (
					<div className="flex flex-col items-center gap-3 py-8 px-4">
						<p className="text-sm text-muted-foreground text-center">
							No se pudieron cargar las vistas previas de las fuentes.
						</p>
						<Button variant="outline" size="sm" onClick={handleRetry}>
							Reintentar
						</Button>
					</div>
				)}
				{!isLoading && rows.length === 0 && (
					<div className="py-6 text-center text-sm text-muted-foreground">
						No se encontraron fuentes.
					</div>
				)}
				{!isLoading && rows.length > 0 && (
					<List
						listRef={listRef}
						rowCount={rows.length}
						rowHeight={(index) =>
							rows[index]?.kind === "header" ? HEADER_ROW_HEIGHT : FONT_ROW_HEIGHT
						}
						overscanCount={OVERSCAN}
						rowComponent={FontListRowView}
						rowProps={{
							atlas,
							rows,
							selectedFont: defaultValue,
							highlighted,
							favorites,
							onFontSelect: handleSelect,
							onToggleFavorite: toggleFavorite,
							onHighlight: setHighlighted,
						}}
						style={{ height: listHeight, width: LIST_WIDTH }}
						aria-label="Fuentes"
					/>
				)}
			</PopoverContent>
		</Popover>
	);
}

function FontSpritePreview({ entry }: { entry: FontAtlasEntry }) {
	return (
		<div
			className="shrink-0"
			style={{
				width: entry.w,
				height: SPRITE_ROW_HEIGHT,
				backgroundColor: "currentColor",
				WebkitMaskImage: `url(/fonts/font-chunk-${entry.ch}.avif)`,
				WebkitMaskPosition: `-${entry.x}px -${entry.y}px`,
				WebkitMaskRepeat: "no-repeat",
				maskImage: `url(/fonts/font-chunk-${entry.ch}.avif)`,
				maskPosition: `-${entry.x}px -${entry.y}px`,
				maskRepeat: "no-repeat",
				transform: `scale(${PREVIEW_SCALE})`,
				transformOrigin: "left center",
			}}
		/>
	);
}

type FontListRowProps = {
	atlas: FontAtlas | null;
	rows: FontListRow[];
	selectedFont: string | undefined;
	highlighted: number;
	favorites: string[];
	onFontSelect: (params: { family: string }) => void;
	onToggleFavorite: (family: string) => void;
	onHighlight: (index: number) => void;
};

function FontListRowView({
	index,
	style,
	atlas,
	rows,
	selectedFont,
	highlighted,
	favorites,
	onFontSelect,
	onToggleFavorite,
	onHighlight,
}: RowComponentProps<FontListRowProps>) {
	const row = rows[index];

	useEffect(() => {
		if (row?.kind === "font" && row.source === "fontshare") {
			loadFontshareFont({ family: row.family, weights: [400] });
		}
	}, [row]);

	if (!row) return null;

	if (row.kind === "header") {
		return (
			<div
				style={style as CSSProperties}
				className="flex items-end justify-between px-3 pb-1 text-xs text-muted-foreground"
			>
				<span>{row.label}</span>
				<span className="tabular-nums">{row.count}</span>
			</div>
		);
	}

	const entry = atlas?.fonts[row.family];
	const isSelected = row.family === selectedFont;
	const isFavorite = favorites.includes(row.family);

	return (
		<div
			style={style as CSSProperties}
			role="option"
			aria-selected={isSelected}
			tabIndex={-1}
			className={cn(
				"group flex w-full cursor-pointer items-center gap-2 pl-2 pr-1.5 outline-hidden hover:bg-popover-hover",
				(isSelected || highlighted === index) && "bg-popover-hover",
			)}
			onMouseEnter={() => onHighlight(index)}
			onClick={() => onFontSelect({ family: row.family })}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onFontSelect({ family: row.family });
				}
			}}
		>
			<span className="text-primary flex w-3.5 shrink-0 justify-center">
				{isSelected && <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />}
			</span>
			<div
				className="min-w-0 flex-1 overflow-hidden"
				style={{ height: FONT_ROW_HEIGHT }}
			>
				{row.source === "google" && entry ? (
					<div className="flex h-full items-center" style={{ marginTop: (FONT_ROW_HEIGHT - SPRITE_ROW_HEIGHT) / 2 }}>
						<FontSpritePreview entry={entry} />
					</div>
				) : (
					<span
						className="text-foreground/85 flex h-full items-center truncate text-sm"
						style={{ fontFamily: `"${row.family}", sans-serif` }}
					>
						{row.family}
					</span>
				)}
			</div>
			<button
				type="button"
				aria-label={isFavorite ? `Quitar ${row.family} de favoritas` : `Añadir ${row.family} a favoritas`}
				aria-pressed={isFavorite}
				title={isFavorite ? "Quitar de favoritas" : "Añadir a favoritas"}
				className={cn(
					"flex size-6 shrink-0 items-center justify-center rounded-sm hover:bg-accent",
					isFavorite
						? "text-amber-500"
						: "text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
					highlighted === index && "opacity-100",
				)}
				onClick={(event) => {
					event.stopPropagation();
					onToggleFavorite(row.family);
				}}
			>
				<HugeiconsIcon
					icon={StarIcon}
					className={cn("size-3.5", isFavorite && "fill-current")}
				/>
			</button>
		</div>
	);
}
