import { and, eq } from "drizzle-orm";
import { db } from "../db/db";
import { robotCycleLogs } from "../db/schema";
import { randomUUID } from "crypto";
import { FieldState, MonitorFrame, ServerEvent, StateChange } from "../../shared/types";

export async function getTeamCycle(eventCode: string, teamNumber: number, matchNumber: number, playNumber: number, level: 'None' | 'Practice' | 'Qualification' | 'Playoff') {
    let cycle = await db.query.robotCycleLogs.findFirst({
        where: and(
            eq(robotCycleLogs.event, eventCode),
            eq(robotCycleLogs.match_number, matchNumber),
            eq(robotCycleLogs.play_number, playNumber),
            eq(robotCycleLogs.level, level),
            eq(robotCycleLogs.team, teamNumber)
        )
    });

    if (!cycle) {
        await db.insert(robotCycleLogs).values({
            id: randomUUID(),
            event: eventCode,
            match_number: matchNumber,
            play_number: playNumber,
            level,
            team: teamNumber
        }).returning();

        cycle = await db.query.robotCycleLogs.findFirst({
            where: and(
                eq(robotCycleLogs.event, eventCode),
                eq(robotCycleLogs.match_number, matchNumber),
                eq(robotCycleLogs.play_number, playNumber),
                eq(robotCycleLogs.level, level),
                eq(robotCycleLogs.team, teamNumber)
            )
        });
    }

    if (!cycle) throw new Error('Failed to create team cycle log');

    return cycle;
}

export async function getTeamAverageCycle(team: number, eventCode?: string) {
    const teamCycles = await db.query.robotCycleLogs.findMany({
        where:
            (eventCode ?
                and(eq(robotCycleLogs.event, eventCode), eq(robotCycleLogs.team, team))
                : eq(robotCycleLogs.team, team)),
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
