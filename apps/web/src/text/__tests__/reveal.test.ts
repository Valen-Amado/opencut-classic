import { describe, expect, test } from "bun:test";
import { getRevealedLines, isFullyRevealed } from "@/text/reveal";

describe("getRevealedLines", () => {
	test("types characters across lines", () => {
		expect(getRevealedLines({ lines: ["Hola", "mundo"], reveal: { characters: 50, words: 100 } })).toEqual([
			"Hola",
			"m",
		]);
		expect(getRevealedLines({ lines: ["Hola", "mundo"], reveal: { characters: 0, words: 100 } })).toEqual(["", ""]);
	});

	test("reveals whole words", () => {
		expect(
			getRevealedLines({ lines: ["uno dos tres", "cuatro"], reveal: { characters: 100, words: 50 } }),
		).toEqual(["uno dos", ""]);
		expect(
			getRevealedLines({ lines: ["uno dos tres", "cuatro"], reveal: { characters: 100, words: 75 } }),
		).toEqual(["uno dos tres", ""]);
	});

	test("counts emoji as one character", () => {
		expect(getRevealedLines({ lines: ["a😀b"], reveal: { characters: 67, words: 100 } })).toEqual(["a😀"]);
	});

	test("full reveal detection", () => {
		expect(isFullyRevealed({ reveal: undefined })).toBe(true);
		expect(isFullyRevealed({ reveal: { characters: 100, words: 99 } })).toBe(false);
	});
});
