import { describe, expect, it } from "bun:test";
import { DOC_HOSTS, isAllowedDocUrl, parseDocUrl } from "./docs";

describe("parseDocUrl", () => {
	it("accepts an https vendor URL and drops the fragment", () => {
		const u = parseDocUrl("https://docs.wpilib.org/en/stable/a.html#section");
		expect(u?.hostname).toBe("docs.wpilib.org");
		expect(u?.hash).toBe("");
	});

	it("rejects plain http, so a page cannot be swapped in transit", () => {
		expect(parseDocUrl("http://docs.wpilib.org/a.html")).toBeNull();
	});

	it("rejects other schemes and malformed input", () => {
		for (const bad of ["file:///etc/passwd", "javascript:alert(1)", "not a url", ""]) {
			expect(parseDocUrl(bad)).toBeNull();
		}
	});
});

describe("isAllowedDocUrl", () => {
	it("allows every host in the allowlist", () => {
		for (const host of Object.keys(DOC_HOSTS)) {
			expect(isAllowedDocUrl(new URL(`https://${host}/any/path`))).toBe(true);
		}
	});

	it("rejects an unlisted host", () => {
		expect(isAllowedDocUrl(new URL("https://evil.example.com/x"))).toBe(false);
	});

	it("does not match a lookalike host that merely ends with an allowed one", () => {
		expect(isAllowedDocUrl(new URL("https://evil-docs.wpilib.org.attacker.com/x"))).toBe(false);
		expect(isAllowedDocUrl(new URL("https://notdocs.wpilib.org/x"))).toBe(false);
	});

	it("does not treat a subdomain of an allowed host as allowed", () => {
		expect(isAllowedDocUrl(new URL("https://evil.docs.wpilib.org/x"))).toBe(false);
	});

	it("ignores userinfo and port tricks", () => {
		expect(isAllowedDocUrl(new URL("https://docs.wpilib.org@evil.example.com/x"))).toBe(false);
	});
});
