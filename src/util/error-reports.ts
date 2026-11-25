import { z } from "zod";
import { debugLog, debugLogThrottled } from "./debug-log";
import { redis } from "./redis";

/**
 * JavaScript errors reported by the web app and the extension, stored as
 * `client-error` / `extension-error` rows in debug_logs. The caller identity is
 * never taken from the payload: the user comes from the auth token, the event
 * from the event token, the IP from the request.
 *
 * Rate limits (Redis counters, fixed windows): per IP and per identity. Errors
 * past a limit are dropped silently and counted in `ftabuddy:errrep:dropped:<day>`.
 */

export const MAX_ERRORS_PER_REPORT = 20;
export const IP_LIMIT_PER_MINUTE = 60;
export const IDENTITY_LIMIT_PER_10_MINUTES = 100;

export const errorReportSchema = z.object({
	source: z.enum(["app", "extension"]),
	/** Route (app) or script name: background, popup, content:<name>, injected:<name>. */
	surface: z.string().max(80),
	version: z.string().max(40).optional(),
	extensionId: z.string().max(64).optional(),
	errors: z
		.array(
			z.object({
				kind: z.enum(["error", "unhandledrejection", "trpc", "extension-note"]),
				message: z.string().max(1000),
				stack: z.string().max(6000).optional(),
				file: z.string().max(300).optional(),
				line: z.number().int().min(0).max(10_000_000).optional(),
				col: z.number().int().min(0).max(10_000_000).optional(),
				count: z.number().int().min(1).max(100_000).default(1),
			}),
		)
		.min(1)
		.max(MAX_ERRORS_PER_REPORT),
});
export type ErrorReport = z.infer<typeof errorReportSchema>;

/** Add `n` to a fixed-window counter; true when the total is still within `limit`. */
export async function withinBudget(key: string, n: number, limit: number, windowSeconds: number): Promise<boolean> {
	const total = await redis.incrby(key, n);
	if (total === n) await redis.expire(key, windowSeconds);
	return total <= limit;
}

export interface ReporterIdentity {
	ip: string | undefined;
	userId: number | null;
	extensionId: string | undefined;
	eventCode: string | null;
	userAgent: string | undefined;
}

/** Store a report. Returns how many errors were kept and how many were dropped by the limits. */
export async function storeErrorReport(
	report: ErrorReport,
	who: ReporterIdentity,
	now = Date.now(),
): Promise<{ accepted: number; dropped: number }> {
	const n = report.errors.length;
	const ip = (who.ip ?? "unknown").split(",")[0].trim().slice(0, 64);
	const identity = who.userId != null ? `u${who.userId}` : who.extensionId ? `x${who.extensionId}` : `ip${ip}`;
	const minute = Math.floor(now / 60_000);
	const tenMinutes = Math.floor(now / 600_000);
	const okIp = await withinBudget(`ftabuddy:errrep:ip:${ip}:${minute}`, n, IP_LIMIT_PER_MINUTE, 120);
	const okId =
		okIp &&
		(await withinBudget(`ftabuddy:errrep:id:${identity}:${tenMinutes}`, n, IDENTITY_LIMIT_PER_10_MINUTES, 1200));
	if (!okIp || !okId) {
		const day = new Date(now).toISOString().slice(0, 10);
		const dropped = await redis.incrby(`ftabuddy:errrep:dropped:${day}`, n);
		await redis.expire(`ftabuddy:errrep:dropped:${day}`, 14 * 86_400);
		debugLogThrottled(`errrep-dropped:${identity}`, 600_000, {
			category: "general",
			level: "warn",
			message: `Error reports dropped by rate limit (${okIp ? "identity" : "ip"})`,
			data: { identity, droppedToday: dropped },
		});
		return { accepted: 0, dropped: n };
	}
	const category = report.source === "app" ? "client-error" : "extension-error";
	for (const e of report.errors) {
		debugLog({
			category,
			eventCode: who.eventCode,
			level: "error",
			message: `${e.message.split("\n")[0].slice(0, 300)}${e.count > 1 ? ` (x${e.count})` : ""}`,
			data: {
				kind: e.kind,
				stack: e.stack,
				file: e.file,
				line: e.line,
				col: e.col,
				count: e.count,
				surface: report.surface,
				version: report.version,
				userId: who.userId,
				extensionId: who.extensionId ?? report.extensionId,
				userAgent: who.userAgent?.slice(0, 300),
			},
		});
	}
	return { accepted: n, dropped: 0 };
}
