import { createExpressMiddleware } from "@trpc/server/adapters/express";
import cors from "cors";
import "dotenv/config";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import express from "express";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import hljs from "highlight.js";
import json from "highlight.js/lib/languages/json";
import { createHash } from "crypto";
import { createServer } from "http";
import { json2csv } from "json-2-csv";
import { Marked } from "marked";
import { gfmHeadingId } from "marked-gfm-heading-id";
import { markedHighlight } from "marked-highlight";
import { join, relative } from "path";
import sanitizeHtml from "sanitize-html";
import SuperJSON from "superjson";
import { cycleTimeToMS } from "../shared/cycleTimeToMS";
import type { ROBOT, TournamentLevel } from "../shared/types";
import { connect, db } from "./db/db";
import { cycleLogs, logPublishing, matchLogs, slackLinkTokens } from "./db/schema";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { adminRouter } from "./router/admin";
import { startDebugLogBackground } from "./util/debug-log";
import { checklistRouter } from "./router/checklist";
import { cycleRouter } from "./router/cycles";
import { eventRouter } from "./router/event";
import { fieldMonitorRouter } from "./router/field-monitor";
import { matchRouter } from "./router/logs";
import { aiReportRouter } from "./router/ai-report";
import { matchEventsRouter } from "./router/match-events";
import { powerRouter } from "./router/power";
import { extensionRouter } from "./router/extension";
import {
	addNoteMessageFromSlack,
	createFromNexus,
	createFromSlashCommand,
	notesRouter,
	updateNoteAssignmentFromSlack,
	updateNoteStatusFromSlack,
} from "./router/notes";
import { scorekeeperRouter } from "./router/scorekeeper";
import { slackSessionRouter } from "./router/slack-session";
import { slackUserRouter } from "./router/slack-user";
import { telemetryRouter } from "./router/telemetry";
import { troubleshootRouter } from "./router/troubleshoot";
import { userRouter, generateToken } from "./router/user";
import { adminProcedure, createContext, publicProcedure, router } from "./trpc";

import { z } from "zod";
import { initializePushNotifications } from "../src/util/push-notifications";
import schema from "./db/schema";
import { ftcRouter } from "./router/ftc";
import { getEvent } from "./util/get-event";
import { decompressStationLog, logAnalysisLoop } from "./util/log-analysis";
import { linkChannel, openTicketModal, sendEphemeralMessage, slackOAuth } from "./util/slack";
import {
	buildAuthorizeUrl,
	completeUserInstall,
	consumeInstallState,
	peekInstallState,
	userOAuthReturnUrl,
} from "./util/slack-user-oauth";
import { startSlackPoller } from "./util/troubleshoot/slack-poller";
import { startCorpusRefresh } from "./util/troubleshoot/corpus-scheduler";
import { getTeamAverageCycle } from "./util/team-cycles";
import { eventLastSeen, events, eventCodes } from "./state";
import * as nexusEventPoller from "./util/nexusEventPoller";
import { bus } from "./util/eventBus";
import { redis } from "./util/redis";
import { acquireOrRenewLock } from "./util/leaderLock";
import { cleanupEventSubscriptions } from "./util/get-event";

export { events, eventCodes };

const pjson = require("../package.json") as { version: string };

const port = parseInt(process.env.PORT || "3001");

initializePushNotifications();
export let knownIssue: {
	current: boolean;
	message: string;
	startTime: Date | null;
	endTime: Date | null;
	effectedEvents: string[];
} = {
	current: false,
	message: "",
	startTime: null,
	endTime: null,
	effectedEvents: [],
};

