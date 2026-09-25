import { SYSTEM_FONTS } from "@/fonts/system-fonts";
import { isFontshareFont } from "@/fonts/fontshare";

export type FontSource = "system" | "google" | "fontshare";
export type FontSourceFilter = "all" | FontSource;

export function getFontSource(family: string): FontSource {
	if (SYSTEM_FONTS.has(family)) return "system";
	if (isFontshareFont(family)) return "fontshare";
	return "google";
}

export type FontListRow =
	| { kind: "header"; id: FontSectionId; label: string; count: number }
	| { kind: "font"; family: string; source: FontSource; section: FontSectionId };

export type FontSectionId = "favorites" | "recents" | "all";

const SECTION_LABELS: Record<FontSectionId, string> = {
	favorites: "Favoritas",
	recents: "Usadas recientemente",
	all: "Todas las fuentes",
};

/**
 * Flattens the picker into header and font rows: favorites, recently used and
 * the full catalog, each filtered by the search query and the source filter.
 * Empty sections are left out.
 */
export function buildFontRows({
	allFonts,
	favorites,
	recents,
	query,
	sourceFilter,
}: {
	allFonts: readonly string[];
	favorites: readonly string[];
	recents: readonly string[];
	query: string;
	sourceFilter: FontSourceFilter;
}): FontListRow[] {
	const known = new Set(allFonts);
	const needle = query.trim().toLowerCase();
	const matches = (family: string) =>
		(sourceFilter === "all" || getFontSource(family) === sourceFilter) &&
		(!needle || family.toLowerCase().includes(needle));

	const sections: [FontSectionId, string[]][] = [
		["favorites", favorites.filter((family) => known.has(family) && matches(family))],
		["recents", recents.filter((family) => known.has(family) && matches(family))],
		["all", allFonts.filter(matches)],
	];

	const rows: FontListRow[] = [];
	for (const [id, families] of sections) {
		if (families.length === 0) continue;
		rows.push({ kind: "header", id, label: SECTION_LABELS[id], count: families.length });
		for (const family of families) {
			rows.push({ kind: "font", family, source: getFontSource(family), section: id });
		}
	}
	return rows;
}
