function read(station) {
    return {
        number: document.getElementById(station + 'Number').innerText,
        ds: identifyStatus(document.getElementById(station + 'ds')),
        radio: identifyStatus(document.getElementById(station + 'radio')),
        rio: identifyStatus(document.getElementById(station + 'robot')),
        code: (document.getElementById(station + 'Row').classList.contains('notReadyYellow')) ? 0 : 1,
        bwu: parseFloat(document.getElementById(station + 'BWU').innerText),
        battery: parseFloat(document.getElementById(station + 'Battery').innerText),
        ping: parseInt(document.getElementById(station + 'AvgTrip').innerText),
        packets: parseInt(document.getElementById(station + 'MissedPackets').innerText)
    }
}

function identifyStatus(elm) {
    if (elm.classList.contains('fieldMonitor-redSquare')) return 0;
    if (elm.classList.contains('fieldMonitor-greenCircle')) return 1;
    if (elm.classList.contains('fieldMonitor-greenCircleX')) return 2;
    if (elm.classList.contains('fieldMonitor-yellowCircleM')) return 3;
    if (elm.classList.contains('fieldMonitor-yellowCircleW')) return 4;
}

function identifyFieldStatus(elm) {
    if (elm.innerText === 'UNKNOWN') return 0;
}

let lastData = {};

function sendUpdate() {
    let data = {
        field: identifyFieldStatus(document.getElementById('matchStateTop')),
        match: document.getElementById('MatchNumber').innerText.substring(3),
        time: document.getElementById('aheadbehind').innerText,
        blue1: read('blue1'),
        blue2: read('blue2'),
        blue3: read('blue3'),
        red1: read('red1'),
        red2: read('red2'),
        red3: read('red3')
    };

    if (JSON.stringify(data) == JSON.stringify(lastData)) return;
    lastData = data;

    fetch('http://127.0.0.1:8284/monitor', {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify(data)
    });
}

setInterval(sendUpdate, 500);
sendUpdate();