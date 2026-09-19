import { describe, expect, test } from "bun:test";
import { submissionHash } from "../util/uploads/ingest";

const file = (name: string, body: string) => ({ fileName: name, data: new TextEncoder().encode(body) });

describe("submission fingerprint", () => {
	test("the same files in a different order are the same submission", () => {
		const a = [file("a.dslog", "one"), file("b.dsevents", "two")];
		const b = [file("b.dsevents", "two"), file("a.dslog", "one")];
		expect(submissionHash(a)).toBe(submissionHash(b));
	});

	test("a renamed file is still the same submission", () => {
		expect(submissionHash([file("a.dslog", "one")])).toBe(submissionHash([file("renamed.dslog", "one")]));
	});

	test("one byte different is a different submission", () => {
		expect(submissionHash([file("a.dslog", "one")])).not.toBe(submissionHash([file("a.dslog", "onf")]));
	});

	test("an extra file is a different submission", () => {
		const one = [file("a.dslog", "one")];
		expect(submissionHash(one)).not.toBe(submissionHash([...one, file("b.dsevents", "two")]));
	});

	test("duplicate bytes within one submission still count once each", () => {
		const twice = [file("a.dslog", "one"), file("b.dslog", "one")];
		expect(submissionHash(twice)).not.toBe(submissionHash([file("a.dslog", "one")]));
	});
});
