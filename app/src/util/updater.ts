import { get } from "svelte/store";
import { eventStore } from "../stores/event";
import { settingsStore } from "../stores/settings";
import { userStore } from "../stores/user";

interface Version {
    changelog: string;
    update: () => void;
}

export const VERSIONS: { [key: string]: Version; } = {
    '2.6.7': {
        changelog: `
        <h1 class="text-lg font-bold">v2.6.7</h1>
        <ul>
        <li>Fixed cycle timer not resetting when match starts</li>
        <li>App should load faster on slow connections</li>
        <li>Extension <strong>v1.23</strong> should be more stable</li>
        </ul>`,
        update: () => { }
    },
    '2.6.6': {
        changelog: `
        <h1 class="text-lg font-bold">v2.6.6</h1>
        <ul>
        <li>Added exact ahead/behind time</li>
        <li>Notes page actually filters to the team in the url (like when you click on the team in the field monitor)</li>
        <li>Extension <strong>v1.20</strong> fixes a problem with Nexus checklist syncing</li>
        </ul>`,
        update: () => { }
    },
    '2.6.5': {
        changelog: `
        <h1 class="text-lg font-bold">v2.6.5</h1>
        <ul>
        <li>Fixed iOS Login</li>
        <li>Extension <strong>v1.19</strong> can be installed on WPA kiosk to automatically check off teams when they program their radio</li>
        </ul>`,
        update: () => { }
    },
    '2.6.4': {
        changelog: `
        <h1 class="text-lg font-bold">v2.6.4</h1>
        <ul>
        <li>Added 98th percentile min voltage for battery</li>
        <li>Added abiity to join event with event token and not have to login</li>
        <li>Extension <strong>v1.18</strong> can scrape Nexus team list page and sync inspection status, physically here, and radio programming if you create a custom column for that</li>
        </ul>
        `,
        update: () => { }
    },
    '2.6.3': {
        changelog: `
        <h1 class="text-lg font-bold">v2.6.3</h1>
        <ul>
        <li>Fixed the audio alerts not working</li>
        <li>Changed A stop to be A with green background</li>
        <li>Extension <strong>v1.15</strong> can scrape Nexus inspection page and automatically check off teams as they get inspected</li>
        </ul>`,
        update: () => { }
    },
    '2.6.2': {
        changelog: `
        <h1 class="text-lg font-bold">v2.6.2</h1>
        <ul>
        <li>Made the average cycle time now a rolling average of 10 matches</li>
        <li>New Slack integration for tickets</li>
        <li>Ability to attach match log to existing ticket</li>
        </ul>`,
        update: () => { }
    },
    '2.6.1': {
        changelog: `
        <h1 class="text-lg font-bold">v2.6.1</h1>
        <ul>
        <li>Fixed the bug where the field monitor didn't work until the match preview was gone</li>
        <li>Made signal strength larger and colored</li>
        <li>Other assorted bug fixes</li>
        </ul>`,
        update: () => { }
    },
    '2.6.0': {
        changelog: `
        <h1 class="text-lg font-bold">v2.6.0</h1>
        <ul>
        <li>Welcome to 2025 Reefscape!</li>
        <li>Complete overhaul of the ticket system</li>
        <li>Added ability to change your role in the settings menu</li>
        <li>Created different layout of the app for CSAs</li>
        <li>Added a notifications page</li>
        <li>Added way more information to the references page</li>
        <li>Made reference pages public</li>
        <li>FTC event status tracker</li>
        </ul>
        <h2 class="font-bold">Extension v1.13</h2>
        <ul>
        <li>2025 support</li>
        </ul>`,
        update: () => {
            eventStore.set({ code: "", pin: "", teams: [], users: [] });
            userStore.set({
                email: "",
                username: '',
                id: 0,
                token: '',
                eventToken: '',
                role: 'FTA',
                admin: false,
            });
        }
    },
    '2.5.6': {
        changelog: `
        <h1 class="text-lg font-bold">v2.5.6</h1>
        <ul>
        <li>Radio will show green if a signal is detected, even if DS is still not connected</li>
        <li>Add a open ticket warning emoji</li>
        <li>New radio signal display</li>
        <li>Finally fixed the link to a team's notes from the monitor</li>
        <li>Event Dashboard</li>
        <li>Event Reports</li>
        <li>Match log analysis</li>
        </ul>`,
        update: () => { }
    },
    '2.5.5': {
        changelog: `
        <h1 class="text-lg font-bold">v2.5.5</h1>
        <ul>
        <li>Fix the graphs on the monitor</li>
        </ul>`,
        update: () => { }
    },
    '2.5.4': {
        changelog: `
        <h1 class="text-lg font-bold">v2.5.4</h1>
        <ul>
        <li>Graph for ping</li>
        <li>Button to test music in settings menu</li>
        </ul>`,
        update: () => { }
    },
    '2.5.3': {
        changelog: `
        <h1 class="text-lg font-bold">v2.5.3</h1>
        <ul>
        <li>Added Lofi music genere</li>
        <li>Music is syncronized, so everyone with the same genere selection hears the same track</li>
        <li>WIP on push notifications</li>
        </ul>`,
        update: () => {
            settingsStore.update(s => {
                s.notificationCategories.robot = false;
                s.notifications = false;
                return s;
            });
        }
    },
    '2.5.2': {
        changelog: `
        <h1 class="text-lg font-bold">v2.5.2</h1>
        <ul>
        <li>More reliable cycle time tracking</li>
        <li>Ticket notifications</li>
        <li>Redesigned the monitor page</li>
        <li>Added more cycle time and schedule data</li>
        <li>Music during field reset</li>
        <li>Automatic update prompts</li>
        </ul>`,
        update: () => { }
    },
    '2.5.1': {
        changelog: `
        <h1 class="text-lg font-bold">v2.5.1</h1>
        <ul>
        <li>Light theme for you heathens</li>
        <li>Fixed problem with FMS event code not matching TBA</li>
        <li>Match Logs (non team-specific)</li>
        </ul>
        `,
        update: () => { }
    },
    '2.5.0': {
        changelog: `
        <h1 class="text-lg font-bold">v2.5.0</h1>
        <p class="my-2 font-bold">Yay! Big update</p>
        <ul>
        <li>New event creation flow</li>
        <li>Added match logs</li>
        <li>Synced radio/inspection checklist</li>
        <li>🔍 when an uninspected team is in a match</li>
        <li>Direct SignalR connection</li>
        <li>Use FTA Buddy as your primary monitor</li>
        <li>Automatic extension configuration</li>
        <li>New vivid hosting radio in references</li>
        <li>Maybe IOS will let you install this as an app now lol</li>
        <li>FIM specific packing instructions</li>
        <li>Share button in match log will generate QR code to share that station's log with the team</li>
        </ul>`,
        update: () => {
            eventStore.set({ code: "", pin: "", teams: [], users: [] });
            userStore.set({ ...get(userStore), eventToken: "" });
        }
    },
    '2.4.5': {
        changelog: `
        <h1 class="text-lg font-bold">v2.4.5</h1>
        <ul>
        <li>A fullscreen mode</li>
        <li>Google sign in! If you already created an account using the same email as your gmail, you can sign in with either.</li>
        <li>You can click on the QR Codes in references to navigate to the PDF yourself.</li>
        <li>Radio signal strength is now displayed</li>
        </ul>
        `,
        update: () => { }
    },
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
};

export function update(currentVersion: string, newVersion: string, openWelcome: () => void, openChangelog: (arg0: string) => void, dontShowDialogs: boolean = false) {
    let changelog = "";
    if (currentVersion == "0" && window.location.pathname === "/app/manage/login") {
        currentVersion = newVersion;
        settingsStore.update(s => {
            s.version = newVersion;
            return s;
        });
        if (!dontShowDialogs) openWelcome();
    } else if (currentVersion !== newVersion) {
        let updatesToDo = [];

        for (let v in VERSIONS) {
            if (v > currentVersion) {
                updatesToDo.push(v);
                changelog += VERSIONS[v].changelog;
            }
        }

        if (!dontShowDialogs) openChangelog(changelog);

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
