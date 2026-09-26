import type { ParamValues } from "@/params";

/** Params that make up a reusable text style (everything but the content). */
export const TEXT_STYLE_PARAM_KEYS = [
	"fontFamily",
	"fontSize",
	"color",
	"textAlign",
	"fontWeight",
	"fontStyle",
	"textDecoration",
	"letterSpacing",
	"lineHeight",
	"background.enabled",
	"background.color",
	"background.cornerRadius",
	"background.paddingX",
	"background.paddingY",
	"background.offsetX",
	"background.offsetY",
	"shadow.enabled",
	"shadow.color",
	"shadow.opacity",
	"shadow.blur",
	"shadow.distance",
	"shadow.angle",
] as const;

export interface SavedTextStyle {
	id: string;
	name: string;
	params: ParamValues;
}

export function extractTextStyle({ params }: { params: ParamValues }): ParamValues {
	const style: ParamValues = {};
	for (const key of TEXT_STYLE_PARAM_KEYS) {
		const value = params[key];
		if (value !== undefined) style[key] = value;
	}
	return style;
}

/** Applies a style on top of existing params, keeping the content and other params. */
export function applyTextStyle({
	params,
	style,
}: {
	params: ParamValues;
	style: ParamValues;
}): ParamValues {
	return { ...params, ...extractTextStyle({ params: style }) };
}

export function getNextStyleName({ styles }: { styles: readonly SavedTextStyle[] }): string {
	const taken = new Set(styles.map((style) => style.name));
	let index = styles.length + 1;
	while (taken.has(`Estilo ${index}`)) index++;
	return `Estilo ${index}`;
}
