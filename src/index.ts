import { createExpressMiddleware } from "@trpc/server/adapters/express";
import cors from "cors";
import "dotenv/config";
import { and, eq } from "drizzle-orm";
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
import { ROBOT, TournamentLevel } from "../shared/types";
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
import { events, eventCodes, notificationEmitter, newEventEmitter } from "./state";

export { events, eventCodes, notificationEmitter, newEventEmitter };

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
	let assets = readdirSync("./app/dist/assets");
	let serviceWorkerFile = readFileSync("./app/dist/serviceworker.js").toString();
	serviceWorkerFile = serviceWorkerFile.replace("{{CSS_FILE}}", assets.filter((f) => f.endsWith(".css"))[0]);
	serviceWorkerFile = serviceWorkerFile.replace("{{JS_FILE}}", assets.filter((f) => f.endsWith(".js"))[0]);
	res.setHeader("Content-Type", "application/javascript");
	res.send(serviceWorkerFile);
});

app.use("/report", express.static("/data/reports"));

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
	const { event, challenge } = req.body;

	// Slack Verification Challenge
	if (challenge) {
		return res.json({ challenge });
	}

	try {
		// Ignore events from the bot
		if (event && event.user !== "U08FVV94LPR") {
			console.log(event);
			// Only listen to reactions on messages from the bot
			if (event.reaction === "white_check_mark" && event.item.user === "U08FVV94LPR") {
				await updateNoteStatusFromSlack(event.item.ts, event.type === "reaction_added", event.user);
			} else if (event.reaction === "eyes" && event.item.user === "U08FVV94LPR") {
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
	// Log analysis loop
	new Promise(async () => {
		while (true) {
			await logAnalysisLoop(3);
			await new Promise((resolve) => setTimeout(resolve, 3e3));
		}
	});

	// Start Nexus pollers for any events that already have a key configured
	try {
		const eventsWithNexus = await db
			.select({
				token: schema.events.token,
			})
			.from(schema.events)
			.where(and(eq(schema.events.archived, false)));
		for (const row of eventsWithNexus) {
			// Load event into memory (which will start the poller if nexusApiKey is set)
			getEvent(row.token).catch(() => {
				/* ignore load errors on startup */
			});
		}
	} catch (err) {
		console.error("[Nexus] Failed to load events on startup:", (err as any)?.message);
	}

	server.listen(port);
	console.log("✅ HTTP Server listening on http://localhost:" + port);
});

process.on("SIGTERM", () => {
	console.log("SIGTERM");
	server.close();
});
