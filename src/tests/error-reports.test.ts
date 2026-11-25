import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { errorReportSchema, IP_LIMIT_PER_MINUTE, storeErrorReport } from "../util/error-reports";
import { redis } from "../util/redis";
import { pendingDebugLogRows } from "../util/debug-log";

/** Needs REDIS_URL; docker-compose provides one. */

const report = (n: number) =>
	errorReportSchema.parse({
		source: "app",
		surface: "/test",
		errors: Array.from({ length: n }, (_, i) => ({ kind: "error", message: `boom ${i}` })),
	});

const ip = `test-${randomUUID()}`;
afterAll(async () => {
	const keys = await redis.keys(`ftabuddy:errrep:*${ip}*`);
	if (keys.length) await redis.del(...keys);
});

describe("storeErrorReport", () => {
	test("accepts within the per-IP limit and buffers one row per error", async () => {
		const before = pendingDebugLogRows();
		const res = await storeErrorReport(report(5), {
			ip,
			userId: null,
			extensionId: undefined,
			eventCode: null,
			userAgent: "t",
		});
		expect(res).toEqual({ accepted: 5, dropped: 0 });
		expect(pendingDebugLogRows() - before).toBe(5);
	});
	test("drops silently beyond the per-IP limit", async () => {
		const who = { ip: ip + "b", userId: null, extensionId: undefined, eventCode: null, userAgent: "t" };
		const now = 1_900_000_000_000;
		let accepted = 0;
		let dropped = 0;
		for (let i = 0; i < IP_LIMIT_PER_MINUTE / 5 + 2; i++) {
			const r = await storeErrorReport(report(5), who, now);
			accepted += r.accepted;
			dropped += r.dropped;
		}
		expect(accepted).toBe(IP_LIMIT_PER_MINUTE);
		expect(dropped).toBe(10);
	});
	test("schema caps the batch", () => {
		expect(() => report(21)).toThrow();
	});
});

// #region Noise filter and dedupe (shared with the app and the extension)

import {
	ErrorDeduper,
	noiseReason,
	type NoiseContext,
	type RawError,
} from "../../shared/error-reporting";
import { isExpectedSignedOutError } from "../../app/src/util/expectedErrors";

const appCtx: NoiseContext = { ownOrigins: ["https://ftabuddy.com"], online: true };
const extCtx: NoiseContext = { ownOrigins: ["chrome-extension://ours"], ownExtensionId: "ours", online: true };
const own = (stack: string): RawError => ({ kind: "error", message: "x is undefined", stack });

describe("noiseReason", () => {
	test("our own error is kept", () => {
		expect(
			noiseReason(own("TypeError: x\n    at f (https://ftabuddy.com/assets/index-1.js:1:2)"), appCtx),
		).toBeNull();
	});
	test("third-party script, Google Tag Manager and gtag", () => {
		expect(noiseReason(own("Error\n    at https://www.googletagmanager.com/gtag/js?id=G-1:5:6"), appCtx)).toBe(
			"third-party-script",
		);
		expect(noiseReason({ kind: "error", message: "boom", file: "https://cdn.example.com/w.js" }, appCtx)).toBe(
			"third-party-script",
		);
	});
	test("cross-origin Script error. with no stack", () => {
		expect(noiseReason({ kind: "error", message: "Script error." }, appCtx)).toBe("cross-origin-script-error");
	});
	test("third-party request failure", () => {
		expect(
			noiseReason(
				{ kind: "error", message: "Failed to load", requestUrl: "https://ads.example.com/a.js" },
				appCtx,
			),
		).toBe("third-party-request");
		expect(
			noiseReason({ kind: "error", message: "Failed to load", requestUrl: "https://ftabuddy.com/a.js" }, appCtx),
		).toBeNull();
	});
	test("ResizeObserver, AbortError", () => {
		expect(
			noiseReason(
				{ kind: "error", message: "ResizeObserver loop completed with undelivered notifications." },
				appCtx,
			),
		).toBe("resize-observer");
		expect(noiseReason({ kind: "trpc", message: "x", name: "AbortError" }, appCtx)).toBe("abort");
	});
	test("fetch failure offline only", () => {
		expect(noiseReason({ kind: "trpc", message: "Failed to fetch" }, { ...appCtx, online: false })).toBe("offline");
		expect(noiseReason({ kind: "trpc", message: "Failed to fetch" }, appCtx)).toBeNull();
	});
	test("other browser extensions, not ours", () => {
		expect(noiseReason(own("Error\n    at chrome-extension://other/content.js:1:2"), appCtx)).toBe(
			"other-extension",
		);
		expect(noiseReason(own("Error\n    at chrome-extension://other/content.js:1:2"), extCtx)).toBe(
			"other-extension",
		);
		expect(noiseReason(own("Error\n    at chrome-extension://ours/background.js:1:2"), extCtx)).toBeNull();
	});
});

describe("ErrorDeduper", () => {
	test("same message and top frame is sent once, repeats counted", () => {
		const d = new ErrorDeduper();
		const e = own("E\n    at f (https://ftabuddy.com/a.js:1:2)");
		expect(d.add(e)).not.toBeNull();
		expect(d.add(e)).toBeNull();
		expect(d.add(e)).toBeNull();
		expect(d.takeRepeats()[0].count).toBe(2);
		expect(d.takeRepeats()).toEqual([]);
	});
	test("at most 20 distinct errors", () => {
		const d = new ErrorDeduper();
		let sent = 0;
		for (let i = 0; i < 30; i++) if (d.add({ kind: "error", message: `m${i}` })) sent++;
		expect(sent).toBe(20);
		expect(d.overflow).toBe(10);
	});
});

// #endregion

describe("isExpectedSignedOutError", () => {
	test("the signed-out checkAuth answer is expected, other failures are not", () => {
		expect(isExpectedSignedOutError("user.checkAuth", "No token provided")).toBe(true);
		expect(isExpectedSignedOutError("user.checkAuth", "Failed query: select")).toBe(false);
		expect(isExpectedSignedOutError("match.putMatchLogs", "No token provided")).toBe(false);
	});
});
