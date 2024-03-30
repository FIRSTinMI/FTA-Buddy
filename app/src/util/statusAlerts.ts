import { GREEN, GREEN_X, RED, type MonitorFrame, type TeamInfo, WRONG_MATCH, MOVE_STATION, ASTOP, ESTOP, CODE, NO_CODE, ROBOT, type StatusChanges, BYPASS } from "../../../shared/types";

const VIBRATION_PATTERNS = {
    ds: [500, 200, 500],
    radio: [200, 200, 500],
    rio: [200, 100, 200],
    code: [200],
    estop: [100]
}

const AUDIO_ALERTS: {[key in ROBOT]: {ds: HTMLAudioElement, radio: HTMLAudioElement, rio: HTMLAudioElement, code: HTMLAudioElement}} = {
    red1: {
        ds: new Audio('/app/audio/red1_ds.ogg'),
        radio: new Audio('/app/audio/red1_radio.ogg'),
        rio: new Audio('/app/audio/red1_rio.ogg'),
        code: new Audio('/app/audio/red1_code.ogg')
    },
    red2: {
        ds: new Audio('/app/audio/red2_ds.ogg'),
        radio: new Audio('/app/audio/red2_radio.ogg'),
        rio: new Audio('/app/audio/red2_rio.ogg'),
        code: new Audio('/app/audio/red2_code.ogg')
    },
    red3: {
        ds: new Audio('/app/audio/red3_ds.ogg'),
        radio: new Audio('/app/audio/red3_radio.ogg'),
        rio: new Audio('/app/audio/red3_rio.ogg'),
        code: new Audio('/app/audio/red3_code.ogg')
    },
    blue1: {
        ds: new Audio('/app/audio/blue1_ds.ogg'),
        radio: new Audio('/app/audio/blue1_radio.ogg'),
        rio: new Audio('/app/audio/blue1_rio.ogg'),
        code: new Audio('/app/audio/blue1_code.ogg')
    },
    blue2: {
        ds: new Audio('/app/audio/blue2_ds.ogg'),
        radio: new Audio('/app/audio/blue2_radio.ogg'),
        rio: new Audio('/app/audio/blue2_rio.ogg'),
        code: new Audio('/app/audio/blue2_code.ogg')
    },
    blue3: {
        ds: new Audio('/app/audio/blue3_ds.ogg'),
        radio: new Audio('/app/audio/blue3_radio.ogg'),
        rio: new Audio('/app/audio/blue3_rio.ogg'),
        code: new Audio('/app/audio/blue3_code.ogg')
    }
};

const GREEN_ALERTS = [
    new Audio('/app/audio/green1.ogg'),
    new Audio('/app/audio/green2.ogg'),
    new Audio('/app/audio/green3.ogg')
]

export function playGreenAlert() {
    GREEN_ALERTS[Math.floor(Math.random() * GREEN_ALERTS.length)].play();
}

export function statusChangeAlertHandler(frame: MonitorFrame, previousFrame: MonitorFrame | null, vibrate: boolean, sound: boolean) {
    if (!previousFrame) return;

    for (let robot in ROBOT) {
        const currentRobot = (frame[robot as keyof MonitorFrame] as TeamInfo);
        const previousRobot = (previousFrame[robot as keyof MonitorFrame] as TeamInfo);

        if (currentRobot.ds === BYPASS) continue;

        if (previousRobot.ds === GREEN && [GREEN_X, RED, WRONG_MATCH, MOVE_STATION].includes(currentRobot.ds)) {
            if (vibrate) window.navigator.vibrate(VIBRATION_PATTERNS.ds);
            if (sound) AUDIO_ALERTS[robot as ROBOT].ds.play();
        } else if (previousRobot.radio === GREEN && currentRobot.radio !== GREEN) {
            if (vibrate) window.navigator.vibrate(VIBRATION_PATTERNS.radio);
            if (sound) AUDIO_ALERTS[robot as ROBOT].radio.play();
        } else if (previousRobot.rio === GREEN && currentRobot.rio !== GREEN) {
            if (vibrate) window.navigator.vibrate(VIBRATION_PATTERNS.rio);
            if (sound) AUDIO_ALERTS[robot as ROBOT].rio.play();
        } else if (previousRobot.code === CODE && currentRobot.code !== CODE) {
            if (vibrate) window.navigator.vibrate(VIBRATION_PATTERNS.code);
            if (sound) AUDIO_ALERTS[robot as ROBOT].code.play();
        } else if (![ASTOP, ESTOP].includes(previousRobot.ds) && [ASTOP, ESTOP].includes(currentRobot.ds)) {
            if (vibrate) window.navigator.vibrate(VIBRATION_PATTERNS.estop);
        }
    }
}

