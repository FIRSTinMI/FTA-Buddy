const colors = require('colors/safe');
const ip = require('ip');
const WebSocket = require('ws')

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { DEFAULT_MONITOR } = require('../shared/constants');
const app = express();
const expressWs = require('express-ws')(app);

const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});

const commandLineArgs = require('command-line-args')
const options = commandLineArgs([
    { name: 'ip', type: String },
    { name: 'event', alias: 'e', type: String }
]);

const port = 8284;

let monitor = DEFAULT_MONITOR;

let clients = [];
let cloud;

app.use(bodyParser.json());
app.use(cors());

app.use(express.static('./server/public'));

app.get('/monitor', (req, res) => {
    res.send(monitor);
});

app.post('/monitor', (req, res) => {
    monitor = req.body;
    res.send();
    pushUpdateToSockets(monitor);
});

app.ws('/', function (ws, req) {
    console.log('New connection');
    clients.push(ws);
    // 500ms delay lets the UI load so the changes can be made
    // Yeah, I know this should be done client side
    setTimeout(() => ws.send(JSON.stringify(monitor)), 500);

    ws.on('message', (msg) => {
        if (msg == 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    });
});

function pushUpdateToSockets(monitor) {
    if (cloud) cloud.send(JSON.stringify(monitor));
    for (let ws of clients) {
        ws.send(JSON.stringify(monitor));
    }
}

app.listen(port, async () => {
    let myip = options.ip
    if (!myip) myip = ip.address();

    console.log(`FTA-Helper app listening on port ${port} of ${colors.green.bold(myip)}`);

    let code = options.event;
    if (!options.event) {
        code = await new Promise((resolve, reject) => {
            readline.question('Enter event code: ', code => {
                readline.close();
                resolve(code);
            });
        });
    }

    fetch(`https://ftahelper.filipkin.com/register/${encodeURIComponent(code)}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            ip: myip
        })
    }).then(res => {
        if (res.status == 200) {
            console.log(`Successfully registered with cloud server under event code ${colors.green.bold(code)}`);

            cloud = new WebSocket(`ws://ftabuddy.filipkin.com/ws`);

            cloud.on('error', console.error);
            cloud.on('open', () => {
                cloud.send(`server-${code}`);
                console.log(`Connected to cloud websocket server for relaying`)
                setInterval(() => {
                    cloud.send('ping');
                }, 60e3);
            });

            return null;
        }
    }).then(res => {
        if (res) return res.text()
    }).then(text => {
        if (text) console.log(text);
    }).catch(err => {
        if (err) console.error('Failed to connect to cloud, continuing in local only mode')
    });
});