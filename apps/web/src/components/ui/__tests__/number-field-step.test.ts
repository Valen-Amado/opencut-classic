import { describe, expect, test } from "bun:test";
import { getKeyboardSteppedValue } from "../number-field";

describe("getKeyboardSteppedValue", () => {
	test("steps up and down by the step", () => {
		expect(getKeyboardSteppedValue({ current: "10", step: 1, direction: 1 })).toBe(11);
		expect(getKeyboardSteppedValue({ current: "10", step: 1, direction: -1 })).toBe(9);
	});

	test("shift multiplies the step by 10 and alt divides it by 10", () => {
		expect(
			getKeyboardSteppedValue({ current: 1, step: 0.1, direction: 1, shiftKey: true }),
		).toBe(2);
		expect(
			getKeyboardSteppedValue({ current: 1, step: 1, direction: -1, altKey: true }),
		).toBe(0.9);
	});

	test("avoids floating point noise", () => {
		expect(getKeyboardSteppedValue({ current: "0.1", step: 0.2, direction: 1 })).toBe(0.3);
	});

	test("returns null for non numeric input", () => {
		expect(getKeyboardSteppedValue({ current: "abc", step: 1, direction: 1 })).toBeNull();
	});
});
