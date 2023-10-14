const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { DEFAULT_MONITOR } = require('../shared/constants');
const app = express();
const expressWs = require('express-ws')(app);
const port = 8284;

let monitor = DEFAULT_MONITOR;

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