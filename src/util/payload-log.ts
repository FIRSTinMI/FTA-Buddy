import { createHash } from "crypto";
import { debugLog } from "./debug-log";

/**
 * Inbound payload logging for the admin Logs tab: what an integration (Nexus,
 * Slack, TBA, FTC, the FMS extension, ...) actually sent us, so its JSON can be
 * read without a debugger. Rows go through `debugLog`, so writing is buffered
 * and never blocks the caller. Categories are `<area>-payload`; retention is the
 * table size cap in debug-log.ts (payload rows are pruned first).
 *
 * Two entry points:
 * - {@link logPayload} for low-rate sources (polls, webhooks, API replies,
 *   notes, schedule, team sync). EVERY payload is written, so changing values
 *   are visible. A payload whose full content hash equals the previous one for
 *   the same (category, source, event) is written as a short "unchanged" row at
 *   most once per 10 minutes instead of the whole payload.
 * - {@link logFramePayload} for the field monitor frame and power samples, which
 *   arrive several times a second per event. A row is written on the first
 *   frame per (source, event) per process, on a transition the caller reports
 *   (field state, match number or level changed), on a shape change, and
 *   otherwise at most one sampled frame per 30 s. The common path is a Map
 *   lookup and two comparisons; the shape signature is computed only on the
 *   sampled frames.
 *
 * Stored per row (`data`): { source, reason, bytes, shape: { hash, outline }, payload },
 * `bytes` being the size of the original payload. `payload` is bounded (see
 * {@link sanitizePayload}) and secrets are redacted by key name.
 *
 * Production runs two instances; each has its own state, so "first" rows can
 * appear once per instance. That is accepted.
 */

/** An identical payload is written as a short "unchanged" row at most this often. */
export const UNCHANGED_INTERVAL_MS = 10 * 60 * 1000;
/** High-rate sources: one sampled frame per key per this long. */
export const FRAME_SAMPLE_INTERVAL_MS = 30 * 1000;
export const PAYLOAD_MAX_BYTES = 32 * 1024;
export const PAYLOAD_MAX_ARRAY = 10;
export const PAYLOAD_MAX_STRING = 2000;
export const PAYLOAD_MAX_DEPTH = 8;
const PAYLOAD_MAX_KEYS = 80;
/** Elements looked at per array when building the shape signature (bounds the cost on log arrays). */
const SHAPE_MAX_ELEMENTS = 50;
const SHAPE_MAX_DEPTH = 10;
const OUTLINE_MAX = 2000;

export type PayloadReason = "first" | "shape-change" | "changed" | "unchanged" | "transition" | "interval";

// #region Shape signature

/** Recursive key names and value types. No values, no array lengths. */
export function shapeSignature(value: unknown, depth = 0): string {
	if (value === null) return "null";
	const t = typeof value;
	if (t !== "object") return t;
	if (depth >= SHAPE_MAX_DEPTH) return "...";
	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		const seen = new Set<string>();
		const n = Math.min(value.length, SHAPE_MAX_ELEMENTS);
		for (let i = 0; i < n; i++) seen.add(shapeSignature(value[i], depth + 1));
		return "[" + [...seen].sort().join("|") + "]";
	}
	if (value instanceof Date) return "date";
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	let out = "{";
	for (let i = 0; i < keys.length; i++) {
		if (i > 0) out += ",";
		out += keys[i] + ":" + shapeSignature(obj[keys[i]], depth + 1);
	}
	return out + "}";
}

function sha(text: string, len = 12): string {
	return createHash("sha1").update(text).digest("hex").slice(0, len);
}

export function shapeHash(signature: string): string {
	return sha(signature);
}

// #endregion

// #region Decisions

export interface LowRateState {
	signature: string;
	contentHash: string;
	unchangedAt: number;
}

/**
 * Low-rate decision. Every payload is written, except one whose content hash
 * equals the previous payload's, which becomes an "unchanged" row at most once
 * per `unchangedMs`. Updates `state`. Pure apart from the map.
 */
