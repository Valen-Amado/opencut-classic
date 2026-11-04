import { describe, expect, test } from "bun:test";
import type { SceneTracks, TimelineElement, TimelineTrack } from "@/timeline";
import {
	buildMoveGroup,
	findPinnedMainMember,
	resolveGroupMove,
	type GroupMoveResult,
} from "@/timeline/group-move";
import { mediaTime, TICKS_PER_SECOND } from "@/wasm";

const seconds = (value: number) =>
	mediaTime({ ticks: Math.round(value * TICKS_PER_SECOND) });

const element = ({
	id,
	type,
	start,
	duration,
}: {
	id: string;
	type: TimelineElement["type"];
	start: number;
	duration: number;
}) =>
	({
		id,
		type,
		name: id,
		startTime: seconds(start),
		duration: seconds(duration),
		trimStart: seconds(0),
		trimEnd: seconds(0),
		params: {},
	}) as TimelineElement;

const track = ({
	id,
	type,
	elements,
}: {
	id: string;
	type: TimelineTrack["type"];
	elements: TimelineElement[];
}) => ({ id, type, name: id, elements }) as TimelineTrack;

const background = element({ id: "bg", type: "video", start: 0, duration: 20 });
const mainTrack = track({ id: "main", type: "video", elements: [background] });

function scene({ overlay }: { overlay: TimelineTrack[] }): SceneTracks {
	return { overlay, main: mainTrack, audio: [] } as unknown as SceneTracks;
}

function moveTo({
	tracks,
	selected,
	anchorTrackId = selected[0][0],
	targetTrackId = anchorTrackId,
	time,
}: {
	tracks: SceneTracks;
	selected: Array<[trackId: string, elementId: string]>;
	anchorTrackId?: string;
	targetTrackId?: string;
	time: number;
}) {
	const refs = selected.map(([trackId, elementId]) => ({ trackId, elementId }));
	const anchorRef = refs.find(({ trackId }) => trackId === anchorTrackId);
	const group = buildMoveGroup({
		anchorRef: anchorRef ?? refs[0],
		selectedElements: refs,
		tracks,
	});
	if (!group) throw new Error("No group");

	return {
		group,
		result: resolveGroupMove({
			group,
			tracks,
			anchorStartTime: seconds(time),
			target: { kind: "existingTrack", anchorTargetTrackId: targetTrackId },
		}),
	};
}

const startOf = (result: GroupMoveResult | null, elementId: string) =>
	result?.moves.find((move) => move.elementId === elementId)?.newStartTime;
const trackOf = (result: GroupMoveResult | null, elementId: string) =>
	result?.moves.find((move) => move.elementId === elementId)?.targetTrackId;

describe("dragging several elements", () => {
	const subtitles = track({
		id: "subs",
		type: "text",
		elements: [
			element({ id: "a", type: "text", start: 1, duration: 1 }),
			element({ id: "b", type: "text", start: 3, duration: 1 }),
		],
	});

	test("elements on one track stay together on it", () => {
		const { result } = moveTo({
			tracks: scene({ overlay: [subtitles] }),
			selected: [
				["subs", "a"],
				["subs", "b"],
			],
			time: 5,
		});

		expect(result?.createTracks).toEqual([]);
		expect(trackOf(result, "b")).toBe("subs");
		expect(startOf(result, "a")).toBe(seconds(5));
		expect(startOf(result, "b")).toBe(seconds(7));
	});

	test("the main track's first clip stays while the rest moves", () => {
		const { result } = moveTo({
			tracks: scene({ overlay: [subtitles] }),
			selected: [
				["subs", "a"],
				["subs", "b"],
				["main", "bg"],
			],
			time: 5,
		});

		expect(startOf(result, "bg")).toBe(seconds(0));
		expect(startOf(result, "a")).toBe(seconds(5));
		expect(startOf(result, "b")).toBe(seconds(7));
	});

	test("grabbing the main track's first clip still moves the rest", () => {
		const { result } = moveTo({
			tracks: scene({ overlay: [subtitles] }),
			selected: [
				["subs", "a"],
				["main", "bg"],
			],
			anchorTrackId: "main",
			time: 4,
		});

		expect(startOf(result, "bg")).toBe(seconds(0));
		expect(startOf(result, "a")).toBe(seconds(5));
	});

	test("the pinned clip does not stop the rest going left", () => {
		const { result } = moveTo({
			tracks: scene({ overlay: [subtitles] }),
			selected: [
				["subs", "b"],
				["main", "bg"],
			],
			time: 2,
		});

		expect(startOf(result, "b")).toBe(seconds(2));
	});

	test("a horizontal drag keeps a skipped track out of it", () => {
		const image = (id: string) =>
			element({ id, type: "image", start: 1, duration: 1 });
		const { result } = moveTo({
			tracks: scene({
				overlay: [
					track({ id: "top", type: "video", elements: [image("t")] }),
					track({ id: "mid", type: "video", elements: [] }),
					track({ id: "low", type: "video", elements: [image("l")] }),
				],
			}),
			selected: [
				["top", "t"],
				["low", "l"],
			],
			time: 5,
		});

		expect(trackOf(result, "l")).toBe("low");
	});

	test("a collision with an unselected clip reports no room", () => {
		const { result } = moveTo({
			tracks: scene({
				overlay: [
					track({
						id: "subs",
						type: "text",
						elements: [
							...subtitles.elements,
							element({ id: "c", type: "text", start: 5.2, duration: 1 }),
						],
					}),
				],
			}),
			selected: [
				["subs", "a"],
				["subs", "b"],
			],
			time: 5,
		});

		expect(result).toBeNull();
	});

	test("new tracks: one per source track, and never the main clip", () => {
		const tracks = scene({ overlay: [subtitles] });
		const { group } = moveTo({
			tracks,
			selected: [
				["subs", "a"],
				["subs", "b"],
			],
			time: 5,
		});
		const result = resolveGroupMove({
			group,
			tracks,
			anchorStartTime: seconds(5),
			target: {
				kind: "newTracks",
				anchorInsertIndex: 0,
				newTrackIds: ["n1", "n2"],
			},
		});
		expect(result?.createTracks.map(({ id }) => id)).toEqual(["n1"]);

		const mixed = moveTo({
			tracks,
			selected: [
				["subs", "a"],
				["main", "bg"],
			],
			time: 5,
		});
		expect(
			resolveGroupMove({
				group: mixed.group,
				tracks,
				anchorStartTime: seconds(5),
				target: {
					kind: "newTracks",
					anchorInsertIndex: 0,
					newTrackIds: ["n1", "n2"],
				},
			}),
		).toBeNull();
	});

	test("a later main clip is not pinned", () => {
		const tracks = {
			overlay: [],
			main: track({
				id: "main",
				type: "video",
				elements: [
					element({ id: "v1", type: "video", start: 0, duration: 5 }),
					element({ id: "v2", type: "video", start: 5, duration: 5 }),
				],
			}),
			audio: [],
		} as unknown as SceneTracks;
		const { group } = moveTo({ tracks, selected: [["main", "v2"]], time: 8 });

		expect(
			findPinnedMainMember({ group, tracks, anchorStartTime: seconds(8) }),
		).toBeNull();
	});
});
