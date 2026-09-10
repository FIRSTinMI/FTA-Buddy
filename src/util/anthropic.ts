import Anthropic from "@anthropic-ai/sdk";

// Env-guarded client, same shape as the OpenAI one in ai-report-generator.ts.
// Callers must check `anthropicConfigured` (or handle the throw) before use.
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

export const anthropicConfigured = Boolean(anthropicApiKey);

let client: Anthropic | null = null;

/** Lazily construct the client. Throws a plain Error when ANTHROPIC_API_KEY is unset. */
export function getAnthropic(): Anthropic {
	if (!anthropicApiKey) {
		throw new Error("ANTHROPIC_API_KEY is not set");
	}
	if (!client) {
		client = new Anthropic({ apiKey: anthropicApiKey });
	}
	return client;
}
