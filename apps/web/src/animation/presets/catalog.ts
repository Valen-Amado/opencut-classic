/**
 * Animation presets: entrance (in), exit (out) and loop animations expressed
 * as keyframe points relative to the element's own values. Pure data + math,
 * no editor state, so it can be tested and later moved to Rust as-is.
 */

export type AnimationPresetSlot = "in" | "out" | "loop";
export type PresetEase = "linear" | "smooth" | "ease-in" | "ease-out" | "ease-in-out";

export const PRESET_EASE_CURVES: Record<PresetEase, [number, number, number, number]> = {
	linear: [0, 0, 1, 1],
	smooth: [0.25, 0.1, 0.25, 1],
	"ease-in": [0.8, 0, 1, 1],
	"ease-out": [0, 0, 0.2, 1],
	"ease-in-out": [0.4, 0, 0.2, 1],
};

/** Values the animation returns to (the element's own transform at rest). */
export interface PresetBase {
	opacity: number;
	positionX: number;
	positionY: number;
	scaleX: number;
	scaleY: number;
	rotate: number;
	letterSpacing: number;
}

export interface PresetCanvas {
	width: number;
	height: number;
}

type Point = readonly [ratio: number, value: number, ease?: PresetEase];

export interface PresetTrack {
	path: string;
	points: readonly Point[];
	ease?: PresetEase;
	/** Loop only: added to the values once per cycle (continuous spin). */
	cumulative?: number;
}

interface EntryPreset {
	group: string;
	in: string;
	/** Label of the mirrored exit animation; null when it has no exit variant. */
	out: string | null;
	textOnly?: boolean;
	ease?: PresetEase;
	tracks: (input: { base: PresetBase; canvas: PresetCanvas }) => PresetTrack[];
}

interface LoopPreset {
	group: string;
	label: string;
	tracks: (input: { base: PresetBase; canvas: PresetCanvas }) => PresetTrack[];
}

const fade = ({ base: b, until = 1 }: { base: PresetBase; until?: number }): PresetTrack => ({
	path: "opacity",
	points: [
		[0, 0],
		[until, b.opacity],
	],
});

const scale = ({
	base: b,
	points,
}: {
	base: PresetBase;
	points: ReadonlyArray<readonly [number, number]>;
}): PresetTrack[] => [
	{ path: "transform.scaleX", points: points.map(([r, k]) => [r, b.scaleX * k] as const) },
	{ path: "transform.scaleY", points: points.map(([r, k]) => [r, b.scaleY * k] as const) },
];

const move = ({
	path,
	from,
	to,
}: {
	path: "transform.positionX" | "transform.positionY";
	from: number;
	to: number;
}): PresetTrack => ({
	path,
	points: [
		[0, from],
		[1, to],
	],
});

