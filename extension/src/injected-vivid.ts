import { trpc, updateValues } from "./injected-trpc";

let url = document.getElementById('fta-buddy')?.dataset.host;
let cloud = document.getElementById('fta-buddy')?.dataset.cloud;
let eventCode = document.getElementById('fta-buddy')?.dataset.event;
let eventToken = document.getElementById('fta-buddy')?.dataset.eventToken;

if (!url || !cloud || !eventCode || !eventToken) {
    throw new Error('Missing data');
} else {
    updateValues({ cloud: cloud === 'true', id: '', event: eventCode, url: url, eventToken: eventToken });
}

const completedTeams: string[] = [];

function scrapeTeamList() {
    const div = document.querySelector('div.relative.overflow-hidden > div > div > div');
    if (!div) return;

    const array = Array.from(div.children);

    const programmedTeams = [];

    for (let i = 3; i < array.length; i += 4) {
        if (array[i + 2] && array[i + 2].textContent === 'Programmed') {
            programmedTeams.push(array[i].textContent as string);
        }
    }

    return programmedTeams;
}

setInterval(async () => {
    const teamsToSend: {
        team: string;
        key: 'inspected' | 'present' | 'radioProgrammed';
        value: boolean;
    }[] = [];

    if (window.location.pathname === '/admin') {
        const programmedTeams = scrapeTeamList();
        if (programmedTeams) {
            for (const team of programmedTeams) {
                if (!completedTeams.includes(team)) {
                    completedTeams.push(team);
                    teamsToSend.push({ team, key: 'radioProgrammed', value: true });
                }
            }
        }
    } else if (window.location.pathname === '/status') {
        const team = window.location.search.split('=')[1];
    }

    if (teamsToSend.length > 0) await trpc.checklist.update.query(teamsToSend);
}, 1000);
