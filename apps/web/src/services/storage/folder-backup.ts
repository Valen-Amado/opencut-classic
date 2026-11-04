import { toast } from "sonner";
import { IndexedDBAdapter } from "./indexeddb-adapter";
import { storageService } from "./service";
import type { MediaAssetData, SerializedProject } from "./types";

const PROJECT_FILE = "project.json";
const MEDIA_INDEX_FILE = "media.json";
const MEDIA_DIRECTORY = "media";
const HANDLE_KEY = "folder";

export type FolderBackupStatus =
	| { state: "unsupported" }
	| { state: "off" }
	| { state: "paused"; folderName: string }
	| { state: "active"; folderName: string };

export interface FolderBackupEntry {
	project: SerializedProject;
	directory: FileSystemDirectoryHandle;
}

function isNotFound(error: unknown): boolean {
	return (error as Error)?.name === "NotFoundError";
}

function savedAt({ project }: { project: SerializedProject }): number {
	return new Date(project.metadata.updatedAt).getTime();
}

async function writeFile({
	directory,
	name,
	data,
}: {
	directory: FileSystemDirectoryHandle;
	name: string;
	data: Blob | string;
}): Promise<void> {
	const handle = await directory.getFileHandle(name, { create: true });
	// The file only changes on close(), so a failed copy leaves the old one.
	const writable = await handle.createWritable();
	try {
		await writable.write(data);
		await writable.close();
	} catch (error) {
		await writable.abort().catch(() => undefined);
		throw error;
	}
}

async function readJson<T>({
	directory,
	name,
}: {
	directory: FileSystemDirectoryHandle;
	name: string;
}): Promise<T | null> {
	try {
		const handle = await directory.getFileHandle(name);
		const file = await handle.getFile();
		return JSON.parse(await file.text()) as T;
	} catch (error) {
		if (isNotFound(error) || error instanceof SyntaxError) return null;
		throw error;
	}
}

async function hasFileOfSize({
	directory,
	name,
	size,
}: {
	directory: FileSystemDirectoryHandle;
	name: string;
	size: number;
}): Promise<boolean> {
	try {
		const handle = await directory.getFileHandle(name);
		return (await handle.getFile()).size === size;
	} catch (error) {
		if (isNotFound(error)) return false;
		throw error;
	}
}

/**
 * The project file is written last: when it is there, everything it needs is
 * too. A copy in the folder that is newer than this browser's is left alone,
 * so a profile with an older version can't overwrite it.
 */
export async function writeProjectToFolder({
	folder,
	project,
	readMedia,
}: {
	folder: FileSystemDirectoryHandle;
	project: SerializedProject;
	readMedia: () => Promise<Array<{ metadata: MediaAssetData; file: File }>>;
}): Promise<boolean> {
	const directory = await folder.getDirectoryHandle(project.metadata.id, {
		create: true,
	});
	const existing = await readJson<SerializedProject>({
		directory,
		name: PROJECT_FILE,
	});
	if (existing && savedAt({ project: existing }) >= savedAt({ project })) {
		return false;
	}

	const media = await readMedia();
	const mediaDirectory = await directory.getDirectoryHandle(MEDIA_DIRECTORY, {
		create: true,
	});
	for (const { metadata, file } of media) {
		const isCopied = await hasFileOfSize({
			directory: mediaDirectory,
			name: metadata.id,
			size: file.size,
		});
		if (!isCopied) {
			await writeFile({
				directory: mediaDirectory,
				name: metadata.id,
				data: file,
			});
		}
	}

	await writeFile({
		directory,
		name: MEDIA_INDEX_FILE,
		data: JSON.stringify(media.map(({ metadata }) => metadata)),
	});
	await writeFile({
		directory,
		name: PROJECT_FILE,
		data: JSON.stringify(project),
	});
	return true;
}

export async function readProjectsFromFolder({
	folder,
}: {
	folder: FileSystemDirectoryHandle;
}): Promise<FolderBackupEntry[]> {
	const entries: FolderBackupEntry[] = [];

	for await (const handle of folder.values()) {
		if (handle.kind !== "directory") continue;

		const directory = handle as FileSystemDirectoryHandle;
		const project = await readJson<SerializedProject>({
			directory,
			name: PROJECT_FILE,
		});
		if (project?.metadata?.id) {
			entries.push({ project, directory });
		}
	}

	return entries;
}

export function pickEntriesToRestore({
	entries,
	localProjects,
}: {
	entries: FolderBackupEntry[];
	localProjects: SerializedProject[];
}): FolderBackupEntry[] {
	const localById = new Map(
		localProjects.map((project) => [project.metadata.id, project]),
	);

	return entries.filter(({ project }) => {
		const local = localById.get(project.metadata.id);
		return !local || savedAt({ project }) > savedAt({ project: local });
	});
}

class FolderBackup {
	private readonly handles = new IndexedDBAdapter<{
		handle: FileSystemDirectoryHandle;
	}>({
		dbName: "opencut-backup-folder",
		storeName: "handles",
	});
	private handle: FileSystemDirectoryHandle | null = null;
	private status: FolderBackupStatus = { state: "off" };
	private initialization: Promise<void> | null = null;
	private readonly listeners = new Set<() => void>();
	private readonly runningProjectIds = new Set<string>();
	private readonly queuedProjectIds = new Set<string>();
	private hasWarnedPaused = false;
	private hasWarnedFailed = false;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	getStatus = (): FolderBackupStatus => this.status;

	private setStatus({ status }: { status: FolderBackupStatus }): void {
		this.status = status;
		for (const listener of this.listeners) listener();
	}

