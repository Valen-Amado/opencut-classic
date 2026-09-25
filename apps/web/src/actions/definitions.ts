import type { ShortcutKey } from "@/actions/keybinding";
import type { TActionWithOptionalArgs } from "./types";

export type TActionCategory =
	| "playback"
	| "navigation"
	| "editing"
	| "selection"
	| "history"
	| "timeline"
	| "controls"
	| "assets";

export interface TActionBaseDefinition {
	description: string;
	category: TActionCategory;
	args?: Record<string, unknown>;
}

export interface TActionDefinition extends TActionBaseDefinition {
	defaultShortcuts?: readonly ShortcutKey[];
}

export const ACTIONS = {
	"toggle-play": {
		description: "Reproducir/Pausar",
		category: "playback",
	},
	"stop-playback": {
		description: "Detener la reproducción",
		category: "playback",
	},
	"seek-forward": {
		description: "Avanzar 1 segundo",
		category: "playback",
		args: { seconds: "number" },
	},
	"seek-backward": {
		description: "Retroceder 1 segundo",
		category: "playback",
		args: { seconds: "number" },
	},
	"frame-step-forward": {
		description: "Avanzar un fotograma",
		category: "navigation",
	},
	"frame-step-backward": {
		description: "Retroceder un fotograma",
		category: "navigation",
	},
	"jump-forward": {
		description: "Avanzar 5 segundos",
		category: "navigation",
		args: { seconds: "number" },
	},
	"jump-backward": {
		description: "Retroceder 5 segundos",
		category: "navigation",
		args: { seconds: "number" },
	},
	"goto-start": {
		description: "Ir al inicio de la línea de tiempo",
		category: "navigation",
	},
	"goto-end": {
		description: "Ir al final de la línea de tiempo",
		category: "navigation",
	},
	split: {
		description: "Dividir los elementos en el cabezal",
		category: "editing",
	},
	"split-left": {
		description: "Dividir y quitar la parte izquierda",
		category: "editing",
	},
	"split-right": {
		description: "Dividir y quitar la parte derecha",
		category: "editing",
	},
	"delete-selected": {
		description: "Eliminar la selección actual",
		category: "editing",
	},
	"copy-selected": {
		description: "Copiar los elementos seleccionados",
		category: "editing",
	},
	"paste-copied": {
		description: "Pegar elementos en el cabezal",
		category: "editing",
	},
	"toggle-snapping": {
		description: "Activar o desactivar el ajuste automático",
		category: "editing",
	},
	"toggle-ripple-editing": {
		description: "Activar o desactivar la edición en cascada",
		category: "editing",
	},
	"toggle-source-audio": {
		description: "Extraer o recuperar el audio original",
		category: "editing",
	},
	"select-all": {
		description: "Seleccionar todos los elementos",
		category: "selection",
	},
	"cancel-interaction": {
		description: "Cancelar la interacción actual",
		category: "controls",
	},
	"deselect-all": {
		description: "Deseleccionar todos los elementos",
		category: "selection",
	},
	"duplicate-selected": {
		description: "Duplicar el elemento seleccionado",
		category: "selection",
	},
	"toggle-elements-muted-selected": {
		description: "Silenciar o activar el sonido de los elementos seleccionados",
		category: "selection",
	},
	"toggle-elements-visibility-selected": {
		description: "Mostrar u ocultar los elementos seleccionados",
		category: "selection",
	},
	"toggle-text-bold": {
		description: "Negrita en el texto seleccionado",
		category: "editing",
	},
	"toggle-text-italic": {
		description: "Cursiva en el texto seleccionado",
		category: "editing",
	},
	"toggle-text-underline": {
		description: "Subrayar el texto seleccionado",
		category: "editing",
	},
	"toggle-text-strikethrough": {
		description: "Tachar el texto seleccionado",
		category: "editing",
	},
	"toggle-bookmark": {
		description: "Añadir o quitar un marcador en el cabezal",
		category: "timeline",
	},
	undo: {
		description: "Deshacer",
		category: "history",
	},
	redo: {
		description: "Rehacer",
		category: "history",
	},
	"remove-media-asset": {
		description: "Quitar el recurso",
		category: "assets",
		args: { projectId: "string", assetId: "string" },
	},
	"remove-media-assets": {
		description: "Quitar los recursos",
		category: "assets",
		args: { projectId: "string", assetIds: "string[]" },
	},
} as const satisfies Record<string, TActionBaseDefinition>;

export type TAction = keyof typeof ACTIONS;

/**
 * Actions whose arguments are mandatory, so they can never be bound to a
 * keybinding. Keep in sync with the required entries of `TActionArgsMap`; the
 * `satisfies` clause rejects anything that is not one of them.
 */
const ACTIONS_WITH_REQUIRED_ARGS = [
	"remove-media-asset",
	"remove-media-assets",
] as const satisfies readonly Exclude<TAction, TActionWithOptionalArgs>[];

const ACTIONS_WITH_REQUIRED_ARGS_SET: ReadonlySet<string> = new Set(
	ACTIONS_WITH_REQUIRED_ARGS,
);

export function isActionWithOptionalArgs(
	value: string,
): value is TActionWithOptionalArgs {
	return (
		Object.hasOwn(ACTIONS, value) && !ACTIONS_WITH_REQUIRED_ARGS_SET.has(value)
	);
}

const ACTION_DEFAULT_SHORTCUTS = [
	["toggle-play", ["space", "k"]],
	["seek-forward", ["l"]],
	["seek-backward", ["j"]],
	["frame-step-forward", ["right"]],
	["frame-step-backward", ["left"]],
	["jump-forward", ["shift+right"]],
	["jump-backward", ["shift+left"]],
	["goto-start", ["home", "enter"]],
	["goto-end", ["end"]],
	["split", ["s"]],
	["split-left", ["q"]],
	["split-right", ["w"]],
	["delete-selected", ["backspace", "delete"]],
	["copy-selected", ["ctrl+c"]],
	["paste-copied", ["ctrl+v"]],
	["toggle-snapping", ["n"]],
	["select-all", ["ctrl+a"]],
	["cancel-interaction", ["escape"]],
	["duplicate-selected", ["ctrl+d"]],
	["toggle-text-bold", ["ctrl+b"]],
	["toggle-text-italic", ["ctrl+i"]],
	["toggle-text-underline", ["ctrl+u"]],
	["toggle-text-strikethrough", ["ctrl+shift+x"]],
	["undo", ["ctrl+z"]],
	["redo", ["ctrl+shift+z", "ctrl+y"]],
] as const satisfies ReadonlyArray<
	readonly [TActionWithOptionalArgs, readonly ShortcutKey[]]
>;

const ACTION_DEFAULT_SHORTCUTS_BY_ACTION = new Map<
	TAction,
	readonly ShortcutKey[]
>(ACTION_DEFAULT_SHORTCUTS);

export function getActionDefinition({
	action,
}: {
	action: TAction;
}): TActionDefinition {
	return {
		...ACTIONS[action],
		defaultShortcuts: ACTION_DEFAULT_SHORTCUTS_BY_ACTION.get(action),
	};
}

export function getDefaultShortcuts(): Map<
	ShortcutKey,
	TActionWithOptionalArgs
> {
	const shortcuts = new Map<ShortcutKey, TActionWithOptionalArgs>();

	for (const [action, defaultShortcuts] of ACTION_DEFAULT_SHORTCUTS) {
		for (const shortcut of defaultShortcuts) {
			shortcuts.set(shortcut, action);
		}
	}

	return shortcuts;
}
