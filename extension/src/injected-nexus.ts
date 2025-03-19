import { trpc, updateValues } from "./injected-trpc";

let url = document.getElementById('fta-buddy')?.dataset.host;
let cloud = document.getElementById('fta-buddy')?.dataset.cloud;
let eventCode = document.getElementById('fta-buddy')?.dataset.event;
let eventToken = document.getElementById('fta-buddy')?.dataset.eventToken;
let extensionId = document.getElementById('fta-buddy')?.dataset.extensionId;

if (!url || !cloud || !eventCode || !eventToken) {
    throw new Error('Missing data');
} else {
    updateValues({ cloud: cloud === 'true', id: '', event: eventCode, url: url, eventToken: eventToken, extensionId });
}

const completedTeams: string[] = [];
const hereTeams: string[] = [];
const radioTeams: string[] = [];

function scrapeInspectionStatus() {
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

function scrapeTeamList() {
    const headerDiv = document.querySelector("nexus-teams > div > div > table > thead > tr");
    const div = document.querySelector("nexus-teams > div > div > table > tbody");

    if (!div || !headerDiv) throw new Error("Could not find div element");

    const teamStatus = [];
    for (let row of Array.from(div.children)) {
        const teamNumber = row.children[0].textContent?.split(' ')[0] as string;

        let inspected = false;
        let here = false;
        let radio = false;

        if (headerDiv.children[3] && row.children[3] && headerDiv.children[3].textContent?.toLowerCase().includes('inspect')) {
            inspected = row.children[3].children[0].classList.contains('bi-check-lg');
        }

        if (headerDiv.children[5] && row.children[5] && headerDiv.children[5].textContent?.toLowerCase().includes('here')) {
            here = !row.children[5].children[0].classList.contains('btn-primary');
        }

        if (headerDiv.children[8] && row.children[8] && headerDiv.children[8].textContent?.toLowerCase().includes('radio')) {
            radio = !row.children[8].children[0].classList.contains('btn-primary');
        }

        teamStatus.push({ team: teamNumber, inspected, radio, here });
    }
    return teamStatus;
}

setInterval(() => {
    const teamsToSend: {
        team: string;
        key: 'inspected' | 'present' | 'radioProgrammed';
        value: boolean;
    }[] = [];

    if (window.location.pathname.endsWith('/inspect')) {
        const newCompletedTeams = scrapeInspectionStatus();
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

    } else if (window.location.pathname.endsWith('/teams')) {
        const newStatusTeams = scrapeTeamList();
        for (let team of newStatusTeams) {
            if (team.here && !hereTeams.includes(team.team)) {
                teamsToSend.push({
                    team: team.team,
                    key: "present",
                    value: true
                });
                hereTeams.push(team.team);
                console.log(`Team ${team.team} is here`);
            }
            if (team.radio && !radioTeams.includes(team.team)) {
                teamsToSend.push({
                    team: team.team,
                    key: "radioProgrammed",
                    value: true
                });
                radioTeams.push(team.team);
                console.log(`Team ${team.team} has a radio`);
            }
            if (team.inspected && !completedTeams.includes(team.team)) {
                teamsToSend.push({
                    team: team.team,
                    key: "inspected",
                    value: true
                });
                completedTeams.push(team.team);
                console.log(`Team ${team.team} has been inspected`);
            }
        }

    }


    if (teamsToSend.length > 0) trpc.checklist.update.query(teamsToSend);
}, 1000);