export function decideLowRate(
	states: Map<string, LowRateState>,
	key: string,
	signature: string,
	contentHash: string,
	now: number,
	unchangedMs = UNCHANGED_INTERVAL_MS,
): PayloadReason | null {
	const last = states.get(key);
	if (!last) {
		states.set(key, { signature, contentHash, unchangedAt: now });
		return "first";
	}
	if (last.contentHash === contentHash) {
		if (now - last.unchangedAt < unchangedMs) return null;
		last.unchangedAt = now;
		return "unchanged";
	}
	const reason: PayloadReason = last.signature !== signature ? "shape-change" : "changed";
	states.set(key, { signature, contentHash, unchangedAt: now });
	return reason;
}

export interface FrameState {
	lastAt: number;
	signature: string;
}

/**
 * High-rate decision. The common path (a frame that is not first, not a
 * transition, inside the 30 s window) is one comparison. `computeSignature` is
 * called only when a frame is about to be sampled, so the shape cost is paid
 * once per 30 s per key, not per frame. Pure apart from the map.
 */
export function decideFrame(
	states: Map<string, FrameState>,
	key: string,
	transition: boolean,
	now: number,
	computeSignature: () => string,
	sampleMs = FRAME_SAMPLE_INTERVAL_MS,
): { reason: PayloadReason; signature: string } | null {
	const last = states.get(key);
	if (!last) {
		const signature = computeSignature();
		states.set(key, { lastAt: now, signature });
		return { reason: "first", signature };
	}
	if (!transition && now - last.lastAt < sampleMs) return null;
	const signature = computeSignature();
	const reason: PayloadReason = transition
		? "transition"
		: signature !== last.signature
			? "shape-change"
			: "interval";
	last.lastAt = now;
	last.signature = signature;
	return { reason, signature };
}

// #endregion

// #region Sanitising

const SECRET_KEY =
	/token|secret|passw|api[_-]?key|authorization|cookie|pin$|endpoint|p256dh|webhook|bearer|^keys$|^auth$|credential|signature|response_url|trigger_id/i;
const SECRET_VALUE = /xox[a-z]-[A-Za-z0-9-]+|Bearer\s+[A-Za-z0-9._~+/-]+=*/g;

export function isSecretKey(key: string): boolean {
	return SECRET_KEY.test(key);
}

interface Limits {
	array: number;
	string: number;
	depth: number;
	keys: number;
}

function clean(value: unknown, depth: number, lim: Limits): unknown {
	if (value === null || typeof value === "number" || typeof value === "boolean") return value;
	if (value === undefined) return null;
	if (typeof value === "string") {
		const redacted = value.replace(SECRET_VALUE, "[redacted]");
		return redacted.length > lim.string
			? redacted.slice(0, lim.string) + `...[+${redacted.length - lim.string} chars]`
			: redacted;
	}
	if (typeof value === "bigint") return value.toString();
	if (typeof value !== "object") return String(value);
	if (value instanceof Date) return value.toISOString();
	if (depth >= lim.depth) return Array.isArray(value) ? `[array of ${value.length}]` : "[object]";
	if (Array.isArray(value)) {
		const out: unknown[] = value.slice(0, lim.array).map((v) => clean(v, depth + 1, lim));
		if (value.length > lim.array) out.push({ __truncated: value.length - lim.array });
		return out;
	}
	const out: Record<string, unknown> = {};
	const keys = Object.keys(value as object);
	for (const k of keys.slice(0, lim.keys)) {
		const v = (value as Record<string, unknown>)[k];
		out[k] = isSecretKey(k) && v != null ? "[redacted]" : clean(v, depth + 1, lim);
	}
	if (keys.length > lim.keys) out.__truncated = keys.length - lim.keys;
	return out;
}

/**
 * Bounded, redacted copy of a payload: arrays cut to 10 elements with a
 * `{"__truncated": n}` marker, strings cut at 2,000 chars, depth capped, secret
 * keys replaced by "[redacted]", and the serialized result at most 32 KB
 * (limits tighten step by step until it fits).
 */
