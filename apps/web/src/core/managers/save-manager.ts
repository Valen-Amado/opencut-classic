import type { EditorCore } from "@/core";
import { toast } from "sonner";

type SaveManagerOptions = {
	debounceMs?: number;
	retryDelayMs?: number;
};

export class SaveManager {
	private debounceMs: number;
	private retryDelayMs: number;
	private isPaused = false;
	private isReadOnly = false;
	private isSaving = false;
	private hasPendingSave = false;
	private hasSaveFailed = false;
	private activeSave: Promise<void> | null = null;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private unsubscribeHandlers: Array<() => void> = [];

	constructor({
		editor,
		debounceMs = 800,
		retryDelayMs = 5000,
	}: {
		editor: EditorCore;
	} & SaveManagerOptions) {
		this.editor = editor;
		this.debounceMs = debounceMs;
		this.retryDelayMs = retryDelayMs;
	}

	private editor: EditorCore;

	start(): void {
		if (this.unsubscribeHandlers.length > 0) return;

		this.unsubscribeHandlers = [
			this.editor.scenes.subscribe(() => {
				this.markDirty();
			}),
			this.editor.timeline.subscribe(() => {
				this.markDirty();
			}),
		];

		if (typeof window === "undefined") return;

		const handleVisibilityChange = () => {
			if (document.visibilityState === "hidden") this.saveOnPageExit();
		};
		const handlePageExit = () => this.saveOnPageExit();

		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("beforeunload", handlePageExit);
		window.addEventListener("pagehide", handlePageExit);
		this.unsubscribeHandlers.push(() => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("beforeunload", handlePageExit);
			window.removeEventListener("pagehide", handlePageExit);
		});
	}

	stop(): void {
		for (const unsubscribe of this.unsubscribeHandlers) {
			unsubscribe();
		}
		this.unsubscribeHandlers = [];
		this.clearTimer();
	}

	pause(): void {
		this.isPaused = true;
		this.clearTimer();
	}

	resume(): void {
		this.isPaused = false;
		if (this.hasPendingSave) {
			this.queueSave();
		}
	}

	setReadOnly({ isReadOnly }: { isReadOnly: boolean }): void {
		this.isReadOnly = isReadOnly;
		if (!isReadOnly) return;
		this.hasPendingSave = false;
		this.hasSaveFailed = false;
		this.clearTimer();
	}

	markDirty({ force = false }: { force?: boolean } = {}): void {
		if (this.isReadOnly) return;
		if (this.isPaused && !force) return;
		this.hasPendingSave = true;
		this.queueSave();
	}

	async flush(): Promise<void> {
		if (this.activeSave) {
			await this.activeSave;
		}
		await this.saveNow();
	}

	getHasSaveFailed(): boolean {
		return this.hasSaveFailed;
	}

	private queueSave(): void {
		if (this.isSaving) return;
		this.clearTimer();
		this.saveTimer = setTimeout(
			() => {
				void this.saveNow();
			},
			this.hasSaveFailed ? this.retryDelayMs : this.debounceMs,
		);
	}

	private canSave(): boolean {
		return (
			this.hasPendingSave &&
			!this.isPaused &&
			!this.isReadOnly &&
			this.editor.project.getActiveOrNull() !== null &&
			!this.editor.project.getIsLoading() &&
			!this.editor.project.getMigrationState().isMigrating
		);
	}

	/**
	 * Runs synchronously up to the database write, so the write is already on
	 * its way when the page goes away. Skips the in-flight check because that
	 * save holds older state and the page may not live to queue another one.
	 */
	private saveOnPageExit(): void {
		if (!this.canSave()) return;
		void this.runSave();
	}

	private async saveNow(): Promise<void> {
		if (this.isSaving) return;
		if (!this.canSave()) return;
		await this.runSave();
	}

	private runSave(): Promise<void> {
		this.isSaving = true;
		this.hasPendingSave = false;
		this.clearTimer();

		const save = this.writeProject();
		this.activeSave = save;
		return save;
	}

	private async writeProject(): Promise<void> {
		try {
			await this.editor.project.saveCurrentProject();
			this.hasSaveFailed = false;
		} catch (error) {
			console.error("Failed to save project:", error);
			this.hasPendingSave = true;
			if (!this.hasSaveFailed) {
				toast.error("No se pudieron guardar tus cambios", {
					description:
						"Seguiremos intentándolo. No cierres el editor hasta que se guarden.",
				});
			}
			this.hasSaveFailed = true;
		} finally {
			this.isSaving = false;
			this.activeSave = null;
			if (this.hasPendingSave) {
				this.queueSave();
			}
		}
	}

	private clearTimer(): void {
		if (!this.saveTimer) return;
		clearTimeout(this.saveTimer);
		this.saveTimer = null;
	}
}
