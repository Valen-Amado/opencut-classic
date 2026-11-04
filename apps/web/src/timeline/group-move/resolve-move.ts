import type { SceneTracks } from "@/timeline";
import { getTrackTypeForElementType } from "@/timeline/placement/compatibility";
import { canPlaceTimeSpansOnTrack } from "@/timeline/placement/overlap";
import type {
	GroupMember,
	GroupMoveResult,
	MoveGroup,
	PlannedElementMove,
	PlannedTrackCreation,
} from "./types";
import {
	getDisplayTracks,
	getTrackPlacementByDisplayIndex,
	getTrackPlacementById,
} from "./track-placement";
import {
	addMediaTime,
	maxMediaTime,
	type MediaTime,
	subMediaTime,
	ZERO_MEDIA_TIME,
} from "@/wasm";

type GroupMoveTarget =
	| {
			kind: "existingTrack";
			anchorTargetTrackId: string;
	  }
	| {
			kind: "newTracks";
			anchorInsertIndex: number;
			newTrackIds: string[];
	  };

export function resolveGroupMove({
	group,
	tracks,
	anchorStartTime,
	target,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorStartTime: MediaTime;
	target: GroupMoveTarget;
}): GroupMoveResult | null {
	if (target.kind === "newTracks") {
		return resolveNewTrackMove({
			group,
			tracks,
			anchorStartTime,
			anchorInsertIndex: target.anchorInsertIndex,
			newTrackIds: target.newTrackIds,
		});
	}

	return resolveExistingTrackMove({
		group,
		tracks,
		anchorStartTime,
		anchorTargetTrackId: target.anchorTargetTrackId,
	});
}

function resolveExistingTrackMove({
	group,
	tracks,
	anchorStartTime,
	anchorTargetTrackId,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorStartTime: MediaTime;
	anchorTargetTrackId: string;
}): GroupMoveResult | null {
	const anchorTargetPlacement = getTrackPlacementById({
		tracks,
		trackId: anchorTargetTrackId,
	});
	if (!anchorTargetPlacement) {
		return null;
	}

	const targetTrackIdsByElementId = resolveExistingTrackIdsByElementId({
		group,
		tracks,
		anchorTargetDisplayIndex: anchorTargetPlacement.displayIndex,
	});
	if (!targetTrackIdsByElementId) {
		return null;
	}

	const pinnedMember = findPinnedMainMember({
		group,
		tracks,
		anchorStartTime,
		targetTrackIdsByElementId,
	});
	const clampedAnchorStartTime = clampAnchorStartTime({
		members: group.members.filter((member) => member !== pinnedMember),
		anchorStartTime,
	});

	const moves = group.members.map((member) => ({
		sourceTrackId: member.trackId,
		targetTrackId:
			targetTrackIdsByElementId.get(member.elementId) ?? member.trackId,
		elementId: member.elementId,
		newStartTime:
			member === pinnedMember
				? ZERO_MEDIA_TIME
				: addMediaTime({
						a: clampedAnchorStartTime,
						b: member.timeOffset,
					}),
	}));

	if (!canApplyMovesToExistingTracks({ tracks, moves })) {
		return null;
	}

	return {
		moves,
		createTracks: [],
		targetSelection: moves.map(({ elementId, targetTrackId }) => ({
			trackId: targetTrackId,
			elementId,
		})),
	};
}

function resolveNewTrackMove({
	group,
	tracks,
	anchorStartTime,
	anchorInsertIndex,
	newTrackIds,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorStartTime: MediaTime;
	anchorInsertIndex: number;
	newTrackIds: string[];
}): GroupMoveResult | null {
	const sourceTracks = getSourceTracks({ group });
	const anchorTrackIndex = sourceTracks.findIndex(
		({ trackId }) => trackId === group.anchor.trackId,
	);
	if (anchorTrackIndex < 0 || newTrackIds.length < sourceTracks.length) {
		return null;
	}

	const hasAudioMember = group.members.some(
		(member) => member.trackSection === "audio",
	);
	const hasNonAudioMember = group.members.some(
		(member) => member.trackSection !== "audio",
	);
	if (hasAudioMember && hasNonAudioMember) {
		return null;
	}

	// The main track holds the project's base clip: a mixed selection must not
	// carry it off to an overlay just because the rest found no room.
	const isMixedWithMainTrack =
		sourceTracks.length > 1 &&
		group.members.some((member) => member.trackSection === "main");
	if (isMixedWithMainTrack) {
		return null;
	}

	const clampedAnchorStartTime = clampAnchorStartTime({
		members: group.members,
		anchorStartTime,
	});
	const blockStartIndex = hasAudioMember
		? clampAudioInsertIndex({
				tracks,
				insertIndex: anchorInsertIndex - anchorTrackIndex,
			})
		: Math.max(
				0,
				Math.min(anchorInsertIndex - anchorTrackIndex, tracks.overlay.length),
			);

	const createTracks: PlannedTrackCreation[] = sourceTracks.map(
		({ requiredTrackType }, trackIndex) => ({
			id: newTrackIds[trackIndex],
			type: requiredTrackType,
			index: blockStartIndex + trackIndex,
		}),
	);
	const moves = group.members.map((member) => ({
		sourceTrackId: member.trackId,
		targetTrackId:
			newTrackIds[
				sourceTracks.findIndex(({ trackId }) => trackId === member.trackId)
			],
		elementId: member.elementId,
		newStartTime: addMediaTime({
			a: clampedAnchorStartTime,
			b: member.timeOffset,
		}),
	}));

	return {
		moves,
		createTracks,
		targetSelection: moves.map(({ elementId, targetTrackId }) => ({
			trackId: targetTrackId,
			elementId,
		})),
	};
}

