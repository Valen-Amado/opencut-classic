"use client";

import { createContext, useContext, type ReactNode } from "react";
import { resolveElementPlayhead, buildParamWritePatch } from "@/components/editor/panels/properties/param-write";
import { useEditor } from "@/editor/use-editor";
import type { ParamValue } from "@/params";
import { findTrackInSceneTracks, type ElementRef, type TimelineElement } from "@/timeline";

const ElementGroupContext = createContext<readonly ElementRef[] | null>(null);

/** Inside it, the properties tabs edit every listed element instead of just one. */
export function ElementGroupProvider({
	elements,
	children,
}: {
	elements: readonly ElementRef[];
	children: ReactNode;
}) {
	return <ElementGroupContext.Provider value={elements}>{children}</ElementGroupContext.Provider>;
}

export function useIsEditingGroup(): boolean {
	return useContext(ElementGroupContext) !== null;
}

/**
 * Writes for a properties tab. The element it shows is the only target, unless
 * the tab sits in a group, where each write reaches every grouped element from
 * that element's own values and playhead.
 */
export function useElementWrites({ element, trackId }: { element: TimelineElement; trackId: string }) {
	const editor = useEditor();
	const group = useContext(ElementGroupContext);
	const targets = group ?? [{ trackId, elementId: element.id }];

	const eachTarget = <T,>(build: (target: ElementRef, current: TimelineElement) => T | null): T[] => {
		const tracks = editor.timeline.getPreviewTracks() ?? editor.scenes.getActiveScene().tracks;
		return targets.flatMap((target) => {
			const current = findTrackInSceneTracks({ tracks, trackId: target.trackId })?.elements.find(
				(candidate) => candidate.id === target.elementId,
			);
			const result = current ? build(target, current) : null;
			return result === null ? [] : [result];
		});
	};

	return {
		/** One undo step for all targets; return null to leave an element as it is. */
		update: (buildPatch: (current: TimelineElement) => Partial<TimelineElement> | null) => {
			editor.timeline.updateElements({
				updates: eachTarget((target, current) => {
					const patch = buildPatch(current);
					return patch ? { ...target, patch } : null;
				}),
			});
		},
		previewParam: ({ key, value }: { key: string; value: ParamValue }) => {
			const playheadTime = editor.playback.getCurrentTime();
			const { fps } = editor.project.getActive().settings;
			editor.timeline.previewElements({
				updates: eachTarget((target, current) => ({
					...target,
					updates: buildParamWritePatch({
						element: current,
						values: { [key]: value },
						localTime: resolveElementPlayhead({
							startTime: current.startTime,
							duration: current.duration,
							playheadTime,
							animations: current.animations,
							fps,
						}).localTime,
					}),
				})),
			});
		},
	};
}