// TRPC Server
const appRouter = router({
	user: userRouter,
	event: eventRouter,
	match: matchRouter,
	checklist: checklistRouter,
	field: fieldMonitorRouter,
	cycles: cycleRouter,
	notes: notesRouter,
	matchEvents: matchEventsRouter,
	power: powerRouter,
	extension: extensionRouter,
	aiReport: aiReportRouter,
	scorekeeper: scorekeeperRouter,
	troubleshoot: troubleshootRouter,
	slackUser: slackUserRouter,
	slackSession: slackSessionRouter,
	app: router({
		version: publicProcedure.query(() => {
			return pjson.version ?? "dev";
		}),
		status: publicProcedure.query(() => {
			return knownIssue;
		}),
		startIssue: adminProcedure
			.input(
				z.object({
					message: z.string(),
					effectedEvents: z.array(z.string()),
				}),
			)
			.mutation(async ({ input }) => {
				knownIssue = {
					current: true,
					message: input.message,
					startTime: new Date(),
					endTime: null,
					effectedEvents: input.effectedEvents,
				};
				redis.set("ftabuddy:global:known_issue", SuperJSON.stringify(knownIssue));
				bus.publish("global:known_issue", knownIssue);
				return knownIssue;
			}),
		endIssue: adminProcedure.mutation(async () => {
			knownIssue = {
				current: false,
				message: knownIssue.message,
				startTime: knownIssue.startTime,
				endTime: new Date(),
				effectedEvents: knownIssue.effectedEvents,
			};
			redis.set("ftabuddy:global:known_issue", SuperJSON.stringify(knownIssue));
			bus.publish("global:known_issue", knownIssue);
			return knownIssue;
		}),
	}),
	ftc: ftcRouter,
	admin: adminRouter,
	telemetry: telemetryRouter,
});

export type AppRouter = typeof appRouter;

const app = express();

const server = createServer(app);

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/trpc", createExpressMiddleware({ router: appRouter, createContext }));

app.get("/serviceworker.js", async (req, res) => {
	const assets = readdirSync("./app/dist/assets");
	const rootFiles = readdirSync("./app/dist").filter(
		(f) =>
			f !== "serviceworker.js" &&
			f !== "tutorial" &&
			(f.endsWith(".png") ||
				f.endsWith(".svg") ||
				f.endsWith(".ico") ||
				f.endsWith(".js") ||
				f.endsWith(".html") ||
				f.endsWith(".json")),
	);
	const allAssets = [...assets.map((f) => `/assets/${f}`), ...rootFiles.map((f) => `/${f}`), "/"];
	// SW version = hash of the hashed JS bundle name + the CONTENTS of the non-hashed root
	// assets (privacy.html, manifest.json, etc). Vite hashes JS/CSS filenames, but static
	// public files keep stable names, so editing one would otherwise never bust the SW cache.
	const jsBundle = assets.find((f) => f.startsWith("index-") && f.endsWith(".js")) ?? assets[0] ?? "v1";
	const versionHash = createHash("sha1");
	versionHash.update(jsBundle);
	for (const f of rootFiles.filter((f) => f.endsWith(".html") || f.endsWith(".json")).sort()) {
		versionHash.update(f);
		versionHash.update(readFileSync(`./app/dist/${f}`));
	}
	const swVersion = `${jsBundle}-${versionHash.digest("hex").slice(0, 8)}`;
	let serviceWorkerFile = readFileSync("./app/dist/serviceworker.js").toString();
	serviceWorkerFile = serviceWorkerFile.replace("{{ALL_ASSETS}}", JSON.stringify(allAssets));
	serviceWorkerFile = serviceWorkerFile.replace("{{SW_VERSION}}", swVersion);
	res.setHeader("Content-Type", "application/javascript");
	res.send(serviceWorkerFile);
});

app.get("/report/:filename", async (req, res) => {
	try {
		const { downloadReport } = await import("./util/gcs");
		const buffer = await downloadReport(req.params.filename);
		res.setHeader("Content-Type", "application/pdf");
		res.setHeader("Content-Disposition", `attachment; filename="${req.params.filename}"`);
		res.send(buffer);
	} catch (err: any) {
		if (err?.code === 404) return res.status(404).send("Report not found");
		console.error("Failed to serve report", req.params.filename, err);
		res.status(500).send(`Failed to serve report: ${err?.message ?? "unknown error"}`);
	}
});

app.get("/slack/oauth", async (req, res) => {
	const code = req.query.code as string;

	if (!code) {
		return res.status(400).send("Missing code parameter");
	}

	try {
		await slackOAuth(code);
		res.send("Success! You can close this window now.");
	} catch (err) {
		if (err instanceof Error) {
			res.status(500).send(err.message);
		} else {
			res.status(500).send("An unknown error occurred");
		}
	}
});
// User-scope Slack install (xoxp) for the troubleshooting corpus poller.
// The state comes from slackUser.getInstallUrl (protected tRPC), which ties it to the app user in Redis.
app.get("/slack/user-oauth/start", async (req, res) => {
	const state = typeof req.query.state === "string" ? req.query.state : "";
	if (!(await peekInstallState(state)))
		return res.status(400).send("Invalid or expired state. Start again from Settings.");
	res.redirect(buildAuthorizeUrl(state));
});

