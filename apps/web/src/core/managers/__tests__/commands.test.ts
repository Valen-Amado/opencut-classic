import { describe, expect, test } from "bun:test";
import type { EditorCore } from "@/core";
import { Command } from "@/commands/base-command";
import { CommandManager } from "@/core/managers/commands";

function buildEditor() {
	const scenes = [
		{ id: "main", tracks: "main-tracks" },
		{ id: "second", tracks: "second-tracks" },
	];
	let active = scenes[0];

	const editor = {
		scenes: {
			getScenes: () => scenes,
			getActiveSceneOrNull: () => active,
			switchToScene: async ({ sceneId }: { sceneId: string }) => {
				active = scenes.find(({ id }) => id === sceneId) ?? active;
			},
		},
		selection: { getSnapshot: () => ({}) },
	};

	return {
		editor: editor as unknown as EditorCore,
		scenes,
		activeId: () => active.id,
		switchTo: (sceneId: string) => editor.scenes.switchToScene({ sceneId }),
		setActiveTracks: (tracks: string) => {
			active.tracks = tracks;
		},
	};
}

class SetTracks extends Command {
	private saved = "";

	constructor(
		private readonly context: ReturnType<typeof buildEditor>,
		private readonly tracks: string,
	) {
		super();
	}

	execute() {
		const { scenes, activeId, setActiveTracks } = this.context;
		this.saved = scenes.find(({ id }) => id === activeId())?.tracks ?? "";
		setActiveTracks(this.tracks);
		return undefined;
	}

	undo() {
		this.context.setActiveTracks(this.saved);
	}
}

describe("undo across scenes", () => {
	test("goes back to the scene it belongs to, leaving the others alone", async () => {
		const context = buildEditor();
		const manager = new CommandManager(context.editor);

		await context.switchTo("second");
		manager.execute({ command: new SetTracks(context, "second-edited") });
		await context.switchTo("main");

		manager.undo();

		expect(context.activeId()).toBe("second");
		expect(context.scenes[0].tracks).toBe("main-tracks");
		expect(context.scenes[1].tracks).toBe("second-tracks");
	});

	test("redo does the same", async () => {
		const context = buildEditor();
		const manager = new CommandManager(context.editor);

		await context.switchTo("second");
		manager.execute({ command: new SetTracks(context, "second-edited") });
		manager.undo();
		await context.switchTo("main");

		manager.redo();

		expect(context.activeId()).toBe("second");
		expect(context.scenes[0].tracks).toBe("main-tracks");
		expect(context.scenes[1].tracks).toBe("second-edited");
	});
});
