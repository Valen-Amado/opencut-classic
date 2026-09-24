import { HugeiconsIcon } from "@hugeicons/react";
import { Settings05Icon } from "@hugeicons/core-free-icons";

export function EmptyView() {
	return (
		<div className="bg-background flex h-full flex-col items-center justify-center gap-3 p-4">
			<HugeiconsIcon
				icon={Settings05Icon}
				className="text-muted-foreground/75 size-10"
				strokeWidth={1}
			/>
			<div className="flex flex-col gap-2 text-center">
				<p className="text-lg font-medium ">Aquí no hay nada</p>
				<p className="text-muted-foreground text-sm text-balance">
					Selecciona un elemento en la línea de tiempo para editar sus propiedades
				</p>
			</div>
		</div>
	);
}
