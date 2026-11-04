import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { EditorCore } from "@/core";
import { SaveManager } from "../save-manager";

mock.module("sonner", () => ({ toast: { error: () => {} } }));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function buildSaveManager({
	save = async () => {},
	hasActiveProject = true,
}: {
	save?: () => Promise<void>;
	hasActiveProject?: boolean;
} = {}) {
	const saveCurrentProject = mock(save);
	const subscribe = () => () => {};
	const editor = {
		scenes: { subscribe },
		timeline: { subscribe },
		project: {
			saveCurrentProject,
			getActiveOrNull: () => (hasActiveProject ? {} : null),
			getIsLoading: () => false,
			getMigrationState: () => ({ isMigrating: false }),
		},
	} as unknown as EditorCore;

	return {
		manager: new SaveManager({ editor, debounceMs: 5, retryDelayMs: 5 }),
		saveCurrentProject,
	};
}

describe("SaveManager", () => {
	let consoleError: typeof console.error;

	beforeEach(() => {
		consoleError = console.error;
		console.error = () => {};
		return () => {
			console.error = consoleError;
		};
	});

	test("saves after a change", async () => {
		const { manager, saveCurrentProject } = buildSaveManager();

		manager.markDirty();
		await wait(20);

		expect(saveCurrentProject).toHaveBeenCalledTimes(1);
	});

	test("does not throw when the project was closed before the timer fired", async () => {
		const { manager, saveCurrentProject } = buildSaveManager({
			hasActiveProject: false,
		});

		manager.markDirty();
		await manager.flush();

		expect(saveCurrentProject).not.toHaveBeenCalled();
	});

	test("cancels a queued save while a project is loading", async () => {
		const { manager, saveCurrentProject } = buildSaveManager();

		manager.markDirty();
		manager.pause();
		await wait(20);
		expect(saveCurrentProject).not.toHaveBeenCalled();

		manager.resume();
		await wait(20);
		expect(saveCurrentProject).toHaveBeenCalledTimes(1);
	});

	test("keeps the changes and retries when a save fails", async () => {
		let attempts = 0;
		const { manager, saveCurrentProject } = buildSaveManager({
			save: async () => {
				attempts += 1;
				if (attempts === 1) throw new Error("quota");
			},
		});

		manager.markDirty();
		await wait(8);
		expect(manager.getHasSaveFailed()).toBe(true);

		await wait(20);
		expect(saveCurrentProject).toHaveBeenCalledTimes(2);
		expect(manager.getHasSaveFailed()).toBe(false);
	});

	test("flush also writes changes made during a save in progress", async () => {
		let finishFirstSave = () => {};
		let saves = 0;
		const { manager, saveCurrentProject } = buildSaveManager({
			save: () => {
				saves += 1;
				if (saves > 1) return Promise.resolve();
				return new Promise<void>((resolve) => {
					finishFirstSave = resolve;
				});
			},
		});

		manager.markDirty();
		await wait(10);
		manager.markDirty();

		const flushed = manager.flush();
		finishFirstSave();
		await flushed;

		expect(saveCurrentProject).toHaveBeenCalledTimes(2);
	});

	test("never writes from a tab that lost the project", async () => {
		const { manager, saveCurrentProject } = buildSaveManager();

		manager.markDirty();
		manager.setReadOnly({ isReadOnly: true });
		manager.markDirty();
		await manager.flush();
		await wait(20);

		expect(saveCurrentProject).not.toHaveBeenCalled();
	});
});
