import type { MigrationResult, ProjectRecord } from "./types";
import { getProjectId, isRecord } from "./utils";

/**
 * v33: text letter spacing moves to font-size units (scaled with the canvas
 * like fontSize) instead of raw canvas pixels, so small values are visible.
 *
 * Additive: values are not converted. Text elements that already had a
 * spacing (a non-zero value or keyframes) get `params.letterSpacingUnit =
 * "px"` so they keep rendering exactly as before; everything else uses the
 * new unit.
 */
export function transformProjectV32ToV33({
	project,
}: {
	project: ProjectRecord;
}): MigrationResult<ProjectRecord> {
	if (!getProjectId({ project })) {
		return { project, skipped: true, reason: "no project id" };
	}

	const version = project.version;
	if (typeof version !== "number") {
		return { project, skipped: true, reason: "invalid version" };
	}
	if (version >= 33) {
		return { project, skipped: true, reason: "already v33" };
	}
	if (version !== 32) {
		return { project, skipped: true, reason: "not v32" };
	}

	const nextProject: ProjectRecord = { ...project, version: 33 };
	if (Array.isArray(project.scenes)) {
		nextProject.scenes = project.scenes.map((scene) => migrateScene({ scene }));
	}
	return { project: nextProject, skipped: false };
}

function migrateScene({ scene }: { scene: unknown }): unknown {
	if (!isRecord(scene) || !isRecord(scene.tracks)) {
		return scene;
	}
	const tracks = scene.tracks;
	const nextTracks = { ...tracks };
	if (isRecord(tracks.main)) {
		nextTracks.main = migrateTrack({ track: tracks.main });
	}
	if (Array.isArray(tracks.overlay)) {
		nextTracks.overlay = tracks.overlay.map((track) => migrateTrack({ track }));
	}
	if (Array.isArray(tracks.audio)) {
		nextTracks.audio = tracks.audio.map((track) => migrateTrack({ track }));
	}
	return { ...scene, tracks: nextTracks };
}

function migrateTrack({ track }: { track: unknown }): unknown {
	if (!isRecord(track) || !Array.isArray(track.elements)) {
		return track;
	}
	return {
		...track,
		elements: track.elements.map((element) => migrateElement({ element })),
	};
}

function migrateElement({ element }: { element: unknown }): unknown {
	if (!isRecord(element) || element.type !== "text" || !isRecord(element.params)) {
		return element;
	}
	const spacing = element.params.letterSpacing;
	const hasSpacing = typeof spacing === "number" && spacing !== 0;
	const hasKeyframes =
		isRecord(element.animations) && element.animations.letterSpacing !== undefined;
	if (!hasSpacing && !hasKeyframes) {
		return element;
	}
	return {
		...element,
		params: { ...element.params, letterSpacingUnit: "px" },
	};
}
