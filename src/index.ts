import 'dotenv/config';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import cors from 'cors';
import express from 'express';
const pjson = require('../package.json');
import { readFileSync, readdirSync } from 'fs';
import ws from 'ws';
import { FMSLogFrame, NotificationEvents, ROBOT, ServerEvent, TournamentLevel } from '../shared/types';
import { connect, db } from './db/db';
import { checklistRouter } from './router/checklist';
import { eventRouter } from './router/event';
import { fieldMonitorRouter } from './router/field-monitor';
import { matchRouter } from './router/logs';
import { userRouter } from './router/user';
import { createContext, publicProcedure, router } from './trpc';
import { cycleRouter } from './router/cycles';
import { getTeamAverageCycle } from './util/team-cycles';
import { and, eq } from 'drizzle-orm';
import { cycleLogs, logPublishing, matchLogs } from './db/schema';
import { createProxyServer } from 'http-proxy';
import proxy from 'express-http-proxy';
import { createServer } from 'http';
import { messagesRouter } from './router/messages';
import { ticketsRouter, updateTicketAssignmentFromSlack, updateTicketStatusFromSlack } from './router/tickets';
import { json2csv } from 'json-2-csv';
import { Marked } from 'marked';
import { join } from 'path';
import sanitizeHtml from 'sanitize-html';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import json from 'highlight.js/lib/languages/json';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import { observable } from '@trpc/server/observable';
//import { initializePushNotifications } from '../app/src/util/push-notifications';
import { decompressStationLog, logAnalysisLoop } from './util/log-analysis';
import { ftcRouter } from './router/ftc';
import { notesRouter } from './router/notes';
import { TypedEmitter } from 'tiny-typed-emitter';
import { linkChannel, slackOAuth } from './util/slack';
import bodyParser from 'body-parser';

const port = parseInt(process.env.PORT || '3001');

export const events: { [key: string]: ServerEvent; } = {};
export const eventCodes: { [key: string]: string; } = {};

//initializePushNotifications();
// event emitter for all notifications
export const notificationEmitter = new TypedEmitter<NotificationEvents>();

// TRPC Server
const appRouter = router({
    user: userRouter,
    event: eventRouter,
    match: matchRouter,
    checklist: checklistRouter,
    field: fieldMonitorRouter,
    cycles: cycleRouter,
    messages: messagesRouter,
    tickets: ticketsRouter,
    notes: notesRouter,
    app: router({
        version: publicProcedure.subscription(async () => {
            return observable<string>((emitter) => {
                const interval = setInterval(() => {
                    emitter.next(pjson.version ?? 'dev');
                }, 60000);

                emitter.next(pjson.version ?? 'dev');
                return () => clearInterval(interval);
            });
        })
    }),
    ftc: ftcRouter
});

export type AppRouter = typeof appRouter;

// HTTP server hosting TRPC
createHTTPServer({
    router: appRouter,
    middleware: cors(),
    createContext,
}).listen(port + 1);

// Websocket Server
const wss = new ws.Server({ port: port + 2 });

const handler = applyWSSHandler({
    wss,
    router: appRouter,
    createContext: createContext
});

wss.on('connection', (ws) => {
    ws.once('close', () => {
    });
});
console.log('✅ WebSocket Server listening on ws://localhost:' + (port + 2));

const app = express();

const server = createServer(app);

// Proxy for websocket
const wsProxy = createProxyServer({ target: 'http://localhost:' + (port + 2), ws: true });

server.on('upgrade', function (req, socket, head) {
    wsProxy.ws(req, socket, head);
});

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/trpc', proxy('http://localhost:' + (port + 1) + '/trpc'));

app.get('/serviceworker.js', async (req, res) => {
    let assets = readdirSync('./app/dist/assets');
    let serviceWorkerFile = readFileSync('./app/dist/serviceworker.js').toString();
    serviceWorkerFile = serviceWorkerFile.replace('{{CSS_FILE}}', assets.filter(f => f.endsWith('.css'))[0]);
    serviceWorkerFile = serviceWorkerFile.replace('{{JS_FILE}}', assets.filter(f => f.endsWith('.js'))[0]);
    res.setHeader('Content-Type', 'application/javascript');
    res.send(serviceWorkerFile);
});

if (process.env.NODE_ENV === 'dev') {
    app.use('/FieldMonitor', express.static('app/src/public/FieldMonitor'));
} else {
    app.use('/app', express.static('app/dist'));
    app.use('/app/*', express.static('app/dist/index.html'));
    app.use('/FieldMonitor', express.static('app/dist/FieldMonitor'));
}

app.use('/report', express.static('reports'));

