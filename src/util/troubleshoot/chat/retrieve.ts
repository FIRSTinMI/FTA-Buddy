import { searchChunks, type ChunkHit } from "../chunks";
import { broadQuery } from "./keywords";

/**
 * Retrieve the top `limit` chunks for a turn. First an exact (AND) search on the
 * new message; if that comes up short, a broad (OR) search over the message plus
 * keywords from the last assistant answer fills the rest.
 */
export async function retrieveChunks(
	message: string,
	lastAssistant: string | undefined,
	limit = 6,
): Promise<ChunkHit[]> {
	const seen = new Map<string, ChunkHit>();
	for (const hit of await searchChunks(message, limit)) seen.set(hit.id, hit);
	if (seen.size < limit) {
		const broad = broadQuery(message, lastAssistant);
		if (broad) {
			for (const hit of await searchChunks(broad, limit * 2)) {
				if (seen.size >= limit) break;
				if (!seen.has(hit.id)) seen.set(hit.id, hit);
			}
		}
	}
	return [...seen.values()];
}
