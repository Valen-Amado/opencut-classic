import { getPersistedKeybindingsState } from "../persisted-state";

/** Text formatting shortcuts added in v8; existing bindings for these keys win. */
export const V8_TEXT_FORMAT_SHORTCUTS: Record<string, string> = {
	"ctrl+b": "toggle-text-bold",
	"ctrl+i": "toggle-text-italic",
	"ctrl+u": "toggle-text-underline",
	"ctrl+shift+x": "toggle-text-strikethrough",
};

export function v7ToV8({ state }: { state: unknown }): unknown {
	const v7 = getPersistedKeybindingsState({ state });
	if (!v7) return state;
	const keybindings = { ...v7.keybindings };

	for (const [key, action] of Object.entries(V8_TEXT_FORMAT_SHORTCUTS)) {
		if (keybindings[key] === undefined) {
			keybindings[key] = action;
		}
	}

	return { ...v7, keybindings };
}
