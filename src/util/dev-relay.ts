import Redis from "ioredis";
import { redis as devRedis } from "./redis";

/**
 * Dev-only, STRICTLY ONE-WAY live relay. The dev instance opens a read-only
 * subscribe connection to the PRODUCTION Redis and forwards the event's pub/sub
 * traffic (field frames, robot/field status, timing, checklist, scorekeeper,
 * notes - everything published on `ftabuddy:event:<code>:*`) into THIS instance's
 * own Redis. Dev clients then see live prod data with no second extension.
 *
 * It only ever SUBSCRIBEs to prod - it never publishes or writes there - so it
 * is physically incapable of affecting the production event.
 */

const RELAY_KEY = "ftabuddy:dev:relay_event";

let current: { eventCode: string; sub: Redis } | null = null;

export function getRelayStatus(): { enabled: boolean; eventCode: string | null } {
	return { enabled: !!current, eventCode: current?.eventCode ?? null };
}

export async function stopRelay(): Promise<void> {
	if (!current) return;
	const { sub } = current;
	current = null;
	try {
		await sub.punsubscribe();
	} catch {
		/* ignore */
	}
	sub.disconnect();
	devRedis.del(RELAY_KEY).catch(() => {});
}

export async function startRelay(eventCode: string): Promise<void> {
	await stopRelay();
	const url = process.env.PROD_REDIS_URL;
	if (!url) throw new Error("PROD_REDIS_URL not configured on this instance");

	const sub = new Redis(url, { maxRetriesPerRequest: null });
	const pattern = `ftabuddy:event:${eventCode}:*`;
	const monitorKey = `ftabuddy:event:${eventCode}:monitor_frame`;
	const historyKey = `ftabuddy:event:${eventCode}:history`;

	sub.on("pmessage", (_pattern: string, channel: string, message: string) => {
		// Forward verbatim into dev's own bus (payloads are already SuperJSON strings).
		devRedis.publish(channel, message).catch(() => {});
		// Frames also seed the current-frame + history keys so refreshes / late
		// joiners on dev render immediately, mirroring what field.post does.
		if (channel.endsWith(":frame")) {
			devRedis.set(monitorKey, message).catch(() => {});
			devRedis
				.multi()
				.lpush(historyKey, message)
				.ltrim(historyKey, 0, 49)
				.expire(historyKey, 86400)
				.exec()
				.catch(() => {});
		}
	});
	sub.on("error", (err) => console.error("[dev-relay] prod Redis error:", err));

	await sub.psubscribe(pattern);
	current = { eventCode, sub };
	devRedis.set(RELAY_KEY, eventCode).catch(() => {});
	console.log(`[dev-relay] relaying prod event ${eventCode} -> dev`);
}

/** Re-arm the relay on boot if it was left on before a restart. */
export async function restoreRelay(): Promise<void> {
	try {
		const ev = await devRedis.get(RELAY_KEY);
		if (ev) await startRelay(ev);
	} catch (err) {
		console.error("[dev-relay] restore failed:", err);
	}
}
