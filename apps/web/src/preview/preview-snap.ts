export interface SnapLine {
	type: "horizontal" | "vertical";
	position: number;
	/** Extent along the other axis; the line spans the whole canvas when omitted. */
	start?: number;
	end?: number;
	/** "element" when the line aligns with another element instead of the canvas. */
	source?: "canvas" | "element";
}

/** Axis-aligned rect in center-origin canvas coordinates (same space as transform position). */
export interface SnapRect {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/** Measured gap between two rects (Figma-style red distance line). */
export interface SpacingGuide {
	axis: "x" | "y";
	/** Start and end of the gap along `axis`. */
	from: number;
	to: number;
	/** Position of the line on the other axis. */
	at: number;
	/** The gap equals the gap on the opposite side (equal spacing). */
	isEqual: boolean;
}

const ROTATION_SNAP_STEP_DEGREES = 90;
const ROTATION_SNAP_THRESHOLD_DEGREES = 5;
export const MIN_SCALE = 0.01;
export const SNAP_THRESHOLD_SCREEN_PIXELS = 8;

export interface SnapResult {
	snappedPosition: { x: number; y: number };
	activeLines: SnapLine[];
	spacingGuides: SpacingGuide[];
}

/** AABB of rotated bounds given in top-left canvas coordinates, as a center-origin rect. */
export function rectFromBounds({
	bounds,
	canvasSize,
}: {
	bounds: { cx: number; cy: number; width: number; height: number; rotation: number };
	canvasSize: { width: number; height: number };
}): SnapRect {
	const rad = (bounds.rotation * Math.PI) / 180;
	const cos = Math.abs(Math.cos(rad));
	const sin = Math.abs(Math.sin(rad));
	const halfWidth = (Math.abs(bounds.width) * cos + Math.abs(bounds.height) * sin) / 2;
	const halfHeight = (Math.abs(bounds.width) * sin + Math.abs(bounds.height) * cos) / 2;
	const cx = bounds.cx - canvasSize.width / 2;
	const cy = bounds.cy - canvasSize.height / 2;
	return { left: cx - halfWidth, right: cx + halfWidth, top: cy - halfHeight, bottom: cy + halfHeight };
}

const overlapsVertically = ({ a, b }: { a: SnapRect; b: SnapRect }) =>
	Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;
const overlapsHorizontally = ({ a, b }: { a: SnapRect; b: SnapRect }) =>
	Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0;

/** Nearest neighbor in each direction that overlaps `rect` on the other axis. */
export function findNeighbors({
	rect,
	others,
}: {
	rect: SnapRect;
	others: readonly SnapRect[];
}): { left?: SnapRect; right?: SnapRect; top?: SnapRect; bottom?: SnapRect } {
	const nearest = ({
		candidates,
		distance,
	}: {
		candidates: SnapRect[];
		distance: (other: SnapRect) => number;
	}) => candidates.sort((a, b) => distance(a) - distance(b))[0];
	return {
		left: nearest({
			candidates: others.filter((o) => overlapsVertically({ a: rect, b: o }) && o.right <= rect.left + 0.5),
			distance: (o) => rect.left - o.right,
		}),
		right: nearest({
			candidates: others.filter((o) => overlapsVertically({ a: rect, b: o }) && o.left >= rect.right - 0.5),
			distance: (o) => o.left - rect.right,
		}),
		top: nearest({
			candidates: others.filter((o) => overlapsHorizontally({ a: rect, b: o }) && o.bottom <= rect.top + 0.5),
			distance: (o) => rect.top - o.bottom,
		}),
		bottom: nearest({
			candidates: others.filter((o) => overlapsHorizontally({ a: rect, b: o }) && o.top >= rect.bottom - 0.5),
			distance: (o) => o.top - rect.bottom,
		}),
	};
}

/** Distance lines from `rect` to its nearest neighbors (or to the canvas edges when there are none). */
export function getDistanceGuides({
	rect,
	others,
	canvasSize,
	includeCanvasEdges = false,
	equalX = false,
	equalY = false,
}: {
	rect: SnapRect;
	others: readonly SnapRect[];
	canvasSize?: { width: number; height: number };
	includeCanvasEdges?: boolean;
	equalX?: boolean;
	equalY?: boolean;
}): SpacingGuide[] {
	const neighbors = findNeighbors({ rect, others });
	const midY = (o: SnapRect) => (Math.max(rect.top, o.top) + Math.min(rect.bottom, o.bottom)) / 2;
	const midX = (o: SnapRect) => (Math.max(rect.left, o.left) + Math.min(rect.right, o.right)) / 2;
	const centerX = (rect.left + rect.right) / 2;
	const centerY = (rect.top + rect.bottom) / 2;
	const guides: SpacingGuide[] = [];
	const halfW = canvasSize ? canvasSize.width / 2 : 0;
	const halfH = canvasSize ? canvasSize.height / 2 : 0;
	const edges = includeCanvasEdges && canvasSize;

	if (neighbors.left) guides.push({ axis: "x", from: neighbors.left.right, to: rect.left, at: midY(neighbors.left), isEqual: equalX });
	else if (edges) guides.push({ axis: "x", from: -halfW, to: rect.left, at: centerY, isEqual: false });
	if (neighbors.right) guides.push({ axis: "x", from: rect.right, to: neighbors.right.left, at: midY(neighbors.right), isEqual: equalX });
	else if (edges) guides.push({ axis: "x", from: rect.right, to: halfW, at: centerY, isEqual: false });
	if (neighbors.top) guides.push({ axis: "y", from: neighbors.top.bottom, to: rect.top, at: midX(neighbors.top), isEqual: equalY });
	else if (edges) guides.push({ axis: "y", from: -halfH, to: rect.top, at: centerX, isEqual: false });
	if (neighbors.bottom) guides.push({ axis: "y", from: rect.bottom, to: neighbors.bottom.top, at: midX(neighbors.bottom), isEqual: equalY });
	else if (edges) guides.push({ axis: "y", from: rect.bottom, to: halfH, at: centerX, isEqual: false });

	return guides.filter((guide) => guide.to - guide.from >= 1);
}

type ScaleEdge = "left" | "right" | "top" | "bottom";

export interface ScaleEdgePreference {
	left?: boolean;
	right?: boolean;
	top?: boolean;
	bottom?: boolean;
}

function hasPreferredEdge({
	preferredEdges,
	edge,
}: {
	preferredEdges?: ScaleEdgePreference;
	edge: ScaleEdge;
}): boolean {
	return preferredEdges?.[edge] === true;
}

function pickClosestScaleCandidate<T extends { distance: number; edge: ScaleEdge }>({
	candidates,
	preferredEdges,
}: {
	candidates: T[];
	preferredEdges?: ScaleEdgePreference;
}): T | null {
	if (candidates.length === 0) {
		return null;
	}

	return candidates.reduce((bestCandidate, candidate) => {
		if (candidate.distance < bestCandidate.distance) {
			return candidate;
		}
		if (candidate.distance > bestCandidate.distance) {
			return bestCandidate;
		}

		const shouldPreferCandidate = hasPreferredEdge({
			preferredEdges,
			edge: candidate.edge,
		});
		const shouldPreferBestCandidate = hasPreferredEdge({
			preferredEdges,
			edge: bestCandidate.edge,
		});

		return shouldPreferCandidate && !shouldPreferBestCandidate
			? candidate
			: bestCandidate;
	});
}

export function snapPosition({
	proposedPosition,
	canvasSize,
	elementSize,
	rotation = 0,
	snapThreshold,
	targets = [],
}: {
	proposedPosition: { x: number; y: number };
	canvasSize: { width: number; height: number };
	elementSize: { width: number; height: number };
	rotation?: number;
	snapThreshold: { x: number; y: number };
	/** Other elements to align with; enables distance and equal-spacing guides. */
	targets?: readonly SnapRect[];
}): SnapResult {
	const centerX = 0;
	const centerY = 0;
	const left = -canvasSize.width / 2;
	const right = canvasSize.width / 2;
	const top = -canvasSize.height / 2;
	const bottom = canvasSize.height / 2;

	const rotRad = (rotation * Math.PI) / 180;
	const cosR = Math.abs(Math.cos(rotRad));
	const sinR = Math.abs(Math.sin(rotRad));
	const halfWidth = (elementSize.width * cosR + elementSize.height * sinR) / 2;
	const halfHeight = (elementSize.width * sinR + elementSize.height * cosR) / 2;
	const activeLines: SnapLine[] = [];

	type AxisSnapCandidate = {
		snappedPosition: number;
		line: SnapLine;
		distance: number;
		target?: SnapRect;
	};

	function getClosestAxisSnap({
		candidates,
		threshold,
	}: {
		candidates: AxisSnapCandidate[];
		threshold: number;
	}): AxisSnapCandidate | null {
		const snapCandidatesWithinThreshold = candidates.filter(
			(candidate) => candidate.distance <= threshold,
		);
		if (snapCandidatesWithinThreshold.length === 0) {
			return null;
		}
		return snapCandidatesWithinThreshold.reduce((closest, current) =>
			current.distance < closest.distance ? current : closest,
		);
	}

	const verticalTargets = [centerX, left, right];
	const horizontalTargets = [centerY, top, bottom];

	const xCandidates: AxisSnapCandidate[] = [];
	for (const targetX of verticalTargets) {
		xCandidates.push({
			snappedPosition: targetX,
			line: { type: "vertical", position: targetX },
			distance: Math.abs(proposedPosition.x - targetX),
		});
		xCandidates.push({
			snappedPosition: targetX + halfWidth,
			line: { type: "vertical", position: targetX },
			distance: Math.abs(proposedPosition.x - halfWidth - targetX),
		});
		xCandidates.push({
			snappedPosition: targetX - halfWidth,
			line: { type: "vertical", position: targetX },
			distance: Math.abs(proposedPosition.x + halfWidth - targetX),
		});
	}
	for (const target of targets) {
		for (const targetX of [target.left, (target.left + target.right) / 2, target.right]) {
			const line: SnapLine = { type: "vertical", position: targetX, source: "element" };
			xCandidates.push({ snappedPosition: targetX, line, distance: Math.abs(proposedPosition.x - targetX), target });
			xCandidates.push({ snappedPosition: targetX + halfWidth, line, distance: Math.abs(proposedPosition.x - halfWidth - targetX), target });
			xCandidates.push({ snappedPosition: targetX - halfWidth, line, distance: Math.abs(proposedPosition.x + halfWidth - targetX), target });
		}
	}
	const yCandidates: AxisSnapCandidate[] = [];
	for (const target of targets) {
		for (const targetY of [target.top, (target.top + target.bottom) / 2, target.bottom]) {
			const line: SnapLine = { type: "horizontal", position: targetY, source: "element" };
			yCandidates.push({ snappedPosition: targetY, line, distance: Math.abs(proposedPosition.y - targetY), target });
			yCandidates.push({ snappedPosition: targetY + halfHeight, line, distance: Math.abs(proposedPosition.y - halfHeight - targetY), target });
			yCandidates.push({ snappedPosition: targetY - halfHeight, line, distance: Math.abs(proposedPosition.y + halfHeight - targetY), target });
		}
	}
	for (const targetY of horizontalTargets) {
		yCandidates.push({
			snappedPosition: targetY,
			line: { type: "horizontal", position: targetY },
			distance: Math.abs(proposedPosition.y - targetY),
		});
		yCandidates.push({
			snappedPosition: targetY + halfHeight,
			line: { type: "horizontal", position: targetY },
			distance: Math.abs(proposedPosition.y - halfHeight - targetY),
		});
		yCandidates.push({
			snappedPosition: targetY - halfHeight,
			line: { type: "horizontal", position: targetY },
			distance: Math.abs(proposedPosition.y + halfHeight - targetY),
		});
	}

	const closestX = getClosestAxisSnap({
		candidates: xCandidates,
		threshold: snapThreshold.x,
	});
	const closestY = getClosestAxisSnap({
		candidates: yCandidates,
		threshold: snapThreshold.y,
	});

	let x = closestX?.snappedPosition ?? proposedPosition.x;
	let y = closestY?.snappedPosition ?? proposedPosition.y;

	// Equal spacing: centre the element between its neighbors when the gaps nearly match.
	let equalX = false;
	let equalY = false;
	if (targets.length > 0) {
		const rectAt = () => ({ left: x - halfWidth, right: x + halfWidth, top: y - halfHeight, bottom: y + halfHeight });
		const neighbors = findNeighbors({ rect: rectAt(), others: targets });
		if (!closestX && neighbors.left && neighbors.right) {
			const gapLeft = x - halfWidth - neighbors.left.right;
			const gapRight = neighbors.right.left - (x + halfWidth);
			if (Math.abs(gapLeft - gapRight) <= snapThreshold.x * 2) {
				x += (gapRight - gapLeft) / 2;
				equalX = true;
			}
		}
		if (!closestY && neighbors.top && neighbors.bottom) {
			const gapTop = y - halfHeight - neighbors.top.bottom;
			const gapBottom = neighbors.bottom.top - (y + halfHeight);
			if (Math.abs(gapTop - gapBottom) <= snapThreshold.y * 2) {
				y += (gapBottom - gapTop) / 2;
				equalY = true;
			}
		}
	}

	const rect = { left: x - halfWidth, right: x + halfWidth, top: y - halfHeight, bottom: y + halfHeight };
	if (closestX) {
		const target = closestX.target;
		activeLines.push(
			target
				? { ...closestX.line, start: Math.min(rect.top, target.top), end: Math.max(rect.bottom, target.bottom) }
				: closestX.line,
		);
	}
	if (closestY) {
		const target = closestY.target;
		activeLines.push(
			target
				? { ...closestY.line, start: Math.min(rect.left, target.left), end: Math.max(rect.right, target.right) }
				: closestY.line,
		);
	}

	return {
		snappedPosition: { x, y },
		activeLines,
		spacingGuides:
			targets.length > 0 ? getDistanceGuides({ rect, others: targets, equalX, equalY }) : [],
	};
}

export interface ScaleSnapResult {
	snappedScale: number;
	activeLines: SnapLine[];
}

export function snapScale({
	proposedScale,
	position,
	baseWidth,
	baseHeight,
	rotation = 0,
	canvasSize,
	snapThreshold,
	preferredEdges,
	targets = [],
}: {
	proposedScale: number;
	position: { x: number; y: number };
	baseWidth: number;
	baseHeight: number;
	rotation?: number;
	canvasSize: { width: number; height: number };
	snapThreshold: { x: number; y: number };
	preferredEdges?: ScaleEdgePreference;
	/** Other elements whose edges and centers the scaled edges snap to. */
	targets?: readonly SnapRect[];
}): ScaleSnapResult {
	const centerX = 0;
	const centerY = 0;
	const left = -canvasSize.width / 2;
	const right = canvasSize.width / 2;
	const top = -canvasSize.height / 2;
	const bottom = canvasSize.height / 2;

	const rotRad = (rotation * Math.PI) / 180;
	const cosR = Math.abs(Math.cos(rotRad));
	const sinR = Math.abs(Math.sin(rotRad));
	const aabbBaseHalfW = (baseWidth * cosR + baseHeight * sinR) / 2;
	const aabbBaseHalfH = (baseWidth * sinR + baseHeight * cosR) / 2;

	const leftEdge = position.x - aabbBaseHalfW * proposedScale;
	const rightEdge = position.x + aabbBaseHalfW * proposedScale;
	const topEdge = position.y - aabbBaseHalfH * proposedScale;
	const bottomEdge = position.y + aabbBaseHalfH * proposedScale;

	interface SnapCandidate {
		scale: number;
		distance: number;
		lines: SnapLine[];
		edge: ScaleEdge;
	}

	const candidates: SnapCandidate[] = [];

	interface ScaleTarget {
		position: number;
		line: SnapLine;
		rect?: SnapRect;
	}
	const elementTargets = ({
		type,
		positions,
	}: {
		type: SnapLine["type"];
		positions: (rect: SnapRect) => number[];
	}): ScaleTarget[] =>
		targets.flatMap((rect) =>
			positions(rect).map((targetPosition) => ({
				position: targetPosition,
				line: { type, position: targetPosition, source: "element" as const },
				rect,
			})),
		);

	const verticalTargets: ScaleTarget[] = [
		{ position: left, line: { type: "vertical" as const, position: left } },
		{
			position: centerX,
			line: { type: "vertical" as const, position: centerX },
		},
		{ position: right, line: { type: "vertical" as const, position: right } },
		...elementTargets({
			type: "vertical",
			positions: (rect) => [rect.left, (rect.left + rect.right) / 2, rect.right],
		}),
	];

	for (const target of verticalTargets) {
		const distanceLeft = Math.abs(leftEdge - target.position);
		if (distanceLeft <= snapThreshold.x) {
			const scale = (position.x - target.position) / aabbBaseHalfW;
			if (Math.abs(scale) > MIN_SCALE) {
				candidates.push({
					scale,
					distance: distanceLeft,
					lines: [target.line],
					edge: "left",
				});
			}
		}
		const distanceRight = Math.abs(rightEdge - target.position);
		if (distanceRight <= snapThreshold.x) {
			const scale = (target.position - position.x) / aabbBaseHalfW;
			if (Math.abs(scale) > MIN_SCALE) {
				candidates.push({
					scale,
					distance: distanceRight,
					lines: [target.line],
					edge: "right",
				});
			}
		}
	}

	const horizontalTargets: ScaleTarget[] = [
		{ position: top, line: { type: "horizontal" as const, position: top } },
		{
			position: centerY,
			line: { type: "horizontal" as const, position: centerY },
		},
		{
			position: bottom,
			line: { type: "horizontal" as const, position: bottom },
		},
		...elementTargets({
			type: "horizontal",
			positions: (rect) => [rect.top, (rect.top + rect.bottom) / 2, rect.bottom],
		}),
	];

	for (const target of horizontalTargets) {
		const distanceTop = Math.abs(topEdge - target.position);
		if (distanceTop <= snapThreshold.y) {
			const scale = (position.y - target.position) / aabbBaseHalfH;
			if (Math.abs(scale) > MIN_SCALE) {
				candidates.push({
					scale,
					distance: distanceTop,
					lines: [target.line],
					edge: "top",
				});
			}
		}
		const distanceBottom = Math.abs(bottomEdge - target.position);
		if (distanceBottom <= snapThreshold.y) {
			const scale = (target.position - position.y) / aabbBaseHalfH;
			if (Math.abs(scale) > MIN_SCALE) {
				candidates.push({
					scale,
					distance: distanceBottom,
					lines: [target.line],
					edge: "bottom",
				});
			}
		}
	}

	const best = pickClosestScaleCandidate({
		candidates,
		preferredEdges,
	});
	if (!best) {
		return { snappedScale: proposedScale, activeLines: [] };
	}

	const snappedLeft = position.x - aabbBaseHalfW * best.scale;
	const snappedRight = position.x + aabbBaseHalfW * best.scale;
	const snappedTop = position.y - aabbBaseHalfH * best.scale;
	const snappedBottom = position.y + aabbBaseHalfH * best.scale;

	const activeLines: SnapLine[] = [];
	const seenKeys = new Set<string>();

	function addLine({ target }: { target: ScaleTarget }) {
		const { line, rect } = target;
		const key = `${line.type}-${line.position}`;
		if (seenKeys.has(key)) return;
		seenKeys.add(key);
		if (!rect) {
			activeLines.push(line);
			return;
		}
		// Element lines span both boxes, like the move guides.
		activeLines.push(
			line.type === "vertical"
				? { ...line, start: Math.min(snappedTop, rect.top), end: Math.max(snappedBottom, rect.bottom) }
				: { ...line, start: Math.min(snappedLeft, rect.left), end: Math.max(snappedRight, rect.right) },
		);
	}

	for (const target of verticalTargets) {
		if (
			(hasPreferredEdge({ preferredEdges, edge: "left" }) &&
				Math.abs(snappedLeft - target.position) <= 1) ||
			(hasPreferredEdge({ preferredEdges, edge: "right" }) &&
				Math.abs(snappedRight - target.position) <= 1) ||
			(!preferredEdges &&
				(Math.abs(snappedLeft - target.position) <= 1 ||
					Math.abs(snappedRight - target.position) <= 1))
		) {
			addLine({ target });
		}
	}
	for (const target of horizontalTargets) {
		if (
			(hasPreferredEdge({ preferredEdges, edge: "top" }) &&
				Math.abs(snappedTop - target.position) <= 1) ||
			(hasPreferredEdge({ preferredEdges, edge: "bottom" }) &&
				Math.abs(snappedBottom - target.position) <= 1) ||
			(!preferredEdges &&
				(Math.abs(snappedTop - target.position) <= 1 ||
					Math.abs(snappedBottom - target.position) <= 1))
		) {
			addLine({ target });
		}
	}

	return {
		snappedScale: best.scale,
		activeLines,
	};
}

export interface AxisSnapResult {
	snappedScale: number;
	/** Infinity when no snap candidate was within threshold */
	snapDistance: number;
	activeLines: SnapLine[];
}

export function snapScaleAxes({
	proposedScaleX,
	proposedScaleY,
	position,
	baseWidth,
	baseHeight,
	rotation = 0,
	canvasSize,
	snapThreshold,
	preferredEdges,
}: {
	proposedScaleX: number;
	proposedScaleY: number;
	position: { x: number; y: number };
	baseWidth: number;
	baseHeight: number;
	rotation?: number;
	canvasSize: { width: number; height: number };
	snapThreshold: { x: number; y: number };
	preferredEdges?: ScaleEdgePreference;
}): { x: AxisSnapResult; y: AxisSnapResult } {
	const canvasLeft = -canvasSize.width / 2;
	const canvasRight = canvasSize.width / 2;
	const canvasTop = -canvasSize.height / 2;
	const canvasBottom = canvasSize.height / 2;

	const rotRad = (rotation * Math.PI) / 180;
	const cosR = Math.abs(Math.cos(rotRad));
	const sinR = Math.abs(Math.sin(rotRad));
	const EPSILON = 1e-6;

	// Current AABB edges at proposed scales
	const currentAabbHalfW = (baseWidth * proposedScaleX * cosR + baseHeight * proposedScaleY * sinR) / 2;
	const currentAabbHalfH = (baseWidth * proposedScaleX * sinR + baseHeight * proposedScaleY * cosR) / 2;
	const currentLeftEdge = position.x - currentAabbHalfW;
	const currentRightEdge = position.x + currentAabbHalfW;
	const currentTopEdge = position.y - currentAabbHalfH;
	const currentBottomEdge = position.y + currentAabbHalfH;

	interface Candidate {
		scale: number;
		distance: number;
		line: SnapLine;
		edge: ScaleEdge;
	}

	function bestCandidate({
		candidates,
		proposedScale,
	}: {
		candidates: Candidate[];
		proposedScale: number;
	}): AxisSnapResult {
		const best = pickClosestScaleCandidate({
			candidates,
			preferredEdges,
		});
		if (!best) {
			return { snappedScale: proposedScale, snapDistance: Infinity, activeLines: [] };
		}
		return { snappedScale: best.scale, snapDistance: best.distance, activeLines: [best.line] };
	}

	// sX candidates: snap via vertical targets (left/right AABB edges) — only valid when cosR ≠ 0
	// snap via horizontal targets (top/bottom AABB edges) — only valid when sinR ≠ 0
	const xCandidates: Candidate[] = [];
	const yContribW = baseHeight * proposedScaleY * sinR;
	const yContribH = baseHeight * proposedScaleY * cosR;

	if (cosR > EPSILON) {
		for (const T of [canvasLeft, 0, canvasRight]) {
			const line: SnapLine = { type: "vertical", position: T };
			const distLeft = Math.abs(currentLeftEdge - T);
			if (distLeft <= snapThreshold.x) {
				const scale = (2 * (position.x - T) - yContribW) / (baseWidth * cosR);
				if (Math.abs(scale) > MIN_SCALE) xCandidates.push({ scale, distance: distLeft, line, edge: "left" });
			}
			const distRight = Math.abs(currentRightEdge - T);
			if (distRight <= snapThreshold.x) {
				const scale = (2 * (T - position.x) - yContribW) / (baseWidth * cosR);
				if (Math.abs(scale) > MIN_SCALE) xCandidates.push({ scale, distance: distRight, line, edge: "right" });
			}
		}
	}

	if (sinR > EPSILON) {
		for (const T of [canvasTop, 0, canvasBottom]) {
			const line: SnapLine = { type: "horizontal", position: T };
			const distTop = Math.abs(currentTopEdge - T);
			if (distTop <= snapThreshold.y) {
				const scale = (2 * (position.y - T) - yContribH) / (baseWidth * sinR);
				if (Math.abs(scale) > MIN_SCALE) xCandidates.push({ scale, distance: distTop, line, edge: "top" });
			}
			const distBottom = Math.abs(currentBottomEdge - T);
			if (distBottom <= snapThreshold.y) {
				const scale = (2 * (T - position.y) - yContribH) / (baseWidth * sinR);
				if (Math.abs(scale) > MIN_SCALE) xCandidates.push({ scale, distance: distBottom, line, edge: "bottom" });
			}
		}
	}

	// sY candidates: snap via vertical targets — only valid when sinR ≠ 0
	// snap via horizontal targets — only valid when cosR ≠ 0
	const yCandidates: Candidate[] = [];
	const xContribW = baseWidth * proposedScaleX * cosR;
	const xContribH = baseWidth * proposedScaleX * sinR;

	if (sinR > EPSILON) {
		for (const T of [canvasLeft, 0, canvasRight]) {
			const line: SnapLine = { type: "vertical", position: T };
			const distLeft = Math.abs(currentLeftEdge - T);
			if (distLeft <= snapThreshold.x) {
				const scale = (2 * (position.x - T) - xContribW) / (baseHeight * sinR);
				if (Math.abs(scale) > MIN_SCALE) yCandidates.push({ scale, distance: distLeft, line, edge: "left" });
			}
			const distRight = Math.abs(currentRightEdge - T);
			if (distRight <= snapThreshold.x) {
				const scale = (2 * (T - position.x) - xContribW) / (baseHeight * sinR);
				if (Math.abs(scale) > MIN_SCALE) yCandidates.push({ scale, distance: distRight, line, edge: "right" });
			}
		}
	}

	if (cosR > EPSILON) {
		for (const T of [canvasTop, 0, canvasBottom]) {
			const line: SnapLine = { type: "horizontal", position: T };
			const distTop = Math.abs(currentTopEdge - T);
			if (distTop <= snapThreshold.y) {
				const scale = (2 * (position.y - T) - xContribH) / (baseHeight * cosR);
				if (Math.abs(scale) > MIN_SCALE) yCandidates.push({ scale, distance: distTop, line, edge: "top" });
			}
			const distBottom = Math.abs(currentBottomEdge - T);
			if (distBottom <= snapThreshold.y) {
				const scale = (2 * (T - position.y) - xContribH) / (baseHeight * cosR);
				if (Math.abs(scale) > MIN_SCALE) yCandidates.push({ scale, distance: distBottom, line, edge: "bottom" });
			}
		}
	}

	return {
		x: bestCandidate({ candidates: xCandidates, proposedScale: proposedScaleX }),
		y: bestCandidate({ candidates: yCandidates, proposedScale: proposedScaleY }),
	};
}

export interface RotationSnapResult {
	snappedRotation: number;
	isSnapped: boolean;
}

export function snapRotation({
	proposedRotation,
}: {
	proposedRotation: number;
}): RotationSnapResult {
	const nearestRotationSnap =
		Math.round(proposedRotation / ROTATION_SNAP_STEP_DEGREES) *
		ROTATION_SNAP_STEP_DEGREES;
	const distanceToNearestSnap = Math.abs(
		proposedRotation - nearestRotationSnap,
	);
	if (distanceToNearestSnap <= ROTATION_SNAP_THRESHOLD_DEGREES) {
		return { snappedRotation: nearestRotationSnap, isSnapped: true };
	}
	return { snappedRotation: proposedRotation, isSnapped: false };
}
