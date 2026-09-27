/**
 * UI state for the timeline
 * For core logic, use EditorCore instead.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MediaTime } from "@/wasm";

interface TimelineStore {
	snappingEnabled: boolean;
	toggleSnapping: () => void;
	rippleEditingEnabled: boolean;
	toggleRippleEditing: () => void;
	/** Hovering the timeline previews that frame without moving the playhead. */
	skimmingEnabled: boolean;
	toggleSkimming: () => void;
	/** Time under the pointer while skimming (ticks), or null. Not persisted. */
	skimTime: MediaTime | null;
	setSkimTime: (time: MediaTime | null) => void;
	expandedElementIds: Set<string>;
	toggleElementExpanded: (elementId: string) => void;
}

export const useTimelineStore = create<TimelineStore>()(
	persist(
		(set) => ({
			snappingEnabled: true,

			toggleSnapping: () => {
				set((state) => ({ snappingEnabled: !state.snappingEnabled }));
			},

			rippleEditingEnabled: false,

			toggleRippleEditing: () => {
				set((state) => ({
					rippleEditingEnabled: !state.rippleEditingEnabled,
				}));
			},

			skimmingEnabled: true,

			toggleSkimming: () => {
				set((state) => ({
					skimmingEnabled: !state.skimmingEnabled,
					skimTime: null,
				}));
			},

			skimTime: null,

			setSkimTime: (time) => {
				set((state) => (state.skimTime === time ? state : { skimTime: time }));
			},

			expandedElementIds: new Set<string>(),

			toggleElementExpanded: (elementId) => {
				set((state) => {
					const next = new Set(state.expandedElementIds);
					if (next.has(elementId)) {
						next.delete(elementId);
					} else {
						next.add(elementId);
					}
					return { expandedElementIds: next };
				});
			},
		}),
		{
			name: "timeline-store",
			partialize: (state) => ({
				snappingEnabled: state.snappingEnabled,
				rippleEditingEnabled: state.rippleEditingEnabled,
				skimmingEnabled: state.skimmingEnabled,
			}),
		},
	),
);
