import 'dotenv/config';
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/db";
import { events } from "../db/schema";
import { adminProcedure, eventProcedure, protectedProcedure, publicProcedure, router } from "../trpc";
import { generateToken } from "./user";

export const eventRouter = router({
    join: publicProcedure.input(z.object({
        code: z.string(),
        pin: z.string()
    })).query(async ({ input }) => {
        const event = await db.query.events.findFirst({ where: eq(events.code, input.code) });

        if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });

        if (event.pin !== input.pin) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect pin' });

        return event;
    }),

    get: adminProcedure.input(z.string()).query(async ({ input }) => {
        const event = await db.query.events.findFirst({ where: eq(events.code, input) });

        if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });

        return event;
    }),

    create: protectedProcedure.input(z.object({
        code: z.string().startsWith('202').min(6),
        pin: z.string().min(4)
    })).query(async ({ input }) => {
        const token = generateToken();
        const teams: string[] = [];

        if (await db.query.events.findFirst({ where: eq(events.code, input.code) })) {
            throw new TRPCError({ code: 'CONFLICT', message: 'Event already exists' });
        }

        const teamsData = await fetch(`https://www.thebluealliance.com/api/v3/event/${input.code}/teams/simple`, {
            headers: {
                'X-TBA-Auth-Key': process.env.TBA_API_KEY ?? ''
            }
        }).then(res => res.json());

        if (teamsData) {
            for (let team of teamsData) {
                teams.push(team.team_number);
            }
        }

        await db.insert(events).values({
            code: input.code,
            pin: input.pin,
            token,
            teams
        });

        return { code: input.code, token, teams };
    }),

    getAll: adminProcedure.query(async () => {
        return (await db.query.events.findMany()).sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    })
});

// function updateTeamsListFromMonitor(event: string, monitor: MonitorFrame) {
//     let newTeamsAdded = false;
//     for (let team of [monitor.blue1.number, monitor.blue2.number, monitor.blue3.number, monitor.red1.number, monitor.red2.number, monitor.red3.number]) {
//         if (!events[event].teams.includes(team)) {
//             events[event].teams.push(team);
//             newTeamsAdded = true;
//         }
//     }
//     if (newTeamsAdded) db.query('UPDATE events SET teams = ? WHERE code = ?;', [JSON.stringify(events[event].teams), event]);
// }

// app.use(json());
// app.use(cors());

// app.use(express.static('./cloud/public'));

// app.get('/', (req, res) => {
//     res.redirect('/');
// });

// // Get local server ip for an event
// app.get('/register/:event', (req, res) => {
//     req.params.event = req.params.event.toLowerCase();
//     if (events[req.params.event] && events[req.params.event].ip) {
//         return res.send({
//             'local_ip': events[req.params.event].ip
//         });
//     }

//     db.query('SELECT local_ip FROM events WHERE code = ?;', [req.params.event]).spread((ip: string[]) => {
//         if (ip.length == 0) {
//             return res.send({ 'local_ip': "0.0.0.0" });
//         }
//         res.send(ip[0]);
//     });
// });

// // Register a local server ip for an event
// app.post('/register/:event', (req, res) => {
//     req.params.event = req.params.event.toLowerCase();
//     if (events[req.params.event]) {
//         events[req.params.event].ip = req.body.ip;
//     } else {
//         events[req.params.event] = {
//             ip: req.body.ip,
//             socketClients: [],
//             monitor: DEFAULT_MONITOR,
//             teams: []
//         }
//     }

//     db.query('SELECT * FROM events WHERE code = ?;', [req.params.event]).spread((event: EventsRow[]) => {
//         if (event.length == 0) {
//             db.query('INSERT INTO events VALUES (?, ?, "[]");', [req.params.event, req.body.ip]);
//             console.log(`Registered event ${req.params.event} at ${req.body.ip}`);
//         } else {
//             db.query('UPDATE events SET local_ip = ? WHERE code = ?;', [req.body.ip, req.params.event]);
//             console.log(`Updated event ${req.params.event} at ${req.body.ip}`);
//             events[req.params.event].teams = JSON.parse(event[0].teams);
//         }
//         res.send();
//     });
// });

// // Get team list for an event
// app.get('/teams/:event', (req, res) => {
//     req.params.event = req.params.event.toLowerCase();
//     db.query('SELECT teams FROM events WHERE code = ?;', [req.params.event]).spread((teams: EventsRow[]) => {
//         // TODO: Add TBA integration to get team names and stuff
//         if (teams.length > 0) {
//             teams = JSON.parse(teams[0].teams)
//             res.send(teams);
//         } else {
           
//         }
//     });
// });

// // Set team list for an event
// app.post('/teams/:event', (req, res) => {
//     req.params.event = req.params.event.toLowerCase();
//     db.query('SELECT * FROM events WHERE code = ?;', [req.params.event]).spread((event: EventsRow[]) => {
//         if (event) {
//             db.query('UPDATE events SET teams = ? WHERE code = ?;', [JSON.stringify(req.body.teams), req.params.event]);
//         } else {
//             db.query('INSERT INTO events VALUES (?, NULL, ?);', [req.params.event, JSON.stringify(req.body.teams)]);
//         }
//         res.send();
//     });
// });

// // Get latest update of field monitor
// app.get('/monitor/:event', (req, res) => {
//     req.params.event = req.params.event.toLowerCase();
//     if (!events.hasOwnProperty(req.params.event)) return res.status(404).send();
//     res.send(events[req.params.event].monitor);
// });

// // Post update of field monitor
// app.post('/monitor/:event', (req, res) => {
//     req.params.event = req.params.event.toLowerCase();
//     console.debug(`[${req.params.event}] Field monitor update received ${JSON.stringify(req.body)}`);

//     if (!events.hasOwnProperty(req.params.event)) events[req.params.event] = {
//         socketClients: [],
//         monitor: DEFAULT_MONITOR,
//         teams: []
//     };
//     events[req.params.event].monitor = req.body;
//     res.send();

//     for (let socketClient of events[req.params.event].socketClients) {
//         if (socketClient) socketClient.send(req.body);
//     }

//     updateTeamsListFromMonitor(req.params.event, req.body);
// }); 
