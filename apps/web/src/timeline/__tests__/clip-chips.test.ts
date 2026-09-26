import { describe, expect, test } from "bun:test";
import {
	formatClipDuration,
	formatClipSpeedLabel,
} from "@/timeline/clip-chips";
import { roundMediaTime, TICKS_PER_SECOND } from "@/wasm";

describe("formatClipDuration", () => {
	test("formats as HH:MM:SS:FF in the project fps", () => {
		const duration = roundMediaTime({
			time: TICKS_PER_SECOND * (3 + 3 / 30),
		});
		expect(
			formatClipDuration({
				duration,
				fps: { numerator: 30, denominator: 1 },
			}),
		).toBe("00:00:03:03");
	});
});

describe("formatClipSpeedLabel", () => {
	test("is hidden at normal speed", () => {
		expect(formatClipSpeedLabel({ rate: 1 })).toBeNull();
	});

	test("shows the rate trimmed to two decimals", () => {
		expect(formatClipSpeedLabel({ rate: 2 })).toBe("Velocidad 2x");
		expect(formatClipSpeedLabel({ rate: 0.5 })).toBe("Velocidad 0.5x");
		expect(formatClipSpeedLabel({ rate: 1.3333 })).toBe("Velocidad 1.33x");
	});
});
