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
	/** What a "no" means. Defaults to "Continue." when omitted. */
	readonly no?: string;
}

export type FlowStep = DoStep | CheckStep;

const FIXED = "Fixed.";

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
	if (still) return [{ kind: "check", text: question(`Still ${still[1]}`), yes: outcome(still[2]) }];
	const leadingIf = /^If ([^,:]+?)[,:]\s*(.+)$/s.exec(s);
	if (leadingIf) return [{ kind: "check", text: question(leadingIf[1]), yes: outcome(leadingIf[2]) }];
	const midIf = /^(.+?\.)\s+If ([^,:]+?)[,:]\s*(.+)$/s.exec(s);
	if (midIf) return [{ kind: "do", text: midIf[1] }, { kind: "check", text: question(midIf[2]), yes: outcome(midIf[3]) }];
	return [{ kind: "do", text: s }];
}

/** Parse a whole step list. Objects pass through, strings are parsed. */
export function parseSteps(steps: readonly (string | FlowStep)[]): FlowStep[] {
	return steps.flatMap((s) => (typeof s === "string" ? parseStep(s) : [s]));
}
