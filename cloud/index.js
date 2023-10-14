const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { DATABASE_CONFIG } = require('./config');
const app = express();
const expressWs = require('express-ws')(app);
const port = 9014;
const db = require('mysql-promise')();

db.configure(DATABASE_CONFIG);

db.query(`CREATE TABLE IF NOT EXISTS events (
    code VARCHAR(255) NOT NULL,
    local_ip VARCHAR(255),
    teams VARCHAR(8192),
    PRIMARY KEY (code)
    );`)

db.query(`CREATE TABLE IF NOT EXISTS profiles (
    id INT NOT NULL AUTO_INCREMENT,
    username VARCHAR(1023) UNIQUE,
    created DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
    );`)

db.query(`CREATE TABLE IF NOT EXISTS messages (
    id INT NOT NULL AUTO_INCREMENT,
    profile INT,
    event VARCHAR(255),
    team INT,
    message TEXT,
    created DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
    );`);

let events = {};

app.use(bodyParser.json());
app.use(cors());

app.use(express.static('./cloud/public'));

// Get local server ip for an event
app.get('/register/:event', (req, res) => {
    db.query('SELECT local_ip FROM events WHERE code = ?;', [req.params.event]).spread(ip => {
        if (ip.length == 0) {
            return res.status(404).send();
        }
        res.send(ip[0]);
    });
});

// Register a local server ip for an event
app.post('/register/:event', (req, res) => {
    db.query('SELECT * FROM events WHERE code = ?;', [req.params.event]).spread(event => {
        if (event.length == 0) {
            db.query('INSERT INTO events VALUES (?, ?, NULL);', [req.params.event, req.body.ip]);
            console.log(`Registered event ${req.params.event} at ${req.body.ip}`);
        } else {
            db.query('UPDATE events SET local_ip = ? WHERE code = ?;', [req.body.ip, req.params.event]);
            console.log(`Updated event ${req.params.event} at ${req.body.ip}`);
        }
        res.send();
    });
});

// Get team list for an event
app.get('/teams/:event', (req, res) => {
    db.query('SELECT teams FROM events WHERE code = ?;', [req.params.event]).spread(teams => {
        // TODO: Add TBA integration to get team names and stuff
        teams = JSON.parse(teams[0].teams)
        res.send(teams);
    });
});

// Set team list for an event
app.post('/teams/:event', (req, res) => {
    db.query('SELECT * FROM events WHERE code = ?;', [req.params.event]).spread(event => {
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
    if (!events.hasOwnProperty(req.params.event)) return res.status(404).send();
    res.send(events[req.params.event].monitor);
});

// Post update of field monitor
app.post('/monitor/:event', (req, res) => {
    console.debug(`[${req.params.event}] Field monitor update received ${JSON.stringify(req.body)}`);

    if (!events.hasOwnProperty(req.params.event)) events[req.params.event] = { socketClients: [] };
    events[req.params.event].monitor = req.body;
    res.send();
    pushUpdateToSockets(events[req.params.event].socketClients, req.body);
});

// Create a user profile for notes
app.post('/profile', (req, res) => {
    db.query('INSERT INTO profiles VALUES (null, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);', [req.body.username]).then(result => {
        res.send(result[0].insertId.toString());
    }).catch(err => {
        // TODO: handle duplicate usernames
    });
});

// Get notes for a team along with profile info
app.get('/message/:team', (req, res) => {
    db.query('SELECT * FROM messages WHERE team = ?;', [req.params.team]).spread((messages) => {
        db.query(`SELECT * FROM profiles WHERE id IN (SELECT profile FROM messages WHERE team = ?);`, [req.params.team]).spread((profiles_raw) => {
            let profiles = {};
            for (profile of profiles_raw) {
                profiles[profile.id] = profile;
            }

            for (let m of messages) {
                console.log(m);
                m.username = profiles[m.profile].username; // Attatch a username to every message
            }

            res.send(messages);
        });
    });
});

// Post a message on the notes for a team
app.post('/message/:team', (req, res) => {
    db.query('INSERT INTO messages VALUES (null, ?, ?, ?, ?, CURRENT_TIMESTAMP);', [req.body.profile, req.body.event, req.params.team, req.body.message]).then(result => {
        console.log(result);
        res.send();
    }).catch(err => {
        if (err) res.status(500).send(err)
    });
});

// Register client for an event
app.ws('/:event', function (ws, req) {
    events[req.params.event].socketClients.push(ws);

    ws.on('message', function (msg) {
        console.debug(`[WS ${req.params.event}] (client) ${msg}`);
    });
});

// Register server for an event
app.ws('/server/:event', function (ws, req) {
    events[req.params.event].socketServer = ws;

    ws.on('message', function (msg) {
        console.debug(`[WS ${req.params.event}] (server) ${msg}`);
    });
});

function pushUpdateToSockets(clients, monitor) {
    for (let ws of clients) {
        ws.send(JSON.stringify(monitor));
    }
}

app.listen(port, () => {
    console.log(`FTA Helper cloud server listening on port ${port}`)
});