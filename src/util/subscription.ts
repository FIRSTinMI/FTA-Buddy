/**
 * Creates a simple async queue that can be used to bridge multiple EventEmitter
 * subscriptions into a single tRPC v11 async generator subscription.
 *
 * Usage:
 *   const { push, drain } = subscriptionQueue<T>(signal);
 *   emitter.on('event', push);
 *   try { yield* drain(); } finally { emitter.off('event', push); }
 */
export function subscriptionQueue<T>(signal: AbortSignal) {
	const queue: T[] = [];
	let notify: (() => void) | null = null;

	const push = (value: T) => {
		queue.push(value);
		notify?.();
		notify = null;
	};

	async function* drain(): AsyncGenerator<T> {
		while (!signal.aborted) {
			while (queue.length > 0) {
				yield queue.shift()!;
			}
			await new Promise<void>((resolve) => {
				notify = resolve;
				// Clean up the abort listener when resolved by push(),
				// otherwise it would leak one listener per iteration.
				const onAbort = () => resolve();
				signal.addEventListener("abort", onAbort, { once: true });
				const origNotify = notify;
				notify = () => {
					signal.removeEventListener("abort", onAbort);
					origNotify?.();
				};
			});
		}
	}

	return { push, drain };
}

/**
 * Returns a promise that resolves after `ms` milliseconds, but rejects (or
 * simply resolves early) when the provided AbortSignal fires.
 */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise<void>((resolve) => {
		const id = setTimeout(resolve, ms);
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(id);
				resolve();
			},
			{ once: true },
		);
	});
}
