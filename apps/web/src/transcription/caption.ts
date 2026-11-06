import type { TranscriptionSegment, CaptionChunk } from "@/transcription/types";
import {
	CAPTION_PAUSE_SECONDS,
	IDEAL_CAPTION_CHARS,
	MAX_CAPTION_CHARS,
	MIN_CAPTION_DURATION_SECONDS,
} from "@/transcription/caption-defaults";

/** Used when a segment arrives without an end, as Whisper's last one can. */
const FALLBACK_SECONDS_PER_CHAR = 0.06;

const SENTENCE_END = /[.!?…]["')\]»”]*$/;
const CLAUSE_END = /[,;:]["')\]»”]*$/;

/** A caption must not end on these: they need the word that follows. */
const DEPENDENT_WORDS = new Set(
	`a al ante bajo como con contra cuando de del desde donde e el en entre hacia
	hasta la las le les lo los mi mis muy ni no nos nuestra nuestras nuestro
	nuestros o para pero por porque que se si sin sobre su sus te tu tus u un una
	unas unos y ya
	an and are as at be but by for from has have his her if in is it its my of on
	or our so that the their to was we were with you your`.split(/\s+/),
);

/** Words that open a clause, so a caption reads well starting on them. */
const CLAUSE_OPENERS = new Set(
	`aunque cuando donde o pero porque pues que si sino y
	and because but if or so that when where which while`.split(/\s+/),
);

const COST = {
	perCaption: 0.35,
	loneWord: 3,
	spansSentence: 1.5,
	spansClause: 0.3,
	endsOnDependentWord: 2,
	endsSentence: -1,
	endsClause: -0.5,
	nextOpensClause: -0.4,
	endsSegment: -0.2,
};

interface TimedWord {
	text: string;
	start: number;
	end: number;
	endsSegment: boolean;
}

function bareWord({ word }: { word: TimedWord }): string {
	return word.text.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function joinWords({ words }: { words: TimedWord[] }): string {
	return words.map(({ text }) => text).join(" ");
}

/** Whisper only times segments, so words share them by their length. */
function toTimedWords({
	segments,
}: {
	segments: TranscriptionSegment[];
}): TimedWord[] {
	const timedWords: TimedWord[] = [];

	for (const segment of segments) {
		const texts = segment.text.trim().split(/\s+/).filter(Boolean);
		if (texts.length === 0) continue;

		const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
		const start = Math.max(segment.start, timedWords.at(-1)?.end ?? 0);
		const end =
			segment.end > start
				? segment.end
				: start + totalChars * FALLBACK_SECONDS_PER_CHAR;
		const secondsPerChar = (end - start) / totalChars;

		let cursor = start;
		texts.forEach((text, index) => {
			const wordEnd = cursor + text.length * secondsPerChar;
			timedWords.push({
				text,
				start: cursor,
				end: wordEnd,
				endsSegment: index === texts.length - 1,
			});
			cursor = wordEnd;
		});
	}

	return timedWords;
}

function splitAtPauses({ words }: { words: TimedWord[] }): TimedWord[][] {
	const phrases: TimedWord[][] = [];

	for (const word of words) {
		const phrase = phrases.at(-1);
		const previous = phrase?.at(-1);
		if (phrase && previous && word.start - previous.end < CAPTION_PAUSE_SECONDS) {
			phrase.push(word);
		} else {
			phrases.push([word]);
		}
	}

	return phrases;
}

function getCaptionCost({
	phrase,
	from,
	to,
}: {
	phrase: TimedWord[];
	from: number;
	to: number;
}): number {
	const words = phrase.slice(from, to);
	const lengthError =
		(joinWords({ words }).length - IDEAL_CAPTION_CHARS) / IDEAL_CAPTION_CHARS;
	let cost = COST.perCaption + lengthError ** 2;

	if (words.length === 1 && phrase.length > 1) cost += COST.loneWord;

	for (const word of words.slice(0, -1)) {
		if (SENTENCE_END.test(word.text)) cost += COST.spansSentence;
		else if (CLAUSE_END.test(word.text)) cost += COST.spansClause;
	}

	const lastWord = words[words.length - 1];
	const nextWord = phrase[to];
	if (!nextWord) return cost;

	if (SENTENCE_END.test(lastWord.text)) cost += COST.endsSentence;
	else if (CLAUSE_END.test(lastWord.text)) cost += COST.endsClause;
	else if (DEPENDENT_WORDS.has(bareWord({ word: lastWord }))) {
		cost += COST.endsOnDependentWord;
	}
	if (CLAUSE_OPENERS.has(bareWord({ word: nextWord }))) {
		cost += COST.nextOpensClause;
	}
	if (lastWord.endsSegment) cost += COST.endsSegment;

	return cost;
}

/** Picks the cheapest set of cuts, judging the phrase as a whole. */
function splitPhrase({ phrase }: { phrase: TimedWord[] }): TimedWord[][] {
	const bestCost = [0, ...phrase.map(() => Number.POSITIVE_INFINITY)];
	const bestCut = phrase.map(() => 0);

	for (let to = 1; to <= phrase.length; to++) {
		for (let from = to - 1; from >= 0; from--) {
			const isTooLong =
				to - from > 1 &&
				joinWords({ words: phrase.slice(from, to) }).length > MAX_CAPTION_CHARS;
			if (isTooLong) break;

			const cost = bestCost[from] + getCaptionCost({ phrase, from, to });
			if (cost < bestCost[to]) {
				bestCost[to] = cost;
				bestCut[to - 1] = from;
			}
		}
	}

	const captions: TimedWord[][] = [];
	for (let to = phrase.length; to > 0; to = bestCut[to - 1]) {
		captions.unshift(phrase.slice(bestCut[to - 1], to));
	}
	return captions;
}

export function buildCaptionChunks({
	segments,
	minDuration = MIN_CAPTION_DURATION_SECONDS,
}: {
	segments: TranscriptionSegment[];
	minDuration?: number;
}): CaptionChunk[] {
	const phrases = splitAtPauses({ words: toTimedWords({ segments }) });
	const groups = phrases.flatMap((phrase) =>
		splitPhrase({ phrase }).map((words, index, all) => ({
			words,
			isLastOfPhrase: index === all.length - 1,
		})),
	);

	return groups.map(({ words, isLastOfPhrase }, index) => {
		const startTime = words[0].start;
		const nextStart = groups[index + 1]?.words[0].start;
		const spokenEnd = Math.max(words[words.length - 1].end, startTime + minDuration);
		// Inside a phrase captions touch, so the text never flickers off.
		const endTime =
			nextStart === undefined
				? spokenEnd
				: isLastOfPhrase
					? Math.min(spokenEnd, nextStart)
					: nextStart;

		return {
			text: joinWords({ words }),
			startTime,
			duration: endTime - startTime,
		};
	});
}
