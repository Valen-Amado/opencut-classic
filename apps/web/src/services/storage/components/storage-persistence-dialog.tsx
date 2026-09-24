"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useStoragePersistence } from "@/services/storage/use-storage-persistence";

export function StoragePersistenceDialog() {
	const { showDialog, onConfirm, onDismiss } = useStoragePersistence();

	return (
		<Dialog open={showDialog} onOpenChange={(open) => !open && onDismiss()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>No pierdas tus proyectos</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<p className="text-base text-muted-foreground">
						Tu navegador puede eliminar tus proyectos automáticamente cuando queda
						poco almacenamiento.
					</p>
					<p className="text-base text-muted-foreground">
						¿Permites que OpenCut los proteja?
					</p>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={onDismiss}>
						Ahora no
					</Button>
					<Button onClick={onConfirm}>Permitir</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
