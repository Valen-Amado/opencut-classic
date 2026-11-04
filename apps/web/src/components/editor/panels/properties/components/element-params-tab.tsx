"use client";

import { resolveAnimationPathValueAtTime } from "@/animation";
import { Section, SectionContent, SectionFields } from "@/components/section";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import { useKeyframedParamProperty } from "@/components/editor/panels/properties/hooks/use-keyframed-param-property";
import { PropertyParamField } from "@/components/editor/panels/properties/components/property-param-field";
import { useElementWrites, useIsEditingGroup } from "@/components/editor/panels/properties/element-group";
import type { ParamValue, ParamValues } from "@/params";
import {
	getElementParams,
	readElementParamValue,
	writeElementParamValue,
	type ElementParamDefinition,
} from "@/params/registry";
import type { TimelineElement } from "@/timeline";
import type { MediaTime } from "@/wasm";

export function ElementParamsTab({
	element,
	trackId,
	paramKeys,
	sectionKey,
}: {
	element: TimelineElement;
	trackId: string;
	paramKeys?: readonly string[];
	sectionKey: string;
}) {
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});
	const params = getElementParams({ element }).filter(
		(param) => !paramKeys || paramKeys.includes(param.key),
	);
	const baseValues = buildValues({ element, params });

	return (
		<Section sectionKey={`${element.id}:${sectionKey}`}>
			<SectionContent className="pt-4">
				<SectionFields>
					{params
						.filter((param) => isVisible({ param, values: baseValues }))
						.map((param) => (
							<ElementParamField
								key={param.key}
								element={element}
								trackId={trackId}
								param={param}
								baseValue={baseValues[param.key] ?? param.default}
								localTime={localTime}
								isPlayheadWithinElementRange={isPlayheadWithinElementRange}
							/>
						))}
				</SectionFields>
			</SectionContent>
		</Section>
	);
}

export interface ElementParamControl {
	value: ParamValue;
	onPreview: (value: ParamValue) => void;
	onCommit: () => void;
	keyframe?: {
		isActive: boolean;
		isDisabled: boolean;
		onToggle: () => void;
	};
}

/**
 * Resolved value plus preview/commit/keyframe handlers for one element param,
 * for tabs that lay out their controls by hand.
 */
export function useElementParamControl({
	element,
	trackId,
	param,
	localTime,
	isPlayheadWithinElementRange,
}: {
	element: TimelineElement;
	trackId: string;
	param: ElementParamDefinition;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
}): ElementParamControl {
	const isEditingGroup = useIsEditingGroup();
	const { previewParam } = useElementWrites({ element, trackId });
	const baseValue = readElementParamValue({ element, param }) ?? param.default;
	const resolvedValue = resolveAnimationPathValueAtTime({
		animations: element.animations,
		propertyPath: param.key,
		localTime,
		fallbackValue: baseValue,
	});
	const animatedParam = useKeyframedParamProperty({
		param,
		trackId,
		elementId: element.id,
		animations: element.animations,
		propertyPath: param.key,
		localTime,
		isPlayheadWithinElementRange,
		resolvedValue,
		buildBaseUpdates: ({ value }) =>
			writeElementParamValue({ element, param, value }),
	});

	return {
		value: resolvedValue,
		onPreview: isEditingGroup
			? (value) => previewParam({ key: param.key, value })
			: animatedParam.onPreview,
		onCommit: animatedParam.onCommit,
		// Each clip has its own timing, so keyframes stay a per-element edit.
		keyframe:
			param.keyframable === false || isEditingGroup
				? undefined
				: {
						isActive: animatedParam.isKeyframedAtTime,
						isDisabled: !isPlayheadWithinElementRange,
						onToggle: animatedParam.toggleKeyframe,
					},
	};
}

export function ElementParamField({
	element,
	trackId,
	param,
	localTime,
	isPlayheadWithinElementRange,
}: {
	element: TimelineElement;
	trackId: string;
	param: ElementParamDefinition;
	baseValue?: ParamValue;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
}) {
	const control = useElementParamControl({
		element,
		trackId,
		param,
		localTime,
		isPlayheadWithinElementRange,
	});

	return (
		<PropertyParamField
			param={param}
			value={control.value}
			onPreview={control.onPreview}
			onCommit={control.onCommit}
			keyframe={control.keyframe}
		/>
	);
}

export function buildValues({
	element,
	params,
}: {
	element: TimelineElement;
	params: readonly ElementParamDefinition[];
}): ParamValues {
	const values: ParamValues = {};
	for (const param of params) {
		const value = readElementParamValue({ element, param });
		if (value !== null) {
			values[param.key] = value;
		}
	}
	return values;
}

export function isVisible({
	param,
	values,
}: {
	param: ElementParamDefinition;
	values: ParamValues;
}): boolean {
	return (param.dependencies ?? []).every((dependency) =>
		areParamValuesEqual({
			left: values[dependency.param],
			right: dependency.equals,
		}),
	);
}

function areParamValuesEqual({
	left,
	right,
}: {
	left: ParamValue | undefined;
	right: ParamValue;
}): boolean {
	return left === right;
}
