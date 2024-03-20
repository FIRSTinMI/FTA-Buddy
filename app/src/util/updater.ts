import { settingsStore } from "../stores/settings";


export const VERSIONS = {
    '2.3.1': {
        changelog: `
        <h1 class="text-lg">v2.3.1</h1>
        <ul>
        <li>Better battery monitoring</li>
        <li>Handles A-Stops</li>
        </ul>`,
        update: () => { }
    },
    '2.3.0': {
        changelog: `
        <h1 class="text-lg">v2.3.0</h1>
        <ul>
        <li>Major overhaul of the backend</li>
        <li>Added authentication for events</li>
        <li>WIP on redoing the notes and tickets page</li>
        </ul>`,
        update: () => { }
    },
    '2.2.2': {
        changelog: `
        <h1 class="text-lg">v2.2.2</h1>
        <ul>
        <li>Event feed in notes for CSAs</li>
        <li>Notification icon on notes tab</li>
        <li>Various bug fixes</li>
        </ul>`,
        update: () => { }
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
        update: () => { }
    },
    '2.1.0': {
        changelog: `
        <h1 class="text-lg">v2.1.0</h1>
        <ul>
        <li>Made notes work</li>
        <li>Added a new settings page</li>
        <li>Added a new developer mode setting</li>
        </ul>`,
        update: () => { }
    }
}

export function update(currentVersion: string, newVersion: string, openWelcome: () => void, openChangelog: (string) => void) {
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
