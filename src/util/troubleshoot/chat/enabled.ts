import { TRPCError } from "@trpc/server";
import { redis } from "../../redis";
import { anthropicConfigured } from "../../anthropic";

const DISABLED_KEY = "ftabuddy:troubleshoot:disabled";

/** Env kill switch. Default on. Only "false"/"0"/"no" turn it off. */
function envEnabled(): boolean {
	const v = (process.env.TROUBLESHOOT_CHAT_ENABLED ?? "true").trim().toLowerCase();
	return !["false", "0", "no", "off"].includes(v);
}

export async function isChatEnabled(): Promise<boolean> {
	if (!envEnabled() || !anthropicConfigured) return false;
	const disabled = await redis.get(DISABLED_KEY);
	return !disabled;
}

/** Admin toggle. Sets or clears the Redis flag; the env switch still wins when off. */
export async function setChatEnabled(enabled: boolean): Promise<boolean> {
	if (enabled) await redis.del(DISABLED_KEY);
	else await redis.set(DISABLED_KEY, "1");
	return isChatEnabled();
}

export async function assertChatEnabled(): Promise<void> {
	if (!(await isChatEnabled())) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "The troubleshooting assistant is not available right now. Find a CSA for help.",
		});
	}
}
