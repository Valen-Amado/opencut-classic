import { describe, expect, test } from "bun:test";
import { applyTextStyle, extractTextStyle, getNextStyleName } from "../text-styles";

describe("text styles", () => {
	test("extracts only style params, never the content", () => {
		expect(
			extractTextStyle({ params: { content: "Hola", fontFamily: "Inter", fontSize: 20, "background.enabled": true } }),
		).toEqual({ fontFamily: "Inter", fontSize: 20, "background.enabled": true });
	});

	test("applies a style while keeping the content", () => {
		expect(
			applyTextStyle({
				params: { content: "Hola", fontFamily: "Arial", color: "#fff" },
				style: { fontFamily: "Satoshi", content: "ignored" },
			}),
		).toEqual({ content: "Hola", fontFamily: "Satoshi", color: "#fff" });
	});

	test("names new styles without clashing", () => {
		expect(getNextStyleName({ styles: [] })).toBe("Estilo 1");
		expect(
			getNextStyleName({ styles: [{ id: "a", name: "Estilo 2", params: {} }] }),
		).toBe("Estilo 3");
	});
});
