import { create } from "zustand";
import type { AnimationPresetSlot } from "@/animation/presets/catalog";

interface PropertiesState {
	activeTabPerType: Record<string, string>;
	setActiveTab: (args: { elementType: string; tabId: string }) => void;
	isTransformScaleLocked: boolean;
	setTransformScaleLocked: (args: { locked: boolean }) => void;
	/** Slot shown in the Animation tab (entrance, exit or loop). */
	animationSlot: AnimationPresetSlot;
	setAnimationSlot: (args: { slot: AnimationPresetSlot }) => void;
}

export const usePropertiesStore = create<PropertiesState>()((set) => ({
	activeTabPerType: {},
	setActiveTab: ({ elementType, tabId }) =>
		set((state) => ({
			activeTabPerType: { ...state.activeTabPerType, [elementType]: tabId },
		})),
	isTransformScaleLocked: true,
	setTransformScaleLocked: ({ locked }) =>
		set({ isTransformScaleLocked: locked }),
	animationSlot: "in",
	setAnimationSlot: ({ slot }) => set({ animationSlot: slot }),
}));
