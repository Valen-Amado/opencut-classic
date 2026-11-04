import { describe, expect, mock, test } from "bun:test";
import {
	pickEntriesToRestore,
	readProjectsFromFolder,
	writeProjectToFolder,
} from "@/services/storage/folder-backup";
import type {
	MediaAssetData,
	SerializedProject,
} from "@/services/storage/types";

const notFound = () => new DOMException("missing", "NotFoundError");

class FakeFile {
	constructor(public content: string | Blob) {}

	async getFile() {
		return new File([this.content], "file");
	}

	async createWritable() {
		let pending: string | Blob | null = null;
		return {
			write: async (data: string | Blob) => {
				pending = data;
			},
			close: async () => {
				if (pending !== null) this.content = pending;
			},
			abort: async () => undefined,
		};
	}
}

class FakeDirectory {
	readonly kind = "directory";
	readonly children = new Map<string, FakeDirectory | FakeFile>();

	async getDirectoryHandle(name: string, options?: { create?: boolean }) {
		const child = this.children.get(name);
		if (child instanceof FakeDirectory) return child;
		if (!options?.create) throw notFound();

		const directory = new FakeDirectory();
		this.children.set(name, directory);
		return directory;
	}

	async getFileHandle(name: string, options?: { create?: boolean }) {
		const child = this.children.get(name);
		if (child instanceof FakeFile) return child;
		if (!options?.create) throw notFound();

		const file = new FakeFile("");
		this.children.set(name, file);
		return file;
	}

	async *values() {
		yield* this.children.values();
	}
}

const asHandle = (directory: FakeDirectory) =>
	directory as unknown as FileSystemDirectoryHandle;

const project = ({ updatedAt, name = "Mi video" }: { updatedAt: string; name?: string }) =>
	({
		metadata: { id: "p1", name, updatedAt, createdAt: updatedAt, duration: 0 },
		scenes: [],
	}) as unknown as SerializedProject;

const metadata = { id: "m1", name: "a.mp4", type: "video", size: 5 } as MediaAssetData;
const media = (content = "video") => [
	{ metadata, file: new File([content], "a.mp4") },
];

async function savedName(folder: FakeDirectory) {
	const [entry] = await readProjectsFromFolder({ folder: asHandle(folder) });
	return entry?.project.metadata.name;
}

describe("copying a project to a folder", () => {
	test("writes the project, its media and the media index", async () => {
		const folder = new FakeDirectory();
		await writeProjectToFolder({
			folder: asHandle(folder),
			project: project({ updatedAt: "2026-11-04T10:00:00.000Z" }),
			readMedia: async () => media(),
		});

		const directory = await folder.getDirectoryHandle("p1");
		const mediaDirectory = await directory.getDirectoryHandle("media");
		const copied = await (await mediaDirectory.getFileHandle("m1")).getFile();

		expect(await copied.text()).toBe("video");
		expect(await savedName(folder)).toBe("Mi video");
	});

	test("skips the work when the folder is already up to date", async () => {
		const folder = new FakeDirectory();
		const saved = project({ updatedAt: "2026-11-04T10:00:00.000Z" });
		await writeProjectToFolder({
			folder: asHandle(folder),
			project: saved,
			readMedia: async () => media(),
		});

		const readMedia = mock(async () => media());
		const didCopy = await writeProjectToFolder({
			folder: asHandle(folder),
			project: saved,
			readMedia,
		});

		expect(didCopy).toBe(false);
		expect(readMedia).not.toHaveBeenCalled();
	});

	test("never replaces a newer copy with an older one", async () => {
		const folder = new FakeDirectory();
		await writeProjectToFolder({
			folder: asHandle(folder),
			project: project({ updatedAt: "2026-11-04T12:00:00.000Z", name: "Nuevo" }),
			readMedia: async () => [],
		});
		await writeProjectToFolder({
			folder: asHandle(folder),
			project: project({ updatedAt: "2026-11-04T10:00:00.000Z", name: "Viejo" }),
			readMedia: async () => [],
		});

		expect(await savedName(folder)).toBe("Nuevo");
	});

	test("a failed media copy leaves the previous project in place", async () => {
		const folder = new FakeDirectory();
		await writeProjectToFolder({
			folder: asHandle(folder),
			project: project({ updatedAt: "2026-11-04T10:00:00.000Z", name: "Bueno" }),
			readMedia: async () => [],
		});

		const failing = writeProjectToFolder({
			folder: asHandle(folder),
			project: project({ updatedAt: "2026-11-04T11:00:00.000Z", name: "Roto" }),
			readMedia: async () => {
				throw new Error("disk full");
			},
		});

		await expect(failing).rejects.toThrow("disk full");
		expect(await savedName(folder)).toBe("Bueno");
	});

	test("ignores folders that aren't project copies", async () => {
		const folder = new FakeDirectory();
		await folder.getDirectoryHandle("otra-cosa", { create: true });

		expect(await readProjectsFromFolder({ folder: asHandle(folder) })).toEqual([]);
	});
});

describe("choosing what to restore", () => {
	const entry = (updatedAt: string) => ({
		project: project({ updatedAt }),
		directory: asHandle(new FakeDirectory()),
	});

	test("brings in missing and newer projects, and leaves the rest", () => {
		const older = "2026-11-04T10:00:00.000Z";
		const newer = "2026-11-04T12:00:00.000Z";

		expect(
			pickEntriesToRestore({ entries: [entry(older)], localProjects: [] }),
		).toHaveLength(1);
		expect(
			pickEntriesToRestore({
				entries: [entry(newer)],
				localProjects: [project({ updatedAt: older })],
			}),
		).toHaveLength(1);
		expect(
			pickEntriesToRestore({
				entries: [entry(older)],
				localProjects: [project({ updatedAt: newer })],
			}),
		).toHaveLength(0);
	});
});
