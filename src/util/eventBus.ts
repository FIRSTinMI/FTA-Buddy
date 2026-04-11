import { redis, redisSub } from "./redis";

const PREFIX = "ftabuddy:";

export const bus = {
	/**
	 * Publish data to a named channel. All subscribed instances (including this one)
	 * will receive the message via their redisSub connection.
	 */
	publish(channel: string, data: unknown): void {
		redis.publish(PREFIX + channel, JSON.stringify(data));
	},

	/**
	 * Subscribe to a channel. Returns an unsubscribe function — call it in `finally`
	 * to avoid listener leaks when a tRPC subscription ends.
	 */
	subscribe(channel: string, handler: (data: unknown) => void): () => void {
		const fullChannel = PREFIX + channel;
		const listener = (ch: string, msg: string) => {
			if (ch !== fullChannel) return;
			try {
				handler(JSON.parse(msg));
			} catch (err) {
				console.error(`[EventBus] Handler error on channel ${ch}:`, err);
			}
		};
		redisSub.subscribe(fullChannel);
		redisSub.on("message", listener);
		return () => {
			redisSub.unsubscribe(fullChannel);
			redisSub.off("message", listener);
		};
	},
};
