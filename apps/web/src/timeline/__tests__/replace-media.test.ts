import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import type { ImageElement, UploadAudioElement, VideoElement } from "@/timeline";
import { TICKS_PER_SECOND } from "@/wasm";
import { buildMediaReplacementPatch, canReplaceMedia } from "@/timeline/replace-media";
import { applyElementUpdate } from "@/timeline/update-pipeline";
import { mediaTime } from "@/wasm";

const at = (seconds: number) => mediaTime({ ticks: Math.round(seconds * TICKS_PER_SECOND) });

const baseClip = {
	id: "clip",
	name: "old.mp4",
	mediaId: "old",
	startTime: at(4),
	duration: at(6),
	trimStart: at(2),
	trimEnd: at(1),
	params: { "transform.scaleX": 0.5, cornerRadius: 30 },
	effects: [],
	masks: [],
};
const video = {
	...baseClip,
	type: "video",
	sourceDuration: at(9),
	isSourceAudioEnabled: false,
} as unknown as VideoElement;
const image = { ...baseClip, type: "image", trimStart: at(0), trimEnd: at(0) } as unknown as ImageElement;
const audio = { ...baseClip, type: "audio", sourceType: "upload", sourceDuration: at(9) } as unknown as UploadAudioElement;

const asset = ({ type, duration }: { type: MediaAsset["type"]; duration?: number }) => ({
	id: "new",
	name: "new.file",
	type,
	duration,
});

describe("replacing a clip's file", () => {
	test("visual clips accept images and videos, audio only audio", () => {
		expect(canReplaceMedia({ element: video, mediaType: "image" })).toBe(true);
		expect(canReplaceMedia({ element: image, mediaType: "video" })).toBe(true);
		expect(canReplaceMedia({ element: video, mediaType: "audio" })).toBe(false);
		expect(canReplaceMedia({ element: audio, mediaType: "video" })).toBe(false);
	});

	test("a longer video keeps the clip's length and plays from its start", () => {
		const patch = buildMediaReplacementPatch({ element: video, asset: asset({ type: "video", duration: 20 }) });
		expect(patch).toMatchObject({ mediaId: "new", name: "new.file", trimStart: at(0), duration: at(6), trimEnd: at(14) });
		expect(patch.sourceDuration).toBe(at(20));
	});

	test("a shorter video shortens the clip", () => {
		const patch = buildMediaReplacementPatch({ element: video, asset: asset({ type: "video", duration: 3 }) });
		expect(patch).toMatchObject({ duration: at(3), trimEnd: at(0) });
	});

	test("speed changes apply to how much of the new video fits", () => {
		const element = { ...video, retime: { rate: 2 } } as VideoElement;
		const patch = buildMediaReplacementPatch({ element, asset: asset({ type: "video", duration: 8 }) });
		expect(patch).toMatchObject({ duration: at(4), trimEnd: at(0) });
	});

	test("an image keeps the clip's length and drops video-only state", () => {
		const element = { ...video, retime: { rate: 2 } } as VideoElement;
		const next = applyElementUpdate({
			element,
			patch: buildMediaReplacementPatch({ element, asset: asset({ type: "image" }) }),
			context: { tracks: { main: { id: "main" } } as never, trackId: "other" },
		});
		expect(next).toMatchObject({ type: "image", duration: at(6), trimStart: at(0), trimEnd: at(0) });
		expect("retime" in next ? next.retime : undefined).toBeUndefined();
	});

	test("the clip's own settings survive", () => {
		const next = applyElementUpdate({
			element: image,
			patch: buildMediaReplacementPatch({ element: image, asset: asset({ type: "video", duration: 20 }) }),
			context: { tracks: { main: { id: "main" } } as never, trackId: "other" },
		});
		expect(next).toMatchObject({ type: "video", startTime: at(4), duration: at(6), isSourceAudioEnabled: true });
		expect(next.params).toEqual(image.params);
	});
});