function clampAudioInsertIndex({
	tracks,
	insertIndex,
}: {
	tracks: SceneTracks;
	insertIndex: number;
}): number {
	const minimumAudioInsertIndex = tracks.overlay.length + 1;
	return Math.max(
		minimumAudioInsertIndex,
		Math.min(insertIndex, minimumAudioInsertIndex + tracks.audio.length),
	);
}

/**
 * Elements that share a track keep sharing one, so a selection moves as the
 * block it already is. A purely horizontal drag leaves every track untouched.
 */
function getSourceTracks({ group }: { group: MoveGroup }) {
	const sortedMembers = [...group.members].sort(
		(leftMember, rightMember) =>
			leftMember.displayIndex - rightMember.displayIndex,
	);
	const seenTrackIds = new Set<string>();

	return sortedMembers.flatMap((member) => {
		if (seenTrackIds.has(member.trackId)) {
			return [];
		}

		seenTrackIds.add(member.trackId);
		return [
			{
				trackId: member.trackId,
				requiredTrackType: getTrackTypeForElementType({
					elementType: member.elementType,
				}),
			},
		];
	});
}

function resolveExistingTrackIdsByElementId({
	group,
	tracks,
	anchorTargetDisplayIndex,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorTargetDisplayIndex: number;
}): Map<string, string> | null {
	if (anchorTargetDisplayIndex === group.anchor.displayIndex) {
		return new Map(
			group.members.map((member) => [member.elementId, member.trackId]),
		);
	}

	const sourceTracks = getSourceTracks({ group });
	const anchorTrackIndex = sourceTracks.findIndex(
		({ trackId }) => trackId === group.anchor.trackId,
	);
	if (anchorTrackIndex < 0) {
		return null;
	}

	const anchorPlacement = getTrackPlacementByDisplayIndex({
		tracks,
		displayIndex: anchorTargetDisplayIndex,
	});
	if (!anchorPlacement) {
		return null;
	}

	const targetTrackIdsBySourceTrackId = new Map([
		[group.anchor.trackId, anchorPlacement.trackId],
	]);
	const usedTrackIds = new Set([anchorPlacement.trackId]);

	let upperBoundaryIndex = anchorTargetDisplayIndex;
	for (let trackIndex = anchorTrackIndex - 1; trackIndex >= 0; trackIndex -= 1) {
		const { trackId, requiredTrackType } = sourceTracks[trackIndex];
		const targetPlacement = findCompatibleTrackPlacement({
			tracks,
			requiredTrackType,
			startDisplayIndex: upperBoundaryIndex - 1,
			step: -1,
			usedTrackIds,
		});
		if (!targetPlacement) {
			return null;
		}

		targetTrackIdsBySourceTrackId.set(trackId, targetPlacement.trackId);
		usedTrackIds.add(targetPlacement.trackId);
		upperBoundaryIndex = targetPlacement.displayIndex;
	}

	let lowerBoundaryIndex = anchorTargetDisplayIndex;
	for (
		let trackIndex = anchorTrackIndex + 1;
		trackIndex < sourceTracks.length;
		trackIndex += 1
	) {
		const { trackId, requiredTrackType } = sourceTracks[trackIndex];
		const targetPlacement = findCompatibleTrackPlacement({
			tracks,
			requiredTrackType,
			startDisplayIndex: lowerBoundaryIndex + 1,
			step: 1,
			usedTrackIds,
		});
		if (!targetPlacement) {
			return null;
		}

		targetTrackIdsBySourceTrackId.set(trackId, targetPlacement.trackId);
		usedTrackIds.add(targetPlacement.trackId);
		lowerBoundaryIndex = targetPlacement.displayIndex;
	}

	const targetTrackIdsByElementId = new Map<string, string>();
	for (const member of group.members) {
		const targetTrackId = targetTrackIdsBySourceTrackId.get(member.trackId);
		if (targetTrackId) {
			targetTrackIdsByElementId.set(member.elementId, targetTrackId);
		}
	}

	return targetTrackIdsByElementId;
}

