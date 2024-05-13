import 'dotenv/config';
import { connect, db } from './db/db';
import { userRouter } from './router/user';
import * as trpcExpress from '@trpc/server/adapters/express';
import express from 'express';
import { createContext, router } from './trpc';
import cors from 'cors';
import { eventRouter } from './router/event';
import expressWs from 'express-ws';
import { eq } from 'drizzle-orm';
import { events } from './db/schema';
import { readFileSync, readdirSync } from 'fs';
import { DEFAULT_MONITOR } from '../shared/constants';
import { detectStatusChange } from './stateChange';
import { matchRouter } from './router/logs';
import { StatusChanges } from '../shared/types';
import { checklistRouter } from './router/checklist';
import { processFrameForTeamData } from './frameProcessing';
const { app, getWss, applyTo } = expressWs(express());

const port = process.env.PORT || 3002;

const appRouter = router({
    user: userRouter,
    event: eventRouter,
    match: matchRouter,
    checklist: checklistRouter
});

export const eventList: { [key: string]: { socketServer?: any, socketClients: any[], monitor: any, teams: any[], token: string, statusChanges: StatusChanges } } = {};

export type AppRouter = typeof appRouter;

app.use(cors())

app.ws('/ws/', (ws, req) => {
    ws.on('message', async (rawData) => {
        let msg = rawData.toString();
        if (msg == 'ping') return ws.send(JSON.stringify({ type: 'pong' }));
        if (msg.startsWith('server')) {
            let eventCode = msg.substring(7).toLowerCase();
            console.log(`[WS ${eventCode} S] connected`);
            if (eventList[eventCode]) {
                eventList[eventCode].socketServer = ws;
            } else {
                const res = await db.query.events.findFirst({ where: eq(events.code, eventCode) });
                if (!res) {
                    return ws.send(JSON.stringify({ type: 'error', message: 'Event not found' }));
                } else {
                    eventList[eventCode] = {
                        socketServer: ws,
                        socketClients: [],
                        monitor: DEFAULT_MONITOR,
                        teams: res.teams as string[],
                        token: res.token,
                        statusChanges: {
                            blue1: { lastChange: new Date(), improved: false },
                            blue2: { lastChange: new Date(), improved: false },
                            blue3: { lastChange: new Date(), improved: false },
                            red1: { lastChange: new Date(), improved: false },
                            red2: { lastChange: new Date(), improved: false },
                            red3: { lastChange: new Date(), improved: false }
                        }
                    }
                }
            }

            // Register broadcast function for this server
            ws.on('message', (rawData) => {
                let msg = rawData.toString();
                if (msg == 'ping') return ws.send(JSON.stringify({ type: 'pong' }));

                // This happens if the event immeidetly sends a monitor frame
                if (!eventList[eventCode]) {
                    console.log(`[WS ${eventCode} S] No event found for ${eventCode}`);
                } else {
                    const frame = JSON.parse(msg);
                    eventList[eventCode].statusChanges = detectStatusChange(eventList[eventCode].statusChanges, frame, eventList[eventCode].monitor);
                    processFrameForTeamData(eventCode, frame, eventList[eventCode].statusChanges);
                    for (let socketClient of eventList[eventCode].socketClients) {
                        if (socketClient)
                            socketClient.send(JSON.stringify({
                                ...frame,
                                statusChanges: eventList[eventCode].statusChanges
                            }));
                    }
                    eventList[eventCode].monitor = JSON.parse(msg);
                }
            });

        } else if (msg.startsWith('client')) {
            let eventToken = msg.substring(7).toLowerCase();
            console.log(eventToken);

            const res = await db.query.events.findFirst({ where: eq(events.token, eventToken) });
            if (!res) {
                return ws.send(JSON.stringify({ type: 'error', message: 'Event not found' }));
            }

            console.log(`[WS ${res.code} C] connected`);
            if (eventList[res.code]) {
                eventList[res.code].socketClients.push(ws);
            } else {
                eventList[res.code] = {
                    socketClients: [ws],
                    monitor: DEFAULT_MONITOR,
                    teams: res.teams as string[],
                    token: res.token,
                    statusChanges: {
                        blue1: { lastChange: new Date(), improved: false },
                        blue2: { lastChange: new Date(), improved: false },
                        blue3: { lastChange: new Date(), improved: false },
                        red1: { lastChange: new Date(), improved: false },
                        red2: { lastChange: new Date(), improved: false },
                        red3: { lastChange: new Date(), improved: false }
                    }
                }
            }
            ws.send(JSON.stringify({...eventList[res.code].monitor, statusChanges: eventList[res.code].statusChanges}));
        }
    });
});

app.use(
    '/trpc',
    trpcExpress.createExpressMiddleware({
        router: appRouter,
        createContext,
    }),
);

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

connect().then(async () => {
    app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });
});

