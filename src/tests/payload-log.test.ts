import { describe, expect, test } from "bun:test";
import {
	decideFrame,
	decideLowRate,
	sanitizePayload,
	shapeSignature,
	FRAME_SAMPLE_INTERVAL_MS,
	UNCHANGED_INTERVAL_MS,
	type FrameState,
	type LowRateState,
} from "../util/payload-log";
import {
	debugLogOnChange,
	debugLogThrottled,
	planPrune,
	resetDebugLogHelpers,
	retentionLimits,
} from "../util/debug-log";
import { SubscriberTracker } from "../util/subscriber-tracking";
import { detectStaleExtensions } from "../util/extension-presence";

describe("shapeSignature", () => {
	test("same shape, different values", () => {
		const a = { match: 1, level: "Qualification", red1: { team: 254, ok: true }, list: [1, 2, 3] };
		const b = { list: [9], red1: { ok: false, team: 1 }, level: "Playoff", match: 77 };
		expect(shapeSignature(a)).toBe(shapeSignature(b));
	});
	test("added key differs", () => {
		expect(shapeSignature({ a: 1 })).not.toBe(shapeSignature({ a: 1, b: 2 }));
	});
	test("type change differs", () => {
		expect(shapeSignature({ a: 1 })).not.toBe(shapeSignature({ a: "1" }));
		expect(shapeSignature({ a: null })).not.toBe(shapeSignature({ a: 1 }));
	});
	test("array length does not matter, element shape does", () => {
		expect(shapeSignature({ a: [{ x: 1 }] })).toBe(shapeSignature({ a: [{ x: 1 }, { x: 2 }, { x: 3 }] }));
		expect(shapeSignature({ a: [{ x: 1 }] })).not.toBe(shapeSignature({ a: [{ x: "s" }] }));
		expect(shapeSignature({ a: [{ x: 1 }, { y: 1 }] })).toBe(shapeSignature({ a: [{ y: 2 }, { x: 2 }, { y: 3 }] }));
	});
	test("contains no values", () => {
		expect(shapeSignature({ secret: "hunter2" })).not.toContain("hunter2");
	});
});

describe("sanitizePayload", () => {
	test("arrays cut to 10 with marker", () => {
		const { value } = sanitizePayload({ a: Array.from({ length: 25 }, (_, i) => i) }) as {
			value: { a: unknown[] };
		};
		expect(value.a.length).toBe(11);
		expect(value.a[10]).toEqual({ __truncated: 15 });
	});
	test("strings cut at 2000 with marker", () => {
		const { value } = sanitizePayload({ s: "x".repeat(5000) }) as { value: { s: string } };
		expect(value.s.startsWith("x".repeat(2000))).toBe(true);
		expect(value.s).toContain("[+3000 chars]");
	});
	test("secrets redacted by key and by value", () => {
		const { value } = sanitizePayload({
			access_token: "xoxb-123-abc",
			nested: {
				Authorization: "Bearer abc",
				apiKey: "k",
				pin: "12345",
				endpoint: "https://push/x",
				keys: { p256dh: "a", auth: "b" },
			},
			text: "hello xoxp-999-zzz there",
			note: "keep this",
		}) as { value: any };
		expect(value.access_token).toBe("[redacted]");
		expect(value.nested.Authorization).toBe("[redacted]");
		expect(value.nested.apiKey).toBe("[redacted]");
		expect(value.nested.pin).toBe("[redacted]");
		expect(value.nested.endpoint).toBe("[redacted]");
		expect(value.nested.keys).toBe("[redacted]");
		expect(value.text).toBe("hello [redacted] there");
		expect(value.note).toBe("keep this");
	});
	test("depth capped", () => {
		let deep: unknown = { leaf: 1 };
		for (let i = 0; i < 20; i++) deep = { d: deep };
		expect(JSON.stringify(sanitizePayload(deep).value)).toContain("[object]");
	});
	test("total size capped at 32 KB", () => {
		const big = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, "v".repeat(1900)]));
		const { value, bytes } = sanitizePayload(big);
		expect(bytes).toBeLessThanOrEqual(32768);
		expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThanOrEqual(32768);
	});
});

describe("decideLowRate", () => {
	const key = "nexus-payload|poll|2026test";
	test("first, changed, shape-change, unchanged at most every 10 minutes", () => {
		const st = new Map<string, LowRateState>();
		expect(decideLowRate(st, key, "S1", "h1", 0)).toBe("first");
		expect(decideLowRate(st, key, "S1", "h1", 1000)).toBeNull();
		expect(decideLowRate(st, key, "S1", "h2", 2000)).toBe("changed");
		expect(decideLowRate(st, key, "S2", "h3", 3000)).toBe("shape-change");
		expect(decideLowRate(st, key, "S2", "h3", 3000 + UNCHANGED_INTERVAL_MS - 1)).toBeNull();
		expect(decideLowRate(st, key, "S2", "h3", 3000 + UNCHANGED_INTERVAL_MS)).toBe("unchanged");
		expect(decideLowRate(st, key, "S2", "h3", 3000 + UNCHANGED_INTERVAL_MS + 5)).toBeNull();
	});
	test("keys are independent", () => {
		const st = new Map<string, LowRateState>();
		expect(decideLowRate(st, "a", "A", "h", 0)).toBe("first");
		expect(decideLowRate(st, "b", "A", "h", 0)).toBe("first");
	});
});

