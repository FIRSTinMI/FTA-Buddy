/**
 * Text a stranger typed, on its way into a prompt.
 *
 * A team's "what went wrong" note is the most useful line in an upload, and it
 * is also the one field where an anonymous person on the public portal addresses
 * the assistant directly. Two rules keep it evidence:
 *
 * 1. SCREEN. A note that reads like instructions to an AI, a shell, or a deploy
 *    is withheld from the prompt entirely and the upload is marked, so the CSA
 *    still reads the note and the model never does. Deterministic and cheap.
 * 2. FENCE. A note that passes is capped, stripped of control characters, has
 *    any look-alike closing tag neutralised, and is wrapped in a tag the system
 *    prompt names as untrusted.
 *
 * Neither rule is the safety boundary. That is structural: the assistant's tools
 * are reads scoped to one upload, and nothing it says changes a record.
 *
 * Adapted from the same pair of functions in The Tool Pit.
 */

const INSTRUCTION_PATTERNS: Array<[RegExp, string]> = [
	[
		/\b(ignore|disregard|forget)\b.{0,40}\b(previous|prior|above|earlier|all)\b.{0,30}\b(instructions?|prompts?|rules?)\b/i,
		"asks to ignore instructions",
	],
	[
		/\b(you are now|act as|pretend (to be|you are)|new (persona|role|instructions?)|from now on)\b/i,
		"tries to reassign the role",
	],
	[
		/\b(system prompt|developer message|assistant:|<\/?(system|assistant|user|instructions?)>)/i,
		"names prompt machinery",
	],
	[/^\s*(claude|assistant|ai|chatgpt|gpt|model)\s*[,:!-]/im, "addresses the model directly"],
	[
		/\b(rm\s+-rf|sudo\b|chmod\b|curl\s+.*\|\s*(ba)?sh|force[- ]push|git\s+push\s+.*--force|drop\s+(table|database)|delete\s+from\b|truncate\b)/i,
		"contains shell, git or SQL commands",
	],
	[
		/\b(deploy|redeploy|erase|wipe|delete|destroy)\b.{0,40}\b(production|prod|repo(sitory)?|website|site|server|database|all files)\b/i,
		"describes a destructive deploy or wipe",
	],
	[/```|<\|[a-z_]+\|>|\[INST\]|<<SYS>>/i, "uses code-fence or chat-template markup"],
	[
		/\b(step\s*\d|^\s*\d+\.)\s.{0,80}\b(run|execute|deploy|push|erase|delete)\b/im,
		"numbered instructions to run things",
	],
];

export interface UntrustedScreen {
	suspicious: boolean;
	reasons: string[];
}

/** True when the text reads like instructions rather than a description. */
export function screenForInstructions(text: string | null | undefined): UntrustedScreen {
	const value = (text ?? "").trim();
	if (!value) return { suspicious: false, reasons: [] };
	const reasons = INSTRUCTION_PATTERNS.filter(([re]) => re.test(value)).map(([, why]) => why);
	return { suspicious: reasons.length > 0, reasons };
}

export interface FenceOptions {
	/** Tag name; the system prompt must name the same one as untrusted. */
	tag: string;
	/** Hard cap. A note is a sentence or two, not a document. */
	maxChars?: number;
	/** Who typed it, shown to the model as an attribute. */
	source?: string;
}

// Code point ranges that hide or reorder text: C0/C1 controls (not tab, LF, CR),
// zero-width joiners and spaces, bidi overrides and isolates, BOM. Built from
// numbers so this source file itself contains none of them.
const HIDDEN_RANGES: Array<[number, number]> = [
	[0x00, 0x08],
	[0x0b, 0x0c],
	[0x0e, 0x1f],
	[0x7f, 0x9f],
	[0x200b, 0x200f],
	[0x202a, 0x202e],
	[0x2066, 0x2069],
	[0xfeff, 0xfeff],
];
const HIDDEN_CHARS = new RegExp(
	"[" + HIDDEN_RANGES.map(([a, b]) => `\\u{${a.toString(16)}}-\\u{${b.toString(16)}}`).join("") + "]",
	"gu",
);

/** Wrap untrusted text for a prompt. Returns "" for an empty note. */
export function fenceUntrusted(text: string | null | undefined, opts: FenceOptions): string {
	const max = opts.maxChars ?? 600;
	const tag = opts.tag.replace(/[^a-z0-9_-]/gi, "");
	let value = (text ?? "").replace(HIDDEN_CHARS, "").replace(/\s+/g, " ").trim();
	if (!value) return "";
	if (value.length > max) value = value.slice(0, max - 1) + "...";
	// A closing tag typed by the uploader must not end the fence early.
	value = value.replace(new RegExp(`</?\\s*${tag}\\b[^>]*>`, "gi"), "[tag removed]");
	return `<${tag} source="${opts.source ?? "anonymous uploader"}" trust="none">\n${value}\n</${tag}>`;
}
