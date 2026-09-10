// Content rules for troubleshooting steps everywhere (status light help, guided trees, monitor).
// A check box holds only an outcome, never the next instruction; conditionals are authored as checks.
import { describe, expect, test } from "bun:test";
import { statusLightHelp } from "../../app/src/pages/references/status-light-help/index";
import { monitorSteps } from "../../shared/troubleshooting/monitor-steps";
import { trees } from "../../shared/troubleshooting";
import type { FlowStep } from "../../shared/troubleshooting/steps";

type Steps = readonly (string | FlowStep)[];

const OUTCOME_MAX = 60;
const CONDITIONAL = /^(if |still |when |unless )/i;

function problems(label: string, steps: Steps | undefined): string[] {
	const out: string[] = [];
	if (!steps) return out;
	steps.forEach((s, i) => {
		const at = `${label} step ${i + 1}`;
		if (typeof s === "string") {
			if (CONDITIONAL.test(s)) out.push(`${at}: conditional sentence should be a check object: "${s.slice(0, 70)}"`);
			if (s.includes("?")) out.push(`${at}: question should be a check object: "${s.slice(0, 70)}"`);
			return;
		}
		if (s.kind === "do") {
			if (CONDITIONAL.test(s.text)) out.push(`${at}: do step reads as a conditional: "${s.text.slice(0, 70)}"`);
			return;
		}
		if (!s.text.trim().endsWith("?")) out.push(`${at}: check text must be a question: "${s.text}"`);
		for (const [side, v] of [["yes", s.yes], ["no", s.no]] as const) {
			if (v === undefined) continue;
			if (v.length > OUTCOME_MAX) out.push(`${at}: ${side} outcome too long (${v.length}): "${v}"`);
			if (/\b(then|after that|next,)\b/i.test(v)) out.push(`${at}: ${side} outcome chains instructions: "${v}"`);
			if (!/[.!]$/.test(v.trim())) out.push(`${at}: ${side} outcome must end with a period: "${v}"`);
		}
		if (s.yes === undefined && s.no === undefined) out.push(`${at}: check needs at least one of yes/no spelled out`);
	});
	return out;
}

describe("status light help steps", () => {
	for (const [id, entry] of Object.entries(statusLightHelp)) {
		test(id, () => {
			const found = [...problems(id, entry.steps), ...(entry.variants ?? []).flatMap((v) => problems(`${id}/${v.label}`, v.steps))];
			expect(found).toEqual([]);
		});
	}
});

describe("guided tree leaf steps", () => {
	for (const tree of trees) {
		for (const node of Object.values(tree.nodes)) {
			if (node.kind !== "leaf") continue;
			test(`${tree.id}/${node.id}`, () => {
				expect(problems(`${tree.id}/${node.id}`, node.steps)).toEqual([]);
			});
		}
	}
});

describe("monitor steps", () => {
	for (const [key, entry] of Object.entries(monitorSteps)) {
		test(key, () => {
			expect(problems(key, entry.steps)).toEqual([]);
		});
	}
});
