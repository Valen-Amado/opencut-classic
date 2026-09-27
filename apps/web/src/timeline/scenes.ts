import type { TScene } from "@/timeline";
import { generateUUID } from "@/utils/id";
import { calculateTotalDuration } from "@/timeline";
import { MAIN_TRACK_NAME } from "@/timeline/placement/main-track";
import { type MediaTime, ZERO_MEDIA_TIME } from "@/wasm";

export function getMainScene({ scenes }: { scenes: TScene[] }): TScene | null {
	return scenes.find((scene) => scene.isMain) || null;
}

export function ensureMainScene({ scenes }: { scenes: TScene[] }): TScene[] {
	const hasMain = scenes.some((scene) => scene.isMain);
	if (!hasMain) {
		const mainScene = buildDefaultScene({ name: "Main scene", isMain: true });
		return [mainScene, ...scenes];
	}
	return scenes;
}

export function buildDefaultScene({
	name,
	isMain,
}: {
	name: string;
	isMain: boolean;
}): TScene {
	return {
		id: generateUUID(),
		name,
		isMain,
		tracks: {
			overlay: [],
			main: {
				id: generateUUID(),
				name: MAIN_TRACK_NAME,
				type: "video",
				elements: [],
				muted: false,
				hidden: false,
			},
			audio: [],
		},
		bookmarks: [],
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

export function canDeleteScene({ scene }: { scene: TScene }): {
	canDelete: boolean;
	reason?: string;
} {
	if (scene.isMain) {
		return { canDelete: false, reason: "Cannot delete main scene" };
	}
	return { canDelete: true };
}

export function getFallbackSceneAfterDelete({
	scenes,
	deletedSceneId,
	currentSceneId,
}: {
	scenes: TScene[];
	deletedSceneId: string;
	currentSceneId: string | null;
}): TScene | null {
	if (currentSceneId !== deletedSceneId) {
		return scenes.find((s) => s.id === currentSceneId) || null;
	}
	return getMainScene({ scenes });
}

export function findCurrentScene({
	scenes,
	currentSceneId,
}: {
	scenes: TScene[];
	currentSceneId: string;
}): TScene | null {
	return (
		scenes.find((s) => s.id === currentSceneId) ||
		getMainScene({ scenes }) ||
		scenes[0] ||
		null
	);
}

export function getProjectDurationFromScenes({
	scenes,
}: {
	scenes: TScene[];
}): MediaTime {
	const mainScene = getMainScene({ scenes }) ?? scenes[0] ?? null;
	if (!mainScene?.tracks) {
		return ZERO_MEDIA_TIME;
	}

	return calculateTotalDuration({ tracks: mainScene.tracks });
}

export function updateSceneInArray({
	scenes,
	sceneId,
	updates,
}: {
	scenes: TScene[];
	sceneId: string;
	updates: Partial<TScene>;
}): TScene[] {
	return scenes.map((scene) =>
		scene.id === sceneId ? { ...scene, ...updates } : scene,
	);
}

const DEFAULT_MAIN_SCENE_NAME = "Main scene";

/** Name shown in the UI; the default main scene name is localized. */
export function getSceneDisplayName({ scene }: { scene: TScene }): string {
	return scene.isMain && scene.name === DEFAULT_MAIN_SCENE_NAME
		? "Escena principal"
		: scene.name;
}

/** First free "Escena N" name, starting at 2 (the main scene is the first). */
export function getNextSceneName({ scenes }: { scenes: TScene[] }): string {
	const taken = new Set(scenes.map((scene) => scene.name.trim().toLowerCase()));
	let index = Math.max(2, scenes.length + 1);
	while (taken.has(`escena ${index}`)) index += 1;
	return `Escena ${index}`;
}

export function countSceneElements({ scene }: { scene: TScene }): number {
	const { overlay, main, audio } = scene.tracks;
	return [...overlay, main, ...audio].reduce(
		(total, track) => total + track.elements.length,
		0,
	);
}
