const headers = {
    "Accept": "application/json",
    "Authorization": "Basic ZmlsaXBraW46MUZFMTZBQTctMjJEQi00ODNBLTgxODktNzZBRTExRjRERDM0"
};

export namespace FTCAPI {
    export interface Match {
        actualStartTime: string; // ISO 8601 Date-Time format
        description: string;
        tournamentLevel: "QUALIFICATION" | "ELIMINATION" | string; // Adjust for additional levels if needed
        series: number;
        matchNumber: number;
        scoreRedFinal: number;
        scoreRedFoul: number;
        scoreRedAuto: number;
        scoreBlueFinal: number;
        scoreBlueFoul: number;
        scoreBlueAuto: number;
        postResultTime: string; // ISO 8601 Date-Time format
        teams: TeamDetails[];
        modifiedOn: string; // ISO 8601 Date-Time format
    }

    export interface TeamDetails {
        teamNumber: number;
        station: "Red1" | "Red2" | "Blue1" | "Blue2" | string; // Adjust for additional stations if needed
        dq: boolean; // Disqualified status
        onField: boolean; // Indicates if the team was on the field
    }

    export async function getMatches(eventCode: string) {
        const res = await fetch(`http://ftc-api.firstinspires.org/v2.0/2024/matches/${eventCode}?tournamentLevel=0&start=0&end=999`, {
            headers,
        });

        const json = await res.json();

        return json.matches as FTCAPI.Match[];
    }
}
