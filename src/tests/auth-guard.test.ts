import { describe, expect, test } from "bun:test";
import { decideBootAuth } from "../../app/src/util/authGuard";

const A = "a@example.com";
const B = "b@example.com";

describe("decideBootAuth", () => {
	test("no stored profile: keep", () => {
		expect(decideBootAuth("", null)).toBe("keep");
		expect(decideBootAuth("", B)).toBe("keep");
	});
	test("same account on first fire: keep", () => {
		expect(decideBootAuth(A, A)).toBe("keep");
	});
	test("different account on first fire: sign out as mismatch", () => {
		expect(decideBootAuth(A, B)).toBe("signout-mismatch");
	});
	test("stored email and no session on first fire: re-check before deciding", () => {
		expect(decideBootAuth(A, null)).toBe("recheck");
	});
	test("stored email, no session on first fire, session present on re-check: keep the profile", () => {
		expect(decideBootAuth(A, null, A)).toBe("keep");
	});
	test("stored email, no session on first fire or re-check: sign out as no session", () => {
		expect(decideBootAuth(A, null, null)).toBe("signout-no-session");
	});
	test("a different account appearing on re-check never uses the stored profile", () => {
		expect(decideBootAuth(A, null, B)).toBe("signout-mismatch");
	});
	test("first-fire user without an email keeps the profile, as before", () => {
		expect(decideBootAuth(A, "")).toBe("keep");
	});
});
