import { TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "../../../src/index";
import {
	ErrorDeduper,
	noiseReason,
	toRawError,
	type NoiseContext,
	type RawError,
} from "../../../shared/error-reporting";
import { trpc } from "../main";
import { compareVersions, VERSIONS } from "./updater";

/**
 * Sends the web app's JavaScript errors to the server (`telemetry.reportErrors`),
 * where they show in the admin Logs tab as `client-error`. Three sources:
 * window.onerror, unhandled promise rejections, and tRPC calls that fail with an
 * unexpected error (see `errorReportLink`). Third-party and browser noise is
 * dropped before sending (shared/error-reporting.ts), repeats are collapsed, and
 * nothing here may throw or report itself.
 */

const FLUSH_DELAY_MS = 5_000;
/** tRPC error codes that are normal outcomes (sign-in, validation, missing record), not faults. */
const EXPECTED_TRPC_CODES = new Set([
	"UNAUTHORIZED",
	"FORBIDDEN",
	"NOT_FOUND",
	"BAD_REQUEST",
	"CONFLICT",
	"PRECONDITION_FAILED",
	"TOO_MANY_REQUESTS",
	"METHOD_NOT_SUPPORTED",
	"UNPROCESSABLE_CONTENT",
	"PARSE_ERROR",
]);
/** Our own report call must never be reported (it would loop). */
const SKIP_PATHS = new Set(["telemetry.reportErrors", "telemetry.batchTrack", "telemetry.activeHeartbeat"]);

type Entry = { error: RawError; count: number };

const deduper = new ErrorDeduper();
let queue: Entry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let reporting = false;

function context(): NoiseContext {
	return { ownOrigins: [window.location.origin], online: navigator.onLine };
}

function appVersion(): string {
	return Object.keys(VERSIONS).sort(compareVersions).pop() ?? "unknown";
}

function surface(): string {
	return (window.location.pathname || "/").slice(0, 80);
}

async function flush() {
	flushTimer = null;
	if (queue.length === 0 || reporting) return;
	const batch = queue.splice(0, 20);
	reporting = true;
	try {
		await trpc.telemetry.reportErrors.mutate({
			source: "app",
			surface: surface(),
			version: appVersion(),
			errors: batch.map(({ error, count }) => ({
				kind: error.kind,
				message: error.message,
				stack: error.stack,
				file: error.file?.slice(0, 300),
				line: error.line,
				col: error.col,
				count,
			})),
		});
	} catch (err) {
		// Reporting is best effort and must not recurse into itself.
		console.warn("[errorReporter] report failed:", err);
	} finally {
		reporting = false;
	}
}

function schedule() {
	if (!flushTimer) flushTimer = setTimeout(() => void flush(), FLUSH_DELAY_MS);
}

/** Filter, dedupe and queue one error. Never throws. */
export function reportError(error: RawError) {
	try {
		if (noiseReason(error, context())) return;
		const entry = deduper.add(error);
		if (!entry) return;
		queue.push(entry);
		schedule();
	} catch (err) {
		console.warn("[errorReporter] could not queue error:", err);
	}
}

function flushRepeats() {
	try {
		for (const r of deduper.takeRepeats()) queue.push(r);
		void flush();
	} catch (err) {
		console.warn("[errorReporter] repeat flush failed:", err);
	}
}

/** Start once, next to the other app-wide telemetry. */
export function startErrorReporter() {
	if (started) return;
	started = true;

	// Script errors (bubbling) and failed resource loads (capturing: element errors do not bubble).
	window.addEventListener(
		"error",
		(ev: Event) => {
			try {
				if (ev instanceof ErrorEvent) {
					reportError(
						toRawError("error", ev.error ?? ev.message, {
							message: ev.message || String((ev.error as Error | undefined)?.message ?? "error"),
							file: ev.filename || undefined,
							line: ev.lineno || undefined,
							col: ev.colno || undefined,
						}),
					);
				} else {
					const target = ev.target as (HTMLElement & { src?: string; href?: string }) | null;
					const url = target?.src || target?.href;
					if (target && url) {
						reportError({
							kind: "error",
							message: `Resource failed to load: <${target.tagName.toLowerCase()}> ${url}`.slice(0, 1000),
							requestUrl: url,
						});
					}
				}
			} catch (err) {
				console.warn("[errorReporter] error handler failed:", err);
			}
		},
		true,
	);

	window.addEventListener("unhandledrejection", (ev) => {
		try {
			reportError(toRawError("unhandledrejection", ev.reason));
		} catch (err) {
			console.warn("[errorReporter] rejection handler failed:", err);
		}
	});

	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") flushRepeats();
	});
	window.addEventListener("pagehide", flushRepeats);
}

/** tRPC link: reports calls that end in an unexpected error, then passes the error on unchanged. */
export const errorReportLink: TRPCLink<AppRouter> = () => {
	return ({ op, next }) =>
		observable((observer) =>
			next(op).subscribe({
				next: (value) => observer.next(value),
				complete: () => observer.complete(),
				error: (err) => {
					try {
						if (!SKIP_PATHS.has(op.path) && op.type !== "subscription") {
							const code =
								err instanceof TRPCClientError
									? (err.data as { code?: string } | undefined)?.code
									: undefined;
							if (!code || !EXPECTED_TRPC_CODES.has(code)) {
								reportError(
									toRawError("trpc", err, {
										message:
											`${op.path}: ${err instanceof Error ? err.message : String(err)}`.slice(
												0,
												1000,
											),
										name:
											err instanceof Error
												? ((err.cause as Error | undefined)?.name ?? err.name)
												: undefined,
										// A failed fetch to our own server is ours; anything else cannot be told apart here.
										stack: err instanceof Error ? err.stack : undefined,
									}),
								);
							}
						}
					} catch (e) {
						console.warn("[errorReporter] link failed:", e);
					}
					observer.error(err);
				},
			}),
		);
};
