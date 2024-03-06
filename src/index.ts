import 'dotenv/config';
import { connect } from './db/db';
import { userRouter } from './router/user';
import * as trpcExpress from '@trpc/server/adapters/express';
import express from 'express';
import { createContext, router } from './trpc';
import cors from 'cors';
import { eventRouter } from './router/event';

const port = process.env.PORT || 3001;

const appRouter = router({
    user: userRouter,
    event: eventRouter
});

export type AppRouter = typeof appRouter;

const app = express();

app.use(cors())

app.use(
    '/trpc',
    trpcExpress.createExpressMiddleware({
        router: appRouter,
        createContext,
    }),
);

if (process.env.NODE_ENV === 'dev') {
} else {
    app.use(express.static('app/dist'));
}

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

// app.ws('/', (ws, req) => {
//     ws.on('message', async (rawData) => {
//         let msg = rawData.toString();
//         if (msg == 'ping') return ws.send(JSON.stringify({ type: 'pong' }));
//         if (msg.startsWith('server')) {
//             let eventCode = msg.substring(7).toLowerCase();
//             console.log(`[WS ${eventCode} S] connected`);
//             if (events[eventCode]) {
//                 events[eventCode].socketServer = ws;
//             } else {
//                 fetch(`https://www.thebluealliance.com/api/v3/event/${eventCode}/teams/simple`, {
//                     headers: {
//                         'X-TBA-Auth-Key': process.env.TBA_KEY ?? ''
//                     }
//                 }).then(async (response) => {
//                     let teams = [];
//                     if (response.status == 200) {
//                         let teamsData = await response.json();
//                         for (let team of teamsData) {
//                             teams.push(team.team_number);
//                         }
//                         // db.query('SELECT * FROM events WHERE code = ?;', [req.params.event]).spread((event: EventsRow[]) => {
//                         //     if (event) {
//                         //         db.query('UPDATE events SET teams = ? WHERE code = ?;', [JSON.stringify(req.body.teams), req.params.event]);
//                         //     }
//                         // });
//                     }

//                     events[eventCode] = {
//                         socketServer: ws,
//                         socketClients: [],
//                         monitor: DEFAULT_MONITOR,
//                         teams: []
//                     }
//                 });
//             }
//             // Register broadcast function for this server
//             ws.on('message', (rawData) => {
//                 let msg = rawData.toString();
//                 if (msg == 'ping') return ws.send(JSON.stringify({ type: 'pong' }));

//                 // This happens if the event immeidetly sends a monitor frame before the TBA request is done
//                 if (!events[eventCode]) {
//                     console.log(`[WS ${eventCode} S] No event found for ${eventCode}`);
//                 } else {
//                     for (let socketClient of events[eventCode].socketClients) {
//                         if (socketClient)
//                             socketClient.send(msg);
//                     }
//                     events[eventCode].monitor = JSON.parse(msg);
//                     // If field is ready to prestart, that means new teams are displayed
//                     if (events[eventCode].monitor.field === 7) {
//                         //updateTeamsListFromMonitor(eventCode, events[eventCode].monitor);
//                     }
//                 }
//             });

//         } else if (msg.startsWith('client')) {
//             let eventCode = msg.substring(7).toLowerCase();
//             console.log(`[WS ${eventCode} C] connected`);
//             if (events[eventCode]) {
//                 events[eventCode].socketClients.push(ws);
//             } else {
//                 events[eventCode] = {
//                     socketClients: [ws],
//                     monitor: DEFAULT_MONITOR,
//                     teams: []
//                 }
//             }
//             ws.send(JSON.stringify(events[eventCode].monitor));
//         }
//     });
// });
