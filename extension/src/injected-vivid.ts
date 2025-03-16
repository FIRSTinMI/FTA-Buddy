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

function scrapeProgrammingPage() {
    const statusDiv = document.querySelector("div.p-6.pt-0.flex.flex-col.gap-y-4 > div:nth-child(2) > p.text-sm.text-muted-foreground") as HTMLParagraphElement;
    const titleDiv = document.querySelector("body > main > div:nth-child(1) > div > div > div > p") as HTMLParagraphElement;
    if (!statusDiv || !titleDiv) return;
    if (statusDiv.innerText === 'ACTIVE') {
        titleDiv.style.marginTop = '0.5rem';
        titleDiv.style.fontSize = '3rem';
        titleDiv.style.fontWeight = 'bold';
        titleDiv.innerText = 'Success!';
        titleDiv.style.color = 'green';
        const team = window.location.search.split('=')[1];

        return team;
    }
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
        const team = scrapeProgrammingPage();
        if (team) {
            teamsToSend.push({ team, key: 'radioProgrammed', value: true });
        }
    }

    if (teamsToSend.length > 0) await trpc.checklist.update.query(teamsToSend);
}, 1000);

setInterval(async () => {
    if (window.location.pathname === '/status') {
        scrapeProgrammingPage();
    }
}, 200); // More frequent to make the interface update faster
