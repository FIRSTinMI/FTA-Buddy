import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import proxy from 'express-http-proxy';
import { readFileSync, readdirSync } from 'fs';
import ws from 'ws';
import { ServerEvent, TournamentLevel } from '../shared/types';
import { connect, db } from './db/db';
import { checklistRouter } from './router/checklist';
import { eventRouter } from './router/event';
import { fieldMonitorRouter } from './router/field-monitor';
import { matchRouter } from './router/logs';
import { userRouter } from './router/user';
import { createContext, router } from './trpc';
import { cycleRouter } from './router/cycles';
import { getTeamAverageCycle } from './util/team-cycles';
import { and, eq } from 'drizzle-orm';
import { cycleLogs } from './db/schema';

const port = parseInt(process.env.PORT || '3000');

export const events: { [key: string]: ServerEvent; } = {};
export const eventCodes: { [key: string]: string; } = {};

// TRPC Server
const appRouter = router({
    user: userRouter,
    event: eventRouter,
    match: matchRouter,
    checklist: checklistRouter,
    field: fieldMonitorRouter,
    cycles: cycleRouter
});

export type AppRouter = typeof appRouter;

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
    console.log(`➕➕ Connection (${wss.clients.size})`);
    ws.once('close', () => {
        console.log(`➖➖ Connection (${wss.clients.size})`);
    });
});
console.log('✅ WebSocket Server listening on ws://localhost:' + (port + 2));

const app = express();

app.use(cors())

app.use('/trpc', proxy('http://localhost:' + (port + 1) + '/trpc'));
app.use('/ws', proxy('http://localhost:' + (port + 2)));

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

app.get('/', (req, res) => {
    res.redirect('/app/');
});


// Public api

app.get('/cycles/:eventCode/:level/:match/:play', async (req, res) => {
    if (!['None', 'Practice', 'Qualification', 'Playoff'].includes(req.params.level)) return res.status(400).send('Invalid level');

    res.json(await db.query.cycleLogs.findFirst({ where: and(eq(cycleLogs.event, req.params.eventCode.toLowerCase()), eq(cycleLogs.match_number, parseInt(req.params.match)), eq(cycleLogs.play_number, parseInt(req.params.play)), eq(cycleLogs.level, req.params.level as TournamentLevel)) }));
});

app.get('/cycles/:eventCode', async (req, res) => {
    res.json(await db.query.cycleLogs.findMany({ where: eq(cycleLogs.event, req.params.eventCode.toLowerCase()) }));
});

app.get('/team-average-cycle/:team/:eventCode?', async (req, res) => {
    res.json(await getTeamAverageCycle(parseInt(req.params.team), req.params.eventCode?.toLowerCase()));
});

connect().then(async () => {
    app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });
});

process.on('SIGTERM', () => {
    console.log('SIGTERM');
    handler.broadcastReconnectNotification();
    wss.close();
});
