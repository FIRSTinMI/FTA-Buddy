import { createExpressMiddleware } from "@trpc/server/adapters/express";
import cors from "cors";
import "dotenv/config";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import express from "express";
import { readFileSync, readdirSync } from "fs";
import hljs from "highlight.js";
import json from "highlight.js/lib/languages/json";
import { createServer } from "http";
import { json2csv } from "json-2-csv";
import { Marked } from "marked";
import { gfmHeadingId } from "marked-gfm-heading-id";
import { markedHighlight } from "marked-highlight";
import { join } from "path";
import sanitizeHtml from "sanitize-html";
import { cycleTimeToMS } from "../shared/cycleTimeToMS";
import type { ROBOT, TournamentLevel } from "../shared/types";
import { connect, db } from "./db/db";
import { cycleLogs, logPublishing, matchLogs } from "./db/schema";
import { adminRouter } from "./router/admin";
import { checklistRouter } from "./router/checklist";
import { cycleRouter } from "./router/cycles";
import { eventRouter } from "./router/event";
import { fieldMonitorRouter } from "./router/field-monitor";
import { matchRouter } from "./router/logs";
import { aiReportRouter } from "./router/ai-report";
import { matchEventsRouter } from "./router/match-events";
import {
	addNoteMessageFromSlack,
	createFromNexus,
	notesRouter,
	updateNoteAssignmentFromSlack,
	updateNoteStatusFromSlack,
} from "./router/notes";
import { telemetryRouter } from "./router/telemetry";
import { userRouter } from "./router/user";
import { adminProcedure, createContext, publicProcedure, router } from "./trpc";

import { z } from "zod";
import { initializePushNotifications } from "../src/util/push-notifications";
import schema from "./db/schema";
import { ftcRouter } from "./router/ftc";
import { getEvent } from "./util/get-event";
import { decompressStationLog, logAnalysisLoop } from "./util/log-analysis";
import { linkChannel, slackOAuth } from "./util/slack";
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
	aiReport: aiReportRouter,
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
				redis.set("ftabuddy:global:known_issue", JSON.stringify(knownIssue));
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
			redis.set("ftabuddy:global:known_issue", JSON.stringify(knownIssue));
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
	// Use the main entry JS hash as the SW version for cache busting
	const swVersion = assets.find((f) => f.startsWith("index-") && f.endsWith(".js")) ?? assets[0] ?? "v1";
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
		res.status(404).send("Report not found");
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

app.get(/^\/docs\//, async (req, res) => {
	let path = req.path;
	if (path.endsWith("/")) path += "index";
	path = join(__dirname, "../", path + ".md");
	const data = readFileSync(path, "utf8");
	const html = sanitizeHtml(await marked.parse(data), {
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
	res.send(`
    <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
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

// Nexus live event status webhook — receives push updates for all active events.
// Always returns 200 to prevent Nexus from auto-disabling the webhook.
// Only processes the payload if the NEXUS_WEBHOOK_TOKEN env var matches.
app.post("/api/nexus/event-status", async (req, res) => {
	res.status(200).send("OK");

	const token = req.headers["nexus-token"] as string | undefined;
	const expectedToken = process.env.NEXUS_WEBHOOK_TOKEN;
	if (expectedToken && token !== expectedToken) {
		console.warn("[NexusWebhook] Received request with invalid token — ignoring");
		return;
	}

	const body = req.body as { eventKey?: string; dataAsOfTime?: number; nowQueuing?: string | null; matches?: any[] };
	if (!body?.eventKey || typeof body.dataAsOfTime !== "number") return;

	const eventCode = body.eventKey.toLowerCase();
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
	// Load knownIssue from Redis — rehydrate Date fields since JSON round-trips them as strings
	function rehydrateKnownIssue(raw: typeof knownIssue): typeof knownIssue {
		return { ...raw, startTime: raw.startTime ? new Date(raw.startTime as any) : null, endTime: raw.endTime ? new Date(raw.endTime as any) : null };
	}
	try {
		const storedIssue = await redis.get("ftabuddy:global:known_issue");
		if (storedIssue) knownIssue = rehydrateKnownIssue(JSON.parse(storedIssue));
	} catch (err) {
		console.error("[KnownIssue] Failed to load from Redis:", err);
	}
	bus.subscribe("global:known_issue", (data) => { knownIssue = rehydrateKnownIssue(data as typeof knownIssue); });

	// Log analysis loop — runs forever; errors are caught and logged so the loop never dies.
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
				console.error("[LogAnalysis] Unhandled error in loop iteration — will retry in 3 s:", err);
			}
			await new Promise((resolve) => setTimeout(resolve, 3e3));
		}
	})();

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