function findCompatibleTrackPlacement({
	tracks,
	requiredTrackType,
	startDisplayIndex,
	step,
	usedTrackIds,
}: {
	tracks: SceneTracks;
	requiredTrackType: ReturnType<typeof getTrackTypeForElementType>;
	startDisplayIndex: number;
	step: -1 | 1;
	usedTrackIds: Set<string>;
}) {
	for (
		let displayIndex = startDisplayIndex;
		displayIndex >= 0 &&
		displayIndex < tracks.overlay.length + 1 + tracks.audio.length;
		displayIndex += step
	) {
		const placement = getTrackPlacementByDisplayIndex({
			tracks,
			displayIndex,
		});
		if (!placement) {
			continue;
		}

		if (
			placement.trackType === requiredTrackType &&
			!usedTrackIds.has(placement.trackId)
		) {
			return placement;
		}
	}

	return null;
}

/**
 * The first clip of the main track always starts at zero. When a group drags
 * it along, that clip stays put and only the rest of the group moves, instead
 * of the whole group being pulled back with it.
 */
export function findPinnedMainMember({
	group,
	tracks,
	anchorStartTime,
	targetTrackIdsByElementId,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorStartTime: MediaTime;
	targetTrackIdsByElementId?: Map<string, string>;
}): GroupMember | null {
	const earliestMainMember = group.members
		.filter(
			(member) =>
				(targetTrackIdsByElementId?.get(member.elementId) ?? member.trackId) ===
				tracks.main.id,
		)
		.reduce<GroupMember | null>(
			(earliestMember, member) =>
				!earliestMember || member.timeOffset < earliestMember.timeOffset
					? member
					: earliestMember,
			null,
		);
	if (!earliestMainMember) {
		return null;
	}

	const movingElementIds = new Set(
		group.members.map((member) => member.elementId),
	);
	const earliestStationaryStartTime = tracks.main.elements
		.filter((element) => !movingElementIds.has(element.id))
		.reduce<MediaTime | null>(
			(earliestStartTime, element) =>
				earliestStartTime == null || element.startTime < earliestStartTime
					? element.startTime
					: earliestStartTime,
			null,
		);
	const requestedStartTime = addMediaTime({
		a: anchorStartTime,
		b: earliestMainMember.timeOffset,
	});

	return earliestStationaryStartTime == null ||
		requestedStartTime <= earliestStationaryStartTime
		? earliestMainMember
		: null;
}

function clampAnchorStartTime({
	members,
	anchorStartTime,
}: {
	members: GroupMember[];
	anchorStartTime: MediaTime;
}): MediaTime {
	const minimumAnchorStartTime = members.reduce(
		(minimumStartTime, member) =>
			member.timeOffset < ZERO_MEDIA_TIME
				? maxMediaTime({
						a: minimumStartTime,
						b: subMediaTime({
							a: ZERO_MEDIA_TIME,
							b: member.timeOffset,
						}),
					})
				: minimumStartTime,
		ZERO_MEDIA_TIME,
	);

	return anchorStartTime < minimumAnchorStartTime
		? minimumAnchorStartTime
		: anchorStartTime;
}

function canApplyMovesToExistingTracks({
	tracks,
	moves,
}: {
	tracks: SceneTracks;
	moves: PlannedElementMove[];
}): boolean {
	const movingElementIds = new Set(moves.map((move) => move.elementId));
	const sourceElements = new Map(
		getDisplayTracks({ tracks }).flatMap((track) =>
			track.elements.map((element) => [element.id, element] as const),
		),
	);
	const movesByTargetTrackId = new Map<string, PlannedElementMove[]>();
	for (const move of moves) {
		const targetMoves = movesByTargetTrackId.get(move.targetTrackId) ?? [];
		targetMoves.push(move);
		movesByTargetTrackId.set(move.targetTrackId, targetMoves);
	}

	for (const [targetTrackId, targetMoves] of movesByTargetTrackId) {
		const targetPlacement = getTrackPlacementById({
			tracks,
			trackId: targetTrackId,
		});
		if (!targetPlacement) {
			return false;
		}

		const targetTrack = getDisplayTracks({ tracks })[
			targetPlacement.displayIndex
		];
		if (!targetTrack) {
			return false;
		}

		const timeSpans = targetMoves.map((move) => {
			const sourceElement = sourceElements.get(move.elementId);
			return {
				startTime: move.newStartTime,
				duration: sourceElement?.duration ?? ZERO_MEDIA_TIME,
			};
		});
		if (hasOverlappingTimeSpans({ timeSpans })) {
			return false;
		}

		if (
			!canPlaceTimeSpansOnTrack({
				track: {
					elements: targetTrack.elements.filter(
						(element) => !movingElementIds.has(element.id),
					),
				},
				timeSpans,
			})
		) {
			return false;
		}
	}

	return true;
}

function hasOverlappingTimeSpans({
	timeSpans,
}: {
	timeSpans: Array<{ startTime: number; duration: number }>;
}): boolean {
	const sortedSpans = [...timeSpans].sort(
		(leftSpan, rightSpan) => leftSpan.startTime - rightSpan.startTime,
	);

	for (let spanIndex = 1; spanIndex < sortedSpans.length; spanIndex += 1) {
		const previousSpan = sortedSpans[spanIndex - 1];
		const currentSpan = sortedSpans[spanIndex];
		if (
			previousSpan.startTime + previousSpan.duration >
			currentSpan.startTime
		) {
			return true;
		}
	}

	return false;
}
