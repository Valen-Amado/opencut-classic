"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/ui";
import { folderBackup, type FolderBackupStatus } from "../folder-backup";

const OFF_STATUS: FolderBackupStatus = { state: "off" };

const copiedMessage = (count: number) =>
	count === 1 ? "1 proyecto copiado" : `${count} proyectos copiados`;

export function BackupFolderMenu() {
	const status = useSyncExternalStore(
		folderBackup.subscribe,
		folderBackup.getStatus,
		() => OFF_STATUS,
	);
	const [isBusy, setIsBusy] = useState(false);

	useEffect(() => {
		folderBackup
			.init()
			.then(() => folderBackup.copyAllProjects())
			.catch((error) => console.error("Backup folder unavailable:", error));
	}, []);

	const run = async ({
		loading,
		action,
	}: {
		loading: string;
		action: () => Promise<string | null>;
	}) => {
		setIsBusy(true);
		const toastId = toast.loading(loading);
		try {
			const message = await action();
			if (message) {
				toast.success(message, { id: toastId });
			} else {
				toast.dismiss(toastId);
			}
		} catch (error) {
			console.error("Backup folder action failed:", error);
			toast.error("No se pudo completar la acción", {
				id: toastId,
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setIsBusy(false);
		}
	};

	const copyAll = async () =>
		copiedMessage(await folderBackup.copyAllProjects());

	const chooseFolder = () =>
		run({
			loading: "Copiando tus proyectos…",
			action: async () =>
				(await folderBackup.chooseFolder()) ? copyAll() : null,
		});

	const resume = () =>
		run({
			loading: "Copiando tus proyectos…",
			action: async () => ((await folderBackup.resume()) ? copyAll() : null),
		});

	const restore = () =>
		run({
			loading: "Restaurando proyectos…",
			action: async () => {
				if (status.state === "paused" && !(await folderBackup.resume())) {
					return null;
				}
				const restoredCount = await folderBackup.restoreProjects();
				if (restoredCount === 0) {
					return "Ya tienes la versión más reciente de todo";
				}
				// A full load also runs the migrations on what came in.
				window.location.reload();
				return null;
			},
		});

	if (status.state === "unsupported") return null;

	const hasFolder = status.state === "active" || status.state === "paused";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="lg" disabled={isBusy}>
					<span
						className={cn(
							"size-2 rounded-full",
							status.state === "active" && "bg-green-500",
							status.state === "paused" && "bg-amber-500",
							status.state === "off" && "bg-muted-foreground",
						)}
					/>
					<span className="text-sm font-medium hidden md:block">
						Copia en carpeta
					</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuLabel className="font-normal">
					{status.state === "off" &&
						"Guarda tus proyectos y sus archivos en una carpeta de tu Mac."}
					{status.state === "active" && `Copiando en «${status.folderName}»`}
					{status.state === "paused" &&
						`En pausa: falta tu permiso para «${status.folderName}»`}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{status.state === "paused" && (
					<DropdownMenuItem onClick={resume}>Reactivar copia</DropdownMenuItem>
				)}
				<DropdownMenuItem onClick={chooseFolder}>
					{hasFolder ? "Cambiar de carpeta…" : "Elegir carpeta…"}
				</DropdownMenuItem>
				{hasFolder && (
					<DropdownMenuItem onClick={restore}>
						Restaurar desde la carpeta
					</DropdownMenuItem>
				)}
				{hasFolder && (
					<DropdownMenuItem onClick={() => void folderBackup.stop()}>
						Dejar de copiar
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
