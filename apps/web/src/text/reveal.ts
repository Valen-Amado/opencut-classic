/**
 * Typewriter / word-by-word reveal. Each amount is a percentage (0–100) of
 * the text that is visible; the smaller of the two wins. Pure string math so
 * the layout can keep measuring the full text (the box doesn't grow while
 * the text types in) and only the drawing is truncated.
 */
export interface TextReveal {
	characters: number;
	words: number;
}

export const FULL_REVEAL: TextReveal = { characters: 100, words: 100 };

export function isFullyRevealed({ reveal }: { reveal: TextReveal | undefined }): boolean {
	return !reveal || (reveal.characters >= 100 && reveal.words >= 100);
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

/** Visible part of each line. Counting runs across lines, ignoring line breaks. */
export function getRevealedLines({
	lines,
	reveal,
}: {
	lines: readonly string[];
	reveal: TextReveal;
}): string[] {
	let visible = lines.map((line) => line);

	if (reveal.words < 100) {
		// Words keep their trailing spaces so the visible text never ends mid-gap.
		const lineWords = visible.map((line) => line.match(/\S+\s*|\s+/g) ?? []);
		const total = lineWords.reduce(
			(sum, words) => sum + words.filter((word) => word.trim() !== "").length,
			0,
		);
		let remaining = Math.round((total * clampPercent(reveal.words)) / 100);
		visible = lineWords.map((words) => {
			let text = "";
			for (const word of words) {
				const isWord = word.trim() !== "";
				if (isWord) {
					if (remaining <= 0) break;
					remaining -= 1;
				} else if (remaining <= 0) {
					break;
				}
				text += word;
			}
			return text.trimEnd();
		});
	}

	if (reveal.characters < 100) {
		const glyphs = visible.map((line) => Array.from(line));
		const total = glyphs.reduce((sum, line) => sum + line.length, 0);
		let remaining = Math.round((total * clampPercent(reveal.characters)) / 100);
		visible = glyphs.map((line) => {
			const count = Math.min(line.length, Math.max(0, remaining));
			remaining -= count;
			return line.slice(0, count).join("");
		});
	}

	return visible;
}