app.get("/slack/user-oauth/callback", async (req, res) => {
	const code = typeof req.query.code === "string" ? req.query.code : "";
	const state = typeof req.query.state === "string" ? req.query.state : "";
	if (typeof req.query.error === "string") return res.redirect(userOAuthReturnUrl("error", req.query.error));
	if (!code || !state) return res.redirect(userOAuthReturnUrl("error", "missing_code"));

	const userId = await consumeInstallState(state);
	if (!userId) return res.redirect(userOAuthReturnUrl("error", "bad_state"));

	try {
		const { teamName } = await completeUserInstall(code, userId);
		console.log(`[SlackUser] user ${userId} connected workspace ${teamName}`);
		res.redirect(userOAuthReturnUrl("connected"));
	} catch (err) {
		console.error("[SlackUser] install failed:", (err as Error).message);
		res.redirect(userOAuthReturnUrl("error", (err as Error).message));
	}
});

app.post("/slack/command", async (req, res) => {
	const { command, text, response_url, trigger_id, user_id, user_name, team_id, channel_id, api_app_id } = req.body;

	const args = text.split(" ");

	console.log({
		command,
		text,
		response_url,
		trigger_id,
		user_id,
		user_name,
		team_id,
		channel_id,
		api_app_id,
		args,
	});

	try {
		if (command === "/ftabuddy") {
			res.send(await linkChannel(args, channel_id, team_id));
		} else {
			throw new Error("Invalid command");
		}
	} catch (err) {
		if (err instanceof Error) {
			res.send({
				response_type: "ephemeral",
				text: err.message,
			});
		} else {
			res.send({
				response_type: "ephemeral",
				text: "An unknown error occurred",
			});
		}
	}
});

app.post("/slack/interact", async (req, res) => {
	try {
		const payload = JSON.parse(req.body.payload);

		// Message shortcut: "Create FTA-Buddy Ticket" from the ⋮ menu on any message.
		// Must respond 200 first, then open a modal (views.open requires trigger_id within 3s).
		if (payload.type === "message_action" && payload.callback_id === "create_ftabuddy_ticket") {
			res.sendStatus(200);
			await openTicketModal(payload.trigger_id, payload.team.id, payload.channel.id, payload.message.ts);
			return;
		}

		// Modal submission: user entered a team number in the ticket creation modal.
		// Must respond with a JSON body (errors or clear), NOT just 200.
		if (payload.type === "view_submission" && payload.view.callback_id === "ftabuddy_ticket_modal") {
			const teamNumberStr: string = payload.view.state.values.team_number_block.team_number_input.value ?? "";
			const teamNumber = parseInt(teamNumberStr, 10);
			if (!teamNumberStr || isNaN(teamNumber) || teamNumber < 1 || teamNumber > 99999) {
				return res.json({
					response_action: "errors",
					errors: { team_number_block: "Enter a valid team number (1–99999)." },
				});
			}

			const { channel_id, message_ts } = JSON.parse(payload.view.private_metadata);
			const result = await createFromSlashCommand(
				channel_id,
				payload.team.id,
				payload.user.id,
				message_ts,
				teamNumber,
			);

			// createFromSlashCommand returns { text } for errors, { blocks } for success.
			if (result.text && !result.blocks) {
				return res.json({
					response_action: "update",
					view: {
						type: "modal",
						title: { type: "plain_text", text: "Error" },
						close: { type: "plain_text", text: "Close" },
						blocks: [{ type: "section", text: { type: "mrkdwn", text: result.text } }],
					},
				});
			}

			return res.json({ response_action: "clear" });
		}

		// Block action: link FTA-Buddy account button
		res.sendStatus(200);
		const actionId = payload.actions?.[0]?.action_id;
		if (actionId === "link_ftabuddy_account") {
			const slack_user_id: string = payload.user.id;
			const team_id: string = payload.team.id;
			const channel_id: string = payload.channel.id;
			const token = generateToken();
			const expires_at = new Date(Date.now() + 30 * 60 * 1000);
			await db.insert(slackLinkTokens).values({ token, slack_user_id, team_id, channel_id, expires_at });
			await sendEphemeralMessage(channel_id, team_id, slack_user_id, {
				text: "Link your FTA-Buddy account",
				blocks: [
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text: ":link: Click the button below to link your FTA-Buddy account. This link expires in 30 minutes.",
						},
					},
					{
						type: "actions",
						elements: [
							{
								type: "button",
								text: { type: "plain_text", text: "Link My Account", emoji: true },
								url: `https://ftabuddy.com/link-slack/${token}`,
								style: "primary",
							},
						],
					},
				],
			});
		}
	} catch (err) {
		console.error("[slack/interact]", err);
		if (!res.headersSent) res.sendStatus(200);
	}
});

