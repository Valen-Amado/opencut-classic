import { describe, expect, test } from "bun:test";
import { computeGroupResize, type GroupResizeMember } from "@/timeline/group-resize";
import { dropPlayheadBesideElementEdges } from "@/timeline/snapping";
import { mediaTime, TICKS_PER_SECOND, ZERO_MEDIA_TIME, type MediaTime } from "@/wasm";

const FPS = { numerator: 30, denominator: 1 };
const FRAME = TICKS_PER_SECOND / 30;
const frames = (count: number) => mediaTime({ ticks: Math.round(count * FRAME) });

function buildMember({ duration }: { duration: MediaTime }): GroupResizeMember {
	return {
		trackId: "track",
		elementId: "clip",
		startTime: ZERO_MEDIA_TIME,
		duration,
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		leftNeighborBound: null,
		rightNeighborBound: null,
	};
}

const endOf = (patch: { startTime: MediaTime; duration: MediaTime }) => patch.startTime + patch.duration;

describe("resizing a clip that ends between two frames", () => {
	test("lands exactly on the time it snapped to", () => {
		const member = buildMember({ duration: frames(100.4) });
		const target = frames(120);
		const { updates } = computeGroupResize({
			members: [member],
			side: "right",
			deltaTime: mediaTime({ ticks: target - member.duration }),
			fps: FPS,
			anchorEdgeTime: member.duration,
			isSnapped: true,
		});

		expect(endOf(updates[0].patch)).toBe(target);
	});

	test("reaches another clip's edge that sits between two frames", () => {
		const member = buildMember({ duration: frames(100) });
		const target = frames(120.4);
		const { updates } = computeGroupResize({
			members: [member],
			side: "right",
			deltaTime: mediaTime({ ticks: target - member.duration }),
			fps: FPS,
			anchorEdgeTime: member.duration,
			isSnapped: true,
		});

		expect(endOf(updates[0].patch)).toBe(target);
	});

	test("puts the edge on a frame when dragged freely", () => {
		const member = buildMember({ duration: frames(100.4) });
		const { updates } = computeGroupResize({
			members: [member],
			side: "right",
			deltaTime: frames(19.9),
			fps: FPS,
			anchorEdgeTime: member.duration,
			isSnapped: false,
		});

		expect(endOf(updates[0].patch)).toBe(frames(120));
	});

	test("keeps the trim in step with the clip when the source allows it", () => {
		const member = {
			...buildMember({ duration: frames(100.4) }),
			sourceDuration: frames(200),
			trimEnd: frames(99.6),
		};
		const { updates } = computeGroupResize({
			members: [member],
			side: "right",
			deltaTime: frames(19.9),
			fps: FPS,
			anchorEdgeTime: member.duration,
			isSnapped: false,
		});
		const { patch } = updates[0];

		expect(patch.trimStart + patch.duration + patch.trimEnd).toBe(frames(200));
	});
});

describe("snapping next to the playhead", () => {
	const playhead = { time: frames(120), type: "playhead" } as const;
	const snap = (edgeFrames: number) =>
		dropPlayheadBesideElementEdges({
			snapPoints: [playhead, { time: frames(edgeFrames), type: "element-end" }],
			fps: FPS,
		});

	test("prefers a clip edge in the same frame", () => {
		expect(snap(120.4).map(({ type }) => type)).toEqual(["element-end"]);
	});

	test("keeps the playhead when the edge is a whole frame away", () => {
		expect(snap(121)).toHaveLength(2);
	});
});
