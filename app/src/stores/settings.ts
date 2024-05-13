import { writable } from "svelte/store";

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
    darkMode: boolean;
    inspectionAlerts: boolean;
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
    notifications: true,
    darkMode: true,
    inspectionAlerts: true
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
settingsStore.subscribe((value: Settings) => {
    if (value === undefined) {
        value = defaultSettings;
    }
    localStorage.setItem('settings', JSON.stringify(value));
});
