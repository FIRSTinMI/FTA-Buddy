import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { KIND_LABELS } from "../../shared/logs/detect";
import { db } from "../db/db";
import { matchLogs, teamUploadFiles, teamUploadMatches, teamUploads, teamUploadShares } from "../db/schema";
import { eventProcedure, publicProcedure, router } from "../trpc";
import { fmsGuid } from "./logs";
import { ghostCsaEnabled, ghostCsaTicketUrl, refreshGhostCsa, sendUploadToGhostCsa } from "../util/uploads/ghost-csa";
import { assignUploadToEvent, linkUploadMatch, setUploadTeam, unlinkUploadMatch } from "../util/uploads/ingest";
import { availableSeries, readSeriesData } from "../util/troubleshoot/chat/uploads";
import { readDsEvents } from "../../shared/logs/dslog";
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

	/** Everything a team uploaded at this event, newest first. */
	forTeam: eventProcedure
		.input(z.object({ team: z.number().int().min(1).max(99999) }))
		.query(async ({ ctx, input }) => {
			return db
				.select({
					id: teamUploads.id,
					created_at: teamUploads.created_at,
					source: teamUploads.source,
					ghost_status: teamUploads.ghost_status,
				})
				.from(teamUploads)
				.where(and(eq(teamUploads.event, ctx.event.code), eq(teamUploads.team, input.team)))
				.orderBy(desc(teamUploads.created_at))
				.execute();
		}),

	/**
	 * Uploads nothing could place. Visible to any volunteer at any event, because
	 * an upload nobody can find is worse than one filed in the wrong place.
	 */
	unassigned: eventProcedure.query(async () => {
		return db
			.select({
				id: teamUploads.id,
				team: teamUploads.team,
				created_at: teamUploads.created_at,
				uploader_name: teamUploads.uploader_name,
				file_count: sql<number>`(select count(*) from ${teamUploadFiles} where ${teamUploadFiles.upload_id} = ${teamUploads.id} and ${teamUploadFiles.parent_id} is null)`,
			})
			.from(teamUploads)
			.where(isNull(teamUploads.event))
			.orderBy(desc(teamUploads.created_at))
			.limit(50)
			.execute();
	}),

	/** Attach an unplaced upload to this event, and link its logs to our matches. */
	assignToEvent: eventProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
		const upload = await db.query.teamUploads.findFirst({ where: eq(teamUploads.id, input.id) });
		if (!upload) throw new TRPCError({ code: "NOT_FOUND", message: "Upload not found" });
		if (upload.event && upload.event !== ctx.event.code) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `That upload is already filed under ${upload.event}.`,
			});
		}
		await assignUploadToEvent(input.id, ctx.event.code, `Attached to ${ctx.event.code} by a volunteer.`);
		return { ok: true };
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
		.input(z.object({ id: z.string().uuid(), fileId: z.string().uuid(), matchId: fmsGuid }))
		.mutation(async ({ ctx, input }) => {
			await uploadOr404(input.id, ctx.event.code);
			await linkUploadMatch({ uploadId: input.id, fileId: input.fileId, matchId: input.matchId });
			return { ok: true };
		}),

	unlinkMatch: eventProcedure
		.input(z.object({ id: z.string().uuid(), matchId: fmsGuid }))
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

	/**
	 * Uploads attached to one match, for the station log viewer. This is what turns
	 * "what FMS saw" into "what FMS saw and what the team's own laptop saw".
	 */
	forMatch: eventProcedure.input(z.object({ matchId: fmsGuid })).query(async ({ ctx, input }) => {
		const rows = await db
			.select({
				uploadId: teamUploads.id,
				code: teamUploads.code,
				team: teamUploads.team,
				createdAt: teamUploads.created_at,
				link: teamUploadMatches,
			})
			.from(teamUploadMatches)
			.innerJoin(teamUploads, eq(teamUploadMatches.upload_id, teamUploads.id))
			.where(and(eq(teamUploadMatches.match_id, input.matchId), eq(teamUploads.event, ctx.event.code)))
			.execute();
		// One upload can link the same match through several files; one row each.
		// Prefer the row that knows the station, since that is the one that can
		// also draw our own station log.
		const byUpload = new Map<string, (typeof rows)[number]>();
		for (const row of rows) {
			const existing = byUpload.get(row.uploadId);
			if (!existing || (!existing.link.station && row.link.station)) byUpload.set(row.uploadId, row);
		}
		const uploadIds = [...byUpload.keys()];
		// Which kinds each upload holds, so the viewer can default to the team's
		// own Driver Station log where there is one: it samples ten times faster
		// than the field monitor frames we record.
		const kinds = uploadIds.length
			? await db
					.select({ upload_id: teamUploadFiles.upload_id, kind: teamUploadFiles.kind })
					.from(teamUploadFiles)
					.where(inArray(teamUploadFiles.upload_id, uploadIds))
					.execute()
			: [];
		const kindsOf = (uploadId: string) => kinds.filter((k) => k.upload_id === uploadId).map((k) => k.kind);
		return [...byUpload.values()].map((row) => {
			const has = kindsOf(row.uploadId);
			return {
				uploadId: row.uploadId,
				code: row.code,
				team: row.team,
				createdAt: row.createdAt,
				how: row.link.how,
				reason: row.link.reason,
				station: row.link.station,
				hasDsLog: has.includes("dslog"),
				hasDataLog: has.includes("wpilog"),
				hasCsv: has.includes("csv"),
				hasEvents: has.includes("dsevents"),
			};
		});
	}),

	/** Which series this upload can plot, as text for the picker's help line. */
	seriesCatalog: eventProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
		await uploadOr404(input.id, ctx.event.code);
		return { text: await availableSeries(input.id) };
	}),

	/**
	 * The Driver Station's event log for a match, timestamped against match start
	 * so a line in the terminal can point at a moment on the chart.
	 */
	events: eventProcedure
		.input(z.object({ id: z.string().uuid(), matchId: fmsGuid }))
		.query(async ({ ctx, input }) => {
			await uploadOr404(input.id, ctx.event.code);
			const match = await db.query.matchLogs.findFirst({ where: eq(matchLogs.id, input.matchId) });
			if (!match) throw new TRPCError({ code: "NOT_FOUND", message: "Match not found" });
			const files = await db
				.select()
				.from(teamUploadFiles)
				.where(and(eq(teamUploadFiles.upload_id, input.id), eq(teamUploadFiles.kind, "dsevents")))
				.execute();

			const matchStart = match.start_time.getTime() / 1000;
			const lines: { t: number | null; text: string; file: string }[] = [];
			for (const file of files) {
				const parsed = readDsEvents(await loadBytes(file));
				if (!parsed.parsed || parsed.startTime === null) continue;
				const offset = parsed.startTime - matchStart;
				for (const entry of parsed.entries) {
					lines.push({ t: entry.timestamp + offset, text: entry.text, file: file.path });
				}
			}
			lines.sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
			return { lines };
		}),

	/** Series data on the match clock, for the chart. */
	series: eventProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				matchId: fmsGuid,
				keys: z.array(z.string().max(200)).min(1).max(8),
				points: z.number().int().min(50).max(20_000).default(1200),
			}),
		)
		.query(async ({ ctx, input }) => {
			await uploadOr404(input.id, ctx.event.code);
			try {
				return await readSeriesData({
					uploadId: input.id,
					matchId: input.matchId,
					keys: input.keys,
					points: input.points,
				});
			} catch (err) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: err instanceof Error ? err.message : "Those series could not be read",
				});
			}
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
			uploadId: share.upload_id,
			label: share.label,
			expires: share.expire_time,
			team: upload.team,
			event: upload.event,
			createdAt: upload.created_at,
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
