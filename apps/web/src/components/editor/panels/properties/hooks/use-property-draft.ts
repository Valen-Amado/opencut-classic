import { useState } from "react";
import { evaluateMathExpression } from "@/utils/math";

function looksLikeExpression({ input }: { input: string }): boolean {
	const trimmed = input.trim();
	if (!trimmed) return false;
	if (/[+*/]/.test(input)) return true;
	const minusIndex = trimmed.indexOf("-");
	return minusIndex > 0;
}

/** Accepts the decimal comma, which `parseFloat` would cut off ("1,5" -> 1). */
function normalizeDecimalComma({ input }: { input: string }): string {
	return input.replace(/,/g, ".");
}

export function usePropertyDraft<T>({
	displayValue: sourceDisplay,
	parse: parseText,
	onPreview,
	onCommit,
	onStartEditing,
	supportsExpressions = true,
}: {
	displayValue: string;
	parse: (input: string) => T | null;
	onPreview: (value: T) => void;
	onCommit: () => void;
	onStartEditing?: () => void;
	supportsExpressions?: boolean;
}) {
	const [isEditing, setIsEditing] = useState(false);
	const [draft, setDraft] = useState("");
	const parse = (input: string) =>
		parseText(normalizeDecimalComma({ input }));

	return {
		displayValue: isEditing ? draft : sourceDisplay,
		scrubTo: (value: number) => {
			const parsed = parse(String(value));
			if (parsed !== null) onPreview(parsed);
		},
		commitScrub: onCommit,
		/** Replaces the draft text (e.g. after an arrow-key step) and previews it. */
		stepTo: (text: string) => {
			setIsEditing(true);
			setDraft(text);
			const parsed = parse(text);
			if (parsed !== null) onPreview(parsed);
		},
		onFocus: () => {
			setIsEditing(true);
			setDraft(sourceDisplay);
			onStartEditing?.();
		},
		onChange: (
			event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
		) => {
			const nextDraft = event.target.value;
			setDraft(nextDraft);

			const parsed = parse(nextDraft);
			if (parsed !== null) {
				onPreview(parsed);
			}
		},
		onBlur: (
			event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
		) => {
			const nextDraft = normalizeDecimalComma({ input: event.target.value });
			if (supportsExpressions && looksLikeExpression({ input: nextDraft })) {
				const evaluated = evaluateMathExpression({ input: nextDraft });
				if (evaluated !== null) {
					const parsed = parse(String(evaluated));
					if (parsed !== null) onPreview(parsed);
				}
			}
			onCommit();
			setIsEditing(false);
			setDraft("");
		},
	};
}
