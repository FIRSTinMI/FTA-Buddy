/**
 * Shared by the web app and the extension: which JavaScript errors are worth
 * reporting to the server, and how repeats are collapsed. Pure, so it is unit
 * tested from the server's test suite. The reporters (app/src/util/errorReporter.ts,
 * extension/src/error-reporter.ts) add the browser hooks and the transport.
 */

export interface RawError {
	kind: "error" | "unhandledrejection" | "trpc" | "extension-note";
	message: string;
	stack?: string;
	/** Script URL the error came from, when the browser says. */
	file?: string;
	line?: number;
	col?: number;
	/** URL a failed request or resource was for, when known. */
	requestUrl?: string;
	/** Error name, for example "AbortError". */
	name?: string;
}

export interface NoiseContext {
	/** Origins whose scripts are ours: the page origin, or our own chrome-extension://<id> origin. */
	ownOrigins: string[];
	/** Our own extension id (extension context only). Frames from any other extension are foreign. */
	ownExtensionId?: string;
	/** navigator.onLine */
	online: boolean;
}

const EXTENSION_SCHEME = /^(chrome|moz|safari-web|safari)-extension:\/\/([^/]+)/;
const NETWORK_FAILURE = /Failed to fetch|NetworkError|Load failed|Network request failed|fetch failed/i;

function originOf(url: string): string | null {
	try {
		const u = new URL(url);
		return u.protocol === "null:" ? null : u.origin === "null" ? `${u.protocol}//${u.host}` : u.origin;
	} catch {
		return null;
	}
}

/** URLs of the stack frames, top frame first. */
export function stackUrls(stack: string | undefined): string[] {
	if (!stack) return [];
	const urls: string[] = [];
	for (const line of stack.split("\n")) {
		const m = line.match(
			/((?:https?|chrome-extension|moz-extension|safari-web-extension|safari-extension):\/\/[^\s)]+?)(?::\d+)*\)?\s*$/,
		);
		if (m) urls.push(m[1]);
	}
	return urls;
}

export function isThirdPartyUrl(url: string | undefined, ctx: NoiseContext): boolean {
	if (!url) return false;
	const origin = originOf(url);
	if (!origin) return false;
	return !ctx.ownOrigins.includes(origin);
}

/**
 * Why an error is not worth reporting, or null to report it. Each rule is a
 * kind of noise we cannot act on:
 */
export function noiseReason(err: RawError, ctx: NoiseContext): string | null {
	const text = `${err.name ?? ""} ${err.message}`;
	const urls = [err.file, ...stackUrls(err.stack)].filter((u): u is string => !!u);

	// Errors thrown by other browser extensions: a stack frame from an extension we are not.
	for (const u of urls) {
		const m = u.match(EXTENSION_SCHEME);
		if (m && m[2] !== ctx.ownExtensionId) return "other-extension";
	}

	// Cross-origin "Script error." arrives with no file, line or stack: nothing to act on.
	if (/^Script error\.?$/i.test(err.message.trim()) && !err.stack) return "cross-origin-script-error";

	// Third-party scripts (Google Analytics, Tag Manager, gtag, ad blockers' replacements, widgets):
	// the top frame, or the reported file when there is no stack, is not our origin.
	const top = urls[0];
	if (top && isThirdPartyUrl(top, ctx)) return "third-party-script";
	if (
		/googletagmanager|google-analytics|gtag\/js|doubleclick|analytics\.js/i.test(
			urls.join(" ") + " " + (err.requestUrl ?? ""),
		)
	) {
		return "third-party-script";
	}

	// Resource or request to a third-party URL failed: ad blockers and Pi-hole block these.
	if (err.requestUrl && isThirdPartyUrl(err.requestUrl, ctx)) return "third-party-request";

	// Harmless browser warning about layout timing.
	if (/ResizeObserver loop/i.test(err.message)) return "resize-observer";

	// A cancelled request or navigation, not a fault.
	if (err.name === "AbortError" || /\bAbortError\b|The user aborted a request|signal is aborted/i.test(text)) {
		return "abort";
	}

	// The device has no network: every fetch fails and nothing is wrong with our code.
	if (NETWORK_FAILURE.test(text) && !ctx.online) return "offline";

	return null;
}

/** First line of the stack that has a location, used with the message to tell errors apart. */
export function topFrame(stack: string | undefined): string {
	if (!stack) return "";
	for (const line of stack.split("\n")) {
		if (/(:\d+){1,2}\)?\s*$/.test(line)) return line.trim().slice(0, 200);
	}
	return "";
}

export const MAX_DISTINCT_PER_SESSION = 20;

export interface PendingEntry {
	error: RawError;
	/** Occurrences not yet sent. */
	count: number;
}

/**
 * Collapses repeats for one page or worker session: the same message and top
 * frame is sent once, later repeats are summed and sent as one extra row with
 * the repeat count (`takeRepeats`, called when the page hides). At most
 * MAX_DISTINCT_PER_SESSION distinct errors are kept; the rest are counted in
 * `overflow` and dropped.
 */
export class ErrorDeduper {
	private entries = new Map<string, { error: RawError; sent: boolean; unsent: number }>();
	overflow = 0;

	constructor(private max = MAX_DISTINCT_PER_SESSION) {}

	/** Returns the entry to send now (first sighting), or null when it is a repeat or over the cap. */
	add(error: RawError): PendingEntry | null {
		const key = `${error.message}\n${topFrame(error.stack)}`;
		const known = this.entries.get(key);
		if (known) {
			known.unsent++;
			return null;
		}
		if (this.entries.size >= this.max) {
			this.overflow++;
			return null;
		}
		this.entries.set(key, { error, sent: true, unsent: 0 });
		return { error, count: 1 };
	}

	/** Repeats since the last call, one entry per error, and resets their counters. */
	takeRepeats(): PendingEntry[] {
		const out: PendingEntry[] = [];
		for (const e of this.entries.values()) {
			if (e.unsent > 0) {
				out.push({ error: e.error, count: e.unsent });
				e.unsent = 0;
			}
		}
		return out;
	}
}

/** Fields of an unknown thrown value, as a RawError. Never throws. */
export function toRawError(kind: RawError["kind"], value: unknown, extra: Partial<RawError> = {}): RawError {
	try {
		if (value instanceof Error) {
			return {
				kind,
				message: String(value.message ?? "").slice(0, 1000),
				stack: value.stack?.slice(0, 6000),
				name: value.name,
				...extra,
			};
		}
		if (typeof value === "string") return { kind, message: value.slice(0, 1000), ...extra };
		return { kind, message: JSON.stringify(value)?.slice(0, 1000) ?? String(value), ...extra };
	} catch {
		return { kind, message: "unserialisable error", ...extra };
	}
}
