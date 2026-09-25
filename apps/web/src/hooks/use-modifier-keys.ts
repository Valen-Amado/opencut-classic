import { useEffect, useRef, useState, type RefObject } from "react";

export interface ModifierKeysState {
	shift: boolean;
	/** Ctrl on Windows/Linux, Cmd on macOS. */
	mod: boolean;
	alt: boolean;
}

const RELEASED: ModifierKeysState = { shift: false, mod: false, alt: false };

function readModifiers(event: KeyboardEvent | PointerEvent | MouseEvent): ModifierKeysState {
	return { shift: event.shiftKey, mod: event.metaKey || event.ctrlKey, alt: event.altKey };
}

/** Live modifier keys as a ref, for pointer handlers that must not re-render. */
export function useModifierKeysRef(): RefObject<ModifierKeysState> {
	const ref = useRef<ModifierKeysState>(RELEASED);

	useEffect(() => {
		const update = (event: KeyboardEvent | PointerEvent) => {
			ref.current = readModifiers(event);
		};
		const reset = () => {
			ref.current = RELEASED;
		};
		document.addEventListener("keydown", update, true);
		document.addEventListener("keyup", update, true);
		document.addEventListener("pointermove", update, true);
		window.addEventListener("blur", reset);
		return () => {
			document.removeEventListener("keydown", update, true);
			document.removeEventListener("keyup", update, true);
			document.removeEventListener("pointermove", update, true);
			window.removeEventListener("blur", reset);
		};
	}, []);

	return ref;
}

/** Whether Alt/Option is held, as state (re-renders on change). */
export function useAltKeyHeld(): boolean {
	const [isHeld, setIsHeld] = useState(false);

	useEffect(() => {
		const update = (event: KeyboardEvent) => setIsHeld(event.altKey);
		const reset = () => setIsHeld(false);
		document.addEventListener("keydown", update, true);
		document.addEventListener("keyup", update, true);
		window.addEventListener("blur", reset);
		return () => {
			document.removeEventListener("keydown", update, true);
			document.removeEventListener("keyup", update, true);
			window.removeEventListener("blur", reset);
		};
	}, []);

	return isHeld;
}
