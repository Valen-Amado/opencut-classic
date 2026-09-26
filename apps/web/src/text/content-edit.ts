import type { TextElement } from "@/timeline";

/**
 * Preview update for typing on the canvas. Preview overlays replace
 * top-level fields wholesale, so the params must carry every existing param
 * (font, color, shadow, effects…), not only the new content.
 */
export function buildContentEditUpdate({
	element,
	content,
}: {
	element: TextElement;
	content: string;
}): Pick<TextElement, "params"> {
	return { params: { ...element.params, content } };
}
