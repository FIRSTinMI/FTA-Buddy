const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { DATABASE_CONFIG } = require('./config');
const app = express();
const expressWs = require('express-ws')(app);
const port = process.env.PORT | 3000;
const db = require('mysql2-promise')();

db.configure(DATABASE_CONFIG);

app.use(bodyParser.json());
app.use(cors());

app.use(express.static('./cloud/public'));

app.get('/monitor/:event', (req, res) => {
    res.send(monitor);
});

app.post('/monitor/:event', (req, res) => {
    monitor = req.body;
    console.log(monitor);
    res.send();
    pushUpdateToSockets(monitor);
});

app.ws('/:event', function (ws, req) {
    clients.push(ws);

    ws.on('message', function (msg) {
        console.log(msg);
    });
});

app.ws('/server/:event', function (ws, req) {
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