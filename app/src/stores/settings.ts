import { writable } from "svelte/store";
import { createInstance } from "localforage";

export const localforage = createInstance({
    name: "ftabuddy-settings"
});
export interface Settings {
    version: string;
    developerMode: boolean;
    vibrations: boolean;
    forceCloud: boolean;
    soundAlerts: boolean;
    fieldGreen: boolean;
    susRobots: boolean;
    fimSpecifics: boolean;
    notifications: boolean;
    notificationsDoNotAsk: boolean;
    darkMode: boolean;
    inspectionAlerts: boolean;
    roundGreen: boolean;
    musicVolume: number;
    musicType: 'none' | 'jazz' | 'lofi';
    acknowledgedNotesPolicy: boolean;
    notificationCategories: {
        create: boolean;
        follow: boolean;
        assign: boolean;
        robot: boolean;
    };
}

let initialSettings = localStorage.getItem('settings');

const defaultSettings: Settings = {
    version: '0',
    developerMode: false,
    vibrations: true,
    forceCloud: true,
    soundAlerts: false,
    fieldGreen: true,
    susRobots: false,
    fimSpecifics: true,
    notifications: false,
    notificationsDoNotAsk: false,
    darkMode: true,
    inspectionAlerts: true,
    roundGreen: true,
    musicVolume: 12,
    musicType: 'none',
    acknowledgedNotesPolicy: false,
    notificationCategories: {
        create: true,
        follow: true,
        assign: true,
        robot: true
    }
};

if (!initialSettings) {
    initialSettings = JSON.stringify(defaultSettings);
} else {
    let parsedSettings = JSON.parse(initialSettings);
    for (const key in defaultSettings) {
        if (parsedSettings[key] === undefined) {
            parsedSettings[key] = defaultSettings[key as keyof Settings];
        }
    }
    initialSettings = JSON.stringify(parsedSettings);
}

export const settingsStore = writable<Settings>(JSON.parse(initialSettings));
settingsStore.subscribe(async (value: Settings) => {
    if (value === undefined) {
        value = defaultSettings;
    }
    localStorage.setItem('settings', JSON.stringify(value));
    await localforage.setItem('settings', JSON.stringify(value));
});
