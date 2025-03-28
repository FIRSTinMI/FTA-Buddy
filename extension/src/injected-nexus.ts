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

function getColumnIndex() {
    const headerDiv = document.querySelector("nexus-teams > div > div > table > thead > tr");

    let inspectionCol = -1;
    let hereCol = -1;
    let radioCol = -1;

    if (!headerDiv) throw new Error("Could not find header div element");

    for (let i = 0; i < headerDiv.children.length; i++) {
        const text = headerDiv.children[i].textContent?.toLowerCase();
        if (text?.includes('inspect')) {
            inspectionCol = i;
        } else if (text?.includes('here') || text?.includes('on site')) {
            hereCol = i;
        } else if (text?.includes('radio')) {
            radioCol = i;
        }
    }

    return { inspectionCol, hereCol, radioCol };
}

function scrapeTeamList() {
    const div = document.querySelector("nexus-teams > div > div > table > tbody");

    if (!div) throw new Error("Could not find div element");

    const { inspectionCol, hereCol, radioCol } = getColumnIndex();

    const teamStatus = [];
    for (let row of Array.from(div.children)) {
        const teamNumber = row.children[0].textContent?.split(' ')[0] as string;

        let inspected = false;
        let here = false;
        let radio = false;

        if (row.children[inspectionCol]) {
            inspected = row.children[inspectionCol].children[0].classList.contains('bi-check-lg');
        }

        if (row.children[hereCol]) {
            here = !row.children[hereCol].children[0].classList.contains('btn-primary');
        }

        if (row.children[radioCol]) {
            radio = !row.children[radioCol].children[0].classList.contains('btn-primary');
        }

        teamStatus.push({ team: teamNumber, inspected, radio, here });
    }
    return teamStatus;
}

function updateNexusFromChecklist(checklist: Awaited<ReturnType<typeof trpc.checklist.update.query>>) {
    const { inspectionCol, hereCol, radioCol } = getColumnIndex();
    const div = document.querySelector("nexus-teams > div > div > table > tbody");
    if (!div) throw new Error("Could not find div element");

    const rows = Array.from(div.children);
    for (let row of rows) {
        const teamNumber = row.children[0].textContent?.split(' ')[0] as string;
        const team = checklist[teamNumber];
        if (team) {
            if (row.children[radioCol]) {
                if (!row.children[radioCol].children[0].classList.contains('btn-primary')) {
                    // Team is checked in nexus
                } else {
                    // Team is unchecked in nexus
                    if (team.radioProgrammed) {
                        (row.children[radioCol].children[0] as HTMLButtonElement).click();
                        if (!radioTeams.includes(teamNumber)) {
                            radioTeams.push(teamNumber);
                        }
                    }
                }
            }

            if (row.children[hereCol]) {
                if (row.children[hereCol].children[0].classList.contains('btn-primary')) {
                    // Team is unchecked in nexus
                    if (team.present) {
                        (row.children[hereCol].children[0] as HTMLButtonElement).click();
                        if (!hereTeams.includes(teamNumber)) {
                            hereTeams.push(teamNumber);
                        }
                    }
                } else {
                    // Team is checked in nexus
                }
            }
        }
    }
}

setInterval(async () => {
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
            }
            if (team.radio && !radioTeams.includes(team.team)) {
                teamsToSend.push({
                    team: team.team,
                    key: "radioProgrammed",
                    value: true
                });
            }
            if (team.inspected && !completedTeams.includes(team.team)) {
                teamsToSend.push({
                    team: team.team,
                    key: "inspected",
                    value: true
                });
            }
        }

    }


    try {
        let lastResponse;

        if (teamsToSend.length > 0) {

            // Send a maximum of 30 updates at a time to prevent exceeding the query length limit
            while (teamsToSend.length > 0) {
                let chunk = teamsToSend.splice(0, 30);
                lastResponse = await trpc.checklist.update.query(chunk);

                for (let team of chunk) {
                    if (team.key === 'inspected') {
                        completedTeams.push(team.team);
                        console.log(`Team ${team.team} has been inspected`);
                    } else if (team.key === 'present') {
                        hereTeams.push(team.team);
                        console.log(`Team ${team.team} is here`);
                    } else if (team.key === 'radioProgrammed') {
                        radioTeams.push(team.team);
                        console.log(`Team ${team.team} has been programmed`);
                    }
                }
            }
        }

        if (lastResponse) {
            updateNexusFromChecklist(lastResponse);
        }
    } catch (e) {
        console.error(e);
    }
}, 1000);
