const FONTSHARE_CSS = "https://api.fontshare.com/v2/css";

/** Curated Fontshare (Indian Type Foundry) families, free for commercial use. */
export const FONTSHARE_FONTS = [
	"Alpino",
	"Amulya",
	"Array",
	"Author",
	"Bespoke Sans",
	"Bespoke Serif",
	"Bevellier",
	"Bonny",
	"Boska",
	"Britney",
	"Cabinet Grotesk",
	"Chillax",
	"Clash Display",
	"Clash Grotesk",
	"Erode",
	"Excon",
	"Gambetta",
	"General Sans",
	"Kola",
	"Melodrama",
	"Nippo",
	"Pally",
	"Panchang",
	"Plein",
	"Quilon",
	"Ranade",
	"Recia",
	"Rowan",
	"Satoshi",
	"Sentient",
	"Sharpie",
	"Stardom",
	"Supreme",
	"Switzer",
	"Synonym",
	"Tanker",
	"Technor",
	"Telma",
	"Zodiak",
] as const;

const FONTSHARE_SET: ReadonlySet<string> = new Set(FONTSHARE_FONTS);

export function isFontshareFont(family: string): boolean {
	return FONTSHARE_SET.has(family);
}

export function getFontshareSlug(family: string): string {
	return family.trim().toLowerCase().replace(/\s+/g, "-");
}

export function buildFontshareCssUrl({
	family,
	weight,
}: {
	family: string;
	weight: number;
}): string {
	return `${FONTSHARE_CSS}?f[]=${getFontshareSlug(family)}@${weight}&display=swap`;
}

const requested = new Map<string, Promise<void>>();

function appendStylesheet(href: string): Promise<void> {
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = href;
	document.head.appendChild(link);
	return new Promise<void>((resolve) => {
		link.addEventListener("load", () => resolve(), { once: true });
		link.addEventListener("error", () => resolve(), { once: true });
	});
}

/**
 * Loads a Fontshare family. Each weight is requested on its own so a family
 * without that weight does not break the others.
 */
export function loadFontshareFont({
	family,
	weights = [400, 700],
}: {
	family: string;
	weights?: number[];
}): Promise<void> {
	const key = `${family}:${weights.join(",")}`;
	const existing = requested.get(key);
	if (existing) return existing;

	const promise = (async () => {
		await Promise.all(
			weights.map((weight) =>
				appendStylesheet(buildFontshareCssUrl({ family, weight })),
			),
		);
		await Promise.all(
			weights.map((weight) =>
				document.fonts
					.load(`${weight} 16px "${family.replace(/"/g, '\\"')}"`)
					.catch(() => undefined),
			),
		);
	})();
	requested.set(key, promise);
	return promise;
}