app.post("/slack/events", async (req, res) => {
	const { event, challenge, authorizations } = req.body;

	// Slack Verification Challenge
	if (challenge) {
		return res.json({ challenge });
	}

	// Check if this event was triggered by our own bot (bot user ID differs per workspace)
	const isBotSelfEvent =
		event &&
		Array.isArray(authorizations) &&
		authorizations.some((a: { user_id: string; is_bot: boolean }) => a.user_id === event.user && a.is_bot);

	try {
		// Ignore events from the FTA Buddy bot itself
		if (event && !isBotSelfEvent) {
			console.log(event);
			// Nexus bot messages: create a ticket from the incoming CSA/volunteer request
			if (
				event.type === "message" &&
				event.subtype === "bot_message" &&
				typeof event.text === "string" &&
				/^(FTA request for team \d+|A volunteer has requested help on behalf of team \d+|Team \d+ has requested help)/i.test(
					event.text,
				)
			) {
				await createFromNexus(event.channel, event.ts, event.text, event.blocks);
			} else if (event.reaction === "white_check_mark") {
				// Accept reactions on any tracked message (FTA Buddy posts and Nexus posts)
				await updateNoteStatusFromSlack(event.item.ts, event.type === "reaction_added", event.user);
			} else if (event.reaction === "eyes") {
				await updateNoteAssignmentFromSlack(event.item.ts, event.type === "reaction_added", event.user);
			} else if (event.type === "message" && event.thread_ts && !event.subtype && !event.bot_id) {
				// event.subtype is set for bot_message, message_changed, message_deleted, etc.
				// event.bot_id is set for any bot-authored message (including FTA-Buddy's own thread replies).
				// Both guards together prevent echoing bot-posted syncs back into FTA-Buddy.
				await addNoteMessageFromSlack(event.channel, event.ts, event.thread_ts, event.text, event.user);
			}
		}
	} catch (err) {
		console.error(err);
	}
	res.sendStatus(200);
});

// Public api

app.get("/api/cycles/:eventCode/:level/:match/:play", async (req, res) => {
	if (!["none", "practice", "qualification", "playoff"].includes(req.params.level.toLowerCase()))
		return res.status(400).send("Invalid level");

	let level = req.params.level.toLowerCase() as TournamentLevel;
	level = level.substring(0, 1).toUpperCase() + level.substring(1);

	res.json(
		await db.query.cycleLogs.findFirst({
			where: and(
				eq(cycleLogs.event, req.params.eventCode.toLowerCase()),
				eq(cycleLogs.match_number, parseInt(req.params.match)),
				eq(cycleLogs.play_number, parseInt(req.params.play)),
				eq(cycleLogs.level, level as TournamentLevel),
			),
		}),
	);
});

app.get("/api/cycles/:eventCode", async (req, res) => {
	res.json(await db.query.cycleLogs.findMany({ where: eq(cycleLogs.event, req.params.eventCode.toLowerCase()) }));
});

app.get("/api/team-average-cycle/:team/:eventCode", async (req, res) => {
	res.json(await getTeamAverageCycle(parseInt(req.params.team), req.params.eventCode.toLowerCase()));
});

app.get("/api/team-average-cycle/:team", async (req, res) => {
	res.json(await getTeamAverageCycle(parseInt(req.params.team), undefined));
});

app.get("/api/logs/:shareCode", async (req, res) => {
	const share = await db.query.logPublishing.findFirst({ where: eq(logPublishing.id, req.params.shareCode) });
	if (!share) return res.status(404).send("Share code not found");
	const log = await db.query.matchLogs.findFirst({ where: eq(matchLogs.id, share.match_id) });
	if (!log) return res.status(500).send("Log not found");

	const station = share.station as ROBOT;

	const compressedLog = log[`${station}_log`];

	const returnObj = {
		team: share.team,
		matchID: share.match_id,
		event: share.event,
		level: share.level,
		matchNumber: share.match_number,
		playNumber: share.play_number,
		station: share.station,
		expires: share.expire_time.toISOString(),
		matchStartTime: log.start_time.toISOString(),
		log: compressedLog ? decompressStationLog(compressedLog) : [],
	};

	if (req.query.format === "json") {
		res.json(returnObj);
	} else {
		res.setHeader(
			"Content-Disposition",
			`attachment; filename=${log.event.toUpperCase()}-${log.level === "None" ? "Test" : log.level}-${log.match_number}-${share.team}.csv`,
		);
		res.setHeader("Content-Type", "text/csv");
		res.send(json2csv(returnObj.log));
	}
});