	private async refreshStatus(): Promise<void> {
		if (!this.handle) {
			this.setStatus({ status: { state: "off" } });
			return;
		}

		const permission = await this.handle.queryPermission({ mode: "readwrite" });
		this.setStatus({
			status: {
				state: permission === "granted" ? "active" : "paused",
				folderName: this.handle.name,
			},
		});
	}

	init(): Promise<void> {
		this.initialization ??= (async () => {
			if (!window.showDirectoryPicker) {
				this.setStatus({ status: { state: "unsupported" } });
				return;
			}

			const stored = await this.handles.get(HANDLE_KEY);
			this.handle = stored?.handle ?? null;
			await this.refreshStatus();
		})();
		return this.initialization;
	}

	/** Returns false when the picker was dismissed. */
	async chooseFolder(): Promise<boolean> {
		await this.init();
		try {
			const handle = await window.showDirectoryPicker?.({
				id: "opencut-backup",
				mode: "readwrite",
				startIn: "documents",
			});
			if (!handle) return false;

			await this.handles.set({ key: HANDLE_KEY, value: { handle } });
			this.handle = handle;
			await this.refreshStatus();
			return true;
		} catch (error) {
			if ((error as Error).name === "AbortError") return false;
			throw error;
		}
	}

	async resume(): Promise<boolean> {
		await this.init();
		if (!this.handle) return false;

		await this.handle.requestPermission({ mode: "readwrite" });
		await this.refreshStatus();
		return this.status.state === "active";
	}

	async stop(): Promise<void> {
		await this.handles.remove(HANDLE_KEY);
		this.handle = null;
		await this.refreshStatus();
	}

	private async copyProject({
		projectId,
	}: {
		projectId: string;
	}): Promise<boolean> {
		const project = await storageService.getSerializedProject({
			id: projectId,
		});
		if (!project || !this.handle) return false;

		return writeProjectToFolder({
			folder: this.handle,
			project,
			readMedia: () => storageService.readProjectMediaFiles({ projectId }),
		});
	}

	private async warnFailed({ error }: { error: unknown }): Promise<void> {
		console.error("Failed to copy project to the backup folder:", error);
		await this.refreshStatus().catch(() => undefined);
		if (this.status.state === "paused") {
			this.warnPaused();
			return;
		}
		if (!this.hasWarnedFailed) {
			this.hasWarnedFailed = true;
			toast.error("No se pudo copiar el proyecto a tu carpeta", {
				description:
					"Tu trabajo sigue guardado en el navegador. Revisa que la carpeta exista y que haya espacio en el disco.",
			});
		}
	}

	private warnPaused(): void {
		if (this.hasWarnedPaused) return;

		this.hasWarnedPaused = true;
		toast("La copia en tu carpeta está en pausa", {
			description: "El navegador necesita tu permiso para seguir copiando.",
			duration: Infinity,
			action: {
				label: "Reactivar",
				onClick: () => void this.resumeAndCopy(),
			},
		});
	}

	private async resumeAndCopy(): Promise<void> {
		if (await this.resume()) {
			await this.copyAllProjects();
		}
	}

	/** Never throws: a failed copy must not get in the way of saving. */
	backupProject({ projectId }: { projectId: string }): void {
		void this.runBackup({ projectId });
	}

	private async runBackup({ projectId }: { projectId: string }): Promise<void> {
		if (this.runningProjectIds.has(projectId)) {
			this.queuedProjectIds.add(projectId);
			return;
		}

		this.runningProjectIds.add(projectId);
		try {
			await this.init();
			if (this.status.state === "paused") {
				this.warnPaused();
				return;
			}
			if (this.status.state !== "active") return;

			do {
				this.queuedProjectIds.delete(projectId);
				await this.copyProject({ projectId });
			} while (this.queuedProjectIds.has(projectId));
			this.hasWarnedFailed = false;
		} catch (error) {
			await this.warnFailed({ error });
		} finally {
			this.runningProjectIds.delete(projectId);
		}
	}

	/** Brings the folder up to date; returns how many projects it copied. */
	async copyAllProjects(): Promise<number> {
		await this.init();
		if (this.status.state !== "active") return 0;

		let copiedCount = 0;
		try {
			for (const projectId of await storageService.listProjectIds()) {
				if (await this.copyProject({ projectId })) copiedCount += 1;
			}
			this.hasWarnedFailed = false;
		} catch (error) {
			await this.warnFailed({ error });
		}
		return copiedCount;
	}

	/**
	 * Brings in the projects this browser lacks or has an older version of.
	 * Media goes first so a restored project never opens with files missing.
	 */
	async restoreProjects(): Promise<number> {
		await this.init();
		if (!this.handle) return 0;

		const localProjects = await Promise.all(
			(await storageService.listProjectIds()).map((id) =>
				storageService.getSerializedProject({ id }),
			),
		);
		const entries = pickEntriesToRestore({
			entries: await readProjectsFromFolder({ folder: this.handle }),
			localProjects: localProjects.filter((project) => project !== null),
		});

		for (const { project, directory } of entries) {
			const projectId = project.metadata.id;
			const mediaIndex =
				(await readJson<MediaAssetData[]>({
					directory,
					name: MEDIA_INDEX_FILE,
				})) ?? [];
			const mediaDirectory = await directory.getDirectoryHandle(MEDIA_DIRECTORY);

			for (const metadata of mediaIndex) {
				const handle = await mediaDirectory.getFileHandle(metadata.id);
				await storageService.saveProjectMediaFile({
					projectId,
					metadata,
					file: await handle.getFile(),
				});
			}
			await storageService.saveSerializedProject({ project });
		}

		return entries.length;
	}
}

export const folderBackup = new FolderBackup();
