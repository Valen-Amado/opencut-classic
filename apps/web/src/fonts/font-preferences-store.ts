import { create } from "zustand";
import { persist } from "zustand/middleware";

export const MAX_RECENT_FONTS = 8;

export function toggleFavoriteFont({
	favorites,
	family,
}: {
	favorites: readonly string[];
	family: string;
}): string[] {
	return favorites.includes(family)
		? favorites.filter((name) => name !== family)
		: [family, ...favorites];
}

export function addRecentFont({
	recents,
	family,
	max = MAX_RECENT_FONTS,
}: {
	recents: readonly string[];
	family: string;
	max?: number;
}): string[] {
	return [family, ...recents.filter((name) => name !== family)].slice(0, max);
}

function sanitizeFontList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
}

interface FontPreferencesState {
	favorites: string[];
	recents: string[];
	toggleFavorite: (family: string) => void;
	addRecent: (family: string) => void;
}

/** Favorite and recently used fonts, shared by every project. */
export const useFontPreferencesStore = create<FontPreferencesState>()(
	persist(
		(set) => ({
			favorites: [],
			recents: [],
			toggleFavorite: (family) =>
				set((state) => ({
					favorites: toggleFavoriteFont({ favorites: state.favorites, family }),
				})),
			addRecent: (family) =>
				set((state) => ({
					recents: addRecentFont({ recents: state.recents, family }),
				})),
		}),
		{
			name: "font-preferences",
			version: 1,
			partialize: (state) => ({
				favorites: state.favorites,
				recents: state.recents,
			}),
			merge: (persisted, current) => {
				const state = (persisted ?? {}) as Partial<FontPreferencesState>;
				return {
					...current,
					favorites: sanitizeFontList(state.favorites),
					recents: sanitizeFontList(state.recents).slice(0, MAX_RECENT_FONTS),
				};
			},
		},
	),
);