export const ENTRY_PRESETS: Record<string, EntryPreset> = {
	fade: { group: "Básicas", in: "Aparecer", out: "Desvanecer", tracks: ({ base: b }) => [fade({ base: b })] },
	rise: { group: "Básicas", in: "Elevar", out: "Hundir", tracks: ({ base: b }) => [move({ path: "transform.positionY", from: b.positionY + 60, to: b.positionY }), fade({ base: b })] },
	drop: { group: "Básicas", in: "Descender", out: "Levantar", tracks: ({ base: b }) => [move({ path: "transform.positionY", from: b.positionY - 60, to: b.positionY }), fade({ base: b })] },
	"slide-up": { group: "Deslizar", in: "Desde abajo", out: "Hacia abajo", tracks: ({ base: b, canvas: c }) => [move({ path: "transform.positionY", from: b.positionY + c.height * 0.15, to: b.positionY }), fade({ base: b, until: 0.6 })] },
	"slide-down": { group: "Deslizar", in: "Desde arriba", out: "Hacia arriba", tracks: ({ base: b, canvas: c }) => [move({ path: "transform.positionY", from: b.positionY - c.height * 0.15, to: b.positionY }), fade({ base: b, until: 0.6 })] },
	"slide-left": { group: "Deslizar", in: "Desde la derecha", out: "Hacia la derecha", tracks: ({ base: b, canvas: c }) => [move({ path: "transform.positionX", from: b.positionX + c.width * 0.2, to: b.positionX }), fade({ base: b, until: 0.6 })] },
	"slide-right": { group: "Deslizar", in: "Desde la izquierda", out: "Hacia la izquierda", tracks: ({ base: b, canvas: c }) => [move({ path: "transform.positionX", from: b.positionX - c.width * 0.2, to: b.positionX }), fade({ base: b, until: 0.6 })] },
	"zoom-in": { group: "Escala", in: "Acercar", out: "Encoger", tracks: ({ base: b }) => [...scale({ base: b, points: [[0, 0.6], [1, 1]] }), fade({ base: b })] },
	"zoom-out": { group: "Escala", in: "Alejar", out: "Agrandar", tracks: ({ base: b }) => [...scale({ base: b, points: [[0, 1.4], [1, 1]] }), fade({ base: b })] },
	pop: { group: "Escala", in: "Rebote", out: "Rebote", tracks: ({ base: b }) => [...scale({ base: b, points: [[0, 0.2], [0.6, 1.12], [1, 1]] }), fade({ base: b, until: 0.3 })] },
	elastic: { group: "Escala", in: "Elástico", out: "Elástico", ease: "smooth", tracks: ({ base: b }) => [...scale({ base: b, points: [[0, 0.3], [0.4, 1.18], [0.6, 0.92], [0.8, 1.04], [1, 1]] }), fade({ base: b, until: 0.25 })] },
	stretch: {
		group: "Escala",
		in: "Estirar",
		out: "Estirar",
		ease: "smooth",
		tracks: ({ base: b }) => [
			{ path: "transform.scaleX", points: [[0, b.scaleX * 1.6], [0.6, b.scaleX * 0.9], [1, b.scaleX]] },
			{ path: "transform.scaleY", points: [[0, b.scaleY * 0.4], [0.6, b.scaleY * 1.1], [1, b.scaleY]] },
			fade({ base: b, until: 0.4 }),
		],
	},
	spin: { group: "Giro y volteo", in: "Girar", out: "Girar", tracks: ({ base: b }) => [{ path: "transform.rotate", points: [[0, b.rotate - 90], [1, b.rotate]] }, fade({ base: b })] },
	roll: {
		group: "Giro y volteo",
		in: "Rodar",
		out: "Rodar",
		tracks: ({ base: b, canvas: c }) => [
			move({ path: "transform.positionX", from: b.positionX - c.width * 0.2, to: b.positionX }),
			{ path: "transform.rotate", points: [[0, b.rotate - 180], [1, b.rotate]] },
			fade({ base: b, until: 0.5 }),
		],
	},
	"swing-in": {
		group: "Giro y volteo",
		in: "Péndulo",
		out: "Péndulo",
		ease: "smooth",
		tracks: ({ base: b }) => [
			{ path: "transform.rotate", points: [[0, b.rotate - 35], [0.45, b.rotate + 14], [0.7, b.rotate - 6], [0.88, b.rotate + 2], [1, b.rotate]] },
			fade({ base: b, until: 0.2 }),
		],
	},
	"flip-x": { group: "Giro y volteo", in: "Voltear horizontal", out: "Voltear horizontal", tracks: ({ base: b }) => [{ path: "transform.scaleX", points: [[0, 0.01], [1, b.scaleX]] }] },
	"flip-y": { group: "Giro y volteo", in: "Voltear vertical", out: "Voltear vertical", tracks: ({ base: b }) => [{ path: "transform.scaleY", points: [[0, 0.01], [1, b.scaleY]] }] },
	"bounce-drop": {
		group: "Dinámicas",
		in: "Caída con rebote",
		out: null,
		tracks: ({ base: b, canvas: c }) => [
			{
				path: "transform.positionY",
				points: [
					[0, b.positionY - c.height * 0.35, "ease-in"],
					[0.5, b.positionY, "ease-out"],
					[0.68, b.positionY - c.height * 0.06, "ease-in"],
					[0.84, b.positionY, "ease-out"],
					[0.93, b.positionY - c.height * 0.015, "ease-in"],
					[1, b.positionY],
				],
			},
			fade({ base: b, until: 0.15 }),
		],
	},
	"shake-in": {
		group: "Dinámicas",
		in: "Sacudida",
		out: "Sacudida",
		ease: "smooth",
		tracks: ({ base: b }) => [
			{ path: "transform.positionX", points: [[0, b.positionX - 40], [0.2, b.positionX + 30], [0.4, b.positionX - 20], [0.6, b.positionX + 12], [0.8, b.positionX - 5], [1, b.positionX]] },
			fade({ base: b, until: 0.3 }),
		],
	},
	"soft-rise": {
		group: "Dinámicas",
		in: "Aparición suave",
		out: "Desaparición suave",
		tracks: ({ base: b }) => [...scale({ base: b, points: [[0, 1.08], [1, 1]] }), move({ path: "transform.positionY", from: b.positionY + 24, to: b.positionY }), fade({ base: b })],
	},
	tracking: {
		group: "Texto",
		in: "Expandir letras",
		out: "Expandir letras",
		textOnly: true,
		tracks: ({ base: b }) => [{ path: "letterSpacing", points: [[0, b.letterSpacing + 12], [1, b.letterSpacing]] }, fade({ base: b, until: 0.6 })],
	},
	"tracking-in": {
		group: "Texto",
		in: "Contraer letras",
		out: "Contraer letras",
		textOnly: true,
		tracks: ({ base: b }) => [{ path: "letterSpacing", points: [[0, b.letterSpacing - 4], [1, b.letterSpacing]] }, fade({ base: b, until: 0.6 })],
	},
};

