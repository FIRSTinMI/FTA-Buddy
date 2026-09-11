/**
 * Manual eval for the troubleshooting assistant. Not run in CI.
 *
 *   ANTHROPIC_API_KEY=... bun run src/tests/troubleshoot-chat.eval.ts
 *
 * Needs the DB env (DB_*) for corpus retrieval. Read-only: it never writes
 * conversations, messages, or spend. Prints each answer with its citations,
 * token usage, and cost.
 */
import "dotenv/config";
import { connect } from "../db/db";
import { streamAnswer } from "../util/troubleshoot/chat/answer";
import { retrieveChunks } from "../util/troubleshoot/chat/retrieve";
import { SOURCE_LABELS } from "../util/troubleshoot/chat/types";
import { costMicroUsd, TROUBLESHOOT_MODEL } from "../util/troubleshoot/pricing";

const QUESTIONS = [
	"Radio status light is solid red and the robot never connects to the field. What do I check first?",
	"Driver Station shows robot code green, comms green, but joysticks do nothing when enabled.",
	"Robot browns out every time the shooter spins up. Battery reads 12.6 V on the cart.",
	"roboRIO status light is flashing and the team says it was fine in the pits.",
	"Which pin on the PDH is the main breaker?",
];

if (!process.env.ANTHROPIC_API_KEY) {
	console.log("ANTHROPIC_API_KEY is not set. Skipping eval.");
	process.exit(0);
}

async function main() {
	await connect();

	let totalMicro = 0;
	for (const [i, q] of QUESTIONS.entries()) {
		console.log(`\n=== Q${i + 1}: ${q}`);
		const retrieval = await retrieveChunks(q, undefined, 6);
		const chunks = retrieval.chunks;
		console.log(`queries: ${retrieval.queries.join(" | ")}`);
		console.log(`retrieved ${chunks.length} chunk(s): ${chunks.map((c) => `${c.source}:${c.title}`).join(" | ")}`);
		const gen = streamAnswer({ history: [], message: q, docs: chunks });
		const cited: string[] = [];
		let next = await gen.next();
		process.stdout.write("--- answer ---\n");
		while (!next.done) {
			const ev = next.value;
			if (ev.type === "delta") process.stdout.write(ev.text);
			else if (ev.type === "citation")
				cited.push(`${SOURCE_LABELS[ev.source]}: ${ev.title}${ev.url ? ` <${ev.url}>` : ""}`);
			else if (ev.type === "error") process.stdout.write(`\n[error] ${ev.message}`);
			next = await gen.next();
		}
		const r = next.value;
		const cost = costMicroUsd(r.usage);
		totalMicro += cost;
		console.log("\n--- citations ---");
		for (const c of cited) console.log(`- ${c}`);
		if (cited.length === 0) console.log("(none)");
		console.log(
			`--- usage: in=${r.usage.input_tokens} cacheRead=${r.usage.cache_read_input_tokens ?? 0} cacheWrite=${r.usage.cache_creation_input_tokens ?? 0} out=${r.usage.output_tokens} stop=${r.stopReason} cost=$${(cost / 1e6).toFixed(4)}`,
		);
	}
	console.log(`\nmodel=${TROUBLESHOOT_MODEL} total=$${(totalMicro / 1e6).toFixed(4)}`);
}

main().then(() => process.exit(0));
