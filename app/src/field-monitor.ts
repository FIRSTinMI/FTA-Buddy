import { get } from "svelte/store";
import { trpc } from "./main";
import { authStore } from "./stores/auth";
import { DSState, MatchState, ROBOT, type MonitorFrame } from "../../shared/types";
import { AudioQueuer } from "./util/audioAlerts";
import { MonitorFrameHandler, type MonitorEvent } from "./util/monitorFrameHandler";
import { settingsStore } from "./stores/settings";

// Initialize frame handler and audio queue
export const frameHandler = new MonitorFrameHandler();
export const audioQueuer = new AudioQueuer();

let settings = get(settingsStore);
settingsStore.subscribe((val) => settings = val);

// Local vibration and audio alert definitions
const VIBRATION_PATTERNS = {
    ds: [500, 200, 500],
    radio: [200, 200, 500],
    rio: [200, 100, 200],
    code: [200],
    estop: [100]
};

const stops: { [key in ROBOT]: { a: boolean, e: boolean; } } = {
    red1: { a: false, e: false },
    red2: { a: false, e: false },
    red3: { a: false, e: false },
    blue1: { a: false, e: false },
    blue2: { a: false, e: false },
    blue3: { a: false, e: false }
};

let subscription: ReturnType<typeof trpc.field.robots.subscribe>;
let fieldStateSubscription: ReturnType<typeof trpc.field.fieldStatus.subscribe>;
let robotStateSubscription: ReturnType<typeof trpc.field.robotStatus.subscribe>;

export async function subscribeToFieldMonitor() {
    subscription?.unsubscribe();
    fieldStateSubscription?.unsubscribe();
    robotStateSubscription?.unsubscribe();

    if (!get(authStore).eventToken) return;

    frameHandler.setHistory(await trpc.field.history.query());

    subscription = trpc.field.robots.subscribe({
        eventToken: get(authStore).eventToken
    }, {
        onData: (data) => {
            frameHandler.feed(data);
        }
    });

    fieldStateSubscription = trpc.field.fieldStatus.subscribe({
        eventToken: get(authStore).eventToken
    }, {
        onData: (data) => {
            frameHandler.fieldStatusChange(data);
        }
    });

    robotStateSubscription = trpc.field.robotStatus.subscribe({
        eventToken: get(authStore).eventToken
    }, {
        onData: (data) => {
            frameHandler.robotStatusChange(data);
        }
    });
}

// Register event listeners for various frame events
// Maybe we want to move this somewhere else?

frameHandler.addEventListener('match-ready', (evt) => {
    console.log('Match ready');
    if (settings.fieldGreen) audioQueuer.addGreenClip();
});

for (let type of ['radio', 'rio', 'code']) {
    frameHandler.addEventListener(`${type}-drop`, (e) => {
        const evt = e as MonitorEvent;
        console.log(type + ' drop', evt.detail);
        if (evt.detail.match === MatchState.RUNNING && evt.detail.frame[evt.detail.robot].ds !== DSState.BYPASS) {
            if (settings.vibrations) navigator.vibrate(VIBRATION_PATTERNS[type as 'radio' | 'rio' | 'code']);
            if (settings.soundAlerts) audioQueuer.addRobotClip(evt.detail.robot, type as 'radio' | 'rio' | 'code');
        }
    });
}

frameHandler.addEventListener(`ds-drop`, (e) => {
    const evt = e as MonitorEvent;
    console.log('DS drop', evt.detail);
    if (evt.detail.match === MatchState.RUNNING) {
        if (evt.detail.frame[evt.detail.robot].ds === DSState.ESTOP) {
            stops[evt.detail.robot].e = true;
            if (settings.vibrations) navigator.vibrate(VIBRATION_PATTERNS.estop);
        } else if (evt.detail.frame[evt.detail.robot].ds === DSState.ASTOP) {
            stops[evt.detail.robot].a = true;
            if (settings.vibrations) navigator.vibrate(VIBRATION_PATTERNS.estop);
        } else {
            if (settings.vibrations) navigator.vibrate(VIBRATION_PATTERNS.ds);
            if (settings.soundAlerts) audioQueuer.addRobotClip(evt.detail.robot, 'ds');
        }
    }
});

frameHandler.addEventListener('match-over', (evt) => {
    console.log('Match over');
    for (let robot in stops) {
        if (stops[robot as ROBOT].a) {
            if (settings.soundAlerts) audioQueuer.addRobotClip(robot as ROBOT, 'astop');
        }
        if (stops[robot as ROBOT].e) {
            if (settings.soundAlerts) audioQueuer.addRobotClip(robot as ROBOT, 'estop');
        }
        stops[robot as ROBOT] = { a: false, e: false };
    }
});

frameHandler.addEventListener('match-start', (evt) => {
    console.log('Match started');
});
