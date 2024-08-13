import { and, eq } from "drizzle-orm";
import { db } from "../db/db";
import { teamCycleLogs } from "../db/schema";
import { randomUUID } from "crypto";
import { FieldState, MonitorFrame, ServerEvent, StateChange } from "../../shared/types";

export async function getTeamCycle(eventCode: string, teamNumber: number, matchNumber: number, playNumber: number, level: 'None' | 'Practice' | 'Qualification' | 'Playoff') {
    let cycle = await db.query.teamCycleLogs.findFirst({
        where: and(
            eq(teamCycleLogs.event, eventCode),
            eq(teamCycleLogs.match_number, matchNumber),
            eq(teamCycleLogs.play_number, playNumber),
            eq(teamCycleLogs.level, level),
            eq(teamCycleLogs.team, teamNumber)
        )
    });

    if (!cycle) {
        await db.insert(teamCycleLogs).values({
            id: randomUUID(),
            event: eventCode,
            match_number: matchNumber,
            play_number: playNumber,
            level,
            team: teamNumber
        }).returning();

        cycle = await db.query.teamCycleLogs.findFirst({
            where: and(
                eq(teamCycleLogs.event, eventCode),
                eq(teamCycleLogs.match_number, matchNumber),
                eq(teamCycleLogs.play_number, playNumber),
                eq(teamCycleLogs.level, level),
                eq(teamCycleLogs.team, teamNumber)
            )
        });
    }

    if (!cycle) throw new Error('Failed to create team cycle log');

    return cycle;
}

export async function getTeamAverageCycle(team: number, eventCode?: string) {
    const teamCycles = await db.query.teamCycleLogs.findMany({
        where:
            (eventCode ?
                and(eq(teamCycleLogs.event, eventCode), eq(teamCycleLogs.team, team))
                : eq(teamCycleLogs.team, team)),
    });

    if (teamCycles.length === 0) return null;

    const averageCycle = {
        ds: 0,
        radio: 0,
        rio: 0,
        code: 0,
    };

    for (const cycle of teamCycles) {
        averageCycle.ds += cycle.time_ds ?? 0;
        averageCycle.radio += cycle.time_radio ?? 0;
        averageCycle.rio += cycle.time_rio ?? 0;
        averageCycle.code += cycle.time_code ?? 0;
    }

    averageCycle.ds /= teamCycles.length;
    averageCycle.radio /= teamCycles.length;
    averageCycle.rio /= teamCycles.length;
    averageCycle.code /= teamCycles.length;

    return averageCycle;
}
