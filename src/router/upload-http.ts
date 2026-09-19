import { createHash } from "crypto";
import express, { type Request, type Response, type Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { teamUploadFiles, teamUploads, teamUploadShares } from "../db/schema";
import { redis } from "../util/redis";
import { resolveUserFromToken } from "../trpc";
import { getEvent } from "../util/get-event";
import { ingestUpload, setTeamAndReinfer } from "../util/uploads/ingest";
import { loadBytes, MAX_UPLOAD_BYTES, UploadTooLargeError } from "../util/uploads/store";

/**
 * File transfer, which tRPC is the wrong tool for.
 *
 * Three ways in and out:
 *
 * - `GET/POST /upload` is the public portal a team opens on their own laptop. No
 *   account, a plain multipart form, rate limited per address.
 * - `POST /api/uploads` is the same ingest for a signed-in volunteer in the app.
 * - `GET .../download` streams a file's bytes back, either to an event volunteer
 *   or through a share token.
 *
 * Multipart is parsed by handing the raw body to a `Response` and asking for its
 * form data, which Bun implements natively. No parser to get wrong, no new
 * dependency.
 */

/** Uploads per address per hour through the public portal. */
const PORTAL_HOURLY_LIMIT = 12;

function hashIp(ip: string | undefined): string {
	return createHash("sha256")
		.update(ip ?? "unknown")
		.digest("hex")
		.slice(0, 32);
}

function clientIp(req: Request): string | undefined {
	const forwarded = req.headers["x-forwarded-for"];
	if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
	return req.socket.remoteAddress ?? undefined;
}

async function portalRateLimit(ipHash: string): Promise<boolean> {
	const key = `ftabuddy:uploads:portal:${ipHash}:${new Date().toISOString().slice(0, 13)}`;
	const count = await redis.incr(key);
	if (count === 1) await redis.expire(key, 3660);
	return count <= PORTAL_HOURLY_LIMIT;
}

interface ParsedForm {
	fields: Record<string, string>;
	files: { fileName: string; data: Uint8Array }[];
}

/** Read a multipart body into fields and files. */
async function parseMultipart(req: Request): Promise<ParsedForm> {
	const contentType = req.headers["content-type"];
	if (!contentType?.startsWith("multipart/form-data")) {
		throw new Error("Send the files as a multipart form.");
	}
	if (!Buffer.isBuffer(req.body)) throw new Error("Upload body was not read.");
	const form = await new Response(new Uint8Array(req.body), { headers: { "content-type": contentType } }).formData();
	const fields: Record<string, string> = {};
	const files: { fileName: string; data: Uint8Array }[] = [];
	// The DOM FormData typings narrow the value away; the runtime gives strings and Files.
	const entries = [...form.entries()] as [string, string | File][];
	for (const [name, value] of entries) {
		if (typeof value === "string") {
			fields[name] = value;
		} else {
			if (value.size === 0 && !value.name) continue;
			files.push({ fileName: value.name, data: new Uint8Array(await value.arrayBuffer()) });
		}
	}
	return { fields, files };
}

function parsedTeam(raw: string | undefined): number | null {
	const value = Number(raw?.trim());
	return Number.isInteger(value) && value > 0 && value < 100_000 ? value : null;
}

export function uploadHttpRouter(): Router {
	const router = express.Router();

	// #region public upload

	/**
	 * The page for this lives in the app at /upload, unlisted and needing no
	 * account, so this is JSON only. Nothing about the event is accepted from the
	 * client: it is worked out from the files.
	 */
	router.post(
		"/api/uploads/public",
		express.raw({ type: "multipart/form-data", limit: MAX_UPLOAD_BYTES }),
		async (req: Request, res: Response) => {
			const ipHash = hashIp(clientIp(req));
			try {
				if (!(await portalRateLimit(ipHash))) {
					return res.status(429).json({
						error: "That is a lot of uploads from one place in an hour. Wait a bit, or hand the files to a volunteer.",
					});
				}
				const { fields, files } = await parseMultipart(req);
				if (files.length === 0) return res.status(400).json({ error: "Pick at least one file." });

				const result = await ingestUpload({
					files,
					source: "portal",
					enteredTeam: parsedTeam(fields.team),
					// The portal posts files and nothing else - the team number comes
					// out of the files, or out of the box the team is offered after
					// the upload lands. This field stays because the volunteer-side
					// path can send one. It used to take a name; we do not want one.
					uploaderName: null,
					ipHash,
				});
				res.json(result);
			} catch (err) {
				const message =
					err instanceof UploadTooLargeError
						? err.message
						: err instanceof Error
							? err.message
							: "Something went wrong reading those files.";
				console.error("[uploads] public upload failed", err);
				res.status(err instanceof UploadTooLargeError ? 413 : 400).json({ error: message });
			}
		},
	);

	/**
	 * Fill in the team number when nothing in the files gave one. Public, because
	 * it is the team finishing the upload they just made: the upload id is an
	 * unguessable uuid they were handed a second ago, and this can only fill a
	 * blank, never change an answer the files already gave.
	 */
	router.post("/api/uploads/:id/team", express.json(), async (req: Request, res: Response) => {
		try {
			const team = Number((req.body as { team?: unknown })?.team);
			if (!Number.isInteger(team) || team < 1 || team > 99_999) {
				return res.status(400).json({ error: "That is not a team number." });
			}
			const upload = await db.query.teamUploads.findFirst({ where: eq(teamUploads.id, String(req.params.id)) });
			if (!upload) return res.status(404).json({ error: "Upload not found." });
			if (upload.team !== null) return res.status(409).json({ error: "This upload already has a team." });
			const result = await setTeamAndReinfer(upload.id, team);
			res.json(result);
		} catch (err) {
			console.error("[uploads] setting the team failed", err);
			res.status(400).json({ error: err instanceof Error ? err.message : "Could not set the team." });
		}
	});

	// #endregion

	/** The app's upload path. Same ingest, but attributed to the volunteer. */
	router.post(
		"/api/uploads",
		express.raw({ type: "multipart/form-data", limit: MAX_UPLOAD_BYTES }),
		async (req: Request, res: Response) => {
			try {
				const authorization = req.headers.authorization;
				const user = await resolveUserFromToken(
					typeof authorization === "string" ? authorization.split(" ")[1] : undefined,
				);
				if (!user) return res.status(401).json({ error: "Sign in first." });
				const eventToken = req.headers["event-token"];
				if (typeof eventToken !== "string") return res.status(400).json({ error: "Missing event token." });
				const event = await getEvent(eventToken);

				const { fields, files } = await parseMultipart(req);
				if (files.length === 0) return res.status(400).json({ error: "No files were sent." });

				const result = await ingestUpload({
					files,
					source: "app",
					// A volunteer uploading from the app is already at an event, so that
					// beats anything inferred from the files.
					event: { code: event.code },
					enteredTeam: parsedTeam(fields.team),
					uploaderName: user.username,
					uploadedBy: user.id,
					ipHash: hashIp(clientIp(req)),
				});
				res.json(result);
			} catch (err) {
				const message = err instanceof Error ? err.message : "Upload failed";
				console.error("[uploads] app upload failed", err);
				res.status(err instanceof UploadTooLargeError ? 413 : 400).json({ error: message });
			}
		},
	);

	/**
	 * Download one file. A volunteer uses the event token; anyone else uses a
	 * share token, which is checked against the files that share covers.
	 */
	router.get("/api/uploads/:uploadId/files/:fileId", async (req: Request, res: Response) => {
		try {
			const file = await db.query.teamUploadFiles.findFirst({
				where: eq(teamUploadFiles.id, String(req.params.fileId)),
			});
			if (!file || file.upload_id !== String(req.params.uploadId)) return res.status(404).send("File not found");

			const shareToken = typeof req.query.share === "string" ? req.query.share : null;
			if (shareToken) {
				const share = await db.query.teamUploadShares.findFirst({ where: eq(teamUploadShares.id, shareToken) });
				if (!share || share.revoked || share.upload_id !== file.upload_id)
					return res.status(404).send("Share not found");
				if (new Date() > share.expire_time) return res.status(410).send("That share link has expired");
				if (share.file_ids.length > 0 && !share.file_ids.includes(file.id)) {
					return res.status(404).send("That file is not in this share");
				}
			} else {
				const eventToken = req.headers["event-token"] ?? req.query.eventToken;
				if (typeof eventToken !== "string") return res.status(401).send("Not authorised");
				const event = await getEvent(eventToken);
				const upload = await db.query.teamUploads.findFirst({ where: eq(teamUploads.id, file.upload_id) });
				if (!upload || upload.event !== event.code) return res.status(404).send("File not found at this event");
			}

			const bytes = await loadBytes(file);
			res.setHeader(
				"Content-Type",
				file.kind === "text" ? "text/plain; charset=utf-8" : "application/octet-stream",
			);
			res.setHeader(
				"Content-Disposition",
				`${file.kind === "text" ? "inline" : "attachment"}; filename="${file.path.replace(/[^\w.\- ]+/g, "_")}"`,
			);
			res.send(Buffer.from(bytes));
		} catch (err) {
			console.error("[uploads] download failed", err);
			res.status(500).send("Could not read that file");
		}
	});

	return router;
}
