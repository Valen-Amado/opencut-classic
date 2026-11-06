import type { FrameRate } from "opencut-wasm";
import { TICKS_PER_SECOND } from "@/wasm";

/**
 * Keyframe times of an element (element-local ticks), unique and sorted, plus
 * helpers to step between them relative to the playhead.
 */
export function getUniqueKeyframeTimes({
	keyframes,
}: {
	keyframes: ReadonlyArray<{ time: number }>;
}): number[] {
	return [...new Set(keyframes.map((keyframe) => keyframe.time))].sort(
		(a, b) => a - b,
	);
}

export function getAdjacentKeyframeTimes({
	times,
	current,
}: {
	times: readonly number[];
	current: number;
}): { previous: number | null; next: number | null; atCurrent: boolean } {
	let previous: number | null = null;
	let next: number | null = null;
	let atCurrent = false;
	for (const time of times) {
		if (time < current) previous = time;
		else if (time === current) atCurrent = true;
		else if (next === null) next = time;
	}
	return { previous, next, atCurrent };
}

/**
 * The playhead lands on frames, but a keyframe can sit between two of them when
 * its clip starts off-frame. The frame that shows a keyframe counts as being on
 * it, so editing there changes that keyframe instead of adding one beside it.
 */
export function snapToKeyframeTime({
	time,
	times,
	fps,
}: {
	time: number;
	times: readonly number[];
	fps: FrameRate;
}): number {
	const halfFrame = (TICKS_PER_SECOND * fps.denominator) / fps.numerator / 2;
	let nearest = time;
	let nearestDistance = Number.POSITIVE_INFINITY;
	for (const candidate of times) {
		const distance = Math.abs(candidate - time);
		if (distance <= halfFrame && distance < nearestDistance) {
			nearest = candidate;
			nearestDistance = distance;
		}
	}
	return nearest;
}
