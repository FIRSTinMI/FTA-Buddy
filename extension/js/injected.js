console.log('Injection loaded');

let url = document.getElementById('fta-buddy').dataset.host;
let cloud = document.getElementById('fta-buddy').dataset.cloud;
let eventCode = document.getElementById('fta-buddy').dataset.event;

function read(station) {
    let obj = {
        time: new Date().getTime(),
        number: document.getElementById(station + 'Number').innerText,
        ds: identifyStatusDS(station),
        radio: identifyStatus(document.getElementById(station + 'radio')),
        rio: identifyStatus(document.getElementById(station + 'robot')),
        code: (document.getElementById(station + 'Row').classList.contains('notReadyYellow')) ? 0 : 1,
        bwu: parseFloat(document.getElementById(station + 'BWU').innerText),
        battery: parseFloat(document.getElementById(station + 'Battery').innerText),
        ping: parseInt(document.getElementById(station + 'AvgTrip').innerText),
        packets: parseInt(document.getElementById(station + 'MissedPackets').innerText),
        versionmm: document.getElementById(station + 'versionmm').style.display === 'none' ? 0 : 1,
    };

    // If the station is bypassed, set all statuses to 0
    // if (obj.ds === 5) {
    //     obj.radio = 0;
    //     obj.rio = 0;
    //     obj.code = 0;
    // }

    return obj
}

function identifyStatusDS(station) {
    if (document.getElementById(station + 'Row').classList.contains('bypassed')) return 5;
    if (document.getElementById(station + 'enabled').classList.contains('fieldMonitor-blackDiamondE')) return 6;
    if (document.getElementById(station + 'enabled').classList.contains('fieldMonitor-blackDiamondA')) return 7;
    return identifyStatus(document.getElementById(station + 'ds'));
}

function identifyStatus(elm) {
    if (elm.classList.contains('fieldMonitor-redSquare')) return 0;
    if (elm.classList.contains('fieldMonitor-redSquareB')) return 0;
    if (elm.classList.contains('fieldMonitor-greenCircle')) return 1;
    if (elm.classList.contains('fieldMonitor-greenCircleX')) return 2;
    if (elm.classList.contains('fieldMonitor-yellowCircleM')) return 3;
    if (elm.classList.contains('fieldMonitor-yellowCircleW')) return 4;
}

function identifyFieldStatus(elm) {
    if (elm.innerText === 'UNKNOWN') return 0;
    if (elm.innerText === 'MATCH RUNNING (TELEOP)') return 1;
    if (elm.innerText === 'MATCH TRANSITIONING') return 2;
    if (elm.innerText === 'MATCH RUNNING (AUTO)') return 3;
    if (elm.innerText === 'MATCH READY') return 4;
    if (elm.innerText === 'MATCH NOT READY') return 11;
    if (elm.innerText === 'PRE-START COMPLETED') return 5;
    if (elm.innerText === 'PRE-START INITIATED') return 6;
    if (elm.innerText === 'READY TO PRE-START') return 7;
    if (elm.innerText === 'MATCH ABORTED') return 8;
    if (elm.innerText === 'MATCH OVER') return 9;
    if (elm.innerText === 'READY FOR POST-RESULT') return 10;
}

function sendUpdate() {
    let data = {
        type: 'monitorUpdate',
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

    if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

let ws;

function connectToWS() {
    if (ws) ws.close();

    console.log('Trying to connect to ' + ((cloud == "true") ? 'cloud' : url));
    ws = new WebSocket((cloud == "true") ? `wss://ftabuddy.com/ws/` : url);
    ws.onopen = () => {
        ws.send(`server-${eventCode}`);
        console.log('Connected to server');
        setTimeout(sendUpdate, 100);
    }
    ws.onclose = () => {
        console.log('Disconnected from server, reconnecting in 5 seconds.');
        setTimeout(connectToWS, 5000);
    }
    ws.onerror = (err) => {
        console.error(err);
    }
}

connectToWS();
new MutationObserver(sendUpdate).observe(document.getElementById('monitorData'), { attributes: true, characterData: true, childList: true, subtree: true });
