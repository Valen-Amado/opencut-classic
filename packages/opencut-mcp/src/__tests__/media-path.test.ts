import { describe, expect, test } from "bun:test";
import { MediaPathError, resolveInsideMediaRoot } from "../media-path";

const ROOT = "/Users/vale/media";

describe("resolveInsideMediaRoot", () => {
	test("resolves a relative path against the root", () => {
		expect(resolveInsideMediaRoot({ path: "clip.mp4", root: ROOT })).toBe(
			`${ROOT}/clip.mp4`,
		);
	});

	test("allows a nested path", () => {
		expect(
			resolveInsideMediaRoot({ path: "woaly/take-1.mp4", root: ROOT }),
		).toBe(`${ROOT}/woaly/take-1.mp4`);
	});

	test("allows an absolute path already inside the root", () => {
		expect(
			resolveInsideMediaRoot({ path: `${ROOT}/clip.mp4`, root: ROOT }),
		).toBe(`${ROOT}/clip.mp4`);
	});

	test("rejects traversal out of the root", () => {
		expect(() =>
			resolveInsideMediaRoot({ path: "../../.ssh/id_rsa", root: ROOT }),
		).toThrow(MediaPathError);
	});

	test("rejects traversal disguised inside a nested path", () => {
		expect(() =>
			resolveInsideMediaRoot({ path: "woaly/../../../etc/passwd", root: ROOT }),
		).toThrow(MediaPathError);
	});

	test("rejects an absolute path outside the root", () => {
		expect(() =>
			resolveInsideMediaRoot({ path: "/etc/passwd", root: ROOT }),
		).toThrow(MediaPathError);
	});

	test("rejects a sibling directory that merely shares the prefix", () => {
		expect(() =>
			resolveInsideMediaRoot({ path: "/Users/vale/media-private/x", root: ROOT }),
		).toThrow(MediaPathError);
	});

	test("rejects an empty path", () => {
		expect(() => resolveInsideMediaRoot({ path: "", root: ROOT })).toThrow(
			MediaPathError,
		);
	});

	test("names the root so the caller knows where to put the file", () => {
		expect(() =>
			resolveInsideMediaRoot({ path: "/etc/passwd", root: ROOT }),
		).toThrow(ROOT);
	});
});
