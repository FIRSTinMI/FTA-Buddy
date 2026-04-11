import { redis, redisSub } from "./redis";

const PREFIX = "ftabuddy:";

/** Reference count per full channel name so we only call redisSub.unsubscribe when the last handler is gone. */
const channelRefCount = new Map<string, number>();

export const bus = {
	/**
	 * Publish data to a named channel. All subscribed instances (including this one)
	 * will receive the message via their redisSub connection.
	 */
	publish(channel: string, data: unknown): void {
		redis.publish(PREFIX + channel, JSON.stringify(data)).catch((err) =>
			console.error(`[EventBus] Publish failed on channel ${channel}:`, err),
		);
	},

	/**
	 * Subscribe to a channel. Returns an unsubscribe function — call it in `finally`
	 * to avoid listener leaks when a tRPC subscription ends.
	 *
	 * redisSub.unsubscribe() is only called when the *last* handler for a channel is
	 * removed, so concurrent subscribers on the same channel don't interfere.
	 */
	subscribe(channel: string, handler: (data: unknown) => void): () => void {
		const fullChannel = PREFIX + channel;

		const listener = (ch: string, msg: string) => {
			if (ch !== fullChannel) return;
			let data: unknown;
			try {
				data = JSON.parse(msg);
			} catch {
				return; // ignore malformed payloads
			}
			try {
				const result = handler(data) as unknown;
				// Guard against async handlers — catch any returned promise rejection
				if (result !== null && result !== undefined && typeof (result as Promise<unknown>).then === "function") {
					(result as Promise<unknown>).catch((err: unknown) =>
						console.error(`[EventBus] Async handler error on channel ${channel}:`, err),
					);
				}
			} catch (err) {
				console.error(`[EventBus] Handler error on channel ${channel}:`, err);
			}
		};

		const refCount = (channelRefCount.get(fullChannel) ?? 0) + 1;
		channelRefCount.set(fullChannel, refCount);
		if (refCount === 1) {
			redisSub.subscribe(fullChannel).catch((err) =>
				console.error(`[EventBus] Subscribe failed on channel ${channel}:`, err),
			);
		}
		redisSub.on("message", listener);

		return () => {
			redisSub.off("message", listener);
			const remaining = (channelRefCount.get(fullChannel) ?? 1) - 1;
			if (remaining <= 0) {
				channelRefCount.delete(fullChannel);
				redisSub.unsubscribe(fullChannel).catch((err) =>
					console.error(`[EventBus] Unsubscribe failed on channel ${channel}:`, err),
				);
			} else {
				channelRefCount.set(fullChannel, remaining);
			}
		};
	},
};
