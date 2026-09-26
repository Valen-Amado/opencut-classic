import { describe, expect, test } from "bun:test";
import { transformProjectV31ToV32 } from "../transformers/v31-to-v32";
import { asArray, asRecord, asRecordArray } from "./helpers";

function key({ id, time, value }: { id: string; time: number; value: number }) {
	return { id, time, value, segmentToNext: "linear", tangentMode: "auto" };
}

function projectWith({ element }: { element: Record<string, unknown> }) {
	return {
		id: "project-v31-presets",
		version: 31,
		scenes: [{ tracks: { main: { elements: [element] }, overlay: [], audio: [] } }],
	};
}

function migratedElement({ element }: { element: Record<string, unknown> }) {
	const result = transformProjectV31ToV32({ project: projectWith({ element }) });
	expect(result.skipped).toBe(false);
	expect(result.project.version).toBe(32);
	const scene = asRecordArray(result.project.scenes)[0];
	const main = asRecord(asRecord(scene.tracks).main);
	return asRecordArray(main.elements)[0];
}

describe("V31 to V32 Migration", () => {
	test("removes generated keyframes and keeps manual ones", () => {
		const element = migratedElement({
			element: {
				id: "text-1",
				type: "text",
				duration: 1000,
				animations: {
					opacity: {
						keys: [
							key({ id: "gen-1", time: 0, value: 0 }),
							key({ id: "gen-2", time: 300, value: 1 }),
						],
					},
					"transform.positionX": {
						keys: [
							key({ id: "manual-1", time: 0, value: 10 }),
							key({ id: "gen-3", time: 900, value: 50 }),
						],
					},
				},
				animationPresets: {
					in: { presetId: "fade", durationTicks: 300, keyframeIds: ["gen-1", "gen-2"] },
					out: { presetId: "slide-left", durationTicks: 100, keyframeIds: ["gen-3"] },
				},
			},
		});

		const animations = asRecord(element.animations);
		expect(animations.opacity).toBeUndefined();
		const positionKeys = asRecordArray(asRecord(animations["transform.positionX"]).keys);
		expect(positionKeys.map((k) => k.id)).toEqual(["manual-1"]);

		const presets = asRecord(element.animationPresets);
		expect(asRecord(presets.in)).toMatchObject({ presetId: "fade", duration: 300 });
		expect(asRecord(presets.out)).toMatchObject({ presetId: "slide-left", duration: 100 });
	});

	test("keeps the old fields and the removed keyframes for a down migration", () => {
		const element = migratedElement({
			element: {
				id: "video-1",
				type: "video",
				duration: 1000,
				animations: {
					opacity: { keys: [key({ id: "gen-1", time: 0, value: 0 })] },
				},
				animationPresets: {
					in: { presetId: "fade", durationTicks: 300, keyframeIds: ["gen-1"] },
				},
			},
		});

		const entry = asRecord(asRecord(element.animationPresets).in);
		expect(entry.durationTicks).toBe(300);
		expect(entry.keyframeIds).toEqual(["gen-1"]);
		const legacy = asRecordArray(entry.legacyKeyframes);
		expect(legacy).toHaveLength(1);
		expect(legacy[0]).toMatchObject({ propertyPath: "opacity", keyframe: { id: "gen-1", time: 0 } });
		expect(element.animations).toBeUndefined();
	});

	test("removes keyframes from composite channels", () => {
		const element = migratedElement({
			element: {
				id: "graphic-1",
				type: "graphic",
				duration: 1000,
				animations: {
					"params.fill": {
						r: { keys: [key({ id: "gen-1", time: 0, value: 0 }), key({ id: "manual", time: 10, value: 1 })] },
						g: { keys: [key({ id: "gen-2", time: 0, value: 0 })] },
					},
				},
				animationPresets: {
					loop: { presetId: "pulse", durationTicks: 400, keyframeIds: ["gen-1", "gen-2"] },
				},
			},
		});
		const fill = asRecord(asRecord(element.animations)["params.fill"]);
		expect(asRecordArray(asRecord(fill.r).keys).map((k) => k.id)).toEqual(["manual"]);
		expect(fill.g).toBeUndefined();
		const legacy = asRecordArray(asRecord(asRecord(element.animationPresets).loop).legacyKeyframes);
		expect(legacy.map((entry) => entry.componentKey)).toEqual(["r", "g"]);
	});

	test("derives the duration from the removed keyframes when it is missing", () => {
		const element = migratedElement({
			element: {
				id: "image-1",
				type: "image",
				duration: 1000,
				animations: {
					opacity: {
						keys: [
							key({ id: "in-1", time: 0, value: 0 }),
							key({ id: "in-2", time: 250, value: 1 }),
							key({ id: "out-1", time: 820, value: 1 }),
							key({ id: "out-2", time: 1000, value: 0 }),
						],
					},
				},
				animationPresets: {
					in: { presetId: "fade", keyframeIds: ["in-1", "in-2"] },
					out: { presetId: "fade", keyframeIds: ["out-1", "out-2"] },
					loop: { presetId: "spin", keyframeIds: [] },
				},
			},
		});
		const presets = asRecord(element.animationPresets);
		expect(asRecord(presets.in).duration).toBe(250);
		expect(asRecord(presets.out).duration).toBe(180);
		expect(asRecord(presets.loop).duration).toBe(120_000);
	});

	test("leaves elements without presets unchanged", () => {
		const original = {
			id: "text-2",
			type: "text",
			duration: 1000,
			animations: { opacity: { keys: [key({ id: "k", time: 0, value: 0 })] } },
		};
		const element = migratedElement({ element: original });
		expect(element).toEqual(original);
		expect(asArray(asRecord(asRecord(element.animations).opacity).keys)).toHaveLength(1);
	});

	test("skips a project that is already v32", () => {
		const project = { id: "p1", version: 32, scenes: [] };
		const result = transformProjectV31ToV32({ project });
		expect(result.skipped).toBe(true);
		expect(result.reason).toBe("already v32");
		expect(result.project).toBe(project);
	});

	test("skips a project that is not v31", () => {
		const project = { id: "p1", version: 30, scenes: [] };
		const result = transformProjectV31ToV32({ project });
		expect(result.skipped).toBe(true);
		expect(result.reason).toBe("not v31");
	});
});
