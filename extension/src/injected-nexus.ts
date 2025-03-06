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

function getCompletedTeams() {
    const div = document.querySelector("nexus-inspection-landing > div > div > div");

    if (!div) throw new Error("Could not find div element");
    const array = Array.from(div.children).map(c => (c as HTMLElement).innerText).reverse();

    const teams = [];
    for (let i of array) {
        if (i.includes("Complete")) {
            break;
        } else {
            teams.push(i);
        }
    }
    return teams;
}

setInterval(() => {
    const newCompletedTeams = getCompletedTeams();
    const teamsToSend: {
        team: string;
        key: 'inspected';
        value: boolean;
    }[] = [];

    for (let teamNumber of newCompletedTeams) {
        if (!completedTeams.includes(teamNumber)) {
            teamsToSend.push({
                team: teamNumber,
                key: "inspected",
                value: true
            });
            completedTeams.push(teamNumber);
            console.log(`Team ${teamNumber} has been inspected`);
        }
    }

    trpc.checklist.update.query(teamsToSend);
}, 1000);
