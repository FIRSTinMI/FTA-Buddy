import {
	ErrorDeduper,
	noiseReason,
	stackUrls,
	toRawError,
	type NoiseContext,
	type RawError,
} from "../../shared/error-reporting";

/**
 * JavaScript errors from the extension, sent to the FTA Buddy server
 * (`telemetry.reportErrors`, shown as `extension-error` in the admin Logs tab).
 *
 * Every error goes through the background service worker: the worker reports
 * its own errors directly, and the popup, content scripts and injected page
 * scripts message it. The only network request this adds is that one call to the
 * FTA Buddy server, the same server the heartbeat talks to. It never contacts
 * FMS, Cheesy Arena or the field network, so it is safe while the extension is
 * disabled or remote-disabled.
 */

export interface ReportedError {
	kind: RawError["kind"];
	message: string;
	stack?: string;
	file?: string;
	line?: number;
	col?: number;
	count: number;
}

const FLUSH_DELAY_MS = 5_000;
const WINDOW_MESSAGE = "__ftaBuddyErrorReport";

function noiseContext(): NoiseContext {
	return {
		ownOrigins: [`chrome-extension://${chrome.runtime.id}`],
		ownExtensionId: chrome.runtime.id,
		online: typeof navigator === "undefined" ? true : navigator.onLine,
	};
}

function toReported(entry: { error: RawError; count: number }): ReportedError {
	const e = entry.error;
	return {
		kind: e.kind,
		message: e.message.slice(0, 1000),
		stack: e.stack?.slice(0, 6000),
		file: e.file?.slice(0, 300),
		line: e.line,
		col: e.col,
		count: entry.count,
	};
}

// #region Background service worker

type Sender = (surface: string, errors: ReportedError[]) => Promise<unknown>;

/**
 * Worker side. `send` is the tRPC call; it is passed in so this file does not
 * import the tRPC client (and with it the field-network code) into popups and
 * content scripts.
 */
export function installWorkerErrorReporting(send: Sender) {
	const deduper = new ErrorDeduper();
	let queue: { surface: string; entry: { error: RawError; count: number } }[] = [];
	let timer: ReturnType<typeof setTimeout> | null = null;
	let sending = false;

	async function flush() {
		timer = null;
		if (queue.length === 0 || sending) return;
		const batch = queue.splice(0, 20);
		sending = true;
		try {
			const bySurface = new Map<string, ReportedError[]>();
			for (const b of batch) bySurface.set(b.surface, [...(bySurface.get(b.surface) ?? []), toReported(b.entry)]);
			for (const [surface, errors] of bySurface) await send(surface, errors);
		} catch (err) {
			// Best effort; reporting must never throw or report itself.
			console.debug("Extension error report failed:", err);
		} finally {
			sending = false;
		}
	}

	function schedule() {
		if (!timer) timer = setTimeout(() => void flush(), FLUSH_DELAY_MS);
	}

	/** The worker's own errors: filter, dedupe, queue. */
	function report(error: RawError) {
		try {
			if (noiseReason(error, noiseContext())) return;
			const entry = deduper.add(error);
			if (!entry) return;
			queue.push({ surface: "background", entry });
			schedule();
		} catch (err) {
			console.debug("Could not queue extension error:", err);
		}
	}

	/** Already filtered and deduped by the popup or content script that sent it. */
	function relay(surface: string, errors: ReportedError[]) {
		try {
			for (const e of errors.slice(0, 20)) {
				queue.push({
					surface: String(surface).slice(0, 80),
					entry: {
						error: {
							kind: e.kind,
							message: String(e.message),
							stack: e.stack,
							file: e.file,
							line: e.line,
							col: e.col,
						},
						count: Math.max(1, Math.min(100_000, Number(e.count) || 1)),
					},
				});
			}
			schedule();
		} catch (err) {
			console.debug("Could not relay extension error:", err);
		}
	}

	self.addEventListener("error", (ev) => {
		const e = ev as ErrorEvent;
		report(
			toRawError("error", e.error ?? e.message, {
				message: e.message || String((e.error as Error | undefined)?.message ?? "error"),
				file: e.filename || undefined,
				line: e.lineno || undefined,
				col: e.colno || undefined,
			}),
		);
	});
	self.addEventListener("unhandledrejection", (ev) => {
		report(toRawError("unhandledrejection", (ev as PromiseRejectionEvent).reason));
	});

	return {
		/** For errors the worker catches itself (the `noteError` path). */
		reportCaught(context: string, err: unknown) {
			const text = err instanceof Error ? err.message : String(err);
			report(toRawError("extension-note", err, { message: `${context}: ${text}`.slice(0, 1000) }));
		},
		/** Handle a `reportErrors` message from the popup or a content script. */
		relay,
	};
}