app.get('/slack/oauth', async (req, res) => {
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
app.post('/slack/command', async (req, res) => {
    const {
        command,
        text,
        response_url,
        trigger_id,
        user_id,
        user_name,
        team_id,
        channel_id,
        api_app_id
    } = req.body;

    const args = text.split(" ");

    try {
        switch (args[0]) {
            case "link":
                res.send(await linkChannel(args, channel_id, team_id));
            default:
                throw new Error("Invalid command");
        }
    } catch (err) {
        if (err instanceof Error) {
            res.send({
                "response_type": "ephemeral",
                text: err.message
            });
        } else {
            res.send({
                "response_type": "ephemeral",
                text: "An unknown error occurred"
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

    // Check if event is a reaction_added event
    if (event) {
        console.log(event);
        if (event.reaction === "white_check_mark") {
            await updateTicketStatusFromSlack(event.item.ts, event.type !== "reaction_added");
        } else if (event.reaction === "eyes") {
            await updateTicketAssignmentFromSlack(event.item.ts, event.type === "reaction_added", event.user);
        }
    }

    res.sendStatus(200);
});

// Public api

app.get('/api/cycles/:eventCode/:level/:match/:play', async (req, res) => {
    if (!['none', 'practice', 'qualification', 'playoff'].includes(req.params.level.toLowerCase())) return res.status(400).send('Invalid level');

    let level = req.params.level.toLowerCase() as TournamentLevel;
    level = level.substring(0, 1).toUpperCase() + level.substring(1);

    res.json(await db.query.cycleLogs.findFirst({ where: and(eq(cycleLogs.event, req.params.eventCode.toLowerCase()), eq(cycleLogs.match_number, parseInt(req.params.match)), eq(cycleLogs.play_number, parseInt(req.params.play)), eq(cycleLogs.level, level as TournamentLevel)) }));
});

app.get('/api/cycles/:eventCode', async (req, res) => {
    res.json(await db.query.cycleLogs.findMany({ where: eq(cycleLogs.event, req.params.eventCode.toLowerCase()) }));
});

app.get('/api/team-average-cycle/:team/:eventCode?', async (req, res) => {
    res.json(await getTeamAverageCycle(parseInt(req.params.team), req.params.eventCode?.toLowerCase()));
});

app.get('/api/logs/:shareCode', async (req, res) => {
    const share = await db.query.logPublishing.findFirst({ where: eq(logPublishing.id, req.params.shareCode) });
    if (!share) return res.status(404).send('Share code not found');
    const log = await db.query.matchLogs.findFirst({ where: eq(matchLogs.id, share.match_id) });
    if (!log) return res.status(500).send('Log not found');

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
        log: compressedLog ? decompressStationLog(compressedLog) : []
    };

    if (req.query.format === 'json') {
        res.json(returnObj);
    } else {
        res.setHeader('Content-Disposition', `attachment; filename=${log.event.toUpperCase()}-${log.level === "None" ? "Test" : log.level}-${log.match_number}-${share.team}.csv`);
        res.setHeader('Content-Type', 'text/csv');
        res.send(json2csv(returnObj.log));
    }
});

hljs.registerLanguage('json', json);

const marked = new Marked(
    markedHighlight({
        langPrefix: 'hljs language-',
        highlight(code, lang, info) {
            console.log(lang);
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            console.log(language);
            const result = hljs.highlight(code, { language }).value;
            console.log(result);
            return result;
        }
    })
);

marked.use({
    gfm: true,
});

marked.use(gfmHeadingId());

app.get('/docs/*', async (req, res) => {
    let path = req.path;
    if (path.endsWith('/')) path += 'index';
    path = join(__dirname, '../', path + '.md');
    const data = readFileSync(path, 'utf8');
    const html = sanitizeHtml(await marked.parse(data), {
        allowedAttributes: {
            'span': ['id', 'class'],
            'a': ['href', 'name', 'target'],
            'h1': ['id'],
            'h2': ['id'],
            'h3': ['id'],
            'h4': ['id'],
            'h5': ['id'],
        }
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

app.get('/docs.css', (req, res) => {
    res.sendFile(join(__dirname, '../node_modules/github-markdown-css/github-markdown.css'));
});
app.get('/hljs.css', (req, res) => {
    res.sendFile(join(__dirname, '../node_modules/highlight.js/styles/atom-one-dark.css'));
});

app.get('/', (req, res) => {
    res.redirect('/app/');
});


connect().then(() => {
    if (process.env.NODE_ENV !== 'dev') {
        // Log analysis loop
        new Promise(async () => {
            while (true) {
                await logAnalysisLoop(3);
                await new Promise((resolve) => setTimeout(resolve, 3e3));
            }
        });
    }

    server.listen(port);
});


process.on('SIGTERM', () => {
    console.log('SIGTERM');
    handler.broadcastReconnectNotification();
    wss.close();
});
