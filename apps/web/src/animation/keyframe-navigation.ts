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