// #endregion

// #region Popup and content scripts

/**
 * Popup and content scripts: filter and collapse repeats locally, then message
 * the worker. Also relays errors posted by this extension's injected page
 * scripts (see {@link installInjectedErrorReporting}).
 */
export function installPageErrorReporting(surface: string) {
	const deduper = new ErrorDeduper();
	let queue: { error: RawError; count: number }[] = [];
	let timer: ReturnType<typeof setTimeout> | null = null;

	function send() {
		timer = null;
		if (queue.length === 0) return;
		const errors = queue.splice(0, 20).map(toReported);
		try {
			chrome.runtime.sendMessage({ type: "reportErrors", surface, errors }).catch(() => {});
		} catch (err) {
			console.debug("Could not message the worker with errors:", err);
		}
	}

	function report(error: RawError, requireOwnFrame = false) {
		try {
			const ctx = noiseContext();
			// A page script's error is only ours when a stack frame is in our own files.
			if (requireOwnFrame) {
				const urls = [error.file, ...stackUrls(error.stack)].filter((u): u is string => !!u);
				if (!urls.some((u) => u.startsWith(ctx.ownOrigins[0]))) return;
			}
			if (noiseReason(error, ctx)) return;
			const entry = deduper.add(error);
			if (!entry) return;
			queue.push(entry);
			if (!timer) timer = setTimeout(send, FLUSH_DELAY_MS);
		} catch (err) {
			console.debug("Could not queue extension error:", err);
		}
	}

	function sendRepeats() {
		for (const r of deduper.takeRepeats()) queue.push(r);
		send();
	}

	window.addEventListener("error", (ev) => {
		report(
			toRawError("error", ev.error ?? ev.message, {
				message: ev.message || String((ev.error as Error | undefined)?.message ?? "error"),
				file: ev.filename || undefined,
				line: ev.lineno || undefined,
				col: ev.colno || undefined,
			}),
		);
	});
	window.addEventListener("unhandledrejection", (ev) => report(toRawError("unhandledrejection", ev.reason)));
	window.addEventListener("pagehide", sendRepeats);

	// Errors from our injected page-world scripts arrive as window messages from this same window.
	window.addEventListener("message", (ev) => {
		if (ev.source !== window || !ev.data || ev.data[WINDOW_MESSAGE] !== true) return;
		const e = ev.data.error as RawError | undefined;
		if (e && typeof e.message === "string") report({ ...e, message: e.message.slice(0, 1000) }, true);
	});
}

/** Injected page-world scripts (no chrome.* access): post errors to the content script on the same page. */
export function installInjectedErrorReporting() {
	const post = (error: RawError) => {
		try {
			window.postMessage({ [WINDOW_MESSAGE]: true, error }, "*");
		} catch {
			/* nothing to do */
		}
	};
	window.addEventListener("error", (ev) =>
		post(
			toRawError("error", ev.error ?? ev.message, {
				message: ev.message || String((ev.error as Error | undefined)?.message ?? "error"),
				file: ev.filename || undefined,
				line: ev.lineno || undefined,
				col: ev.colno || undefined,
			}),
		),
	);
	window.addEventListener("unhandledrejection", (ev) => post(toRawError("unhandledrejection", ev.reason)));
}

// #endregion
