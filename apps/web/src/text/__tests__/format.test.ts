import { describe, expect, test } from "bun:test";
import { isTextFormatActive, toggleTextFormat } from "../format";

describe("text formats", () => {
	test("bold and italic toggle their own params", () => {
		expect(toggleTextFormat({ params: { fontWeight: "normal" }, format: "bold" })).toEqual({ key: "fontWeight", value: "bold" });
		expect(toggleTextFormat({ params: { fontWeight: "bold" }, format: "bold" })).toEqual({ key: "fontWeight", value: "normal" });
		expect(toggleTextFormat({ params: { fontStyle: "normal" }, format: "italic" })).toEqual({ key: "fontStyle", value: "italic" });
	});

	test("underline and strikethrough are exclusive", () => {
		expect(toggleTextFormat({ params: { textDecoration: "underline" }, format: "strikethrough" })).toEqual({ key: "textDecoration", value: "line-through" });
		expect(toggleTextFormat({ params: { textDecoration: "line-through" }, format: "strikethrough" })).toEqual({ key: "textDecoration", value: "none" });
	});

	test("reports active formats", () => {
		const params = { fontWeight: "bold", fontStyle: "normal", textDecoration: "underline" };
		expect(isTextFormatActive({ params, format: "bold" })).toBe(true);
		expect(isTextFormatActive({ params, format: "italic" })).toBe(false);
		expect(isTextFormatActive({ params, format: "underline" })).toBe(true);
		expect(isTextFormatActive({ params, format: "strikethrough" })).toBe(false);
	});
});
