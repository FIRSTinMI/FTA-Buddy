import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { KIND_LABELS } from "../../shared/logs/detect";
import { db } from "../db/db";
import { matchLogs, teamUploadFiles, teamUploadMatches, teamUploads, teamUploadShares } from "../db/schema";
import { eventProcedure, protectedProcedure, publicProcedure, router } from "../trpc";
import { ghostCsaEnabled, ghostCsaTicketUrl, refreshGhostCsa, sendUploadToGhostCsa } from "../util/uploads/ghost-csa";
import { linkUploadMatch, setUploadTeam, unlinkUploadMatch } from "../util/uploads/ingest";
import { deleteBytes, loadBytes } from "../util/uploads/store";

/**
 * Reading, sharing and acting on what a team uploaded.
 *
 * Two audiences on two paths. Volunteers come in through `eventProcedure`, which
 * scopes everything to the event they are signed in to. Everyone else comes in
 * through a share token: `getShared` and `sharedFileText` are the only public
 * procedures, they read a row that says exactly which files the token covers,
 * and they check the expiry on every call.
 */

/** Longest a share link may live. A CSA Slack thread outlives an event, a token should not. */
const MAX_SHARE_HOURS = 14 * 24;

const fileView = {
	id: teamUploadFiles.id,
	parent_id: teamUploadFiles.parent_id,
	path: teamUploadFiles.path,
	kind: teamUploadFiles.kind,
	size: teamUploadFiles.size,
	meta: teamUploadFiles.meta,
};

async function uploadOr404(id: string, eventCode: string) {
	const upload = await db.query.teamUploads.findFirst({
		where: and(eq(teamUploads.id, id), eq(teamUploads.event, eventCode)),
	});
	if (!upload) throw new TRPCError({ code: "NOT_FOUND", message: "Upload not found at this event" });
	return upload;
}

/** Matches attached to an upload, with the teams in that match for context. */
async function matchesFor(uploadId: string) {
	const rows = await db
		.select({
			link: teamUploadMatches,
			match: {
				id: matchLogs.id,
				start_time: matchLogs.start_time,
				red1: matchLogs.red1,
				red2: matchLogs.red2,
				red3: matchLogs.red3,
				blue1: matchLogs.blue1,
				blue2: matchLogs.blue2,
				blue3: matchLogs.blue3,
			},
		})
		.from(teamUploadMatches)
		.leftJoin(matchLogs, eq(teamUploadMatches.match_id, matchLogs.id))
		.where(eq(teamUploadMatches.upload_id, uploadId))
		.execute();
	return rows.map((r) => ({ ...r.link, match: r.match }));
}

/** Text of one file, from the stored preview or decoded from the bytes. */
async function textOf(fileId: string, maxChars: number): Promise<{ path: string; text: string; truncated: boolean }> {
	const file = await db.query.teamUploadFiles.findFirst({ where: eq(teamUploadFiles.id, fileId) });
	if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
	let text = file.text_preview ?? "";
	if (!text && file.kind === "text") {
		const bytes = await loadBytes(file);
		text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
	}
	const truncated = text.length > maxChars;
	return { path: file.path, text: truncated ? `${text.slice(0, maxChars)}\n\n[truncated]` : text, truncated };
}

