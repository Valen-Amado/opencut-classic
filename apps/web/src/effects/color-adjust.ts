/**
 * Color adjustments: presets ("looks") and the math that turns effect params
 * into the `color-adjust` shader uniforms (rust/crates/effects). Pure, no
 * editor state.
 */

export const COLOR_ADJUST_EFFECT_TYPE = "color-adjust";
export const COLOR_ADJUST_SHADER = "color-adjust";

export const ADJUSTMENT_KEYS = [
	"exposure",
	"brightness",
	"contrast",
	"highlights",
	"shadows",
	"temperature",
	"tint",
	"saturation",
	"hue",
	"fade",
	"vignette",
	"grain",
] as const;

export type AdjustmentKey = (typeof ADJUSTMENT_KEYS)[number];
export type AdjustmentValues = Partial<Record<AdjustmentKey, number>>;

export const ADJUSTMENT_META: Record<AdjustmentKey, { label: string; min: number; max: number }> = {
	exposure: { label: "Exposición", min: -100, max: 100 },
	brightness: { label: "Brillo", min: -100, max: 100 },
	contrast: { label: "Contraste", min: -100, max: 100 },
	highlights: { label: "Luces", min: -100, max: 100 },
	shadows: { label: "Sombras", min: -100, max: 100 },
	temperature: { label: "Temperatura", min: -100, max: 100 },
	tint: { label: "Tinte", min: -100, max: 100 },
	saturation: { label: "Saturación", min: -100, max: 100 },
	hue: { label: "Tono", min: -180, max: 180 },
	fade: { label: "Desvanecer", min: 0, max: 100 },
	vignette: { label: "Viñeta", min: 0, max: 100 },
	grain: { label: "Grano", min: 0, max: 100 },
};

export const ADJUSTMENT_GROUPS: { label: string; keys: AdjustmentKey[] }[] = [
	{ label: "Luz", keys: ["exposure", "brightness", "contrast", "highlights", "shadows"] },
	{ label: "Color", keys: ["temperature", "tint", "saturation", "hue"] },
	{ label: "Efectos", keys: ["fade", "vignette", "grain"] },
];

export interface ColorPreset {
	id: string;
	label: string;
	group: string;
	values: AdjustmentValues;
}

export const COLOR_PRESETS: ColorPreset[] = [
	{ id: "vivid", label: "Vívido", group: "Básicos", values: { saturation: 35, contrast: 15, vignette: 10 } },
	{ id: "bright", label: "Luminoso", group: "Básicos", values: { exposure: 20, shadows: 25, contrast: -5 } },
	{ id: "soft", label: "Suave", group: "Básicos", values: { contrast: -18, fade: 25, saturation: -10 } },
	{ id: "warm", label: "Cálido", group: "Cálidos", values: { temperature: 45, saturation: 10 } },
	{ id: "sunset", label: "Atardecer", group: "Cálidos", values: { temperature: 60, tint: 15, contrast: 10, vignette: 25 } },
	{ id: "golden", label: "Hora dorada", group: "Cálidos", values: { temperature: 35, exposure: 10, highlights: -15, fade: 10 } },
	{ id: "cool", label: "Frío", group: "Fríos", values: { temperature: -45, saturation: -5 } },
	{ id: "nordic", label: "Nórdico", group: "Fríos", values: { temperature: -25, saturation: -35, fade: 20, contrast: -10 } },
	{ id: "night", label: "Noche azul", group: "Fríos", values: { temperature: -60, exposure: -20, contrast: 15, vignette: 35 } },
	{ id: "teal", label: "Teal & Orange", group: "Cine", values: { temperature: 15, tint: -12, contrast: 22, saturation: 20, hue: -8 } },
	{ id: "matte", label: "Cine mate", group: "Cine", values: { contrast: 10, fade: 35, saturation: -20, vignette: 30 } },
	{ id: "blockbuster", label: "Blockbuster", group: "Cine", values: { contrast: 32, saturation: 15, temperature: -10, vignette: 40 } },
	{ id: "bw", label: "B&N", group: "Blanco y negro", values: { saturation: -100 } },
	{ id: "bw-contrast", label: "B&N contraste", group: "Blanco y negro", values: { saturation: -100, contrast: 45, vignette: 20 } },
	{ id: "sepia", label: "Sepia", group: "Blanco y negro", values: { saturation: -100, temperature: 60, fade: 10 } },
	{ id: "vintage", label: "Vintage", group: "Retro", values: { fade: 30, temperature: 25, saturation: -25, grain: 30, vignette: 30 } },
	{ id: "film-90s", label: "Película 90s", group: "Retro", values: { contrast: 15, saturation: 10, tint: 10, grain: 45, fade: 15 } },
	{ id: "polaroid", label: "Polaroid", group: "Retro", values: { exposure: 10, fade: 35, temperature: 15, tint: -8, contrast: -10 } },
];

export function getColorPreset(id: unknown): ColorPreset | null {
	return COLOR_PRESETS.find((preset) => preset.id === id) ?? null;
}

const toNumber = ({ value, fallback = 0 }: { value: unknown; fallback?: number }) => {
	const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
	return Number.isFinite(parsed) ? parsed : fallback;
};

/** Final value of each adjustment: preset × intensity + manual offset, clamped. */
export function resolveAdjustments({
	params,
}: {
	params: Record<string, unknown>;
}): Record<AdjustmentKey, number> {
	const preset = getColorPreset(params.preset);
	const intensity = toNumber({ value: params.intensity, fallback: 100 }) / 100;
	const resolve = (key: AdjustmentKey) => {
		const { min, max } = ADJUSTMENT_META[key];
		const value = (preset?.values[key] ?? 0) * intensity + toNumber({ value: params[key] });
		return Math.min(max, Math.max(min, value));
	};
	return {
		exposure: resolve("exposure"),
		brightness: resolve("brightness"),
		contrast: resolve("contrast"),
		highlights: resolve("highlights"),
		shadows: resolve("shadows"),
		temperature: resolve("temperature"),
		tint: resolve("tint"),
		saturation: resolve("saturation"),
		hue: resolve("hue"),
		fade: resolve("fade"),
		vignette: resolve("vignette"),
		grain: resolve("grain"),
	};
}

/** Uniforms for the color-adjust shader, normalized so 0 is neutral. */
export function buildColorAdjustUniforms({
	params,
	seed = 0,
}: {
	params: Record<string, unknown>;
	seed?: number;
}): { u_light: number[]; u_color: number[]; u_fx: number[]; u_extra: number[] } {
	const a = resolveAdjustments({ params });
	const unit = (value: number) => value / 100;
	return {
		u_light: [unit(a.exposure), unit(a.brightness), unit(a.contrast), unit(a.highlights)],
		u_color: [unit(a.shadows), unit(a.temperature), unit(a.tint), unit(a.saturation)],
		u_fx: [a.hue / 180, unit(a.fade), unit(a.vignette), unit(a.grain)],
		u_extra: [seed, 0, 0, 0],
	};
}

export function isNeutralAdjustment({ params }: { params: Record<string, unknown> }): boolean {
	return Object.values(resolveAdjustments({ params })).every((value) => Math.abs(value) < 1e-6);
}