export function sanitizePayload(payload: unknown, maxBytes = PAYLOAD_MAX_BYTES): { value: unknown; bytes: number } {
	const steps: Limits[] = [
		{ array: PAYLOAD_MAX_ARRAY, string: PAYLOAD_MAX_STRING, depth: PAYLOAD_MAX_DEPTH, keys: PAYLOAD_MAX_KEYS },
		{ array: 5, string: 500, depth: 6, keys: 50 },
		{ array: 3, string: 200, depth: 5, keys: 30 },
		{ array: 1, string: 60, depth: 4, keys: 20 },
	];
	for (const lim of steps) {
		const value = clean(payload, 0, lim);
		const bytes = Buffer.byteLength(JSON.stringify(value) ?? "null");
		if (bytes <= maxBytes) return { value, bytes };
	}
	const top =
		payload && typeof payload === "object" && !Array.isArray(payload)
			? Object.keys(payload as object).slice(0, 40)
			: [];
	return { value: { __truncated: true, topLevelKeys: top }, bytes: 0 };
}

// #endregion

// #region Writers

const lowRate = new Map<string, LowRateState>();
const frames = new Map<string, FrameState>();
const MAX_KEYS = 2000;

function bound<T>(map: Map<string, T>, key: string): void {
	if (map.size >= MAX_KEYS && !map.has(key)) {
		const oldest = map.keys().next().value;
		if (oldest !== undefined) map.delete(oldest);
	}
}

export interface LogPayloadOptions {
	/** Full category, `<area>-payload`, for example "nexus-payload". */
	category: string;
	/** Endpoint or message kind, for example "event-status webhook". */
	source: string;
	eventCode?: string | null;
	payload: unknown;
	message?: string;
	/**
	 * What to store instead of the whole payload when it is already stored
	 * elsewhere (for example match logs: metadata and the first rows only).
	 */
	stored?: unknown;
	now?: number;
}

function write(
	opts: LogPayloadOptions,
	reason: PayloadReason,
	signature: string,
	extra: Record<string, unknown> = {},
): void {
	const { value } = sanitizePayload(opts.stored ?? opts.payload);
	debugLog({
		category: opts.category,
		eventCode: opts.eventCode,
		level: "debug",
		message: `${opts.message ?? opts.source} (${reason})`,
		data: {
			source: opts.source,
			reason,
			bytes: Buffer.byteLength(JSON.stringify(opts.payload) ?? "null"),
			shape: { hash: shapeHash(signature), outline: signature.slice(0, OUTLINE_MAX) },
			payload: value,
			...extra,
		},
	});
}

/**
 * Log a low-rate inbound payload. Never throws, never blocks. Returns the
 * reason a row was written, or null when an identical payload was seen recently.
 */
export function logPayload(opts: LogPayloadOptions): PayloadReason | null {
	try {
		const key = `${opts.category}|${opts.source}|${opts.eventCode ?? ""}`;
		const now = opts.now ?? Date.now();
		const signature = shapeSignature(opts.payload);
		const contentHash = sha(JSON.stringify(opts.payload) ?? "null", 16);
		bound(lowRate, key);
		const reason = decideLowRate(lowRate, key, signature, contentHash, now);
		if (!reason) return null;
		if (reason === "unchanged") {
			debugLog({
				category: opts.category,
				eventCode: opts.eventCode,
				level: "debug",
				message: `${opts.message ?? opts.source} (unchanged)`,
				data: { source: opts.source, reason, contentHash, shape: { hash: shapeHash(signature) } },
			});
			return reason;
		}
		write(opts, reason, signature, { contentHash });
		return reason;
	} catch (err) {
		console.error("[logPayload] failed:", err);
		return null;
	}
}

export interface LogFrameOptions extends Omit<LogPayloadOptions, "stored"> {
	/** True when the caller already knows this frame is a transition (field state, match number or level changed). */
	transition: boolean;
}

/**
 * Log a high-rate inbound payload (field monitor frame, power sample): first
 * per key, on a transition, on a shape change, and at most one per 30 s
 * otherwise. Never throws, never blocks.
 */
export function logFramePayload(opts: LogFrameOptions): PayloadReason | null {
	try {
		const key = opts.source + "|" + (opts.eventCode ?? "");
		const now = opts.now ?? Date.now();
		if (!frames.has(key)) bound(frames, key);
		const decision = decideFrame(frames, key, opts.transition, now, () => shapeSignature(opts.payload));
		if (!decision) return null;
		write(opts, decision.reason, decision.signature);
		return decision.reason;
	} catch (err) {
		console.error("[logFramePayload] failed:", err);
		return null;
	}
}

/** Test helper. */
export function resetPayloadLogState(): void {
	lowRate.clear();
	frames.clear();
}

// #endregion
