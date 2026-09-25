import type { ParamValues } from "@/params";

export type TextFormat = "bold" | "italic" | "underline" | "strikethrough";

export const TEXT_FORMATS: readonly TextFormat[] = [
	"bold",
	"italic",
	"underline",
	"strikethrough",
];

const FORMAT_PARAM: Record<TextFormat, "fontWeight" | "fontStyle" | "textDecoration"> = {
	bold: "fontWeight",
	italic: "fontStyle",
	underline: "textDecoration",
	strikethrough: "textDecoration",
};

const FORMAT_ON_VALUE: Record<TextFormat, string> = {
	bold: "bold",
	italic: "italic",
	underline: "underline",
	strikethrough: "line-through",
};

const FORMAT_OFF_VALUE: Record<TextFormat, string> = {
	bold: "normal",
	italic: "normal",
	underline: "none",
	strikethrough: "none",
};

export function getTextFormatParam(format: TextFormat) {
	return FORMAT_PARAM[format];
}

export function isTextFormatActive({
	params,
	format,
}: {
	params: ParamValues;
	format: TextFormat;
}): boolean {
	return params[FORMAT_PARAM[format]] === FORMAT_ON_VALUE[format];
}

/**
 * Param patch that toggles one format. Underline and strikethrough share the
 * textDecoration param, so turning one on replaces the other.
 */
export function toggleTextFormat({
	params,
	format,
}: {
	params: ParamValues;
	format: TextFormat;
}): { key: "fontWeight" | "fontStyle" | "textDecoration"; value: string } {
	const key = FORMAT_PARAM[format];
	const value = isTextFormatActive({ params, format })
		? FORMAT_OFF_VALUE[format]
		: FORMAT_ON_VALUE[format];
	return { key, value };
}
