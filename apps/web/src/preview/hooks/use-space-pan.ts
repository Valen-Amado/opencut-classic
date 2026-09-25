"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { invokeAction } from "@/actions";
import { isTypableDOMElement } from "@/utils/browser";

/**
 * Hold Space over the zoomed preview to pan with a left-button drag, like
 * Figma. A plain tap of Space still toggles playback: the key is held back
 * from the global shortcuts while the pointer is over the preview and
 * playback toggles on release only if no pan happened.
 */
export function useSpacePan({
	viewportRef,
	isEnabled,
}: {
	viewportRef: RefObject<HTMLElement | null>;
	isEnabled: boolean;
}) {
	const [isSpaceHeld, setIsSpaceHeld] = useState(false);
	const didPanRef = useRef(false);
	const isHeldRef = useRef(false);

	useEffect(() => {
		const isSpace = (event: KeyboardEvent) =>
			event.code === "Space" && !event.metaKey && !event.ctrlKey && !event.altKey;

		const onKeyDown = (event: KeyboardEvent) => {
			if (!isSpace(event)) return;
			if (isHeldRef.current) {
				event.preventDefault();
				event.stopImmediatePropagation();
				return;
			}
			if (!isEnabled || !viewportRef.current?.matches(":hover")) return;
			const active = document.activeElement;
			if (active instanceof HTMLElement && isTypableDOMElement({ element: active })) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			isHeldRef.current = true;
			didPanRef.current = false;
			setIsSpaceHeld(true);
		};

		const onKeyUp = (event: KeyboardEvent) => {
			if (event.code !== "Space" || !isHeldRef.current) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			isHeldRef.current = false;
			setIsSpaceHeld(false);
			if (!didPanRef.current) invokeAction("toggle-play", undefined, "keypress");
		};

		const onBlur = () => {
			isHeldRef.current = false;
			setIsSpaceHeld(false);
		};

		window.addEventListener("keydown", onKeyDown, true);
		window.addEventListener("keyup", onKeyUp, true);
		window.addEventListener("blur", onBlur);
		return () => {
			window.removeEventListener("keydown", onKeyDown, true);
			window.removeEventListener("keyup", onKeyUp, true);
			window.removeEventListener("blur", onBlur);
		};
	}, [isEnabled, viewportRef]);

	return {
		isSpaceHeld,
		markPanned: () => {
			didPanRef.current = true;
		},
	};
}
