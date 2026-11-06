import { describe, expect, test } from "bun:test";
import { getChannel, resolveAnimationPathValueAtTime, upsertPathKeyframe } from "@/animation";
import type { ElementAnimations } from "@/animation/types";
import { buildParamWritePatch } from "@/components/editor/panels/properties/param-write";
import { getParamChannelLayout, type ParamValue } from "@/params";
import { getElementParam } from "@/params/registry";
import { buildMoveUpdates, toDragElementSnapshot } from "@/preview/controllers/preview-interaction-controller";
import type { ImageElement } from "@/timeline";
import { mediaTime, type MediaTime } from "@/wasm";

const SECOND = 120_000;
const at = (seconds: number) => mediaTime({ ticks: seconds * SECOND });

function buildImage({ animations }: { animations?: ElementAnimations } = {}): ImageElement {
	return {
		id: "image",
		type: "image",
		name: "image",
		mediaId: "media",
		startTime: at(0),
		duration: at(10),
		trimStart: at(0),
		trimEnd: at(0),
		params: { "transform.positionX": 0, "transform.positionY": 0, "transform.scaleX": 1, "transform.scaleY": 1 },
		animations,
	} as unknown as ImageElement;
}

function withKeyframes({
	keyframes,
}: {
	keyframes: Array<{ path: string; time: MediaTime; value: number }>;
}): ElementAnimations | undefined {
	const element = buildImage();
	return keyframes.reduce<ElementAnimations | undefined>((animations, { path, time, value }) => {
		const param = getElementParam({ element, key: path });
		if (!param) throw new Error(`Unknown param ${path}`);
		return upsertPathKeyframe({
			animations,
			propertyPath: path,
			time,
			value,
			channelLayout: getParamChannelLayout({ param }),
			coerceValue: ({ value: next }: { value: ParamValue }) => next,
		});
	}, undefined);
}

const valueAt = ({
	animations,
	path,
	time,
}: {
	animations: ElementAnimations | undefined;
	path: string;
	time: MediaTime;
}) => resolveAnimationPathValueAtTime({ animations, propertyPath: path, localTime: time, fallbackValue: -1 });

describe("moving an animated element on the canvas", () => {
	const animations = withKeyframes({
		keyframes: [
			{ path: "transform.positionX", time: at(1), value: 100 },
			{ path: "transform.positionX", time: at(3), value: 100 },
		],
	});

	test("changes only the keyframe at the playhead", () => {
		const snapshot = toDragElementSnapshot({
			fps: { numerator: 30, denominator: 1 },
			trackId: "track",
			element: buildImage({ animations }),
			currentTime: at(3),
		});
		const updates = buildMoveUpdates({ snapshot, delta: { x: 50, y: 0 } });

		expect(valueAt({ animations: updates.animations, path: "transform.positionX", time: at(1) })).toBe(100);
		expect(valueAt({ animations: updates.animations, path: "transform.positionX", time: at(3) })).toBe(150);
	});

	test("adds a keyframe between two existing ones", () => {
		const snapshot = toDragElementSnapshot({
			fps: { numerator: 30, denominator: 1 },
			trackId: "track",
			element: buildImage({ animations }),
			currentTime: at(2),
		});
		const updates = buildMoveUpdates({ snapshot, delta: { x: 50, y: 0 } });

		expect(getChannel({ animations: updates.animations, propertyPath: "transform.positionX" })?.keys).toHaveLength(3);
	});

	test("a static axis changes its base value and gets no keyframes", () => {
		const snapshot = toDragElementSnapshot({
			fps: { numerator: 30, denominator: 1 },
			trackId: "track",
			element: buildImage({ animations }),
			currentTime: at(3),
		});
		const updates = buildMoveUpdates({ snapshot, delta: { x: 0, y: 40 } });

		expect(updates.params?.["transform.positionY"]).toBe(40);
		expect(getChannel({ animations: updates.animations, propertyPath: "transform.positionY" })).toBeUndefined();
	});

	test("outside the clip the whole motion shifts, since no frame can be keyed", () => {
		const snapshot = toDragElementSnapshot({
			fps: { numerator: 30, denominator: 1 },
			trackId: "track",
			element: buildImage({ animations }),
			currentTime: at(20),
		});
		const updates = buildMoveUpdates({ snapshot, delta: { x: 50, y: 0 } });

		expect(valueAt({ animations: updates.animations, path: "transform.positionX", time: at(1) })).toBe(150);
		expect(valueAt({ animations: updates.animations, path: "transform.positionX", time: at(3) })).toBe(150);
	});
});

describe("writing an animated param with the playhead outside the clip", () => {
	test("changes the value shown at the clip edge and keeps earlier keyframes", () => {
		const animations = withKeyframes({
			keyframes: [{ path: "transform.positionX", time: at(1), value: 10 }],
		});
		const patch = buildParamWritePatch({
			element: buildImage({ animations }),
			values: { "transform.positionX": 99 },
			localTime: at(5),
		});

		expect(valueAt({ animations: patch.animations, path: "transform.positionX", time: at(5) })).toBe(99);
		expect(valueAt({ animations: patch.animations, path: "transform.positionX", time: at(1) })).toBe(10);
	});
});

describe("scaling an animated element on the canvas", () => {
	test("keeps the other scale keyframes", () => {
		const animations = withKeyframes({
			keyframes: [
				{ path: "transform.scaleX", time: at(1), value: 0.3 },
				{ path: "transform.scaleX", time: at(3), value: 0.3 },
			],
		});
		const patch = buildParamWritePatch({
			element: buildImage({ animations }),
			values: { "transform.scaleX": 0.1 },
			localTime: at(3),
		});

		expect(valueAt({ animations: patch.animations, path: "transform.scaleX", time: at(1) })).toBeCloseTo(0.3);
		expect(valueAt({ animations: patch.animations, path: "transform.scaleX", time: at(3) })).toBeCloseTo(0.1);
	});
});
