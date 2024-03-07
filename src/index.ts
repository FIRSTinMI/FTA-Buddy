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
const { app, getWss, applyTo } = expressWs(express());

const port = process.env.PORT || 3001;

const appRouter = router({
    user: userRouter,
    event: eventRouter
});

const eventList: { [key: string]: { socketServer?: any, socketClients: any[], monitor: any, teams: any[], token: string } } = {};

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
                        token: res.token
                    }
                }
            }

            // Register broadcast function for this server
            ws.on('message', (rawData) => {
                let msg = rawData.toString();
                if (msg == 'ping') return ws.send(JSON.stringify({ type: 'pong' }));
                console.log(msg);

                // This happens if the event immeidetly sends a monitor frame
                if (!eventList[eventCode]) {
                    console.log(`[WS ${eventCode} S] No event found for ${eventCode}`);
                } else {
                    for (let socketClient of eventList[eventCode].socketClients) {
                        if (socketClient)
                            socketClient.send(msg);
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
            if (eventList[eventToken]) {
                eventList[eventToken].socketClients.push(ws);
            } else {
                eventList[eventToken] = {
                    socketClients: [ws],
                    monitor: DEFAULT_MONITOR,
                    teams: res.teams as string[],
                    token: res.token
                }
            }
            ws.send(JSON.stringify(eventList[eventToken].monitor));
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

// app.get('/message/feed/:event', (req, res) => {
//     req.params.event = req.params.event.toLowerCase();
//     db.query('SELECT * FROM messages WHERE event = ? ORDER BY created ASC LIMIT 100;', [req.params.event]).spread((messages: MessagesRow[]) => {
//         db.query(`SELECT * FROM profiles WHERE id IN (SELECT profile FROM messages WHERE event = ?);`, [req.params.event]).spread((profiles_raw: ProfilesRow[]) => {
//             let profiles: { [key: number]: ProfilesRow } = {};
//             for (let profile of profiles_raw) {
//                 profiles[profile.id] = profile;
//             }

//             let messagesWithUsernames: Message[] = [];
//             for (let m of messages) {
//                 messagesWithUsernames.push({
//                     ...m,
//                     username: profiles[m.profile].username
//                 });
//             }

//             res.send(messagesWithUsernames);
//         });
//     });
// });

// // Get notes for a team along with profile info
// app.get('/message/:team', (req, res) => {
//     db.query('SELECT * FROM messages WHERE team = ?;', [req.params.team]).spread((messages: MessagesRow[]) => {
//         db.query(`SELECT * FROM profiles WHERE id IN (SELECT profile FROM messages WHERE team = ?);`, [req.params.team]).spread((profiles_raw: ProfilesRow[]) => {
//             let profiles: { [key: number]: ProfilesRow } = {};
//             for (let profile of profiles_raw) {
//                 profiles[profile.id] = profile;
//             }

//             let messagesWithUsernames: Message[] = [];
//             for (let m of messages) {
//                 messagesWithUsernames.push({
//                     ...m,
//                     username: profiles[m.profile].username
//                 });
//             }

//             res.send(messagesWithUsernames);
//         });
//     });
// });

// app.post('/message/feed/:event', (req, res) => {
//     req.params.event = req.params.event.toLowerCase();
//     console.log(`[NOTE ${req.body.event}] ${req.body.profile}: ${req.body.message}`);
//     db.query('SELECT * FROM profiles WHERE id = ?;', [req.body.profile]).spread((profiles: ProfilesRow[]) => {
//         if (profiles.length !== 1) {
//             return res.status(404).send({ error: 'Profile not found' });
//         }

//         if (req.body.token !== profiles[0].token) {
//             return res.status(401).send('Invalid token');
//         }

//         db.query('INSERT INTO messages VALUES (null, ?, ?, null, ?, CURRENT_TIMESTAMP);', [req.body.profile, req.body.event, req.body.message]).then((result: any) => {
//             const message = {
//                 id: result.insertId,
//                 profile: req.body.profile,
//                 username: profiles[0].username,
//                 event: req.body.event,
//                 message: req.body.message,
//                 created: (new Date()).toISOString()
//             };

//             res.send(message);

//             for (let socketClient of events[req.body.event].socketClients) {
//                 if (socketClient) socketClient.send(JSON.stringify({
//                     type: 'message',
//                     message: message,
//                 }));
//             }

//         }).catch((err: Error) => {
//             if (err) res.status(500).send(err)
//         });
//     });
// });

// // Post a message on the notes for a team
// app.post('/message/:team', (req, res) => {
//     console.log(`[NOTE ${req.body.event}] ${req.params.team} (${req.body.profile}): ${req.body.message}`);

//     db.query('SELECT * FROM profiles WHERE id = ?;', [req.body.profile]).spread((profiles: ProfilesRow[]) => {
//         if (profiles.length !== 1) {
//             return res.status(404).send({ error: 'Profile not found' });
//         }

//         if (req.body.token !== profiles[0].token) {
//             return res.status(401).send('Invalid token');
//         }

//         db.query('INSERT INTO messages VALUES (null, ?, ?, ?, ?, CURRENT_TIMESTAMP);', [req.body.profile, req.body.event, req.params.team, req.body.message]).then((result: any) => {
//             const message = {
//                 id: result.insertId,
//                 profile: req.body.profile,
//                 username: profiles[0].username,
//                 event: req.body.event,
//                 team: req.params.team,
//                 message: req.body.message,
//                 created: (new Date()).toISOString()
//             };

//             res.send(message);

//             for (let socketClient of events[req.body.event].socketClients) {
//                 if (socketClient) socketClient.send(JSON.stringify({
//                     type: 'message',
//                     team: req.params.team,
//                     message: message,
//                 }));
//             }

//         }).catch((err: Error) => {
//             if (err) res.status(500).send(err)
//         });
//     });
// });


