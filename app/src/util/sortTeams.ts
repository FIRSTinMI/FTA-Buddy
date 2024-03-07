export function sortTeams(teams: string[]) {
    return teams.sort((a, b) => {
        return parseInt(a) - parseInt(b);
    });
}
