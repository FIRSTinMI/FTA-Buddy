import express from 'express';
import expressWs from 'express-ws';
import { json } from 'body-parser';
import { randomUUID } from 'crypto';
import cors from 'cors';
import { compare, hash } from 'bcrypt';
import { DATABASE_CONFIG, TBA_KEY } from './config';
import { MonitorFrame, Event, Message } from '../../shared/types';
import { DEFAULT_MONITOR } from '../../shared/constants';

const { app, getWss, applyTo } = expressWs(express());
const port = process.env.PORT || 3001;
const db = require('mysql-promise')();

db.configure(DATABASE_CONFIG);

interface EventsRow {
    code: string;
    local_ip: string;
    teams: string;
}

db.query(`CREATE TABLE IF NOT EXISTS events (
    code VARCHAR(255) NOT NULL,
    local_ip VARCHAR(255),
    teams VARCHAR(8192),
    PRIMARY KEY (code)
    );`)

interface ProfilesRow {
    id: number;
    username: string;
    created: Date;
    last_seen: Date;
    password: string;
    token: string;
}

db.query(`CREATE TABLE IF NOT EXISTS profiles (
    id INT NOT NULL AUTO_INCREMENT,
    username VARCHAR(1023) UNIQUE,
    created DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    password VARCHAR(1023),
    token VARCHAR(1023),
    PRIMARY KEY (id)
    );`)

interface MessagesRow {
    id: number;
    profile: number;
    event: string;
    team: number;
    message: string;
    created: Date;
}

db.query(`CREATE TABLE IF NOT EXISTS messages (
    id INT NOT NULL AUTO_INCREMENT,
    profile INT,
    event VARCHAR(255),
    team INT,
    message TEXT,
    created DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
    );`);

let events: { [key: string]: Event } = {
    'test': {
        socketClients: [],
        monitor: DEFAULT_MONITOR,
        teams: [],
    },
};

function updateTeamsListFromMonitor(event: string, monitor: MonitorFrame) {
    let newTeamsAdded = false;
    for (let team of [monitor.blue1.number, monitor.blue2.number, monitor.blue3.number, monitor.red1.number, monitor.red2.number, monitor.red3.number]) {
        if (!events[event].teams.includes(team)) {
            events[event].teams.push(team);
            newTeamsAdded = true;
        }
    }
    if (newTeamsAdded) db.query('UPDATE events SET teams = ? WHERE code = ?;', [JSON.stringify(events[event].teams), event]);
}

app.use(json());
app.use(cors());

app.use(express.static('./cloud/public'));

app.get('/', (req, res) => {
    res.redirect('/app/');
});

// Get local server ip for an event
app.get('/register/:event', (req, res) => {
    req.params.event = req.params.event.toLowerCase();
    if (events[req.params.event] && events[req.params.event].ip) {
        return res.send({
            'local_ip': events[req.params.event].ip
        });
    }

    db.query('SELECT local_ip FROM events WHERE code = ?;', [req.params.event]).spread((ip: string[]) => {
        if (ip.length == 0) {
            return res.send({ 'local_ip': "0.0.0.0" });
        }
        res.send(ip[0]);
    });
});

// Register a local server ip for an event
app.post('/register/:event', (req, res) => {
    req.params.event = req.params.event.toLowerCase();
    if (events[req.params.event]) {
        events[req.params.event].ip = req.body.ip;
    } else {
        events[req.params.event] = {
            ip: req.body.ip,
            socketClients: [],
            monitor: DEFAULT_MONITOR,
            teams: []
        }
    }

    db.query('SELECT * FROM events WHERE code = ?;', [req.params.event]).spread((event: EventsRow[]) => {
        if (event.length == 0) {
            db.query('INSERT INTO events VALUES (?, ?, "[]");', [req.params.event, req.body.ip]);
            console.log(`Registered event ${req.params.event} at ${req.body.ip}`);
        } else {
            db.query('UPDATE events SET local_ip = ? WHERE code = ?;', [req.body.ip, req.params.event]);
            console.log(`Updated event ${req.params.event} at ${req.body.ip}`);
            events[req.params.event].teams = JSON.parse(event[0].teams);
        }
        res.send();
    });
});

