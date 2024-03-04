import { notesStore } from "../stores/notes"
import { settingsStore } from "../stores/settings";
import { userStore } from "../stores/user";

export const VERSIONS = {
    '2.2.2': {
        changelog: `
        <h1 class="text-lg">v2.2.2</h1>
        <ul>
        <li>Event feed in notes for CSAs</li>
        <li>Notification icon on notes tab</li>
        <li>Various bug fixes</li>
        </ul>`,
        update: () => {
            notesStore.set(undefined);
        }
    },
    '2.2.1': {
        changelog: `
        <h1 class="text-lg">v2.2.1</h1>
        <ul>
        <li>Monitor will auto-reconnect after the app is inactive for a longer period of time</li>
        <li>Handle rio but no code correctly for new 2024 monitor update</li>
        </ul>`,
        update: () => { }
    },
    '2.2.0': {
        changelog: `
        <h1 class="text-lg">v2.2.0</h1>
        <ul>
        <li>Added a welcome screen</li>
        <li>Error handling for websocket connection</li>
        </ul>`,
        update: () => { }
    },
    '2.1.1': {
        changelog: `
        <h1 class="text-lg">v2.1.1</h1>
        Fixed note store`,
        update: () => {
            notesStore.set(undefined);
        }
    },
    '2.1.0': {
        changelog: `
        <h1 class="text-lg">v2.1.0</h1>
        <ul>
        <li>Made notes work</li>
        <li>Added a new settings page</li>
        <li>Added a new developer mode setting</li>
        </ul>`,
        update: () => {
            notesStore.set(undefined);
            settingsStore.set(undefined);
            userStore.set(undefined);
        }
    }
}
