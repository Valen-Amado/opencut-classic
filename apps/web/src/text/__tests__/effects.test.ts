import { describe, expect, test } from "bun:test";
import { upsertPathKeyframe } from "@/animation";
import type { ElementAnimations } from "@/animation/types";
import { coerceParamValue, getParamChannelLayout, type ParamValues } from "@/params";
import { getBuiltInElementParams } from "@/params/registry";
import { mediaTime } from "@/wasm";
import {
	buildTextPaintStyleFromElement,
	colorWithAlpha,
	getShadowGeometry,
	TEXT_SHADOW_DEFAULTS,
} from "../effects";

function keyframed({
	key,
	points,
}: {
	key: string;
	points: Array<[number, number]>;
}): ElementAnimations | undefined {
	const param = getBuiltInElementParams({ type: "text" }).find((p) => p.key === key);
	if (!param) throw new Error(`missing ${key}`);
	let animations: ElementAnimations | undefined;
	for (const [time, value] of points) {
		animations = upsertPathKeyframe({
			animations,
			propertyPath: key,
			time: mediaTime({ ticks: time }),
			value,
			channelLayout: getParamChannelLayout({ param }),
			coerceValue: ({ value: next }) => coerceParamValue({ param, value: next }),
		});
	}
	return animations;
}

describe("getShadowGeometry", () => {
	test("-45° points down-right", () => {
		const { offsetX, offsetY } = getShadowGeometry({
			shadow: { ...TEXT_SHADOW_DEFAULTS, distance: 100 },
			fontSize: 100,
		});
		expect(offsetX).toBeCloseTo(50 * Math.SQRT1_2);
		expect(offsetY).toBeCloseTo(50 * Math.SQRT1_2);
	});

	test("scales with the font size", () => {
		const small = getShadowGeometry({ shadow: TEXT_SHADOW_DEFAULTS, fontSize: 20 });
		const big = getShadowGeometry({ shadow: TEXT_SHADOW_DEFAULTS, fontSize: 40 });
		expect(big.offsetX).toBeCloseTo(small.offsetX * 2);
		expect(big.blur).toBeCloseTo(small.blur * 2);
	});

	test("90° points up", () => {
		const { offsetX, offsetY } = getShadowGeometry({
			shadow: { ...TEXT_SHADOW_DEFAULTS, angle: 90, distance: 100 },
			fontSize: 10,
		});
		expect(offsetX).toBeCloseTo(0);
		expect(offsetY).toBeCloseTo(-5);
	});
});

describe("colorWithAlpha", () => {
	test("multiplies the existing alpha", () => {
		expect(colorWithAlpha({ color: "#ff000080", alpha: 0.5 })).toMatch(
			/^rgba\(255, 0, 0, 0\.25\d*\)$/,
		);
		expect(colorWithAlpha({ color: "#000000", alpha: 0.6 })).toBe("rgba(0, 0, 0, 0.6)");
	});
});

describe("buildTextPaintStyleFromElement", () => {
	test("no shadow unless enabled", () => {
		expect(buildTextPaintStyleFromElement({ element: { params: {} } }).shadow).toBeNull();
	});

	test("reads shadow params with defaults", () => {
		const params: ParamValues = { "shadow.enabled": true, "shadow.opacity": 80 };
		const { shadow } = buildTextPaintStyleFromElement({ element: { params } });
		expect(shadow).toEqual({
			color: TEXT_SHADOW_DEFAULTS.color,
			opacity: 80,
			blur: TEXT_SHADOW_DEFAULTS.blur,
			distance: TEXT_SHADOW_DEFAULTS.distance,
			angle: TEXT_SHADOW_DEFAULTS.angle,
		});
	});

	test("resolves keyframed values at the local time", () => {
		const element = {
			params: { "shadow.enabled": true },
			animations: keyframed({
				key: "shadow.distance",
				points: [
					[0, 0],
					[1000, 100],
				],
			}),
		};
		const mid = buildTextPaintStyleFromElement({ element, localTime: 500 });
		expect(mid.shadow?.distance).toBeCloseTo(50);
	});
});
