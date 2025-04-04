import { get } from "svelte/store";
import { DSState, FieldState, MatchState, MatchStateMap, ROBOT } from "../../shared/types";
import { trpc } from "./main";
import { settingsStore } from "./stores/settings";
import { userStore } from "./stores/user";
import { AudioQueuer } from "./util/audioAlerts";
import { MonitorFrameHandler, type MonitorEvent } from "./util/monitorFrameHandler";
import { robotNotification } from "./util/notifications";

// Initialize frame handler and audio queue
export const frameHandler = new MonitorFrameHandler();
export const audioQueuer = new AudioQueuer();

let settings = get(settingsStore);
settingsStore.subscribe((val) => {
    const oldSettings = settings;
    settings = val;
    if (settings.musicType !== 'none') {
        audioQueuer.setMusicVolume(settings.musicVolume);
        if (oldSettings.musicType !== settings.musicType) {
            setTimeout(async () => {
                if (MatchStateMap[frameHandler.getFrame()?.field ?? FieldState.PRESTART_COMPLETED] !== MatchState.RUNNING) {
                    const frame = frameHandler.getFrame();
                    const musicOrder = await trpc.event.getMusicOrder.query({
                        level: frame?.level ?? "None",
                        match: frame?.match ?? 1
                    });
                    audioQueuer.playMusic(musicOrder);
                }
            }, 3e3);
        }
    } else {
        audioQueuer.stopMusic();
    }
});

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

// let subscription: ReturnType<typeof trpc.field.robots.subscribe>;
// let fieldStateSubscription: ReturnType<typeof trpc.field.fieldStatus.subscribe>;
// let robotStateSubscription: ReturnType<typeof trpc.field.robotStatus.subscribe>;

let combinedSubscription: ReturnType<typeof trpc.field.combinedSubscription.subscribe>;

export async function subscribeToFieldMonitor() {
    combinedSubscription?.unsubscribe();
    // subscription?.unsubscribe();
    // fieldStateSubscription?.unsubscribe();
    // robotStateSubscription?.unsubscribe();

    if (!get(userStore).eventToken) return;

    frameHandler.setHistory(await trpc.field.history.query());

    combinedSubscription = await trpc.field.combinedSubscription.subscribe({
        eventToken: get(userStore).eventToken
    }, {
        onData: (data) => {
            if (typeof data === 'object') {
                if ('field' in data) {
                    frameHandler.feed(data);
                } else if ('station' in data) {
                    frameHandler.robotStatusChange(data);
                }
            } else {
                frameHandler.fieldStatusChange(data as FieldState);
            }
        }
    });

    // subscription = await trpc.field.robots.subscribe({
    //     eventToken: get(userStore).eventToken
    // }, {
    //     onData: (data) => {
    //         console.log(data);
    //         frameHandler.feed(data);
    //     },
    //     onStarted: () => {
    //         console.log('Field monitor started');
    //     }
    // });

    // await new Promise((resolve) => setTimeout(resolve, 100));

    // fieldStateSubscription = await trpc.field.fieldStatus.subscribe({
    //     eventToken: get(userStore).eventToken
    // }, {
    //     onData: (data) => {
    //         console.log(data);
    //         frameHandler.fieldStatusChange(data);
    //     },
    //     onStarted: () => {
    //         console.log('Field status started');
    //     }
    // });

    // await new Promise((resolve) => setTimeout(resolve, 100));

    // robotStateSubscription = await trpc.field.robotStatus.subscribe({
    //     eventToken: get(userStore).eventToken
    // }, {
    //     onData: (data) => {
    //         frameHandler.robotStatusChange(data);
    //     },
    //     onStarted: () => {
    //         console.log('Robot status started');
    //     }
    // });
}

// Register event listeners for various frame events
// Maybe we want to move this somewhere else?

frameHandler.addEventListener('match-ready', (evt) => {
    console.log('Match ready');
    if (settings.fieldGreen) audioQueuer.addGreenClip();
    audioQueuer.stopMusic();
});

for (let type of ['radio', 'rio', 'code']) {
    frameHandler.addEventListener(`${type}-drop`, (e) => {
        const evt = e as MonitorEvent;
        console.log(type + ' drop', evt.detail);
        if (evt.detail.match === MatchState.RUNNING && evt.detail.frame[evt.detail.robot].ds !== DSState.BYPASS) {
            if (settings.vibrations) navigator.vibrate(VIBRATION_PATTERNS[type as 'radio' | 'rio' | 'code']);
            if (settings.soundAlerts) audioQueuer.addRobotClip(evt.detail.robot, type as 'radio' | 'rio' | 'code');
            if (settings.notificationCategories.robot) robotNotification(type, evt.detail);
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
            if (settings.notificationCategories.robot) robotNotification('DS', evt.detail);
        }
    }
});

frameHandler.addEventListener('match-over', async (e) => {
    const evt = e as MonitorEvent;
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

    const musicOrder = await trpc.event.getMusicOrder.query({
        level: evt.detail.frame.level,
        match: evt.detail.frame.match
    });

    if (settings.musicType !== 'none') audioQueuer.playMusic(musicOrder);
});

frameHandler.addEventListener('match-start', (evt) => {
    console.log('Match started');
});