const alertsPlayed: {[key in ROBOT]: {ds: boolean, radio: boolean, rio: boolean, code: boolean}} = {
    red1: { ds: false, radio: false, rio: false, code: false },
    red2: { ds: false, radio: false, rio: false, code: false },
    red3: { ds: false, radio: false, rio: false, code: false },
    blue1: { ds: false, radio: false, rio: false, code: false },
    blue2: { ds: false, radio: false, rio: false, code: false },
    blue3: { ds: false, radio: false, rio: false, code: false }
};

export function susRobotsAlert(frame: MonitorFrame, previousFrame: MonitorFrame | null, statusChanges: StatusChanges) {
    if (!previousFrame) return;

    for (let robot in ROBOT) {
        const currentRobot = (frame[robot as keyof MonitorFrame] as TeamInfo);
        const previousRobot = (previousFrame[robot as keyof MonitorFrame] as TeamInfo);

        if (currentRobot.ds === BYPASS) continue;

        const _robot = robot as ROBOT;

        if (alertsPlayed[_robot].ds && currentRobot.ds !== previousRobot.ds) alertsPlayed[_robot].ds = false;
        if (alertsPlayed[_robot].radio && currentRobot.radio !== previousRobot.radio) alertsPlayed[_robot].radio = false;
        if (alertsPlayed[_robot].rio && currentRobot.rio !== previousRobot.rio) alertsPlayed[_robot].rio = false;
        if (alertsPlayed[_robot].code && currentRobot.code !== previousRobot.code) alertsPlayed[_robot].code = false;

        if (currentRobot.ds === RED && statusChanges[_robot].lastChange.getTime() + 30e3 < new Date().getTime()) {
            if (alertsPlayed[_robot].ds) continue;
            alertsPlayed[_robot].ds = true;
            AUDIO_ALERTS[_robot].ds.play();
        } else if (currentRobot.ds === GREEN_X && statusChanges[_robot].lastChange.getTime() + 30e3 < new Date().getTime()) {
            if (alertsPlayed[_robot].ds) continue;
            alertsPlayed[_robot].ds = true;
            AUDIO_ALERTS[_robot].ds.play();
        } else if (currentRobot.radio === RED && statusChanges[_robot].lastChange.getTime() + 240e3 < new Date().getTime()) {
            if (alertsPlayed[_robot].radio) continue;
            alertsPlayed[_robot].radio = true;
            AUDIO_ALERTS[_robot].radio.play();
        } else if (currentRobot.rio === RED && statusChanges[_robot].lastChange.getTime() + 45e3 < new Date().getTime()) {
            if (alertsPlayed[_robot].rio) continue;
            alertsPlayed[_robot].rio = true;
            AUDIO_ALERTS[_robot].rio.play();
        } else if (currentRobot.code === NO_CODE && statusChanges[_robot].lastChange.getTime() + 30e3 < new Date().getTime()) {
            if (alertsPlayed[_robot].code) continue;
            alertsPlayed[_robot].code = true;
            AUDIO_ALERTS[_robot].code.play();
        }
    }
}