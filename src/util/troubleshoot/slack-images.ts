// Reads the pictures in a CSA Slack thread and writes a short caption for each one, so that a
// Driver Station screenshot or a photo of a burnt connector reaches the corpus as text instead of
// being dropped. Most CSA threads carry their evidence in an image, so text-only ingest loses the
// part that matters.
//
// The bytes need the same credentials the poller already holds: a browser session downloads a file
// with the `d` cookie, an OAuth user token with a bearer header. Captions are cached in Redis by
// Slack file id, because the poller re-reads a two day overlap window on every pass and must not
// pay for the same image twice.

import { getAnthropic, anthropicConfigured } from "../anthropic";
import { redis } from "../redis";
import type { SlackSession } from "../slack-session";
import { PLANNER_MODEL } from "./pricing";
import type { SlackFile, SlackMessage } from "./slack-chunks";
import { getSpendStatus, recordMonthlySpend } from "./spend";

// #region Config
/** Image types Claude accepts. Anything else (pdf, video, text snippet) is left alone. */
const MEDIA_TYPES: Record<string, "image/png" | "image/jpeg" | "image/gif" | "image/webp"> = {
	"image/png": "image/png",
	"image/jpeg": "image/jpeg",
	"image/jpg": "image/jpeg",
	"image/gif": "image/gif",
	"image/webp": "image/webp",
};

/** Anthropic rejects an image over 5 MB once base64 encoded, so cap the raw bytes below that. */
const MAX_IMAGE_BYTES = 3_500_000;
/** Ceiling per poll pass, per source. A backfill of a busy channel cannot run up a bill. */
const MAX_CAPTIONS_PER_PASS = 60;
const CAPTION_TTL_SECONDS = 180 * 24 * 3600;
const CAPTION_MAX_TOKENS = 400;

const captionKey = (fileId: string) => `ftabuddy:troubleshoot:slack:caption:${fileId}`;

function enabled(): boolean {
	const v = (process.env.TROUBLESHOOT_SLACK_IMAGES_ENABLED ?? "true").toLowerCase();
	return !["0", "false", "no", "off"].includes(v);
}

const CAPTION_SYSTEM = `You describe an image posted in a chat where FRC field support volunteers (CSAs, FTAs) help teams fix robots at a competition.

Write one short paragraph, under 90 words, of what the image shows. Rules:
- Transcribe error text, error codes, status text and log lines exactly as they appear.
- Name the colours and patterns of any status LED (roboRIO, radio, PDH, motor controller).
- Name the screen if you recognise it: Driver Station, FMS Field Monitor, radio configuration utility, Phoenix Tuner, REV Hardware Client, WPILib, a log plot.
- Describe wiring, connectors and damage plainly when the image is a photo.
- No preamble, no advice, no guesses about the cause. Only what is visible.
- If nothing legible is in the image, reply exactly: Not legible.`;

/** Credentials for downloading a file: a browser session, or an OAuth token. */
export type ImageAuth = { kind: "session"; session: SlackSession } | { kind: "token"; token: string };
// #endregion

// #region Files
/** Image files on a message that are worth captioning. */
export function imageFiles(message: SlackMessage): SlackFile[] {
	return (message.files ?? []).filter((f) => !!f.id && !!MEDIA_TYPES[(f.mimetype ?? "").toLowerCase()]);
}

/**
 * Best URL for one file: the original when it is small enough, otherwise Slack's 1024px thumbnail.
 * Returns null when neither is usable.
 */
function downloadUrl(file: SlackFile): string | null {
	const tooBig = (file.size ?? 0) > MAX_IMAGE_BYTES;
	if (tooBig) return file.thumb_1024 ?? file.thumb_720 ?? null;
	return file.url_private ?? file.thumb_1024 ?? null;
}

