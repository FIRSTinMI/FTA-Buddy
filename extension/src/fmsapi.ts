import { FMS } from "./background";
import { FMSEnums, FMSLogFrame, FMSMatch, ROBOT, TournamentLevel } from "@shared/types";

export async function getEventCode() {
    const eventCode = await (await fetch(`http://${FMS}/api/v1.0/systembase/get/get_CurrentlyActiveEventCode`)).text();
    const year = new Date().getFullYear(); // Just assume it's the current year, no point to ping the API just for that
    return year.toString() + eventCode.substring(1, eventCode.length-1); // Substring to remove quotes around the string
}

export async function getMatches(level: FMSEnums.Level) {
    return await (await fetch(`http://${FMS}/api/v1.0/fieldmonitor/get/GetResults/${FMSEnums.Level[level]}`)).json() as FMSMatch[];
}

export async function getMatchesByTeam(teamNumber: number) {
    return await (await fetch(`http://${FMS}/api/v1.0/fieldmonitor/get/GetResultsByTeamNumber/${teamNumber}`)).json() as FMSMatch[];
}

export async function getLog(matchId: string, alliance: "Red" | "Blue", station: FMSEnums.StationType) {
    return await (await fetch(`http://${FMS}/api/v1.0/fieldmonitor/get/GetLog/${matchId}/${alliance}/${FMSEnums.StationType[station]}`)).json() as FMSLogFrame[];
}

export async function getCurrentMatch() {
    const response = await (await fetch(`http://${FMS}/api/v1.0/audience/get/GetCurrentMatchAndPlayNumber`)).json();
    return {
        level: response.item1 as TournamentLevel,
        matchNumber: response.item2,
        playNumber: response.item3
    }
}

export async function getAllLogsForMatch(matchId: string) {
    const logs: { [key in ROBOT]: FMSLogFrame[] } = {
        blue1: [],
        blue2: [],
        blue3: [],
        red1: [],
        red2: [],
        red3: []
    };
    for (let i = 1; i <= 3; i++) {
        logs['red'+i as ROBOT] = await getLog(matchId, "Red", i);
        logs['blue'+i as ROBOT] = await getLog(matchId, "Blue", i);
    }
    return logs;
}

export async function getTeamNumbers() {
    return await (await fetch(`http://${FMS}/api/v1.0/match/get/GetAllTeamNumbers`)).json();
}

const levelMap = {
    "None": 0,
    "Practice": 1,
    "Qualification": 2,
    "Playoff": 3
};

export async function getMatch(matchNumber: number, playNumber: number, level: TournamentLevel) {
    const matches = await getMatches(levelMap[level]);
    console.log(matches);
    for (let match of matches) {
        console.log(match.matchNumber, matchNumber, match.playNumber, playNumber);
        if (match.matchNumber === matchNumber && match.playNumber === playNumber) {
            return match;
        }
    }
    throw new Error('Match not found');
}