export const LOOP_PRESETS: Record<string, LoopPreset> = {
	pulse: { group: "Suaves", label: "Pulso", tracks: ({ base: b }) => scale({ base: b, points: [[0, 1], [0.5, 1.08], [1, 1]] }) },
	breathe: { group: "Suaves", label: "Respirar", tracks: ({ base: b }) => [...scale({ base: b, points: [[0, 1], [0.5, 1.04], [1, 1]] }), { path: "opacity", points: [[0, b.opacity], [0.5, b.opacity * 0.78], [1, b.opacity]] }] },
	float: { group: "Suaves", label: "Flotar", tracks: ({ base: b }) => [{ path: "transform.positionY", points: [[0, b.positionY], [0.5, b.positionY - 24], [1, b.positionY]] }] },
	blink: { group: "Suaves", label: "Parpadeo", tracks: ({ base: b }) => [{ path: "opacity", points: [[0, b.opacity], [0.5, b.opacity * 0.25], [1, b.opacity]] }] },
	swing: { group: "Suaves", label: "Balanceo", tracks: ({ base: b }) => [{ path: "transform.rotate", points: [[0, b.rotate - 6], [0.5, b.rotate + 6], [1, b.rotate - 6]] }] },
	heartbeat: { group: "Enérgicas", label: "Latido", tracks: ({ base: b }) => scale({ base: b, points: [[0, 1], [0.14, 1.14], [0.28, 1], [0.42, 1.1], [0.6, 1], [1, 1]] }) },
	bounce: {
		group: "Enérgicas",
		label: "Saltar",
		tracks: ({ base: b }) => [
			{
				path: "transform.positionY",
				points: [[0, b.positionY, "ease-out"], [0.3, b.positionY - 40, "ease-in"], [0.5, b.positionY, "ease-out"], [0.62, b.positionY - 10, "ease-in"], [0.74, b.positionY], [1, b.positionY]],
			},
		],
	},
	wiggle: { group: "Enérgicas", label: "Menear", tracks: ({ base: b }) => [{ path: "transform.rotate", points: [[0, b.rotate], [0.1, b.rotate + 8], [0.2, b.rotate - 8], [0.3, b.rotate + 5], [0.4, b.rotate - 5], [0.5, b.rotate], [1, b.rotate]] }] },
	shake: { group: "Enérgicas", label: "Temblar", tracks: ({ base: b }) => [{ path: "transform.positionX", points: [[0, b.positionX], [0.1, b.positionX - 10], [0.2, b.positionX + 10], [0.3, b.positionX - 8], [0.4, b.positionX + 8], [0.5, b.positionX - 4], [0.6, b.positionX], [1, b.positionX]] }] },
	jelly: {
		group: "Enérgicas",
		label: "Gelatina",
		tracks: ({ base: b }) => [
			{ path: "transform.scaleX", points: [[0, b.scaleX], [0.3, b.scaleX * 1.18], [0.45, b.scaleX * 0.88], [0.6, b.scaleX * 1.06], [0.75, b.scaleX * 0.97], [1, b.scaleX]] },
			{ path: "transform.scaleY", points: [[0, b.scaleY], [0.3, b.scaleY * 0.85], [0.45, b.scaleY * 1.1], [0.6, b.scaleY * 0.95], [0.75, b.scaleY * 1.02], [1, b.scaleY]] },
		],
	},
	spin: { group: "Enérgicas", label: "Girar", tracks: ({ base: b }) => [{ path: "transform.rotate", points: [[0, b.rotate], [1, b.rotate + 360]], ease: "linear", cumulative: 360 }] },
};

