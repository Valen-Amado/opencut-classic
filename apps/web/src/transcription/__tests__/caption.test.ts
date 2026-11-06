import { describe, expect, test } from "bun:test";
import { buildCaptionChunks } from "@/transcription/caption";
import { MAX_CAPTION_CHARS } from "@/transcription/caption-defaults";

const texts = (segments: { text: string; start: number; end: number }[]) =>
	buildCaptionChunks({ segments }).map(({ text }) => text);

describe("buildCaptionChunks", () => {
	test("keeps a short phrase whole instead of leaving a word alone", () => {
		expect(
			texts([{ text: " Hola a todos, bienvenidos", start: 0, end: 2 }]),
		).toEqual(["Hola a todos, bienvenidos"]);
	});

	test("cuts long speech into readable phrases", () => {
		const captions = texts([
			{
				text: " Todas las prendas mencionadas anteriormente las puedes encontrar en el enlace de nuestra biografía son de la marca GymShark que no llega a Colombia, pero nosotros las traemos por ti.",
				start: 0,
				end: 10,
			},
		]);

		expect(captions).toContain("pero nosotros las traemos por ti.");
		for (const caption of captions) {
			expect(caption.length).toBeLessThanOrEqual(MAX_CAPTION_CHARS);
			expect(caption.split(" ").length).toBeGreaterThan(1);
			expect(caption).not.toMatch(/ (de|la|el|en|a|que|y|las)$/);
		}
	});

	test("joins a sentence that Whisper split across segments", () => {
		expect(
			texts([
				{ text: " Vamos a ver la", start: 0, end: 1 },
				{ text: " colección nueva.", start: 1, end: 2 },
			]),
		).toEqual(["Vamos a ver la colección nueva."]);
	});

	test("starts a new caption at each sentence", () => {
		expect(
			texts([
				{
					text: " Esta es la primera frase. Y esta es la segunda frase.",
					start: 0,
					end: 4,
				},
			]),
		).toEqual(["Esta es la primera frase.", "Y esta es la segunda frase."]);
	});

	test("does not leave a one word sentence alone mid speech", () => {
		expect(
			texts([{ text: " Bueno. Vamos a empezar ya", start: 0, end: 2 }]),
		).toEqual(["Bueno. Vamos a empezar ya"]);
	});

	test("never holds a caption across a pause", () => {
		const captions = buildCaptionChunks({
			segments: [
				{ text: " Primera parte", start: 0, end: 1 },
				{ text: " segunda parte", start: 3, end: 4 },
			],
		});

		expect(captions.map(({ text }) => text)).toEqual([
			"Primera parte",
			"segunda parte",
		]);
		expect(captions[0].startTime + captions[0].duration).toBeLessThanOrEqual(3);
	});

	test("captions in a phrase touch and never overlap", () => {
		const captions = buildCaptionChunks({
			segments: [
				{
					text: " Esta es una frase bastante larga para que se parta. Y esta también es muy larga para partirse.",
					start: 1,
					end: 7,
				},
			],
		});

		expect(captions.length).toBeGreaterThan(1);
		captions.slice(1).forEach((caption, index) => {
			const previous = captions[index];
			expect(previous.startTime + previous.duration).toBeCloseTo(
				caption.startTime,
			);
		});
	});

	test("handles a segment without an end and empty segments", () => {
		const captions = buildCaptionChunks({
			segments: [
				{ text: "   ", start: 0, end: 1 },
				{ text: " Hasta luego", start: 2, end: 2 },
			],
		});

		expect(captions).toHaveLength(1);
		expect(captions[0].startTime).toBe(2);
		expect(captions[0].duration).toBeGreaterThan(0);
	});

	test("keeps a word longer than the limit instead of dropping it", () => {
		const word = "a".repeat(MAX_CAPTION_CHARS + 10);
		expect(texts([{ text: ` ${word}`, start: 0, end: 1 }])).toEqual([word]);
	});
});
