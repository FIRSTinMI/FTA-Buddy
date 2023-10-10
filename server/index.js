const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const expressWs = require('express-ws')(app);
const port = 3000;

let monitor = {
    field: 0,
    match: 0,
    time: 'unk',
    blue1: {
        number: 9999,
        ds: 0,
        radio: 0,
        rio: 0,
        code: 0,
        bwu: 0,
        battery: 0,
        ping: 0,
        packets: 0,
    },
    blue2: {
        number: 9998,
        ds: 2,
        radio: 0,
        rio: 0,
        code: 0,
        bwu: 0,
        battery: 0,
        ping: 0,
        packets: 0,
    },
    blue3: {
        number: 9997,
        ds: 3,
        radio: 0,
        rio: 0,
        code: 0,
        bwu: 0,
        battery: 0,
        ping: 0,
        packets: 0,
    },
    red1: {
        number: 9996,
        ds: 4,
        radio: 0,
        rio: 0,
        code: 0,
        bwu: 0,
        battery: 0,
        ping: 0,
        packets: 0,
    },
    red2: {
        number: 9995,
        ds: 1,
        radio: 1,
        rio: 1,
        code: 0,
        bwu: 0,
        battery: 0,
        ping: 0,
        packets: 0,
    },
    red3: {
        number: 9994,
        ds: 1,
        radio: 1,
        rio: 1,
        code: 1,
        bwu: 0.5,
        battery: 12.5,
        ping: 10,
        packets: 12,
    }
};

let clients = [];

app.use(bodyParser.json());
app.use(cors());

app.use(express.static('./server/public'));

app.get('/monitor', (req, res) => {
    res.send(monitor);
});

app.post('/monitor', (req, res) => {
    monitor = req.body;
    console.log(monitor);
    res.send();
    pushUpdateToSockets(monitor);
});

app.ws('/', function (ws, req) {
    clients.push(ws);

    ws.on('message', function (msg) {
        console.log(msg);
    });
});

function pushUpdateToSockets(monitor) {
    for (let ws of clients) {
        ws.send(JSON.stringify(monitor));
    }
}

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
});