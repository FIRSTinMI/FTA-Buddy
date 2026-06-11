/**
 * Per-event mutex. Serializes async work keyed by event code so concurrent
 * tRPC mutations for the same event run in arrival order. Useful anywhere a
 * read-modify-write against Redis or another shared store could otherwise
 * race — frame uploads, timing updates, cycle tracking, checklist updates.
 *
 * Single-process Bun deployment: an in-memory promise chain is sufficient.
 * If we ever shard to multiple Node processes per event, this needs to move
 * to a Redis WATCH/MULTI or Lua-script approach.
 */
const locks = new Map<string, Promise<void>>();

export async function withEventLock<T>(eventCode: string, fn: () => Promise<T>): Promise<T> {
	const prev = locks.get(eventCode) ?? Promise.resolve();
	let release!: () => void;
	const next = new Promise<void>((r) => {
		release = r;
	});
	locks.set(eventCode, next);
	try {
		await prev;
		return await fn();
	} finally {
		release();
		if (locks.get(eventCode) === next) locks.delete(eventCode);
	}
}
