import { describe, expect, test } from "bun:test";
import { transformProjectV32ToV33 } from "../transformers/v32-to-v33";
import { asRecord, asRecordArray } from "./helpers";

function migrate({ elements }: { elements: Record<string, unknown>[] }) {
	const result = transformProjectV32ToV33({
		project: {
			id: "project-v32-spacing",
			version: 32,
			scenes: [{ tracks: { main: { elements: [] }, overlay: [{ elements }], audio: [] } }],
		},
	});
	expect(result.skipped).toBe(false);
	expect(result.project.version).toBe(33);
	const scene = asRecordArray(result.project.scenes)[0];
	return asRecordArray(asRecordArray(asRecord(scene.tracks).overlay)[0].elements);
}

describe("V32 to V33 Migration", () => {
	test("marks text with an existing spacing as legacy pixels, keeping the value", () => {
		const [spaced, keyed, plain, video] = migrate({
			elements: [
				{ id: "a", type: "text", params: { letterSpacing: 30 } },
				{ id: "b", type: "text", params: { letterSpacing: 0 }, animations: { letterSpacing: { keys: [] } } },
				{ id: "c", type: "text", params: { letterSpacing: 0 } },
				{ id: "d", type: "video", params: { letterSpacing: 5 } },
			],
		});
		expect(asRecord(spaced.params)).toEqual({ letterSpacing: 30, letterSpacingUnit: "px" });
		expect(asRecord(keyed.params).letterSpacingUnit).toBe("px");
		expect(asRecord(plain.params).letterSpacingUnit).toBeUndefined();
		expect(asRecord(video.params).letterSpacingUnit).toBeUndefined();
	});

	test("skips projects that are not v32", () => {
		expect(transformProjectV32ToV33({ project: { id: "p", version: 33 } }).skipped).toBe(true);
	});
});
