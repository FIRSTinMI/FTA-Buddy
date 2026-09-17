import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/db";
import { teamUploadFiles, teamUploads, type TeamUploadFile } from "../../db/schema";
import { loadBytes } from "./store";

/**
 * Handing a SystemCore support bundle to Ghost CSA.
 *
 * Ghost CSA is Limelight's own bundle analyser (`tools.limelightvision.io/ghost-csa`).
 * It knows things about SystemCore internals that our corpus does not, so when a
 * team's problem is the device rather than their code, it is the better tool and
 * we get out of the way.
 *
 * It runs on Convex, and the three calls we need take no authentication. That is
 * their decision, not ours, and it can change without notice, so every call
 * fails soft: a Ghost CSA outage marks the upload failed and the rest of the app
 * carries on.
 *
 * What we send: the support bundle and the log files, which is exactly what
 * their form accepts. A team's robot code never leaves our server this way.
 */

const DEFAULT_BASE = "https://agent0.limelightvision.io";

/** Kinds Ghost CSA accepts as attachments alongside a bundle. */
const SENDABLE_LOG_KINDS = ["wpilog", "dslog", "dsevents", "text"] as const;

function base(): string {
	return (process.env.GHOST_CSA_URL ?? DEFAULT_BASE).replace(/\/$/, "");
}

export function ghostCsaEnabled(): boolean {
	return process.env.GHOST_CSA_ENABLED !== "false";
}

export function ghostCsaTicketUrl(ticketNumber: string): string {
	const site = process.env.GHOST_CSA_SITE ?? "https://tools.limelightvision.io/ghost-csa";
	return `${site.replace(/\/$/, "")}/t/${ticketNumber}`;
}

export class GhostCsaError extends Error {}

interface ConvexResponse<T> {
	status: "success" | "error";
	value?: T;
	errorMessage?: string;
}