export interface PresetOption {
	id: string;
	label: string;
	group: string;
}

export function listAnimationPresets({
	slot,
	isText,
}: {
	slot: AnimationPresetSlot;
	isText: boolean;
}): PresetOption[] {
	if (slot === "loop") {
		return Object.entries(LOOP_PRESETS).map(([id, preset]) => ({ id, label: preset.label, group: preset.group }));
	}
	return Object.entries(ENTRY_PRESETS).flatMap(([id, preset]) => {
		if (preset.textOnly && !isText) return [];
		const label = slot === "in" ? preset.in : preset.out;
		return label ? [{ id, label, group: preset.group }] : [];
	});
}

export function getAnimationPresetLabel({
	slot,
	presetId,
}: {
	slot: AnimationPresetSlot;
	presetId: string;
}): string | null {
	if (slot === "loop") return LOOP_PRESETS[presetId]?.label ?? null;
	const preset = ENTRY_PRESETS[presetId];
	return (slot === "in" ? preset?.in : preset?.out) ?? null;
}

export interface GeneratedPresetKeyframe {
	path: string;
	/** Element-local time in ticks, snapped to a frame. */
	time: number;
	value: number;
	ease: PresetEase;
}

/**
 * Keyframes for a preset. `in` animates from 0 to `presetTicks`, `out` is the
 * same curve mirrored to end at `elementTicks`, and `loop` repeats one cycle of
 * `presetTicks` for the whole element. Later points at the same frame win.
 */
export function buildPresetKeyframes({
	slot,
	presetId,
	base,
	canvas,
	presetTicks,
	elementTicks,
	frameTicks,
}: {
	slot: AnimationPresetSlot;
	presetId: string;
	base: PresetBase;
	canvas: PresetCanvas;
	presetTicks: number;
	elementTicks: number;
	frameTicks: number;
}): GeneratedPresetKeyframe[] {
	const snap = (ticks: number) => Math.round(ticks / frameTicks) * frameTicks;
	const byPathAndTime = new Map<string, GeneratedPresetKeyframe>();
	const add = (keyframe: GeneratedPresetKeyframe) => {
		if (keyframe.time < 0 || keyframe.time > elementTicks) return;
		byPathAndTime.set(`${keyframe.path}@${keyframe.time}`, keyframe);
	};

	if (slot === "loop") {
		const preset = LOOP_PRESETS[presetId];
		if (!preset || presetTicks <= 0) return [];
		for (const track of preset.tracks({ base, canvas })) {
			for (let cycle = 0; cycle * presetTicks <= elementTicks; cycle++) {
				for (const [ratio, value, ease] of track.points) {
					if (cycle > 0 && ratio === 0) continue;
					add({
						path: track.path,
						time: snap((cycle + ratio) * presetTicks),
						value: value + (track.cumulative ?? 0) * cycle,
						ease: ease ?? track.ease ?? "smooth",
					});
				}
			}
		}
	} else {
		const preset = ENTRY_PRESETS[presetId];
		if (!preset || (slot === "out" && !preset.out)) return [];
		const fallback: PresetEase = slot === "in" ? "ease-out" : "ease-in";
		for (const track of preset.tracks({ base, canvas })) {
			for (const [ratio, value, ease] of track.points) {
				const offset = snap(ratio * presetTicks);
				add({
					path: track.path,
					time: slot === "in" ? offset : elementTicks - offset,
					value,
					ease: ease ?? track.ease ?? preset.ease ?? fallback,
				});
			}
		}
	}

	return [...byPathAndTime.values()].sort((a, b) => a.path.localeCompare(b.path) || a.time - b.time);
}

/** Longest duration a preset may take given the other slot already applied. */
export function clampPresetTicks({
	slot,
	presetTicks,
	elementTicks,
	hasOppositeSlot,
}: {
	slot: AnimationPresetSlot;
	presetTicks: number;
	elementTicks: number;
	hasOppositeSlot: boolean;
}): number {
	if (slot === "loop") return Math.max(1, presetTicks);
	const max = hasOppositeSlot ? Math.floor(elementTicks / 2) : elementTicks;
	return Math.max(1, Math.min(presetTicks, max));
}