/** Download a file with whichever credential this source uses. Null when Slack does not return an image. */
async function fetchImage(auth: ImageAuth, url: string): Promise<{ base64: string; mediaType: string } | null> {
	const headers: Record<string, string> = {
		"User-Agent":
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
	};
	// A session downloads the way the browser does, with the cookie. A token uses the bearer header.
	if (auth.kind === "session") headers.Cookie = `d=${auth.session.cookieD}`;
	else headers.Authorization = `Bearer ${auth.token}`;

	const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(30_000) });
	if (!res.ok) return null;
	// An expired session gets the login page back with a 200, not an error.
	const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
	const mediaType = MEDIA_TYPES[contentType];
	if (!mediaType) return null;
	const bytes = Buffer.from(await res.arrayBuffer());
	if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
	return { base64: bytes.toString("base64"), mediaType };
}
// #endregion

// #region Caption
/** Ask the cheap model what the image shows. Returns null when it reads nothing useful. */
async function captionImage(image: { base64: string; mediaType: string }, context: string): Promise<string | null> {
	const client = getAnthropic();
	const res = await client.messages.create({
		model: PLANNER_MODEL,
		max_tokens: CAPTION_MAX_TOKENS,
		system: CAPTION_SYSTEM,
		messages: [
			{
				role: "user",
				content: [
					{
						type: "image",
						source: {
							type: "base64",
							media_type: image.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
							data: image.base64,
						},
					},
					{ type: "text", text: context },
				],
			},
		],
	});
	await recordMonthlySpend(res.usage, PLANNER_MODEL);
	const text = res.content
		.filter((b): b is { type: "text"; text: string; citations: null } => b.type === "text")
		.map((b) => b.text)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
	if (!text || /^not legible\.?$/i.test(text)) return null;
	return text;
}
// #endregion

// #region Captioner
/**
 * Captions the images of one poll source, across all of its channels. Holds the per-pass ceiling and
 * stops itself for the rest of the pass when the budget is spent or a call fails hard, so one broken
 * credential does not turn into one failed call per image.
 */
export class SlackImageCaptioner {
	captioned = 0;
	private remaining = MAX_CAPTIONS_PER_PASS;
	private halted = !enabled() || !anthropicConfigured;

	constructor(private readonly auth: ImageAuth) {}

	/** Fill in `captions` on every message that carries images. Failures leave the message unchanged. */
	async attach(messages: SlackMessage[], channelName: string): Promise<void> {
		for (const message of messages) {
			const files = imageFiles(message);
			if (files.length === 0) continue;
			const captions: string[] = [];
			for (const file of files) {
				const caption = await this.captionFile(file, message, channelName);
				if (caption) captions.push(caption);
			}
			if (captions.length) message.captions = captions;
		}
	}

	private async captionFile(file: SlackFile, message: SlackMessage, channelName: string): Promise<string | null> {
		const cached = await redis.get(captionKey(file.id));
		if (cached !== null) return cached || null;
		if (this.halted || this.remaining <= 0) return null;
		if ((await getSpendStatus()).overBudget) {
			this.halted = true;
			console.warn("[SlackImages] monthly budget reached, captioning paused");
			return null;
		}

		const url = downloadUrl(file);
		if (!url) return null;
		try {
			const image = await fetchImage(this.auth, url);
			if (!image) {
				// A bad credential fails for every file, not just this one.
				this.halted = true;
				console.warn(`[SlackImages] ${file.id}: Slack did not return an image, captioning paused`);
				return null;
			}
			this.remaining--;
			const context = [
				`Posted in #${channelName}.`,
				message.text ? `Message with the image: ${message.text.slice(0, 400)}` : "The message has no text.",
			].join(" ");
			const caption = await captionImage(image, context);
			// Cache the empty result too, so an unreadable image is not re-read every pass.
			await redis.set(captionKey(file.id), caption ?? "", "EX", CAPTION_TTL_SECONDS);
			if (caption) this.captioned++;
			return caption;
		} catch (err) {
			console.warn(`[SlackImages] ${file.id}:`, (err as Error).message);
			return null;
		}
	}
}
// #endregion