hljs.registerLanguage("json", json);

const marked = new Marked(
	markedHighlight({
		langPrefix: "hljs language-",
		highlight(code, lang, info) {
			console.log(lang);
			const language = hljs.getLanguage(lang) ? lang : "plaintext";
			console.log(language);
			const result = hljs.highlight(code, { language }).value;
			console.log(result);
			return result;
		},
	}),
);

marked.use(gfmHeadingId());

const SITE_URL = "https://ftabuddy.com";

function escapeHtmlAttr(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

// Strip a leading YAML frontmatter block and return the title/description it declares (if any)
// plus the remaining markdown body.
function stripFrontmatter(markdown: string): { title?: string; description?: string; body: string } {
	const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { body: markdown };
	const block = match[1];
	const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, "");
	const titleLine = block.match(/^title:\s*(.+)$/m);
	const descLine = block.match(/^description:\s*(.+)$/m);
	return {
		title: titleLine ? unquote(titleLine[1]) : undefined,
		description: descLine ? unquote(descLine[1]) : undefined,
		body: markdown.slice(match[0].length),
	};
}

// Reduce inline markdown to readable plain text for use in a meta description.
function markdownToPlainText(text: string): string {
	return text
		.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/[*_`>#]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

// Derive a page title and meta description from the markdown of a docs page.
function extractDocMeta(markdown: string, urlPath: string): { title: string; description: string } {
	const { title: fmTitle, description: fmDescription, body } = stripFrontmatter(markdown);

	const h1 = body.match(/^#\s+(.+?)\s*#*\s*$/m);
	let title = fmTitle || (h1 ? markdownToPlainText(h1[1]) : "");
	if (!title) {
		// Fall back to the last path segment, turned into words.
		const segment = urlPath.replace(/\/$/, "").split("/").pop() || "docs";
		title = segment.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
	}
	const fullTitle = /fta buddy/i.test(title) ? title : `${title} - FTA Buddy Docs`;

	let description = fmDescription || "";
	if (!description) {
		const lines = body.split(/\r?\n/);
		// If the body has an H1, skip the nav links that sit above it; otherwise take the first paragraph.
		let seenHeading = !h1;
		for (const raw of lines) {
			const line = raw.trim();
			if (!line) continue;
			if (line.startsWith("#")) {
				seenHeading = true;
				continue;
			}
			if (!seenHeading) continue; // skip nav links above the H1
			if (line.startsWith("---") || line.startsWith("|") || line.startsWith("![")) continue;
			if (/^[-*+]\s/.test(line) || /^\d+\.\s/.test(line)) continue;
			description = markdownToPlainText(line);
			if (description) break;
		}
	}
	if (!description) description = "FTA Buddy documentation for FRC event volunteers.";
	if (description.length > 300) description = description.slice(0, 297).trimEnd() + "...";

	return { title: fullTitle, description };
}

const DOCS_ROOT = join(__dirname, "../docs");

// Intro paragraph for auto-generated section index pages, keyed by URL path. Feeds the
// visible lead text and the meta description; falls back to a generic line if absent.
const DIR_INDEX_INTRO: Record<string, string> = {
	"/docs/troubleshooting/":
		"Field-tested fixes for common FRC roboRIO, radio, power, and network problems seen at events.",
	"/docs/troubleshooting/notes/":
		"Field-tested fixes for common FRC roboRIO, radio, power, and network problems seen at events.",
};

// Read a docs page's display title (frontmatter title, else first H1, else prettified filename).
function docLinkTitle(markdown: string, segment: string): string {
	const { title: fmTitle, body } = stripFrontmatter(markdown);
	if (fmTitle) return fmTitle;
	const h1 = body.match(/^#\s+(.+?)\s*#*\s*$/m);
	if (h1) return markdownToPlainText(h1[1]);
	return segment.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Read a `date:` value from a page's YAML frontmatter, if present.
function docDate(markdown: string): string {
	const fm = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!fm) return "";
	const m = fm[1].match(/^date:\s*(.+)$/m);
	return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

// Build a markdown listing for a docs directory that has no index.md of its own, so the pages
// under it (e.g. auto-distilled troubleshooting notes) are reachable and crawlable instead of
// orphaned. Recurses into subdirectories; returns null if the dir has no markdown pages.
function buildDirIndexMarkdown(dirAbs: string, reqPath: string): string | null {
	if (!existsSync(dirAbs) || !statSync(dirAbs).isDirectory()) return null;
	const pages: { url: string; title: string; date: string }[] = [];
	const walk = (d: string) => {
		for (const entry of readdirSync(d, { withFileTypes: true })) {
			const full = join(d, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "index.md") {
				const md = readFileSync(full, "utf8");
				const rel = relative(DOCS_ROOT, full).replace(/\\/g, "/").replace(/\.md$/, "");
				pages.push({
					url: "/docs/" + rel,
					title: docLinkTitle(md, entry.name.slice(0, -3)),
					date: docDate(md),
				});
			}
		}
	};
	walk(dirAbs);
	if (pages.length === 0) return null;
	// Newest first (by frontmatter date), then alphabetical.
	pages.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
	const segment = reqPath.replace(/\/$/, "").split("/").pop() || "docs";
	const heading = segment.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
	const intro = DIR_INDEX_INTRO[reqPath];
	let out = `# ${heading}\n\n`;
	if (intro) out += `${intro}\n\n`;
	for (const p of pages) out += `- [${p.title}](${p.url})${p.date ? ` - ${p.date}` : ""}\n`;
	return out;
}

app.get(/^\/docs\//, async (req, res) => {
	let path = req.path;
	if (path.endsWith("/")) path += "index";
	path = join(__dirname, "../", path + ".md");
	let data: string;
	try {
		data = readFileSync(path, "utf8");
	} catch {
		// No index.md for this directory: auto-generate a listing so its pages are not orphaned.
		const auto = path.endsWith("/index.md") ? buildDirIndexMarkdown(path.slice(0, -"/index.md".length), req.path) : null;
		if (auto === null) {
			res.status(404).send("Not found");
			return;
		}
		data = auto;
	}
	const { body } = stripFrontmatter(data);
	const { title, description } = extractDocMeta(data, req.path);
	const canonical = SITE_URL + req.path;
	const html = sanitizeHtml(await marked.parse(body), {
		allowedAttributes: {
			span: ["id", "class"],
			a: ["href", "name", "target"],
			h1: ["id"],
			h2: ["id"],
			h3: ["id"],
			h4: ["id"],
			h5: ["id"],
		},
	});
	res.send(`<!doctype html>
    <html lang="en">
        <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>${escapeHtmlAttr(title)}</title>
            <meta name="description" content="${escapeHtmlAttr(description)}" />
            <link rel="canonical" href="${escapeHtmlAttr(canonical)}" />
            <meta name="theme-color" content="#ac71f4" />
            <link rel="icon" href="/favicon.ico" sizes="any" />
            <meta property="og:type" content="article" />
            <meta property="og:site_name" content="FTA Buddy" />
            <meta property="og:title" content="${escapeHtmlAttr(title)}" />
            <meta property="og:description" content="${escapeHtmlAttr(description)}" />
            <meta property="og:url" content="${escapeHtmlAttr(canonical)}" />
            <meta property="og:image" content="${SITE_URL}/icon512_rounded.png" />
            <meta name="twitter:card" content="summary" />
            <meta name="twitter:title" content="${escapeHtmlAttr(title)}" />
            <meta name="twitter:description" content="${escapeHtmlAttr(description)}" />
            <meta name="twitter:image" content="${SITE_URL}/icon512_rounded.png" />
            <link rel="stylesheet" href="/docs.css">
            <link rel="stylesheet" href="/hljs.css">
        </head>
        <body class="markdown-body" style="margin: 1rem;">
            <div style="margin: 0 auto; max-width: 1024px;">
                ${html}
            </div>
        </body>
    </html>
    `);
});

