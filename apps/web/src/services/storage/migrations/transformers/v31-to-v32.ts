import type { MigrationResult, ProjectRecord } from "./types";
import { getProjectId, isRecord } from "./utils";

const TICKS_PER_SECOND = 120_000;
const SLOTS = ["in", "out", "loop"] as const;
type Slot = (typeof SLOTS)[number];

/**
 * v32: animation presets are resolved procedurally at render time instead of
 * being baked into keyframes.
 *
 * Old entries look like `{ presetId, durationTicks, keyframeIds }` and the
 * listed keyframes live in `element.animations`. Each entry gains `duration`
 * (ticks), and its generated keyframes leave `element.animations` (otherwise
 * the preset would play twice). Following the additive policy, nothing is
 * lost: the old entry fields stay, and the removed keyframes are kept on the
 * entry as `legacyKeyframes` ({ propertyPath, componentKey?, keyframe }) so a
 * down migration can put them back.
 */
export function transformProjectV31ToV32({
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
	if (version >= 32) {
		return { project, skipped: true, reason: "already v32" };
	}
	if (version !== 31) {
		return { project, skipped: true, reason: "not v31" };
	}

	return {
		project: {
			...migrateProject({ project }),
			version: 32,
		},
		skipped: false,
	};
}

function migrateProject({ project }: { project: ProjectRecord }): ProjectRecord {
	const nextProject = { ...project };
	if (Array.isArray(project.scenes)) {
		nextProject.scenes = project.scenes.map((scene) => migrateScene({ scene }));
	}
	return nextProject;
}

function migrateScene({ scene }: { scene: unknown }): unknown {
	if (!isRecord(scene)) {
		return scene;
	}

	const nextScene = { ...scene };
	if (isRecord(scene.tracks)) {
		nextScene.tracks = migrateTracks({ tracks: scene.tracks });
	}
	return nextScene;
}

function migrateTracks({ tracks }: { tracks: ProjectRecord }): ProjectRecord {
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
	return nextTracks;
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

interface RemovedKeyframe {
	propertyPath: string;
	componentKey?: string;
	keyframe: ProjectRecord;
}

function migrateElement({ element }: { element: unknown }): unknown {
	if (!isRecord(element) || !isRecord(element.animationPresets)) {
		return element;
	}

	const presets = element.animationPresets;
	const idsBySlot = new Map<string, Slot>();
	for (const slot of SLOTS) {
		const entry = presets[slot];
		if (!isRecord(entry) || !Array.isArray(entry.keyframeIds)) continue;
		for (const id of entry.keyframeIds) {
			if (typeof id === "string") idsBySlot.set(id, slot);
		}
	}

	const removed = new Map<Slot, RemovedKeyframe[]>();
	const animations = isRecord(element.animations)
		? removeKeyframes({
				animations: element.animations,
				idsBySlot,
				removed,
			})
		: element.animations;

	const elementDuration =
		typeof element.duration === "number" ? element.duration : 0;
	const nextPresets: ProjectRecord = { ...presets };
	for (const slot of SLOTS) {
		const entry = presets[slot];
		if (!isRecord(entry) || typeof entry.presetId !== "string") continue;
		const legacyKeyframes = removed.get(slot) ?? [];
		nextPresets[slot] = {
			...entry,
			duration: deriveDuration({
				entry,
				slot,
				legacyKeyframes,
				elementDuration,
			}),
			...(legacyKeyframes.length > 0 ? { legacyKeyframes } : {}),
		};
	}

	const nextElement: ProjectRecord = {
		...element,
		animationPresets: nextPresets,
	};
	if (animations === undefined) {
		delete nextElement.animations;
	} else {
		nextElement.animations = animations;
	}
	return nextElement;
}

function deriveDuration({
	entry,
	slot,
	legacyKeyframes,
	elementDuration,
}: {
	entry: ProjectRecord;
	slot: Slot;
	legacyKeyframes: RemovedKeyframe[];
	elementDuration: number;
}): number {
	if (typeof entry.duration === "number" && entry.duration > 0) {
		return Math.round(entry.duration);
	}
	if (typeof entry.durationTicks === "number" && entry.durationTicks > 0) {
		return Math.round(entry.durationTicks);
	}

	const times = legacyKeyframes
		.map(({ keyframe }) => keyframe.time)
		.filter((time): time is number => typeof time === "number");
	if (slot !== "loop" && times.length > 0) {
		const span =
			slot === "in"
				? Math.max(...times)
				: elementDuration - Math.min(...times);
		if (span > 0) return Math.round(span);
	}
	return slot === "loop" ? TICKS_PER_SECOND : Math.round(TICKS_PER_SECOND / 2);
}

function removeKeyframes({
	animations,
	idsBySlot,
	removed,
}: {
	animations: ProjectRecord;
	idsBySlot: Map<string, Slot>;
	removed: Map<Slot, RemovedKeyframe[]>;
}): ProjectRecord | undefined {
	if (idsBySlot.size === 0) return animations;

	const filterChannel = ({
		channel,
		propertyPath,
		componentKey,
	}: {
		channel: ProjectRecord;
		propertyPath: string;
		componentKey?: string;
	}): ProjectRecord | null => {
		if (!Array.isArray(channel.keys)) return channel;
		const kept: unknown[] = [];
		for (const keyframe of channel.keys) {
			const slot =
				isRecord(keyframe) && typeof keyframe.id === "string"
					? idsBySlot.get(keyframe.id)
					: undefined;
			if (!slot || !isRecord(keyframe)) {
				kept.push(keyframe);
				continue;
			}
			removed.set(slot, [
				...(removed.get(slot) ?? []),
				{
					propertyPath,
					...(componentKey !== undefined ? { componentKey } : {}),
					keyframe,
				},
			]);
		}
		if (kept.length === channel.keys.length) return channel;
		return kept.length > 0 ? { ...channel, keys: kept } : null;
	};

	const next: ProjectRecord = {};
	for (const [propertyPath, data] of Object.entries(animations)) {
		if (!isRecord(data)) {
			next[propertyPath] = data;
			continue;
		}
		if ("keys" in data) {
			const channel = filterChannel({ channel: data, propertyPath });
			if (channel) next[propertyPath] = channel;
			continue;
		}
		const components: ProjectRecord = {};
		for (const [componentKey, channel] of Object.entries(data)) {
			if (!isRecord(channel)) {
				components[componentKey] = channel;
				continue;
			}
			const filtered = filterChannel({ channel, propertyPath, componentKey });
			if (filtered) components[componentKey] = filtered;
		}
		if (Object.keys(components).length > 0) next[propertyPath] = components;
	}
	return Object.keys(next).length > 0 ? next : undefined;
}
