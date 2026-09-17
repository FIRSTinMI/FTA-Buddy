/**
 * A multiple-choice question the assistant asks mid-diagnosis.
 *
 * Typing on a phone while holding a robot is the slowest part of a
 * conversation, so the assistant narrows down with buttons instead. The rule
 * that makes this safe: every question carries a free-text option. A fixed list
 * of choices is the assistant's guess at the shape of the problem, and the
 * person standing at the robot is allowed to disagree with it.
 */

export interface ChatQuestionOption {
	/** The text sent back as the person's next message when they pick this. */
	label: string;
	/** One short line under the label, when the label alone is ambiguous. */
	detail?: string;
}

export interface ChatQuestion {
	/** What is being asked, one sentence. */
	question: string;
	options: ChatQuestionOption[];
	/** Always true. Kept explicit so the app never renders a question without the escape hatch. */
	allowOther: true;
	/** Placeholder for the free-text box, e.g. "Describe what the lights do". */
	otherLabel: string;
}

export const MAX_QUESTION_OPTIONS = 5;

/** The label the app shows on the free-text choice. */
export const OTHER_OPTION_LABEL = "Something else";

/**
 * Normalise what the model asked for: cap the options, drop empties, and make
 * sure the free-text route exists whatever the model sent.
 */
export function normalizeQuestion(input: {
	question?: unknown;
	options?: unknown;
	otherLabel?: unknown;
}): ChatQuestion | null {
	const question = typeof input.question === "string" ? input.question.trim() : "";
	if (!question) return null;
	const raw = Array.isArray(input.options) ? input.options : [];
	const options: ChatQuestionOption[] = [];
	for (const entry of raw) {
		const label =
			typeof entry === "string"
				? entry.trim()
				: typeof (entry as { label?: unknown })?.label === "string"
					? String((entry as { label: string }).label).trim()
					: "";
		if (!label) continue;
		const detail =
			typeof (entry as { detail?: unknown })?.detail === "string"
				? String((entry as { detail: string }).detail).trim()
				: undefined;
		if (options.some((o) => o.label.toLowerCase() === label.toLowerCase())) continue;
		options.push({ label: label.slice(0, 80), detail: detail?.slice(0, 120) || undefined });
		if (options.length >= MAX_QUESTION_OPTIONS) break;
	}
	if (options.length < 2) return null;
	const otherLabel =
		typeof input.otherLabel === "string" && input.otherLabel.trim()
			? input.otherLabel.trim().slice(0, 80)
			: "Type what you see instead";
	return { question: question.slice(0, 240), options, allowOther: true, otherLabel };
}
