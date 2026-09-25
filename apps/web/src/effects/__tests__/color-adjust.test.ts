import { describe, expect, test } from "bun:test";
import {
	buildColorAdjustUniforms,
	isNeutralAdjustment,
	resolveAdjustments,
} from "../color-adjust";

describe("color adjustments", () => {
	test("default params are neutral", () => {
		expect(isNeutralAdjustment({ params: { preset: "none", intensity: 100 } })).toBe(true);
		expect(buildColorAdjustUniforms({ params: {} })).toEqual({
			u_light: [0, 0, 0, 0],
			u_color: [0, 0, 0, 0],
			u_fx: [0, 0, 0, 0],
			u_extra: [0, 0, 0, 0],
		});
	});

	test("presets scale with intensity and add manual offsets", () => {
		const resolved = resolveAdjustments({ params: { preset: "warm", intensity: 50, temperature: 10 } });
		expect(resolved.temperature).toBe(45 * 0.5 + 10);
		expect(resolved.saturation).toBe(5);
	});

	test("values are clamped to their range", () => {
		const resolved = resolveAdjustments({ params: { preset: "bw", saturation: -50 } });
		expect(resolved.saturation).toBe(-100);
	});

	test("uniforms are normalized for the shader", () => {
		const uniforms = buildColorAdjustUniforms({ params: { exposure: 50, hue: -90, grain: 20 }, seed: 7 });
		expect(uniforms.u_light[0]).toBe(0.5);
		expect(uniforms.u_fx).toEqual([-0.5, 0, 0, 0.2]);
		expect(uniforms.u_extra).toEqual([7, 0, 0, 0]);
	});
});
