// A fix is a list of steps. A "do" step is an action. A "check" step is where you stop, look,
// and answer a yes/no question: yes ends with an outcome, no means continue to the next step.
// Authored content can use these objects directly; plain sentences are parsed with parseSteps().

export interface DoStep {
	readonly kind: "do";
	readonly text: string;
}

export interface CheckStep {
	readonly kind: "check";
	/** The question, ends with "?". */
	readonly text: string;
	/** What a "yes" means or what to do then. Defaults to "Fixed." when omitted. */
	readonly yes?: string;
	/** What a "no" means. Defaults to "Continue." when omitted; the parser sets "Fixed. Stop here." for still/never/not questions. */
	readonly no?: string;
}

export type FlowStep = DoStep | CheckStep;

const FIXED = "Fixed.";
const STOP = "Fixed. Stop here.";

// "If it still flashes, reimage" is a test for the fault being present: a No means the last step
// worked. "If a NEO is attached, the type is wrong" is a plain condition: a No means keep going.
const FAULT_PRESENT = /\b(still|never|stays|stay|not|no|cannot|can't|won't|does not|doesn't|dead|fails?|failing)\b/i;

function noOutcome(condition: string): string | undefined {
	return FAULT_PRESENT.test(condition) ? STOP : undefined;
}

function question(condition: string): string {
	const c = condition.trim().replace(/[.:]$/, "");
	return c.endsWith("?") ? c : `${c[0]?.toUpperCase() ?? ""}${c.slice(1)}?`;
}

function outcome(text: string): string {
	const t = text.trim();
	return t ? `${t[0]?.toUpperCase() ?? ""}${t.slice(1)}` : FIXED;
}

/**
 * Turn one authored sentence into flow steps. Recognised shapes:
 *   "If X, Y."            -> check "X?" yes: Y
 *   "Still X: Y."         -> check "Still X?" yes: Y
 *   "Do A. If X, Y."      -> do A, then check "X?" yes: Y
 * Everything else is a "do" step.
 */
export function parseStep(sentence: string): FlowStep[] {
	const s = sentence.trim();
	const still = /^Still ([^:]+):\s*(.+)$/s.exec(s);
	if (still) return [{ kind: "check", text: question(`Still ${still[1]}`), yes: outcome(still[2]), no: STOP }];
	const leadingIf = /^If ([^,:]+?)[,:]\s*(.+)$/s.exec(s);
	if (leadingIf) return [{ kind: "check", text: question(leadingIf[1]), yes: outcome(leadingIf[2]), no: noOutcome(leadingIf[1]) }];
	const midIf = /^(.+?\.)\s+If ([^,:]+?)[,:]\s*(.+)$/s.exec(s);
	if (midIf) {
		return [
			{ kind: "do", text: midIf[1] },
			{ kind: "check", text: question(midIf[2]), yes: outcome(midIf[3]), no: noOutcome(midIf[2]) },
		];
	}
	return [{ kind: "do", text: s }];
}

/** Parse a whole step list. Objects pass through, strings are parsed. */
export function parseSteps(steps: readonly (string | FlowStep)[]): FlowStep[] {
	return steps.flatMap((s) => (typeof s === "string" ? parseStep(s) : [s]));
}
