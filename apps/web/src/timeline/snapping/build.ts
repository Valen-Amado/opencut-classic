import type { FrameRate } from "opencut-wasm";
import { TICKS_PER_SECOND } from "@/wasm";
import type { SnapPoint, TimelineSnapPointSource } from "./types";

export function buildTimelineSnapPoints({
	sources,
}: {
	sources: TimelineSnapPointSource[];
}): SnapPoint[] {
	const snapPoints: SnapPoint[] = [];

	for (const source of sources) {
		for (const snapPoint of source()) {
			snapPoints.push(snapPoint);
		}
	}

	return snapPoints;
}

/**
 * The playhead sits on whole frames, so next to a clip that ends between two
 * frames it is always a fraction off. Snapping to it there would leave the
 * edges a frame apart on screen, so the clip's edge wins.
 */
export function dropPlayheadBesideElementEdges({
	snapPoints,
	fps,
}: {
	snapPoints: SnapPoint[];
	fps: FrameRate;
}): SnapPoint[] {
	const ticksPerFrame = (TICKS_PER_SECOND * fps.denominator) / fps.numerator;
	const isElementEdge = ({ type }: SnapPoint) =>
		type === "element-start" || type === "element-end";

	return snapPoints.filter(
		(point) =>
			point.type !== "playhead" ||
			!snapPoints.some(
				(other) =>
					isElementEdge(other) &&
					Math.abs(other.time - point.time) < ticksPerFrame,
			),
	);
}
