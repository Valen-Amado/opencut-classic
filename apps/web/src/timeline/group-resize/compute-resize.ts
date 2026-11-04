import {
	getSourceSpanAtClipTime,
	getTimelineDurationForSourceSpan,
} from "@/retime";
import {
	addMediaTime,
	clampMediaTime,
	maxMediaTime,
	type MediaTime,
	mediaTime,
	minMediaTime,
	roundFrameTime,
	roundMediaTime,
	subMediaTime,
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME,
} from "@/wasm";
import type {
	ComputeGroupResizeArgs,
	GroupResizeMember,
	GroupResizeResult,
	GroupResizeUpdate,
	ResizeSide,
} from "./types";

export function computeGroupResize({
	members,
	side,
	deltaTime,
	fps,
	anchorEdgeTime,
	isSnapped,
}: ComputeGroupResizeArgs): GroupResizeResult {
	if (members.length === 0) {
		return { deltaTime: ZERO_MEDIA_TIME, updates: [] };
	}

	const minDuration = mediaTime({
		ticks: Math.round((TICKS_PER_SECOND * fps.denominator) / fps.numerator),
	});
	let minimumDeltaTime = getMinimumAllowedDeltaTime({
		member: members[0],
		side,
		minDuration,
	});
	let maximumDeltaTime = getMaximumAllowedDeltaTime({
		member: members[0],
		side,
		minDuration,
	});

	for (const member of members.slice(1)) {
		minimumDeltaTime = maxMediaTime({
			a: minimumDeltaTime,
			b: getMinimumAllowedDeltaTime({
				member,
				side,
				minDuration,
			}),
		});
		const memberMaximum = getMaximumAllowedDeltaTime({
			member,
			side,
			minDuration,
		});
		if (memberMaximum !== null) {
			maximumDeltaTime =
				maximumDeltaTime === null
					? memberMaximum
					: minMediaTime({ a: maximumDeltaTime, b: memberMaximum });
		}
	}

	const clampedDeltaTime =
		maximumDeltaTime === null
			? maxMediaTime({ a: minimumDeltaTime, b: deltaTime })
			: clampMediaTime({
					time: deltaTime,
					min: minimumDeltaTime,
					max: maximumDeltaTime,
				});

	// Resolve one delta, then derive every patch field from it. This keeps the
	// invariant `trimStart + duration*rate + trimEnd == sourceDuration` exact:
	// the same delta is added on one side of the element and removed from the
	// other, so the rounding cancels by construction. Per-field rounding (the
	// old approach) couldn't preserve this because the individual rounds don't
	// compose when `sourceDuration` isn't frame-aligned.
	//
	// It's the edge that goes on a frame, not the delta: clips often end between
	// frames, and a whole-frame delta would keep them there. A snap point is
	// honoured as is, even between frames, so the two edges end up identical.
	const snappedDeltaTime = isSnapped
		? clampedDeltaTime
		: subMediaTime({
				a: roundFrameTime({
					time: addMediaTime({ a: anchorEdgeTime, b: clampedDeltaTime }),
					fps,
				}),
				b: anchorEdgeTime,
			});
	// Re-clamp after rounding. Bounds derived from other elements are
	// frame-aligned, so this is normally a no-op; at the source-extent limit
	// the bound may not be frame-aligned, and honouring the bound takes
	// precedence over frame alignment (you can't extend past real content).
	const finalDeltaTime =
		maximumDeltaTime === null
			? maxMediaTime({ a: minimumDeltaTime, b: snappedDeltaTime })
			: clampMediaTime({
					time: snappedDeltaTime,
					min: minimumDeltaTime,
					max: maximumDeltaTime,
				});

	return {
		deltaTime: Object.is(finalDeltaTime, -0) ? ZERO_MEDIA_TIME : finalDeltaTime,
		updates: members.map((member) =>
			buildResizeUpdate({
				member,
				side,
				deltaTime: finalDeltaTime,
			}),
		),
	};
}

function buildResizeUpdate({
	member,
	side,
	deltaTime,
}: {
	member: GroupResizeMember;
	side: ResizeSide;
	deltaTime: MediaTime;
}): GroupResizeUpdate {
	const sourceDelta = getSourceDeltaForClipDelta({
		member,
		clipDelta: deltaTime,
	});

	if (side === "left") {
		return {
			trackId: member.trackId,
			elementId: member.elementId,
		patch: {
			trimStart: maxMediaTime({
				a: ZERO_MEDIA_TIME,
				b: addMediaTime({ a: member.trimStart, b: sourceDelta }),
			}),
			trimEnd: member.trimEnd,
			startTime: addMediaTime({ a: member.startTime, b: deltaTime }),
			duration: subMediaTime({ a: member.duration, b: deltaTime }),
		},
		};
	}

	return {
		trackId: member.trackId,
		elementId: member.elementId,
		patch: {
			trimStart: member.trimStart,
			trimEnd: maxMediaTime({
				a: ZERO_MEDIA_TIME,
				b: subMediaTime({ a: member.trimEnd, b: sourceDelta }),
			}),
			startTime: member.startTime,
			duration: addMediaTime({ a: member.duration, b: deltaTime }),
		},
	};
}

