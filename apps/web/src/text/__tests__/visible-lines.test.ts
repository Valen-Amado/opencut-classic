import { describe, expect, test } from "bun:test";
import { getVisibleTextLines } from "@/text/primitives";

describe("getVisibleTextLines", () => {
	test("drops trailing line breaks that only add empty space", () => {
		expect(getVisibleTextLines({ content: "What is in my bag\n\n" })).toEqual(["What is in my bag"]);
	});

	test("keeps line breaks between lines, including empty middle lines", () => {
		expect(getVisibleTextLines({ content: "Hola\n\nmundo\n" })).toEqual(["Hola", "", "mundo"]);
	});

	test("an empty text is one empty line", () => {
		expect(getVisibleTextLines({ content: "" })).toEqual([""]);
	});
});