export const uploadsRouter = router({
	/** Everything uploaded at this event, newest first. */
	list: eventProcedure
		.input(
			z
				.object({ team: z.number().optional(), limit: z.number().min(1).max(200).default(50) })
				.default({ limit: 50 }),
		)
		.query(async ({ ctx, input }) => {
			const where = input.team
				? and(eq(teamUploads.event, ctx.event.code), eq(teamUploads.team, input.team))
				: eq(teamUploads.event, ctx.event.code);
			const rows = await db
				.select({
					id: teamUploads.id,
					code: teamUploads.code,
					team: teamUploads.team,
					team_source: teamUploads.team_source,
					source: teamUploads.source,
					uploader_name: teamUploads.uploader_name,
					notes: teamUploads.notes,
					notes_withheld: teamUploads.notes_withheld,
					created_at: teamUploads.created_at,
					ghost_status: teamUploads.ghost_status,
					ghost_ticket: teamUploads.ghost_ticket,
					file_count: sql<number>`(select count(*) from ${teamUploadFiles} where ${teamUploadFiles.upload_id} = ${teamUploads.id} and ${teamUploadFiles.parent_id} is null)`,
				})
				.from(teamUploads)
				.where(where)
				.orderBy(desc(teamUploads.created_at))
				.limit(input.limit)
				.execute();
			return rows;
		}),

	/** One upload in full: files, attached matches, and the Ghost CSA report if there is one. */
	get: eventProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
		const upload = await uploadOr404(input.id, ctx.event.code);
		const files = await db
			.select(fileView)
			.from(teamUploadFiles)
			.where(eq(teamUploadFiles.upload_id, upload.id))
			.orderBy(teamUploadFiles.path)
			.execute();
		const shares = await db
			.select()
			.from(teamUploadShares)
			.where(eq(teamUploadShares.upload_id, upload.id))
			.orderBy(desc(teamUploadShares.create_time))
			.execute();
		return {
			upload,
			files,
			matches: await matchesFor(upload.id),
			shares,
			ghostCsaAvailable: ghostCsaEnabled(),
			ghostCsaUrl: upload.ghost_ticket ? ghostCsaTicketUrl(upload.ghost_ticket) : null,
		};
	}),

	/** Find an upload by the code the team was given, so a CSA can pull it up from a sticky note. */
	byCode: protectedProcedure.input(z.object({ code: z.string().min(4).max(16) })).query(async ({ input }) => {
		const code = input.code.trim().toUpperCase();
		const upload = await db.query.teamUploads.findFirst({ where: eq(teamUploads.code, code) });
		if (!upload) throw new TRPCError({ code: "NOT_FOUND", message: "No upload has that code" });
		return { id: upload.id, event: upload.event, team: upload.team, created_at: upload.created_at };
	}),

	fileText: eventProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				fileId: z.string().uuid(),
				maxChars: z.number().min(500).max(200_000).default(60_000),
			}),
		)
		.query(async ({ ctx, input }) => {
			await uploadOr404(input.id, ctx.event.code);
			const file = await db.query.teamUploadFiles.findFirst({ where: eq(teamUploadFiles.id, input.fileId) });
			if (!file || file.upload_id !== input.id)
				throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
			return textOf(input.fileId, input.maxChars);
		}),

	setTeam: eventProcedure
		.input(z.object({ id: z.string().uuid(), team: z.number().int().min(1).max(99999).nullable() }))
		.mutation(async ({ ctx, input }) => {
			await uploadOr404(input.id, ctx.event.code);
			await setUploadTeam(input.id, input.team);
			return { ok: true };
		}),

	linkMatch: eventProcedure
		.input(z.object({ id: z.string().uuid(), fileId: z.string().uuid(), matchId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			await uploadOr404(input.id, ctx.event.code);
			await linkUploadMatch({ uploadId: input.id, fileId: input.fileId, matchId: input.matchId });
			return { ok: true };
		}),

	unlinkMatch: eventProcedure
		.input(z.object({ id: z.string().uuid(), matchId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			await uploadOr404(input.id, ctx.event.code);
			await unlinkUploadMatch(input.id, input.matchId);
			return { ok: true };
		}),

	/**
	 * Hand the bundle and logs to Limelight's Ghost CSA. This sends a team's files
	 * to a third party, so it is always a deliberate press, never a side effect of
	 * opening the page.
	 */
	sendToGhostCsa: eventProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
		await uploadOr404(input.id, ctx.event.code);
		try {
			const ticketNumber = await sendUploadToGhostCsa(input.id, ctx.user?.id ?? null);
			return { ticketNumber, url: ghostCsaTicketUrl(ticketNumber) };
		} catch (err) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: err instanceof Error ? err.message : "Ghost CSA could not be reached",
			});
		}
	}),

	refreshGhostCsa: eventProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
		await uploadOr404(input.id, ctx.event.code);
		return { status: await refreshGhostCsa(input.id) };
	}),

	/**
	 * Make a link somebody without an account can open, covering the files chosen
	 * and nothing else. This is how a CSA puts a log in the CSA Slack.
	 */
	createShare: eventProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				/** Empty means every file in the upload. */
				fileIds: z.array(z.string().uuid()).max(200).default([]),
				includeAnalysis: z.boolean().default(false),
				includeFmsLogs: z.boolean().default(false),
				label: z.string().max(120).optional(),
				hours: z.number().int().min(1).max(MAX_SHARE_HOURS).default(72),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await uploadOr404(input.id, ctx.event.code);
			if (input.fileIds.length > 0) {
				const owned = await db
					.select({ id: teamUploadFiles.id })
					.from(teamUploadFiles)
					.where(eq(teamUploadFiles.upload_id, input.id))
					.execute();
				const ownedIds = new Set(owned.map((f) => f.id));
				const stray = input.fileIds.filter((id) => !ownedIds.has(id));
				if (stray.length > 0)
					throw new TRPCError({ code: "BAD_REQUEST", message: "Those files are not in this upload" });
			}
			const [share] = await db
				.insert(teamUploadShares)
				.values({
					upload_id: input.id,
					file_ids: input.fileIds,
					include_analysis: input.includeAnalysis,
					include_fms_logs: input.includeFmsLogs,
					label: input.label ?? null,
					event: ctx.event.code,
					created_by: ctx.user?.id ?? null,
					expire_time: new Date(Date.now() + input.hours * 3600_000),
				})
				.returning()
				.execute();
			return { id: share.id, expires: share.expire_time, path: `/share/upload/${share.id}` };
		}),

	revokeShare: eventProcedure.input(z.object({ shareId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
		const share = await db.query.teamUploadShares.findFirst({ where: eq(teamUploadShares.id, input.shareId) });
		if (!share || share.event !== ctx.event.code)
			throw new TRPCError({ code: "NOT_FOUND", message: "Share not found" });
		await db
			.update(teamUploadShares)
			.set({ revoked: true })
			.where(eq(teamUploadShares.id, input.shareId))
			.execute();
		return { ok: true };
	}),

	/** Delete an upload and its stored bytes. */
	delete: eventProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
		await uploadOr404(input.id, ctx.event.code);
		const files = await db.select().from(teamUploadFiles).where(eq(teamUploadFiles.upload_id, input.id)).execute();
		for (const file of files) await deleteBytes(file);
		await db.delete(teamUploads).where(eq(teamUploads.id, input.id)).execute();
		return { ok: true };
	}),

	// #region public share access

	/** What a share token opens. No account, no event token. */
	getShared: publicProcedure.input(z.object({ token: z.string().uuid() })).query(async ({ input }) => {
		const share = await resolveShare(input.token);
		const allowed = new Set(share.file_ids);
		const files = (
			await db
				.select(fileView)
				.from(teamUploadFiles)
				.where(eq(teamUploadFiles.upload_id, share.upload_id))
				.orderBy(teamUploadFiles.path)
				.execute()
		).filter((f) => allowed.size === 0 || allowed.has(f.id));
		const upload = await db.query.teamUploads.findFirst({ where: eq(teamUploads.id, share.upload_id) });
		if (!upload) throw new TRPCError({ code: "NOT_FOUND", message: "Upload not found" });

		await db
			.update(teamUploadShares)
			.set({ view_count: share.view_count + 1 })
			.where(eq(teamUploadShares.id, share.id))
			.execute();

		return {
			label: share.label,
			expires: share.expire_time,
			team: upload.team,
			event: upload.event,
			createdAt: upload.created_at,
			// The team's own words are shown to a human here, marked when they were withheld from prompts.
			notes: upload.notes,
			notesWithheld: upload.notes_withheld,
			files: files.map((f) => ({ ...f, kindLabel: KIND_LABELS[f.kind] })),
			analysis: share.include_analysis ? upload.ghost_analysis : null,
			matches: share.include_fms_logs ? await matchesFor(share.upload_id) : [],
		};
	}),

	sharedFileText: publicProcedure
		.input(
			z.object({
				token: z.string().uuid(),
				fileId: z.string().uuid(),
				maxChars: z.number().min(500).max(200_000).default(60_000),
			}),
		)
		.query(async ({ input }) => {
			const share = await resolveShare(input.token);
			const allowed = new Set(share.file_ids);
			const file = await db.query.teamUploadFiles.findFirst({ where: eq(teamUploadFiles.id, input.fileId) });
			if (!file || file.upload_id !== share.upload_id || (allowed.size > 0 && !allowed.has(file.id))) {
				throw new TRPCError({ code: "NOT_FOUND", message: "That file is not in this share" });
			}
			return textOf(input.fileId, input.maxChars);
		}),

	// #endregion
});

/**
 * Look up a share token and refuse it when it is past its time. Expiry is
 * checked on every read rather than swept on a timer, so a link stops working
 * the moment it should.
 */
export async function resolveShare(token: string) {
	const share = await db.query.teamUploadShares.findFirst({ where: eq(teamUploadShares.id, token) });
	if (!share || share.revoked) throw new TRPCError({ code: "NOT_FOUND", message: "That share link is not valid" });
	if (new Date() > share.expire_time)
		throw new TRPCError({ code: "NOT_FOUND", message: "That share link has expired" });
	return share;
}
