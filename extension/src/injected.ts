import { DSState, EnableState, FieldState, MonitorFrame, TeamInfo } from "@shared/types";
import { trpc } from "./trpc";

console.log('Injection loaded');

let url = document.getElementById('fta-buddy')?.dataset.host;
let cloud = document.getElementById('fta-buddy')?.dataset.cloud;
let eventCode = document.getElementById('fta-buddy')?.dataset.event;
let version = document.getElementById('fta-buddy')?.dataset.version;

function read(station: string) {
    const radioStats = document.getElementById(station + 'BWU')?.title;

    const radioElm = document.getElementById(station + 'radio');
    const rioElm = document.getElementById(station + 'robot');
    const enabledElm = document.getElementById(station + 'enabled');

    const obj: TeamInfo = {
        number: parseInt(document.getElementById(station + 'Number')?.innerText || '0'),
        ds: identifyStatusDS(station),
        radio: radioElm?.classList.contains('fieldMonitor-greenCircle') ?? false,
        rio: (rioElm?.classList.contains('fieldMonitor-greenCircle') || rioElm?.classList.contains('fieldMonitor-greenCircleX')) ?? false,
        code: !(document.getElementById(station + 'Row')?.classList.contains('notReadyYellow') ?? true),
        bwu: parseFloat(document.getElementById(station + 'BWU')?.innerText ?? '0'),
        battery: parseFloat(document.getElementById(station + 'Battery')?.innerText ?? '0'),
        ping: parseInt(document.getElementById(station + 'AvgTrip')?.innerText ?? '0'),
        packets: parseInt(document.getElementById(station + 'MissedPackets')?.innerText ?? '0'),
        versionmm: ((document.getElementById(station + 'versionmm')?.style.display ?? 'none') !== 'none'),
        signal: (radioStats) ? parseInt(radioStats.split('Signal: ')[1].split(' (')[0]) : null,
        noise: (radioStats) ? parseInt(radioStats.split('Noise: ')[1].split(' (')[0]) : null,
        SNR: (radioStats) ? parseInt(radioStats.split('SNR: ')[1].split(' ')[0]) : null,
        TX: (radioStats) ? parseInt(radioStats.split('TX Rate: ')[1].split(' ')[0]) : null,
        TXMCS: (radioStats) ? parseInt(radioStats.split('TX MCS: ')[1].split(' ')[0]) : null,
        RX: (radioStats) ? parseInt(radioStats.split('RX Rate: ')[1].split(' ')[0]) : null,
        RXMCS: (radioStats) ? parseInt(radioStats.split('RX MCS: ')[1].split(' ')[0]) : null,
        MAC: document.getElementById(station + 'Number')?.title.split('MAC: ')[1] ?? null,
        enabled: (enabledElm && identifyEnableStatus(enabledElm)) ?? EnableState.RED,
    };

    // If the station is bypassed
    if (obj.ds === DSState.BYPASS) {
        obj.code = false;
    }

    return obj
}

function identifyStatusDS(station: string) {
    if (document.getElementById(station + 'Row')?.classList.contains('bypassed')) return DSState.BYPASS;
    if (document.getElementById(station + 'enabled')?.classList.contains('fieldMonitor-blackDiamondE')) return DSState.ESTOP;
    if (document.getElementById(station + 'enabled')?.classList.contains('fieldMonitor-blackDiamondA')) return DSState.ASTOP;
    let elm = document.getElementById(station + 'ds')
    return (elm && identifyStatus(elm)) ?? DSState.RED;
}

function identifyStatus(elm: HTMLElement) {
    if (elm.classList.contains('fieldMonitor-redSquare')) return DSState.RED;
    if (elm.classList.contains('fieldMonitor-redSquareB')) return DSState.BYPASS;
    if (elm.classList.contains('fieldMonitor-greenCircle')) return DSState.GREEN;
    if (elm.classList.contains('fieldMonitor-greenCircleX')) return DSState.GREEN_X;
    if (elm.classList.contains('fieldMonitor-yellowCircleM')) return DSState.MOVE_STATION;
    if (elm.classList.contains('fieldMonitor-yellowCircleW')) return DSState.WAITING;
}

function identifyEnableStatus(elm: HTMLElement) {
    if (elm.classList.contains('fieldMonitor-redSquare')) return EnableState.RED;
    if (elm.classList.contains('fieldMonitor-redSquareA')) return EnableState.RED_A;
    if (elm.classList.contains('fieldMonitor-redSquareT')) return EnableState.RED_T;
    if (elm.classList.contains('fieldMonitor-greenCircleA')) return EnableState.GREEN_A;
    if (elm.classList.contains('fieldMonitor-greenCircleT')) return EnableState.GREEN_T;
    if (elm.classList.contains('fieldMonitor-blackDiamondE')) return EnableState.ESTOP;
    if (elm.classList.contains('fieldMonitor-blackDiamondA')) return EnableState.ASTOP;
}

function identifyFieldStatus(elm: HTMLElement) {
    if (elm.innerText === 'UNKNOWN') return FieldState.UNKNOWN;
    if (elm.innerText === 'MATCH RUNNING (TELEOP)') return FieldState.MATCH_RUNNING_TELEOP;
    if (elm.innerText === 'MATCH RUNNING (AUTO)') return FieldState.MATCH_RUNNING_AUTO;
    if (elm.innerText === 'MATCH READY') return FieldState.MATCH_READY;
    if (elm.innerText === 'MATCH NOT READY') return FieldState.MATCH_NOT_READY;
    if (elm.innerText === 'PRE-START COMPLETED') return FieldState.PRESTART_COMPLETED;
    if (elm.innerText === 'PRE-START INITIATED') return FieldState.PRESTART_INITIATED;
    if (elm.innerText === 'READY TO PRE-START') return FieldState.READY_TO_PRESTART;
    if (elm.innerText === 'MATCH ABORTED') return FieldState.MATCH_ABORTED;
    if (elm.innerText === 'MATCH OVER') return FieldState.MATCH_OVER;
    if (elm.innerText === 'READY FOR POST-RESULT') return FieldState.READY_FOR_POST_RESULT;
}

async function sendUpdate() {
    let elm = document.getElementById('matchStateTop');
    let data: MonitorFrame = {
        frameTime: (new Date()).getTime(),
        version: version ?? '0.0.0',
        field: (elm && identifyFieldStatus(elm)) ?? FieldState.UNKNOWN,
        match: parseInt(document.getElementById('MatchNumber')?.innerText.substring(3) ?? '0'),
        time: document.getElementById('aheadbehind')?.innerText ?? 'Unk',
        blue1: read('blue1'),
        blue2: read('blue2'),
        blue3: read('blue3'),
        red1: read('red1'),
        red2: read('red2'),
        red3: read('red3'),
        lastCycleTime: 'unknown'
    };

    await trpc.field.post.mutate({
        eventCode,
        ...data
    });
}

const elmToObserve = document.getElementById('monitorData');
if (elmToObserve) new MutationObserver(sendUpdate).observe(elmToObserve, { attributes: true, characterData: true, childList: true, subtree: true });
