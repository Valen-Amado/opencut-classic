import { EditorCore } from "@/core";
import type { SceneTracks, TimelineElement, TimelineTrack } from "@/timeline";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	type MediaTime,
} from "@/wasm";
import { AgentToolError } from "../types";

export function getEditor(): EditorCore {
	return EditorCore.getInstance();
}

/**
 * The agent speaks seconds; the editor stores integer ticks. Every boundary
 * between the two goes through these two helpers so rounding stays in one place.
 */
export function toMediaTime({ seconds }: { seconds: number }): MediaTime {
	if (!Number.isFinite(seconds)) {
		throw new AgentToolError(`Expected a finite number of seconds, got ${seconds}`);
	}
	return mediaTimeFromSeconds({ seconds: Math.max(0, seconds) });
}

export function toSeconds({ time }: { time: MediaTime }): number {
	return mediaTimeToSeconds({ time });
}

/** Round to milliseconds so serialized timelines stay readable. */
export function roundSeconds({ seconds }: { seconds: number }): number {
	return Math.round(seconds * 1000) / 1000;
}

export function getActiveTracks(): SceneTracks {
	const scene = getEditor().scenes.getActiveSceneOrNull();
	if (!scene) {
		throw new AgentToolError(
			"No scene is open. Open a project in the editor tab first.",
		);
	}
	return scene.tracks;
}

/** Main track first, then overlays, then audio — the order shown in the UI. */
export function listTracks(): TimelineTrack[] {
	const tracks = getActiveTracks();
	return [tracks.main, ...tracks.overlay, ...tracks.audio];
}

export interface LocatedElement {
	track: TimelineTrack;
	element: TimelineElement;
}

export function findElementOrNull({
	elementId,
}: {
	elementId: string;
}): LocatedElement | null {
	for (const track of listTracks()) {
		const element = track.elements.find((candidate) => candidate.id === elementId);
		if (element) {
			return { track, element };
		}
	}
	return null;
}

/**
 * Resolve an element id, or fail with a message that lists what the agent could
 * have asked for instead — a bare "not found" costs an extra round trip.
 */
export function requireElement({
	elementId,
}: {
	elementId: string;
}): LocatedElement {
	const found = findElementOrNull({ elementId });
	if (found) {
		return found;
	}

	const available = listTracks()
		.flatMap((track) =>
			track.elements.map((element) => `${element.id} (${element.type})`),
		)
		.join(", ");

	throw new AgentToolError(
		available
			? `No element with id "${elementId}". Available elements: ${available}`
			: `No element with id "${elementId}". The timeline is empty.`,
	);
}

export function requireTrack({ trackId }: { trackId: string }): TimelineTrack {
	const track = getEditor().timeline.getTrackById({ trackId });
	if (track) {
		return track;
	}

	const available = listTracks()
		.map((candidate) => `${candidate.id} (${candidate.type})`)
		.join(", ");
	throw new AgentToolError(
		`No track with id "${trackId}". Available tracks: ${available}`,
	);
}

export function requireActiveProject() {
	const project = getEditor().project.getActiveOrNull();
	if (!project) {
		throw new AgentToolError(
			"No project is open. Open a project in the editor tab first.",
		);
	}
	return project;
}
