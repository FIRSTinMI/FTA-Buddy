import SuperJSON from "superjson";
import { redis, redisSub } from "./redis";

const PREFIX = "ftabuddy:";

/**
 * One Set of handlers per full channel name.
 * A single redisSub "message" listener dispatches to these sets, so adding more
 * subscriptions never increases the number of Node.js EventEmitter listeners.
 */
const channelHandlers = new Map<string, Set<(data: unknown) => void>>();

redisSub.on("message", (ch: string, msg: string) => {
	const handlers = channelHandlers.get(ch);
	if (!handlers || handlers.size === 0) return;
	let data: unknown;
	try {
		data = SuperJSON.parse(msg);
	} catch {
		return; // ignore malformed payloads
	}
	for (const handler of handlers) {
		try {
			const result = handler(data) as unknown;
			// Guard against async handlers - catch any returned promise rejection
			if (result !== null && result !== undefined && typeof (result as Promise<unknown>).then === "function") {
				(result as Promise<unknown>).catch((err: unknown) =>
					console.error(`[EventBus] Async handler error on channel ${ch}:`, err),
				);
			}
		} catch (err) {
			console.error(`[EventBus] Handler error on channel ${ch}:`, err);
		}
	}
});

export const bus = {
	/**
	 * Publish data to a named channel. All subscribed instances (including this one)
	 * will receive the message via their redisSub connection.
	 */
	publish(channel: string, data: unknown): void {
		redis.publish(PREFIX + channel, SuperJSON.stringify(data)).catch((err) =>
			console.error(`[EventBus] Publish failed on channel ${channel}:`, err),
		);
	},

	/**
	 * Subscribe to a channel. Returns an unsubscribe function - call it in `finally`
	 * to avoid listener leaks when a tRPC subscription ends.
	 *
	 * redisSub.subscribe() is only called when the *first* handler for a channel is
	 * added; redisSub.unsubscribe() only when the *last* one is removed.
	 */
	subscribe(channel: string, handler: (data: unknown) => void): () => void {
		const fullChannel = PREFIX + channel;

		let handlers = channelHandlers.get(fullChannel);
		if (!handlers) {
			handlers = new Set();
			channelHandlers.set(fullChannel, handlers);
			redisSub.subscribe(fullChannel).catch((err) =>
				console.error(`[EventBus] Subscribe failed on channel ${channel}:`, err),
			);
		}
		handlers.add(handler);

		return () => {
			const set = channelHandlers.get(fullChannel);
			if (!set) return;
			set.delete(handler);
			if (set.size === 0) {
				channelHandlers.delete(fullChannel);
				redisSub.unsubscribe(fullChannel).catch((err) =>
					console.error(`[EventBus] Unsubscribe failed on channel ${channel}:`, err),
				);
			}
		};
	},
};