function getMinimumAllowedDeltaTime({
	member,
	side,
	minDuration,
}: {
	member: GroupResizeMember;
	side: ResizeSide;
	minDuration: MediaTime;
}): MediaTime {
	if (side === "right") {
		return subMediaTime({ a: minDuration, b: member.duration });
	}

	const leftNeighborFloor =
		member.leftNeighborBound !== null
			? subMediaTime({ a: member.leftNeighborBound, b: member.startTime })
			: subMediaTime({ a: ZERO_MEDIA_TIME, b: member.startTime });
	if (member.sourceDuration == null) {
		return leftNeighborFloor;
	}

	const maximumSourceExtension = subMediaTime({
		a: getDurationForVisibleSourceSpan({
			member,
			sourceSpan: addMediaTime({
				a: getVisibleSourceSpanForDuration({
					member,
					duration: member.duration,
				}),
				b: member.trimStart,
			}),
		}),
		b: member.duration,
	});
	return maxMediaTime({
		a: leftNeighborFloor,
		b: subMediaTime({ a: ZERO_MEDIA_TIME, b: maximumSourceExtension }),
	});
}

function getMaximumAllowedDeltaTime({
	member,
	side,
	minDuration,
}: {
	member: GroupResizeMember;
	side: ResizeSide;
	minDuration: MediaTime;
}): MediaTime | null {
	if (side === "left") {
		return subMediaTime({ a: member.duration, b: minDuration });
	}

	const rightNeighborCeiling =
		member.rightNeighborBound === null
			? null
			: subMediaTime({
					a: member.rightNeighborBound,
					b: addMediaTime({ a: member.startTime, b: member.duration }),
				});
	if (member.sourceDuration == null) {
		return rightNeighborCeiling;
	}

	const maximumVisibleSourceSpan = subMediaTime({
		a: getSourceDuration({ member }),
		b: member.trimStart,
	});
	const maximumDuration = getDurationForVisibleSourceSpan({
		member,
		sourceSpan: maximumVisibleSourceSpan,
	});
	const sourceDurationCeiling = subMediaTime({
		a: maximumDuration,
		b: member.duration,
	});
	return rightNeighborCeiling === null
		? sourceDurationCeiling
		: minMediaTime({ a: rightNeighborCeiling, b: sourceDurationCeiling });
}

function getSourceDeltaForClipDelta({
	member,
	clipDelta,
}: {
	member: GroupResizeMember;
	clipDelta: MediaTime;
}): MediaTime {
	if (!member.retime) {
		return clipDelta;
	}

	const sourceDelta =
		clipDelta >= 0
			? getSourceSpanAtClipTime({
					clipTime: clipDelta,
					retime: member.retime,
				})
			: -getSourceSpanAtClipTime({
					clipTime: Math.abs(clipDelta),
					retime: member.retime,
				});
	return roundMediaTime({ time: sourceDelta });
}

function getVisibleSourceSpanForDuration({
	member,
	duration,
}: {
	member: GroupResizeMember;
	duration: MediaTime;
}): MediaTime {
	if (!member.retime) {
		return duration;
	}

	return roundMediaTime({
		time: getSourceSpanAtClipTime({
			clipTime: duration,
			retime: member.retime,
		}),
	});
}

function getDurationForVisibleSourceSpan({
	member,
	sourceSpan,
}: {
	member: GroupResizeMember;
	sourceSpan: MediaTime;
}): MediaTime {
	if (!member.retime) {
		return sourceSpan;
	}

	return roundMediaTime({
		time: getTimelineDurationForSourceSpan({
			sourceSpan,
			retime: member.retime,
		}),
	});
}

function getSourceDuration({ member }: { member: GroupResizeMember }): MediaTime {
	if (member.sourceDuration != null) {
		return member.sourceDuration;
	}

	return addMediaTime({
		a: addMediaTime({
			a: member.trimStart,
			b: getVisibleSourceSpanForDuration({
			member,
			duration: member.duration,
			}),
		}),
		b: member.trimEnd,
	});
}
