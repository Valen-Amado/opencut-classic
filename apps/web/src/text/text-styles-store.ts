import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ParamValues } from "@/params";
import { generateUUID } from "@/utils/id";
import { extractTextStyle, type SavedTextStyle } from "@/text/text-styles";

interface TextStylesState {
	styles: SavedTextStyle[];
	/** Style applied to newly added texts, if any. */
	defaultStyleId: string | null;
	addStyle: (params: { name: string; params: ParamValues }) => string;
	updateStyle: (params: { id: string; params: ParamValues }) => void;
	renameStyle: (params: { id: string; name: string }) => void;
	removeStyle: (id: string) => void;
	setDefaultStyle: (id: string | null) => void;
}

function isSavedTextStyle(value: unknown): value is SavedTextStyle {
	return (
		typeof value === "object" &&
		value !== null &&
		"id" in value &&
		typeof value.id === "string" &&
		"name" in value &&
		typeof value.name === "string" &&
		"params" in value &&
		typeof value.params === "object" &&
		value.params !== null
	);
}

/** Saved text styles, shared by every project. */
export const useTextStylesStore = create<TextStylesState>()(
	persist(
		(set) => ({
			styles: [],
			defaultStyleId: null,
			addStyle: ({ name, params }) => {
				const id = generateUUID();
				set((state) => ({
					styles: [...state.styles, { id, name, params: extractTextStyle({ params }) }],
				}));
				return id;
			},
			updateStyle: ({ id, params }) =>
				set((state) => ({
					styles: state.styles.map((style) =>
						style.id === id ? { ...style, params: extractTextStyle({ params }) } : style,
					),
				})),
			renameStyle: ({ id, name }) =>
				set((state) => ({
					styles: state.styles.map((style) =>
						style.id === id ? { ...style, name } : style,
					),
				})),
			removeStyle: (id) =>
				set((state) => ({
					styles: state.styles.filter((style) => style.id !== id),
					defaultStyleId: state.defaultStyleId === id ? null : state.defaultStyleId,
				})),
			setDefaultStyle: (id) => set({ defaultStyleId: id }),
		}),
		{
			name: "text-styles",
			version: 1,
			partialize: (state) => ({
				styles: state.styles,
				defaultStyleId: state.defaultStyleId,
			}),
			merge: (persisted, current) => {
				const state = (persisted ?? {}) as Partial<TextStylesState>;
				const styles = Array.isArray(state.styles) ? state.styles.filter(isSavedTextStyle) : [];
				const defaultStyleId =
					typeof state.defaultStyleId === "string" &&
					styles.some((style) => style.id === state.defaultStyleId)
						? state.defaultStyleId
						: null;
				return { ...current, styles, defaultStyleId };
			},
		},
	),
);

/** Params of the default style, to seed new text elements. */
export function getDefaultTextStyleParams(): ParamValues {
	const { styles, defaultStyleId } = useTextStylesStore.getState();
	return styles.find((style) => style.id === defaultStyleId)?.params ?? {};
}
