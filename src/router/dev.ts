import { z } from "zod";
import { eq } from "drizzle-orm";
import { publicProcedure, resolveUserFromToken, router } from "../trpc";
import { db } from "../db/db";
import { users } from "../db/schema";
import { isDevMode, prodPool } from "../util/prod-db";
import { copyEventFromProd } from "../util/copy-event";
import { getRelayStatus, startRelay, stopRelay } from "../util/dev-relay";

/**
 * Dev-only tooling exposed on the isolated dev instance. Every mutating/reading
 * procedure is gated by {@link isDevMode} AND a signed-in user, so it is inert on
 * production even if somehow called. Powers the Dev Tools panel:
 *  - copy a real event from prod into dev
 *  - toggle the one-way prod -> dev live relay
 *  - grant/revoke your own admin (dev only)
 */

async function requireDevUser(token: string | undefined) {
	if (!isDevMode()) throw new Error("Dev tools are only available on the dev instance");
	const user = await resolveUserFromToken(token);
	if (!user) throw new Error("Sign in first to use dev tools");
	return user;
}

export const devRouter = router({
	/** Public: lets the client decide whether to render the Dev Tools panel at all. */
	isDev: publicProcedure.query(() => ({ dev: isDevMode() })),

	/** List prod events (read-only) for the copy picker. */
	listProdEvents: publicProcedure.query(async ({ ctx }) => {
		await requireDevUser(ctx.token);
		const { rows } = await prodPool().query(
			"select code, name, archived from events order by archived asc, code desc",
		);
		return rows as { code: string; name: string; archived: boolean }[];
	}),

	/** Copy a whole event graph from prod into dev, remapping user refs to you. */
	copyEventFromProd: publicProcedure.input(z.object({ code: z.string().min(1) })).mutation(async ({ ctx, input }) => {
		const user = await requireDevUser(ctx.token);
		return await copyEventFromProd(input.code, user.id);
	}),

	/** Current one-way relay status. */
	relayStatus: publicProcedure.query(async ({ ctx }) => {
		await requireDevUser(ctx.token);
		return getRelayStatus();
	}),

	/** Start/stop the one-way prod -> dev live relay for an event. */
	setRelay: publicProcedure
		.input(z.object({ eventCode: z.string().nullable(), enabled: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			await requireDevUser(ctx.token);
			if (input.enabled) {
				if (!input.eventCode) throw new Error("eventCode required to enable relay");
				await startRelay(input.eventCode);
			} else {
				await stopRelay();
			}
			return getRelayStatus();
		}),

	/** Grant/revoke admin on your own dev account (dev only). */
	setSelfAdmin: publicProcedure.input(z.object({ admin: z.boolean() })).mutation(async ({ ctx, input }) => {
		const user = await requireDevUser(ctx.token);
		await db.update(users).set({ admin: input.admin }).where(eq(users.id, user.id));
		return { id: user.id, admin: input.admin };
	}),
});
