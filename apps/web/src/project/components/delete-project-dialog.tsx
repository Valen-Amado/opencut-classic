import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export function DeleteProjectDialog({
	isOpen,
	onOpenChange,
	onConfirm,
	projectNames,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	projectNames: string[];
}) {
	const count = projectNames.length;
	const isSingle = count === 1;
	const singleName = isSingle ? projectNames[0] : null;

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
			>
				<DialogHeader>
					<DialogTitle>
						{singleName ? (
							<>
								{"Delete '"}
								<span className="inline-block max-w-[300px] truncate align-bottom">
									{singleName}
								</span>
								{"'?"}
							</>
						) : (
							`Delete ${count} projects?`
						)}
					</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<Alert variant="destructive">
						<AlertTitle>Advertencia</AlertTitle>
						<AlertDescription>
							Esto eliminará definitivamente{" "}
							{singleName ? `"${singleName}"` : `${count} proyectos`} y todos los
							archivos asociados.
						</AlertDescription>
					</Alert>
					<div className="flex flex-col gap-3">
						<Label className="text-xs font-semibold text-slate-500">
							Escribe "ELIMINAR" para confirmar
						</Label>
						<Input
							type="text"
							placeholder="ELIMINAR"
							size="lg"
							variant="destructive"
						/>
					</div>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancelar
					</Button>
					<Button variant="destructive" onClick={onConfirm}>
						Eliminar el proyecto
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
