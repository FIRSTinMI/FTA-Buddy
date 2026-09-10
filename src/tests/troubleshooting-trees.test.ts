import { describe, expect, test } from "bun:test";
import { readdirSync } from "fs";
import { join } from "path";
import { checkTreeIntegrity, getNode, getTree, treeSchema, trees } from "../../shared/troubleshooting";

const treesDir = join(__dirname, "../../shared/troubleshooting/trees");

describe("troubleshooting trees", () => {
	test("every JSON file in trees/ is loaded", () => {
		const files = readdirSync(treesDir)
			.filter((f) => f.endsWith(".json"))
			.map((f) => f.replace(/\.json$/, ""))
			.sort();
		const loaded = trees.map((t) => t.id).sort();
		expect(loaded).toEqual(files);
	});

	test("tree ids are unique and match the file name", () => {
		const ids = trees.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) {
			expect(readdirSync(treesDir)).toContain(`${id}.json`);
		}
	});

	for (const tree of trees) {
		describe(tree.id, () => {
			test("matches the schema", () => {
				expect(treeSchema.safeParse(tree).success).toBe(true);
			});

			test("no dangling next, no unreachable nodes, keys match ids", () => {
				expect(checkTreeIntegrity(tree)).toEqual([]);
			});

			test("start is a question", () => {
				expect(tree.nodes[tree.start]?.kind).toBe("question");
			});

			test("has at least one leaf", () => {
				expect(Object.values(tree.nodes).some((n) => n.kind === "leaf")).toBe(true);
			});

			test("every leaf has 2 to 6 steps", () => {
				for (const node of Object.values(tree.nodes)) {
					if (node.kind !== "leaf") continue;
					expect(node.steps.length, `${tree.id}/${node.id}`).toBeGreaterThanOrEqual(2);
					expect(node.steps.length, `${tree.id}/${node.id}`).toBeLessThanOrEqual(6);
				}
			});

			test("every link is https", () => {
				for (const node of Object.values(tree.nodes)) {
					if (node.kind !== "leaf") continue;
					for (const link of node.links ?? []) {
						expect(link.url, `${tree.id}/${node.id}`).toStartWith("https://");
					}
				}
			});

			test("option labels within a question are unique", () => {
				for (const node of Object.values(tree.nodes)) {
					if (node.kind !== "question") continue;
					const labels = node.options.map((o) => o.label);
					expect(new Set(labels).size, `${tree.id}/${node.id}`).toBe(labels.length);
				}
			});

			test("no banned words in copy", () => {
				const banned = [/\bAI\b/, /\bsimply\b/i, /\bplease\b/i, /—/];
				const text = JSON.stringify(tree);
				for (const re of banned) {
					expect(text, `${tree.id} contains ${re}`).not.toMatch(re);
				}
			});
		});
	}

	test("getTree and getNode resolve", () => {
		const first = trees[0];
		expect(first).toBeDefined();
		if (!first) return;
		expect(getTree(first.id)?.id).toBe(first.id);
		expect(getNode(first.id, first.start)?.id).toBe(first.start);
		expect(getTree("does-not-exist")).toBeUndefined();
		expect(getNode(first.id, "does-not-exist")).toBeUndefined();
	});

	test("schema rejects a dangling next only via integrity check, and rejects bad shapes", () => {
		const bad = {
			id: "x",
			title: "x",
			summary: "x",
			start: "a",
			nodes: {
				a: { kind: "question", id: "a", question: "?", options: [{ label: "1", next: "b" }] },
			},
		};
		// one option is below the minimum of two
		expect(treeSchema.safeParse(bad).success).toBe(false);

		const dangling = treeSchema.parse({
			...bad,
			nodes: {
				a: {
					kind: "question",
					id: "a",
					question: "?",
					options: [
						{ label: "1", next: "b" },
						{ label: "2", next: "c" },
					],
				},
				c: { kind: "leaf", id: "c", title: "c", steps: ["one", "two"] },
			},
		});
		const problems = checkTreeIntegrity(dangling);
		expect(problems.some((p) => p.includes('missing node "b"'))).toBe(true);
	});
});
