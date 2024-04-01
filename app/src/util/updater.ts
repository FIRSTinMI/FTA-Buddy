import { settingsStore } from "../stores/settings";

interface Version {
    changelog: string;
    update: () => void;
}

export const VERSIONS: { [key: string]: Version } = {
    '2.4.4': {
        changelog: `
        <h1 class="text-lg font-bold">v2.4.4</h1>
        <ul>
        <li>More robust websocket connection</li>
        <li>Audio alerts! (enable in settings)</li>
        </ul>
        `,
        update: () => { }
    },
    '2.4.3': {
        changelog: `
        <h1 class="text-lg font-bold">v2.4.3</h1>
        <ul>
        <li>Server side time tracking so it's more accurate</li>
        <li>Reset time tracking when prestart completes</li>
        <li>Larger text on flashcards</li>
        <li>General UI Improvements</li>
        </ul>`,
        update: () => { }
    },
    '2.4.2': {
        changelog: `
        <h1 class="text-lg font-bold">v2.4.2</h1>
        <ul>
        <li>👀 on a team row if a status takes longer than normal to improve</li>
        <li>Make the battery graph update in detailed view</li>
        <li>Corrected RIO status lights in references</li>
        </ul>`,
        update: () => { }
    },
    '2.4.1': {
        changelog: `
        <h1 class="text-lg font-bold">v2.4.1</h1>
        <ul>
        <li>Added a timer in the detailed status view that shows how long since the last status change</li>
        </ul>`,
        update: () => { }
    },
    '2.4.0': {
        changelog: `
        <h1 class="text-lg font-bold">v2.4.0</h1>
        <ul>
        <li>Vibrations when a robot looses connection during a match</li>
        <li>Hamburger menu for easier use in web browser</li>
        <li>Fixed the graphical bug with the battery graph being in the wrong position</li>
        <li>Improved some troubleshooting information</li>
        </ul>
        <p class="font-bold mt-2">Chrome extension (v1.4):</p>
        <ul>
        <li>Handle A-Stops</li>
        <li>Toggle to enable/disable extension</li>
        <li>Automatically disable extension after the event ends</li>
        <li>Option to manually specify server url (for development)</li>
        </ul>`,
        update: () => { }
    },
    '2.3.2': {
        changelog: `
        <h1 class="text-lg font-bold">v2.3.2</h1>
        <ul>
        <li>Larger text on desktop for easier reading</li>
        </ul>`,
        update: () => { }
    },
    '2.3.1': {
        changelog: `
        <h1 class="text-lg font-bold">v2.3.1</h1>
        <ul>
        <li>Better battery monitoring</li>
        <li>Handles A-Stops</li>
        </ul>`,
        update: () => { }
    },
    '2.3.0': {
        changelog: `
        <h1 class="text-lg font-bold">v2.3.0</h1>
        <ul>
        <li>Major overhaul of the backend</li>
        <li>Added authentication for events</li>
        <li>WIP on redoing the notes and tickets page</li>
        </ul>`,
        update: () => { }
    },
    '2.2.2': {
        changelog: `
        <h1 class="text-lg font-bold">v2.2.2</h1>
        <ul>
        <li>Event feed in notes for CSAs</li>
        <li>Notification icon on notes tab</li>
        <li>Various bug fixes</li>
        </ul>`,
        update: () => { }
    },
    '2.2.1': {
        changelog: `
        <h1 class="text-lg font-bold">v2.2.1</h1>
        <ul>
        <li>Monitor will auto-reconnect after the app is inactive for a longer period of time</li>
        <li>Handle rio but no code correctly for new 2024 monitor update</li>
        </ul>`,
        update: () => { }
    },
    '2.2.0': {
        changelog: `
        <h1 class="text-lg font-bold">v2.2.0</h1>
        <ul>
        <li>Added a welcome screen</li>
        <li>Error handling for websocket connection</li>
        </ul>`,
        update: () => { }
    },
    '2.1.1': {
        changelog: `
        <h1 class="text-lg font-bold">v2.1.1</h1>
        Fixed note store`,
        update: () => { }
    },
    '2.1.0': {
        changelog: `
        <h1 class="text-lg font-bold">v2.1.0</h1>
        <ul>
        <li>Made notes work</li>
        <li>Added a new settings page</li>
        <li>Added a new developer mode setting</li>
        </ul>`,
        update: () => { }
    }
}

export function update(currentVersion: string, newVersion: string, openWelcome: () => void, openChangelog: (arg0: string) => void) {
    let changelog = "";
    console.log(currentVersion, newVersion);
    if (currentVersion == "0" && window.location.pathname === "/app/login") {
        currentVersion = newVersion;
        settingsStore.update(s => {
            s.version = newVersion;
            return s;
        });
        openWelcome();
    } else if (currentVersion !== newVersion) {
        let updatesToDo = [];

        for (let v in VERSIONS) {
            if (v > currentVersion) {
                updatesToDo.push(v);
                changelog += VERSIONS[v].changelog;
            }
        }

        openChangelog(changelog);

        console.log("Queued updates: " + updatesToDo.join(", "));

        for (let v of updatesToDo) {
            console.log("Running update " + v);
            VERSIONS[v].update();
        }

        currentVersion = newVersion;
        settingsStore.update(s => {
            s.version = newVersion;
            return s;
        });

        console.log("Sucessfully updated to " + newVersion);
    }
}