// Recursively collect docs URLs from the docs/ directory for the sitemap. A directory URL is
// emitted when it has an index.md, or when it has no index.md but contains pages that the docs
// handler auto-indexes (so those hub pages appear in the sitemap too).
function collectDocUrls(dir: string, urlPrefix: string): string[] {
	const urls: string[] = [];
	const childUrls: string[] = [];
	let hasIndex = false;
	let hasDescendant = false;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			const sub = collectDocUrls(join(dir, entry.name), `${urlPrefix}${entry.name}/`);
			if (sub.length > 0) hasDescendant = true;
			childUrls.push(...sub);
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			hasDescendant = true;
			if (entry.name === "index.md") {
				hasIndex = true;
			} else {
				urls.push(`${urlPrefix}${entry.name.slice(0, -3)}`); // drop .md
			}
		}
	}
	if (hasIndex || hasDescendant) urls.push(urlPrefix); // /docs/foo/index.md or auto-indexed -> /docs/foo/
	urls.push(...childUrls);
	return urls;
}

app.get("/robots.txt", (req, res) => {
	res.type("text/plain").send(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

app.get("/sitemap.xml", (req, res) => {
	let docUrls: string[] = [];
	try {
		docUrls = collectDocUrls(join(__dirname, "../docs"), "/docs/");
	} catch (err) {
		console.error("[sitemap] failed to enumerate docs", err);
	}
	const paths = ["/", ...docUrls.sort()];
	const body = paths
		.map((p) => `  <url><loc>${SITE_URL}${escapeHtmlAttr(p)}</loc></url>`)
		.join("\n");
	res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`);
});

app.get("/docs.css", (req, res) => {
	res.sendFile(join(__dirname, "../node_modules/github-markdown-css/github-markdown.css"));
});
app.get("/hljs.css", (req, res) => {
	res.sendFile(join(__dirname, "../node_modules/highlight.js/styles/atom-one-dark.css"));
});

app.get("/kiosk", (req, res) => {
	res.redirect("/manage/kiosk");
});

app.get("/app", (req, res) => {
	res.redirect("/");
});

// Nexus live event status webhook - receives push updates for all active events.
// Always returns 200 to prevent Nexus from auto-disabling the webhook.
// Only processes the payload if the NEXUS_WEBHOOK_TOKEN env var matches.
app.post("/api/nexus/event-status", async (req, res) => {
	res.status(200).send("OK");

	const token = req.headers["nexus-token"] as string | undefined;
	const expectedToken = process.env.NEXUS_WEBHOOK_TOKEN;
	if (expectedToken && token !== expectedToken) {
		console.warn("[NexusWebhook] Received request with invalid token - ignoring");
		return;
	}

	const body = req.body as { eventKey?: string; dataAsOfTime?: number; nowQueuing?: string | null; matches?: any[] };
	if (!body?.eventKey || typeof body.dataAsOfTime !== "number") return;

	const eventCode = body.eventKey.toLowerCase();
	console.log(`[NexusWebhook] Received ${body.matches ? "match" : "event"} update for ${eventCode}`);
	const newStatus = {
		dataAsOfTime: body.dataAsOfTime,
		nowQueuing: body.nowQueuing ?? null,
		matches: body.matches ?? [],
	};

	// Publish to bus so ALL instances receive the update, not just the one that got the webhook
	bus.publish(`event:${eventCode}:nexus_event_status`, newStatus);

	// Also update this instance's local cache if the event is loaded here
	const event = events[eventCode];
	if (event && body.dataAsOfTime > (event.nexusEventStatus?.dataAsOfTime ?? 0)) {
		event.nexusEventStatus = newStatus;
	}
});

if (process.env.NODE_ENV === "dev") {
	app.use("/FieldMonitor", express.static("app/src/public/FieldMonitor"));
} else {
	app.use("/", express.static("app/dist"));
	app.use("/FieldMonitor", express.static("app/dist/FieldMonitor"));
	app.get(/.*/, (req, res) => {
		res.sendFile(join(__dirname, "../app/dist/index.html"));
	});
}

connect().then(async () => {
	// Apply any pending DB migrations before doing anything else. Without this
	// the server starts against a schema that may not match the code, and
	// foreign-key / column-missing errors surface at runtime instead of boot.
	try {
		await migrate(db, { migrationsFolder: "./drizzle" });
		console.log("✅ Migrations up to date");
	} catch (err) {
		console.error("❌ Migrations failed:", err);
		process.exit(1);
	}

	// Load knownIssue from Redis
	try {
		const storedIssue = await redis.get("ftabuddy:global:known_issue");
		if (storedIssue) {
			const parsed = SuperJSON.parse(storedIssue);
			if (parsed && typeof parsed === "object") knownIssue = parsed as typeof knownIssue;
		}
	} catch (err) {
		console.error("[KnownIssue] Failed to load from Redis:", err);
	}
	bus.subscribe("global:known_issue", (data) => {
		knownIssue = data as typeof knownIssue;
	});

	// Log analysis loop - runs forever; errors are caught and logged so the loop never dies.
	// acquireOrRenewLock: if we already hold the lock, renew it; if unclaimed, acquire it.
	// TTL=15 s, loop interval=3 s → lock is renewed 5× per TTL window, so it stays held
	// as long as this instance is healthy. On crash, another instance takes over within 15 s.
	(async () => {
		while (true) {
			try {
				const isLeader = await acquireOrRenewLock("log_analysis", 15);
				if (isLeader) {
					await logAnalysisLoop(3);
				}
			} catch (err) {
				console.error("[LogAnalysis] Unhandled error in loop iteration - will retry in 3 s:", err);
			}
			await new Promise((resolve) => setTimeout(resolve, 3e3));
		}
	})();

	// Slack history poller for the troubleshooting corpus (leader-locked, 3 h cadence)
	startSlackPoller();

	// Weekly re-crawl of the vendor documentation (leader-locked)
	startCorpusRefresh();

	// Start Nexus pollers for events with a key configured that are currently running
	try {
		const today = new Date().toISOString().split("T")[0];
		const eventsWithNexus = await db
			.select({
				token: schema.events.token,
				startDate: schema.events.startDate,
				endDate: schema.events.endDate,
			})
			.from(schema.events)
			.where(and(eq(schema.events.archived, false), isNotNull(schema.events.nexusApiKey)));
		for (const row of eventsWithNexus) {
			if (row.startDate && row.endDate && today >= row.startDate && today <= row.endDate) {
				getEvent(row.token)
					.then((event) => {
						nexusEventPoller.fetchOnce(event);
						nexusEventPoller.startFallbackPoller(event);
					})
					.catch(() => {
						/* ignore load errors on startup */
					});
			}
		}
	} catch (err) {
		console.error("[Nexus] Failed to load events on startup:", (err as any)?.message);
	}

	// Fix old-format calculated_cycle_time strings (e.g. "8:33") to the full format ("00:08:33.000")
	try {
		const shortCycles = await db
			.select({ id: cycleLogs.id, calculated_cycle_time: cycleLogs.calculated_cycle_time })
			.from(cycleLogs)
			.where(and(isNotNull(cycleLogs.calculated_cycle_time), sql`LENGTH(${cycleLogs.calculated_cycle_time}) < 5`))
			.execute();
		if (shortCycles.length > 0) {
			for (const row of shortCycles) {
				const ms = cycleTimeToMS(row.calculated_cycle_time!);
				const totalSec = Math.floor(ms / 1000);
				const h = Math.floor(totalSec / 3600);
				const m = Math.floor((totalSec % 3600) / 60);
				const s = totalSec % 60;
				const msRemainder = ms % 1000;
				const fixed = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${msRemainder.toString().padStart(3, "0")}`;
				await db
					.update(cycleLogs)
					.set({ calculated_cycle_time: fixed })
					.where(eq(cycleLogs.id, row.id))
					.execute();
			}
			console.log(`✅ Migrated ${shortCycles.length} old cycle time format(s) to full format`);
		}
	} catch (err) {
		console.error("Failed to migrate old cycle time formats:", err);
	}

	server.listen(port);
	console.log("✅ HTTP Server listening on http://localhost:" + port);

	startDebugLogBackground();

	// Evict events with no activity for more than 3 days
	setInterval(
		() => {
			const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
			for (const code of Object.keys(events)) {
				const event = events[code];
				if ((eventLastSeen[code] ?? new Date(0)).getTime() < cutoff) {
					console.log(`[Cleanup] Evicting inactive event ${code}`);
					cleanupEventSubscriptions(code);
					nexusEventPoller.stopForEvent(code);
					if (event.token) delete eventCodes[event.token];
					delete eventLastSeen[code];
					delete events[code];
				}
			}
		},
		60 * 60 * 1000,
	);
});

process.on("SIGTERM", () => {
	console.log("SIGTERM");
	server.closeAllConnections();
	server.close(() => process.exit(0));
});
