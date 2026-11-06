import { describe, expect, test } from "bun:test";
import { wrapSubtitleText } from "@/subtitles/build-subtitle-text-element";

const ctx = {
	measureText: (text: string) => ({ width: text.length }) as TextMetrics,
};

describe("wrapSubtitleText", () => {
	test("leaves text that fits on one line", () => {
		expect(wrapSubtitleText({ ctx, text: "son de la marca", maxWidth: 40 })).toBe(
			"son de la marca",
		);
	});

	test("evens out the lines instead of leaving a word alone", () => {
		expect(
			wrapSubtitleText({
				ctx,
				text: "pero nosotros las traemos por ti.",
				maxWidth: 29,
			}),
		).toBe("pero nosotros las\ntraemos por ti.");
	});

	test("keeps a word wider than the limit", () => {
		expect(
			wrapSubtitleText({ ctx, text: "hola anticonstitucional", maxWidth: 8 }),
		).toBe("hola\nanticonstitucional");
	});
});
