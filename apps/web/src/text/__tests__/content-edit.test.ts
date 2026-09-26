import { describe, expect, test } from "bun:test";
import { buildContentEditUpdate } from "@/text/content-edit";
import type { TextElement } from "@/timeline";

describe("buildContentEditUpdate", () => {
	test("keeps every style param while replacing the content", () => {
		const element = {
			params: {
				content: "Antes",
				fontFamily: "Satoshi",
				fontSize: 42,
				color: "#ff0000",
				"shadow.enabled": true,
				"fx.type": "neon",
			},
		} as unknown as TextElement;
		expect(buildContentEditUpdate({ element, content: "Después" }).params).toEqual({
			content: "Después",
			fontFamily: "Satoshi",
			fontSize: 42,
			color: "#ff0000",
			"shadow.enabled": true,
			"fx.type": "neon",
		});
	});
});
