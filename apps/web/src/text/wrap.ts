/**
 * "Envolver" text effect: the text is laid on a ring that spins around the
 * element position in 3D. Glyphs on the sides are compressed by |cos θ|, the
 * back half is mirrored (it's seen from behind) and slightly faded, and the
 * ring is tilted so the back half sits higher than the front.
 *
 * Pure geometry: the renderer measures glyphs and paints them.
 */

export const WRAP_DEFAULTS = {
	/** 10–100 %, see {@link getWrapRingGeometry} */
	radius: 55,
	/** Degrees, -60–60 */
	tilt: 12,
	/** Degrees per second, -360–360 */
	spin: 60,
	/** Repeat the text to close the ring. */
	repeat: true,
	/** Hide the back half behind the subject of the video below. */
	occlude: true,
} as const;

/** Gap between copies of the text when it repeats around the ring. */
export const WRAP_REPEAT_SEPARATOR = "   ";

const MIN_SIDE_SCALE = 0.05;
const PERSPECTIVE = 0.16;
const BACK_ALPHA = 0.85;
const MAX_REPEATS = 200;

export interface WrapRingGeometry {
	/** Ring radius, in canvas pixels. */
	radius: number;
	/** Tilt of the ring towards the viewer, in radians. */
	tilt: number;
}

export function getWrapRingGeometry({
	radiusPercent,
	tiltDegrees,
	canvasWidth,
}: {
	radiusPercent: number;
	tiltDegrees: number;
	canvasWidth: number;
}): WrapRingGeometry {
	return {
		radius: (Math.max(0, radiusPercent) / 100) * canvasWidth * 0.28,
		tilt: (tiltDegrees * Math.PI) / 180,
	};
}

/** Ring rotation at `seconds` into the element, in radians. */
export function getWrapPhase({
	spinDegreesPerSecond,
	seconds,
}: {
	spinDegreesPerSecond: number;
	seconds: number;
}): number {
	return (seconds * spinDegreesPerSecond * Math.PI) / 180;
}

/** Box around the whole ring, centered on the element position. */
export function getWrapBounds({
	geometry,
	fontSize,
}: {
	geometry: WrapRingGeometry;
	fontSize: number;
}): { left: number; top: number; width: number; height: number } {
	const width = 2 * geometry.radius + fontSize;
	const height = 2 * geometry.radius * Math.abs(Math.sin(geometry.tilt)) + fontSize * 1.4;
	return { left: -width / 2, top: -height / 2, width, height };
}

/**
 * The text laid around the ring: one line, and with `repeat` as many copies
 * as fit in the circumference so the ring is closed.
 */
export function buildWrapText({
	content,
	repeat,
	circumference,
	measure,
}: {
	content: string;
	repeat: boolean;
	circumference: number;
	measure: (text: string) => number;
}): string {
	const base = content.replace(/\s*\n\s*/g, " ");
	if (!repeat || !base.trim()) return base;
	const unit = base + WRAP_REPEAT_SEPARATOR;
	if (measure(unit) <= 0) return unit;
	let text = unit;
	for (let count = 1; count < MAX_REPEATS; count++) {
		if (measure(text + unit) >= circumference) break;
		text += unit;
	}
	return text;
}

export interface WrapGlyph {
	char: string;
	/** Angle on the ring; 0 is the front center. */
	theta: number;
	/** cos θ: 1 in front, -1 at the back. */
	depth: number;
	x: number;
	y: number;
	/** Horizontal compression (negative = mirrored) and perspective. */
	scaleX: number;
	scaleY: number;
	alpha: number;
	isBack: boolean;
}

/**
 * Places each glyph of `text` on the ring, sorted back to front. Whitespace
 * takes room but isn't returned. With `fill`, the text is spread to cover
 * the whole circumference.
 */
export function layoutWrapRing({
	text,
	measure,
	geometry,
	phase,
	fill,
}: {
	text: string;
	measure: (text: string) => number;
	geometry: WrapRingGeometry;
	phase: number;
	fill: boolean;
}): WrapGlyph[] {
	const { radius, tilt } = geometry;
	if (radius <= 0) return [];
	const chars = Array.from(text);
	const widths = chars.map((char) => measure(char));
	const total = widths.reduce((sum, width) => sum + width, 0);
	if (total <= 0) return [];
	const spread = fill ? (2 * Math.PI * radius) / total : 1;

	const glyphs: WrapGlyph[] = [];
	let cursor = -total / 2;
	for (let index = 0; index < chars.length; index++) {
		const middle = cursor + widths[index] / 2;
		cursor += widths[index];
		const char = chars[index];
		if (!char.trim()) continue;
		const theta = phase + (middle * spread) / radius;
		const depth = Math.cos(theta);
		const perspective = 1 + PERSPECTIVE * depth;
		const isBack = depth < 0;
		glyphs.push({
			char,
			theta,
			depth,
			x: radius * Math.sin(theta),
			y: Math.sin(tilt) * radius * depth,
			scaleX: Math.max(MIN_SIDE_SCALE, Math.abs(depth)) * (isBack ? -1 : 1) * perspective,
			scaleY: perspective,
			alpha: isBack ? BACK_ALPHA : 1,
			isBack,
		});
	}
	return glyphs.sort((a, b) => a.depth - b.depth);
}