// Get team list for an event
app.get('/teams/:event', (req, res) => {
    req.params.event = req.params.event.toLowerCase();
    db.query('SELECT teams FROM events WHERE code = ?;', [req.params.event]).spread((teams: EventsRow[]) => {
        // TODO: Add TBA integration to get team names and stuff
        if (teams.length > 0) {
            teams = JSON.parse(teams[0].teams)
            res.send(teams);
        } else {
            fetch(`https://www.thebluealliance.com/api/v3/event/${req.params.event}/teams/simple`, {
                headers: {
                    'X-TBA-Auth-Key': TBA_KEY
                }
            }).then(async (response) => {
                let teams = [];
                if (response.status == 200) {
                    let teamsData = await response.json();
                    for (let team of teamsData) {
                        teams.push(team.team_number);
                    }
                    res.send(teams);
                    db.query('SELECT * FROM events WHERE code = ?;', [req.params.event]).spread((event: EventsRow[]) => {
                        if (event) {
                            db.query('UPDATE events SET teams = ? WHERE code = ?;', [JSON.stringify(req.body.teams), req.params.event]);
                        }
                    });
                } else {
                    res.send([]);
                }
            });
        }
    });
});

// Set team list for an event
app.post('/teams/:event', (req, res) => {
    req.params.event = req.params.event.toLowerCase();
    db.query('SELECT * FROM events WHERE code = ?;', [req.params.event]).spread((event: EventsRow[]) => {
        if (event) {
            db.query('UPDATE events SET teams = ? WHERE code = ?;', [JSON.stringify(req.body.teams), req.params.event]);
        } else {
            db.query('INSERT INTO events VALUES (?, NULL, ?);', [req.params.event, JSON.stringify(req.body.teams)]);
        }
        res.send();
    });
});

// Get latest update of field monitor
app.get('/monitor/:event', (req, res) => {
    req.params.event = req.params.event.toLowerCase();
    if (!events.hasOwnProperty(req.params.event)) return res.status(404).send();
    res.send(events[req.params.event].monitor);
});

// Post update of field monitor
app.post('/monitor/:event', (req, res) => {
    req.params.event = req.params.event.toLowerCase();
    console.debug(`[${req.params.event}] Field monitor update received ${JSON.stringify(req.body)}`);

    if (!events.hasOwnProperty(req.params.event)) events[req.params.event] = {
        socketClients: [],
        monitor: DEFAULT_MONITOR,
        teams: []
    };
    events[req.params.event].monitor = req.body;
    res.send();

    for (let socketClient of events[req.params.event].socketClients) {
        if (socketClient) socketClient.send(req.body);
    }

    updateTeamsListFromMonitor(req.params.event, req.body);
});

// Create a user profile for notes
app.post('/profile', async (req, res) => {
    console.log(`New profile request for ${req.body.username}`);

    const hashedPassword = await hash(req.body.password, 16);
    const token = randomUUID().replace(/-/g, '');

    db.query('INSERT INTO profiles VALUES (null, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?);', [req.body.username, hashedPassword, token])
        .then((result: any) => {
            let id = result[0].insertId.toString();
            console.log(`Created with id ${id}`)
            res.send({ id: id, token: token });
        }).catch((err: Error) => {
            res.status(400).send({ error: 'Username already in use' });
        });
});

app.post('/login', async (req, res) => {
    console.log(`Login request for ${req.body.username}`);
    db.query('SELECT * FROM profiles WHERE username = ?;', [req.body.username]).spread(async (profiles: ProfilesRow[]) => {
        if (profiles.length !== 1) {
            return res.status(404).send({ error: 'Profile not found' });
        }

        const match = await compare(req.body.password, profiles[0].password);
        if (match) {
            db.query('UPDATE profiles SET last_seen = CURRENT_TIMESTAMP WHERE id = ?;', [profiles[0].id]);
            res.send(profiles[0]);
        } else {
            res.status(401).send({ error: 'Incorrect password' });
        }
    });
});

// Check if a profile exists
app.get('/profile/:profile', (req, res) => {
    db.query('SELECT * FROM profiles WHERE id = ?;', [req.params.profile]).spread((profiles: ProfilesRow[]) => {
        if (profiles.length !== 1) {
            return res.status(404).send({ error: 'Profile not found' });
        }

        res.send(profiles[0]);
    });
});