describe("decideFrame", () => {
	test("first, silent inside the window, transition, then a sampled frame", () => {
		const st = new Map<string, FrameState>();
		let sigCalls = 0;
		const sig = (v: string) => () => {
			sigCalls++;
			return v;
		};
		expect(decideFrame(st, "k", false, 0, sig("A"))?.reason).toBe("first");
		for (let t = 100; t < FRAME_SAMPLE_INTERVAL_MS; t += 100)
			expect(decideFrame(st, "k", false, t, sig("A"))).toBeNull();
		expect(sigCalls).toBe(1); // the signature is not computed on the common path
		expect(decideFrame(st, "k", true, 5000, sig("A"))?.reason).toBe("transition");
		expect(decideFrame(st, "k", false, 5000 + FRAME_SAMPLE_INTERVAL_MS, sig("A"))?.reason).toBe("interval");
		expect(decideFrame(st, "k", false, 5000 + 2 * FRAME_SAMPLE_INTERVAL_MS, sig("B"))?.reason).toBe("shape-change");
	});
});

describe("planPrune and retentionLimits", () => {
	const GIB = 1024 ** 3;
	test("nothing at or under the cap", () => {
		expect(
			planPrune({ liveRows: 1000, avgRowBytes: 1000, maxBytes: 6 * GIB, targetBytes: 5.5 * GIB }).rowsToDelete,
		).toBe(0);
	});
	test("over the cap deletes down to the target, not to the cap", () => {
		const avg = 1800; // + 200 overhead = 2000 bytes per row
		const liveRows = Math.ceil((6.1 * GIB) / 2000);
		const plan = planPrune({ liveRows, avgRowBytes: avg, maxBytes: 6 * GIB, targetBytes: 5.5 * GIB });
		const after = (liveRows - plan.rowsToDelete) * 2000;
		expect(after).toBeLessThanOrEqual(5.5 * GIB);
		expect(after).toBeGreaterThan(5.4 * GIB);
	});
	test("after deleting, the same dead-tuple-laden table plans nothing (no runaway)", () => {
		const avg = 1800;
		const liveRows = Math.ceil((6.1 * GIB) / 2000);
		const first = planPrune({ liveRows, avgRowBytes: avg, maxBytes: 6 * GIB, targetBytes: 5.5 * GIB });
		// Live rows shrink; the file does not, but the plan uses live rows only.
		const second = planPrune({
			liveRows: liveRows - first.rowsToDelete,
			avgRowBytes: avg,
			maxBytes: 6 * GIB,
			targetBytes: 5.5 * GIB,
		});
		expect(second.rowsToDelete).toBe(0);
	});
	test("unknown sizes plan nothing", () => {
		expect(planPrune({ liveRows: 0, avgRowBytes: 100, maxBytes: 1, targetBytes: 1 }).rowsToDelete).toBe(0);
		expect(planPrune({ liveRows: 100, avgRowBytes: 0, maxBytes: 1, targetBytes: 1 }).rowsToDelete).toBe(0);
	});
	test("env overrides", () => {
		expect(retentionLimits({}).maxBytes).toBe(6 * GIB);
		expect(retentionLimits({}).targetBytes).toBe(5.5 * GIB);
		expect(retentionLimits({ DEBUG_LOG_MAX_BYTES: "1000000" }).targetBytes).toBeLessThan(1_000_000);
		expect(retentionLimits({ DEBUG_LOG_MAX_BYTES: "1000000", DEBUG_LOG_TARGET_BYTES: "900000" }).targetBytes).toBe(
			900000,
		);
	});
});

describe("log guards", () => {
	test("debugLogOnChange writes once per state", () => {
		resetDebugLogHelpers();
		const opts = { category: "t", message: "m" };
		// DB writes fail silently in tests without a database; the return value is the decision.
		expect(debugLogOnChange("k", "a", opts)).toBe(true);
		expect(debugLogOnChange("k", "a", opts)).toBe(false);
		expect(debugLogOnChange("k", "b", opts)).toBe(true);
	});
	test("debugLogThrottled writes once per window", () => {
		resetDebugLogHelpers();
		const opts = { category: "t", message: "m" };
		expect(debugLogThrottled("k", 1000, opts, 0)).toBe(true);
		expect(debugLogThrottled("k", 1000, opts, 999)).toBe(false);
		expect(debugLogThrottled("k", 1000, opts, 1000)).toBe(true);
	});
});

describe("SubscriberTracker", () => {
	test("settled count change is logged once", async () => {
		const rows: unknown[] = [];
		const t = new SubscriberTracker((e) => rows.push(e), 5);
		t.adjust("e", 1);
		t.adjust("e", 1);
		t.adjust("e", -1);
		await new Promise((r) => setTimeout(r, 30));
		expect(rows).toEqual([{ eventCode: "e", from: 0, to: 1 }]);
		t.adjust("e", -1);
		await new Promise((r) => setTimeout(r, 30));
		expect(rows[1]).toEqual({ eventCode: "e", from: 1, to: 0 });
	});
});

describe("detectStaleExtensions", () => {
	test("stale once, recovered once", () => {
		const stale = new Set<string>();
		const ext = (lastFrame: number) => [{ id: "x", eventCode: "e", lastFrame }];
		expect(detectStaleExtensions(ext(0), 200_000, stale).becameStale.length).toBe(1);
		expect(detectStaleExtensions(ext(0), 220_000, stale).becameStale.length).toBe(0);
		expect(detectStaleExtensions(ext(219_000), 220_000, stale).recovered.length).toBe(1);
		expect(detectStaleExtensions(ext(219_000), 230_000, stale).recovered.length).toBe(0);
	});
});
