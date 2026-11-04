import type { SceneTracks } from "@/timeline";
import {
	buildTimelineSnapPoints,
	dropPlayheadBesideElementEdges,
	getTimelineSnapThresholdInTicks,
	resolveTimelineSnap,
	type SnapPoint,
} from "@/timeline/snapping";
import { getElementEdgeSnapPoints } from "@/timeline/element-snap-source";
import { getPlayheadSnapPoints } from "@/timeline/playhead-snap-source";
import { getAnimationKeyframeSnapPointsForTimeline } from "@/timeline/animation-snap-points";
import { findPinnedMainMember } from "./resolve-move";
import type { MoveGroup } from "./types";
import { addMediaTime, type MediaTime, subMediaTime } from "@/wasm";
import type { FrameRate } from "opencut-wasm";

export function snapGroupEdges({
	group,
	anchorStartTime,
	tracks,
	playheadTime,
	zoomLevel,
	fps,
}: {
	group: MoveGroup;
	anchorStartTime: MediaTime;
	tracks: SceneTracks;
	playheadTime: MediaTime;
	zoomLevel: number;
	fps: FrameRate;
}): {
	snappedAnchorStartTime: MediaTime;
	snapPoint: SnapPoint | null;
} {
	const pinnedMember = findPinnedMainMember({ group, tracks, anchorStartTime });
	const movingMembers = group.members.filter(
		(member) => member !== pinnedMember,
	);
	const excludeElementIds = new Set(
		movingMembers.map((member) => member.elementId),
	);
	const snapPoints = dropPlayheadBesideElementEdges({
		snapPoints: buildTimelineSnapPoints({
			sources: [
				() => getElementEdgeSnapPoints({ tracks, excludeElementIds }),
				() => getPlayheadSnapPoints({ playheadTime }),
				() =>
					getAnimationKeyframeSnapPointsForTimeline({
						tracks,
						excludeElementIds,
					}),
			],
		}),
		fps,
	});
	const maxSnapDistance = getTimelineSnapThresholdInTicks({ zoomLevel });

	let closestSnapDistance = Infinity;
	let snappedAnchorStartTime = anchorStartTime;
	let snapPoint: SnapPoint | null = null;

	for (const member of movingMembers) {
		const memberStartTime = addMediaTime({
			a: anchorStartTime,
			b: member.timeOffset,
		});
		const memberStartSnap = resolveTimelineSnap({
			targetTime: memberStartTime,
			snapPoints,
			maxSnapDistance,
		});
		if (
			memberStartSnap.snapPoint &&
			memberStartSnap.snapDistance < closestSnapDistance
		) {
			closestSnapDistance = memberStartSnap.snapDistance;
			snappedAnchorStartTime = subMediaTime({
				a: memberStartSnap.snappedTime,
				b: member.timeOffset,
			});
			snapPoint = memberStartSnap.snapPoint;
		}

		const memberEndSnap = resolveTimelineSnap({
			targetTime: addMediaTime({
				a: memberStartTime,
				b: member.duration,
			}),
			snapPoints,
			maxSnapDistance,
		});
		if (
			memberEndSnap.snapPoint &&
			memberEndSnap.snapDistance < closestSnapDistance
		) {
			closestSnapDistance = memberEndSnap.snapDistance;
			snappedAnchorStartTime = subMediaTime({
				a: subMediaTime({
					a: memberEndSnap.snappedTime,
					b: member.duration,
				}),
				b: member.timeOffset,
			});
			snapPoint = memberEndSnap.snapPoint;
		}
	}

	return {
		snappedAnchorStartTime,
		snapPoint,
	};
}
