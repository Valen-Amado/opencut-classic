import { describe, expect, test } from "bun:test";
import {
	buildDefaultScene,
	countSceneElements,
	getNextSceneName,
	getSceneDisplayName,
} from "@/timeline/scenes";

describe("scene helpers", () => {
	test("localizes only the default main scene name", () => {
		expect(getSceneDisplayName({ scene: buildDefaultScene({ name: "Main scene", isMain: true }) })).toBe("Escena principal");
		expect(getSceneDisplayName({ scene: buildDefaultScene({ name: "Intro", isMain: true }) })).toBe("Intro");
		expect(getSceneDisplayName({ scene: buildDefaultScene({ name: "Main scene", isMain: false }) })).toBe("Main scene");
	});

	test("picks the next free Escena N name", () => {
		const main = buildDefaultScene({ name: "Main scene", isMain: true });
		expect(getNextSceneName({ scenes: [main] })).toBe("Escena 2");
		const two = buildDefaultScene({ name: "Escena 2", isMain: false });
		const three = buildDefaultScene({ name: "escena 3", isMain: false });
		expect(getNextSceneName({ scenes: [main, two, three] })).toBe("Escena 4");
	});

	test("an empty scene has no elements", () => {
		expect(countSceneElements({ scene: buildDefaultScene({ name: "x", isMain: false }) })).toBe(0);
	});
});