async function convex<T>(kind: "query" | "mutation", path: string, args: unknown, signal?: AbortSignal): Promise<T> {
	const response = await fetch(`${base()}/api/${kind}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ path, args, format: "json" }),
		signal: signal ?? AbortSignal.timeout(30_000),
	});
	if (!response.ok) throw new GhostCsaError(`Ghost CSA answered ${response.status} for ${path}`);
	const body = (await response.json()) as ConvexResponse<T>;
	if (body.status !== "success") throw new GhostCsaError(body.errorMessage ?? `Ghost CSA rejected ${path}`);
	return body.value as T;
}

async function putFile(data: Uint8Array, contentType: string): Promise<string> {
	const url = await convex<string>("mutation", "tickets:generateUploadUrl", {});
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": contentType },
		body: new Blob([data as Uint8Array<ArrayBuffer>], { type: contentType }),
	});
	if (!response.ok) throw new GhostCsaError(`Ghost CSA storage answered ${response.status}`);
	const body = (await response.json()) as { storageId?: string };
	if (!body.storageId) throw new GhostCsaError("Ghost CSA storage did not return a storage id");
	return body.storageId;
}

export interface GhostCsaTicket {
	ticketNumber: string;
	analysisStatus: "pending" | "running" | "complete" | "failed";
	analysisStep?: string | null;
	analysis?: string | null;
	analysisError?: string | null;
	analysisCompletedAt?: number | null;
	teamNumber?: number | null;
	deviceHostname?: string | null;
	hwType?: string | null;
	osRelease?: string | null;
	symptoms?: string | null;
}

export async function getTicket(ticketNumber: string): Promise<GhostCsaTicket | null> {
	return convex<GhostCsaTicket | null>("query", "tickets:get", { ticketNumber });
}

/**
 * Send an upload's bundle and logs, and record the ticket number. Returns the
 * ticket number, or throws with a message worth showing a CSA.
 *
 * Idempotent per upload: if a ticket already exists it is returned unchanged,
 * so a second press of the button does not create a second ticket on their side.
 */
export async function sendUploadToGhostCsa(uploadId: string, requestedBy: number | null): Promise<string> {
	if (!ghostCsaEnabled()) throw new GhostCsaError("Sending to Ghost CSA is switched off on this server.");

	const upload = await db.query.teamUploads.findFirst({ where: eq(teamUploads.id, uploadId) });
	if (!upload) throw new GhostCsaError("Upload not found");
	if (upload.ghost_ticket) return upload.ghost_ticket;

	const files = await db.select().from(teamUploadFiles).where(eq(teamUploadFiles.upload_id, uploadId)).execute();
	// Only the files the team uploaded directly: entries we pulled out of a zip
	// are already inside the zip we send.
	const top = files.filter((f) => f.parent_id === null);
	const bundle = top.find((f) => f.kind === "support-bundle");
	const logs = top.filter((f) => (SENDABLE_LOG_KINDS as readonly string[]).includes(f.kind));
	if (!bundle && logs.length === 0) {
		throw new GhostCsaError(
			"Ghost CSA takes a SystemCore support bundle or Driver Station and data logs. This upload has neither.",
		);
	}

	await db
		.update(teamUploads)
		.set({ ghost_status: "queued", ghost_error: null, ghost_requested_by: requestedBy })
		.where(eq(teamUploads.id, uploadId))
		.execute();

	try {
		let bundleStorageId: string | undefined;
		if (bundle) {
			bundleStorageId = await putFile(await loadBytes(bundle), "application/zip");
		}
		const attachments: { storageId: string; fileName: string; fileSize: number }[] = [];
		for (const log of logs) {
			attachments.push({
				storageId: await putFile(await loadBytes(log), "application/octet-stream"),
				fileName: log.path,
				fileSize: log.size,
			});
		}

		const notes = [
			`Sent from FTA Buddy${upload.event ? ` at event ${upload.event}` : ""}.`,
			upload.team ? `Team ${upload.team}.` : null,
		]
			.filter(Boolean)
			.join(" ");

		const created = await convex<{ ticketNumber: string }>("mutation", "tickets:create", {
			storageId: bundleStorageId,
			fileName: bundle?.path,
			fileSize: bundle?.size,
			teamNumber: upload.team ?? undefined,
			uploaderNotes: notes,
			attachments: attachments.length > 0 ? attachments : undefined,
		});

		await db
			.update(teamUploads)
			.set({ ghost_ticket: created.ticketNumber, ghost_status: "pending", ghost_updated_at: new Date() })
			.where(eq(teamUploads.id, uploadId))
			.execute();
		return created.ticketNumber;
	} catch (err) {
		const message = err instanceof Error ? err.message : "Ghost CSA could not be reached";
		await db
			.update(teamUploads)
			.set({ ghost_status: "failed", ghost_error: message.slice(0, 500), ghost_updated_at: new Date() })
			.where(eq(teamUploads.id, uploadId))
			.execute();
		throw err instanceof GhostCsaError ? err : new GhostCsaError(message);
	}
}

/** Pull the current state of one ticket into our row. Returns the updated status. */
export async function refreshGhostCsa(uploadId: string): Promise<TeamUpload["ghost_status"]> {
	const upload = await db.query.teamUploads.findFirst({ where: eq(teamUploads.id, uploadId) });
	if (!upload?.ghost_ticket) return upload?.ghost_status ?? "none";
	try {
		const ticket = await getTicket(upload.ghost_ticket);
		if (!ticket) return upload.ghost_status;
		await db
			.update(teamUploads)
			.set({
				ghost_status: ticket.analysisStatus,
				ghost_analysis: ticket.analysis ?? upload.ghost_analysis,
				ghost_error: ticket.analysisError ?? null,
				ghost_updated_at: new Date(),
			})
			.where(eq(teamUploads.id, uploadId))
			.execute();
		return ticket.analysisStatus;
	} catch (err) {
		console.error("[ghost-csa] refresh failed", upload.ghost_ticket, err);
		return upload.ghost_status;
	}
}

type TeamUpload = typeof teamUploads.$inferSelect;

/** How long we keep asking about a ticket before giving up on it. */
const GIVE_UP_AFTER_MS = 45 * 60 * 1000;

/**
 * Poll the tickets that are still running. Their analysis took four minutes in
 * the example Limelight published, so a minute between passes is plenty.
 */
export async function pollGhostCsa(): Promise<void> {
	if (!ghostCsaEnabled()) return;
	const open = await db
		.select({ id: teamUploads.id, updated: teamUploads.ghost_updated_at })
		.from(teamUploads)
		.where(inArray(teamUploads.ghost_status, ["queued", "pending", "running"]))
		.execute();
	for (const row of open) {
		const age = Date.now() - (row.updated?.getTime() ?? 0);
		if (age > GIVE_UP_AFTER_MS) {
			await db
				.update(teamUploads)
				.set({
					ghost_status: "failed",
					ghost_error: "Ghost CSA did not finish in 45 minutes.",
					ghost_updated_at: new Date(),
				})
				.where(eq(teamUploads.id, row.id))
				.execute();
			continue;
		}
		await refreshGhostCsa(row.id);
	}
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startGhostCsaPoller(): void {
	if (timer || !ghostCsaEnabled()) return;
	timer = setInterval(() => {
		pollGhostCsa().catch((err) => console.error("[ghost-csa] poll pass failed", err));
	}, 60_000);
	timer.unref?.();
}
