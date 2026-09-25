import { describe, expect, test } from "bun:test";
import { buildFontRows, getFontSource } from "../font-sources";
import { addRecentFont, toggleFavoriteFont } from "../font-preferences-store";
import { buildFontshareCssUrl, getFontshareSlug } from "../fontshare";

const ALL = ["Arial", "Inter", "Satoshi", "Roboto", "General Sans"];

describe("getFontSource", () => {
	test("classifies system, Fontshare and Google families", () => {
		expect(getFontSource("Arial")).toBe("system");
		expect(getFontSource("Satoshi")).toBe("fontshare");
		expect(getFontSource("Inter")).toBe("google");
	});
});

describe("buildFontRows", () => {
	test("orders favorites, recents and all fonts with headers", () => {
		const rows = buildFontRows({ allFonts: ALL, favorites: ["Satoshi"], recents: ["Inter"], query: "", sourceFilter: "all" });
		expect(rows.filter((r) => r.kind === "header").map((r) => r.kind === "header" && r.id)).toEqual(["favorites", "recents", "all"]);
		expect(rows[1]).toEqual({ kind: "font", family: "Satoshi", source: "fontshare", section: "favorites" });
	});

	test("hides empty sections", () => {
		const rows = buildFontRows({ allFonts: ALL, favorites: [], recents: [], query: "", sourceFilter: "all" });
		expect(rows.filter((r) => r.kind === "header")).toHaveLength(1);
	});

	test("filters by query and source in every section", () => {
		const rows = buildFontRows({ allFonts: ALL, favorites: ["Inter", "Satoshi"], recents: [], query: "sato", sourceFilter: "fontshare" });
		expect(rows.filter((r) => r.kind === "font").map((r) => r.kind === "font" && r.family)).toEqual(["Satoshi", "Satoshi"]);
	});

	test("ignores favorites that are not in the catalog", () => {
		const rows = buildFontRows({ allFonts: ALL, favorites: ["Unknown"], recents: [], query: "", sourceFilter: "all" });
		expect(rows[0]).toMatchObject({ kind: "header", id: "all" });
	});
});

describe("font preferences", () => {
	test("toggles favorites", () => {
		expect(toggleFavoriteFont({ favorites: ["Inter"], family: "Satoshi" })).toEqual(["Satoshi", "Inter"]);
		expect(toggleFavoriteFont({ favorites: ["Inter"], family: "Inter" })).toEqual([]);
	});

	test("keeps recents unique, newest first and capped", () => {
		expect(addRecentFont({ recents: ["A", "B", "C"], family: "B", max: 3 })).toEqual(["B", "A", "C"]);
		expect(addRecentFont({ recents: ["A", "B", "C"], family: "D", max: 3 })).toEqual(["D", "A", "B"]);
	});
});

describe("fontshare", () => {
	test("builds slugs and css urls", () => {
		expect(getFontshareSlug("General Sans")).toBe("general-sans");
		expect(buildFontshareCssUrl({ family: "Clash Display", weight: 700 })).toBe(
			"https://api.fontshare.com/v2/css?f[]=clash-display@700&display=swap",
		);
	});
});