// Get notes for a team along with profile info
app.get('/message/:team', (req, res) => {
    db.query('SELECT * FROM messages WHERE team = ?;', [req.params.team]).spread((messages: MessagesRow[]) => {
        db.query(`SELECT * FROM profiles WHERE id IN (SELECT profile FROM messages WHERE team = ?);`, [req.params.team]).spread((profiles_raw: ProfilesRow[]) => {
            let profiles: { [key: number]: ProfilesRow } = {};
            for (let profile of profiles_raw) {
                profiles[profile.id] = profile;
            }

            let messagesWithUsernames: Message[] = [];
            for (let m of messages) {
                messagesWithUsernames.push({
                    ...m,
                    username: profiles[m.profile].username
                });
            }

            res.send(messagesWithUsernames);
        });
    });
});

// Post a message on the notes for a team
app.post('/message/:team', (req, res) => {
    console.log(`[NOTE ${req.body.event}] ${req.params.team} (${req.body.profile}): ${req.body.message}`);

    db.query('SELECT * FROM profiles WHERE id = ?;', [req.body.profile]).spread((profiles: ProfilesRow[]) => {
        if (profiles.length !== 1) {
            return res.status(404).send({ error: 'Profile not found' });
        }

        if (req.body.token !== profiles[0].token) {
            return res.status(401).send('Invalid token');
        }

        db.query('INSERT INTO messages VALUES (null, ?, ?, ?, ?, CURRENT_TIMESTAMP);', [req.body.profile, req.body.event, req.params.team, req.body.message]).then((result: any) => {
            const message = {
                id: result.insertId,
                profile: req.body.profile,
                username: profiles[0].username,
                event: req.body.event,
                team: req.params.team,
                message: req.body.message,
                created: (new Date()).toISOString()
            };

            res.send(message);

            for (let socketClient of events[req.body.event].socketClients) {
                if (socketClient) socketClient.send(JSON.stringify({
                    type: 'message',
                    team: req.params.team,
                    message: message,
                }));
            }

        }).catch((err: Error) => {
            if (err) res.status(500).send(err)
        });
    });
});

app.ws('/', (ws, req) => {
    ws.on('message', async (rawData) => {
        let msg = rawData.toString();
        if (msg == 'ping') return ws.send(JSON.stringify({ type: 'pong' }));
        if (msg.startsWith('server')) {
            let eventCode = msg.substring(7).toLowerCase();
            console.log(`[WS ${eventCode} S] connected`);
            if (events[eventCode]) {
                events[eventCode].socketServer = ws;
            } else {
                fetch(`https://www.thebluealliance.com/api/v3/event/${eventCode}/teams/simple`, {
                    headers: {
                        'X-TBA-Auth-Key': TBA_KEY
                    }
                }).then(async (response) => {
                    let teams = [];
                    if (response.status == 200) {
                        let teamsData = await response.json();
                        for (let team of teamsData) {
                            teams.push(team.team_number);
                        }
                        db.query('SELECT * FROM events WHERE code = ?;', [req.params.event]).spread((event: EventsRow[]) => {
                            if (event) {
                                db.query('UPDATE events SET teams = ? WHERE code = ?;', [JSON.stringify(req.body.teams), req.params.event]);
                            }
                        });
                    }

                    events[eventCode] = {
                        socketServer: ws,
                        socketClients: [],
                        monitor: DEFAULT_MONITOR,
                        teams: []
                    }
                });
            }
            // Register broadcast function for this server
            ws.on('message', (rawData) => {
                let msg = rawData.toString();
                if (msg == 'ping') return ws.send(JSON.stringify({ type: 'pong' }));

                // This happens if the event immeidetly sends a monitor frame before the TBA request is done
                if (!events[eventCode]) {
                    console.log(`[WS ${eventCode} S] No event found for ${eventCode}`);
                } else {
                    for (let socketClient of events[eventCode].socketClients) {
                        if (socketClient)
                            socketClient.send(msg);
                    }
                    events[eventCode].monitor = JSON.parse(msg);
                    // If field is ready to prestart, that means new teams are displayed
                    if (events[eventCode].monitor.field === 7) {
                        updateTeamsListFromMonitor(eventCode, events[eventCode].monitor);
                    }
                }
            });

        } else if (msg.startsWith('client')) {
            let eventCode = msg.substring(7).toLowerCase();
            console.log(`[WS ${eventCode} C] connected`);
            if (events[eventCode]) {
                events[eventCode].socketClients.push(ws);
            } else {
                events[eventCode] = {
                    socketClients: [ws],
                    monitor: DEFAULT_MONITOR,
                    teams: []
                }
            }
            ws.send(JSON.stringify(events[eventCode].monitor));
        }
    });
});

app.listen(port, () => {
    console.log(`FTA Helper cloud server listening on port ${port}`)
});
