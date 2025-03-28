import { observable } from "@trpc/server/observable";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { events, newEventEmitter } from "..";
import { formatTimeShortNoAgoSeconds } from "../../shared/formatTime";
import { DSState, EnableState, FieldState, MonitorFrame, StateChange, TournamentLevel } from "../../shared/types";
import { db } from "../db/db";
import { users } from "../db/schema";
import { eventProcedure, publicProcedure, router } from "../trpc";
import { detectStatusChange, processFrameForTeamData, processTeamCycles, processTeamWarnings } from "../util/frame-processing";
import { getEvent } from "../util/get-event";

export interface Post {
    type: 'test';
}

export const robotInfo = z.object({
    number: z.number(),
    ds: z.nativeEnum(DSState),
    radio: z.boolean(),
    rio: z.boolean(),
    code: z.boolean(),
    bwu: z.number(),
    battery: z.number(),
    ping: z.number(),
    packets: z.number(),
    MAC: z.string().nullable(),
    RX: z.number().nullable(),
    RXMCS: z.number().nullable(),
    TX: z.number().nullable(),
    TXMCS: z.number().nullable(),
    SNR: z.number().nullable(),
    noise: z.number().nullable(),
    signal: z.number().nullable(),
    versionmm: z.boolean(),
    enabled: z.nativeEnum(EnableState),
    radioConnected: z.boolean().nullable(),
    radioConnectionQuality: z.enum(['Warning', 'Caution', 'Good', 'Excellent']).nullable(),
});

export const fieldMonitorRouter = router({

    // Uploading a monitor frame
    post: publicProcedure.input(z.object({
        eventToken: z.string().optional(),
        eventCode: z.string().optional(),
        field: z.nativeEnum(FieldState),
        match: z.number(),
        play: z.number(),
        level: z.enum(['None', 'Practice', 'Qualification', 'Playoff']),
        time: z.string(),
        version: z.string(),
        frameTime: z.number(),
        lastCycleTime: z.string(),
        red1: robotInfo,
        red2: robotInfo,
        red3: robotInfo,
        blue1: robotInfo,
        blue2: robotInfo,
        blue3: robotInfo,
        extensionId: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
        if (!input.eventToken && !input.eventCode) {
            throw new Error('Event token or code required');
        }

        const event = await getEvent(input.eventToken || '', input.eventCode);

        let extensionId = input.extensionId || ctx.extensionId;
        if (extensionId) {
            let connection = event.stats.extensions.find(e => e.id === extensionId);
            if (!connection) {
                connection = {
                    id: extensionId,
                    connected: new Date(),
                    userAgent: ctx.userAgent,
                    ip: ctx.ip,
                    lastFrame: new Date(),
                    frames: 0,
                    checklistUpdates: 0,
                };
                event.stats.extensions.push(connection);
            }

            connection.lastFrame = new Date();
            connection.frames++;
        }

        // Detects raising and falling edges
        const processed = detectStatusChange(input, event.monitorFrame);

        // Add emoji warnings
        processed.currentFrame = await processTeamWarnings(event.code, processed.currentFrame, event.monitorFrame);

        if (event.monitorFrame.field !== processed.currentFrame.field) {
            if (processed.currentFrame.field === FieldState.PRESTART_COMPLETED) {
                event.lastPrestartDone = new Date();
            } else if (processed.currentFrame.field === FieldState.MATCH_RUNNING_AUTO) {
                event.lastMatchStart = new Date();

                let exactAheadBehind = undefined;
                if (event.scheduleDetails.matches) {
                    processed.currentFrame.matchScheduledStartTime = event.scheduleDetails.matches.find(m => (m.match === event.monitorFrame.match && m.level === event.monitorFrame.level))?.scheduledStartTime;
                    console.log(processed.currentFrame.matchScheduledStartTime);
                    if (processed.currentFrame.matchScheduledStartTime !== undefined) {
                        if (typeof processed.currentFrame.matchScheduledStartTime === 'string') {
                            processed.currentFrame.matchScheduledStartTime = new Date(processed.currentFrame.matchScheduledStartTime);
                        }
                        let timeDelta = processed.currentFrame.matchScheduledStartTime.getTime() - event.lastMatchStart.getTime();
                        exactAheadBehind = formatTimeShortNoAgoSeconds(timeDelta) + (timeDelta >= 0 ? ' ahead' : ' behind');
                        console.log(processed.currentFrame.matchScheduledStartTime, event.lastMatchStart, exactAheadBehind);
                    }
                }
                processed.currentFrame.exactAheadBehind = exactAheadBehind;

            } else if (processed.currentFrame.field === FieldState.MATCH_OVER) {
                event.lastMatchEnd = new Date();
            } else if (event.monitorFrame.field === FieldState.READY_FOR_POST_RESULT) {
                event.lastMatchScoresPosted = new Date();
            }

            event.fieldStatusEmitter.emit('change', processed.currentFrame.field);
        }

        if (!processed.currentFrame.exactAheadBehind && processed.currentFrame.level === "Qualification") processed.currentFrame.exactAheadBehind = event.monitorFrame.exactAheadBehind;

        event.monitorFrame = processed.currentFrame;

        event.history.push(processed.currentFrame);
        if (event.history.length > 50) event.history.shift();

        event.fieldMonitorEmitter.emit('update', input);

        for (const change of processed.changes) {
            event.robotStateChangeEmitter.emit('change', change);
        }

        const checklist = await processFrameForTeamData(event.code, processed.currentFrame, processed.changes);
        if (checklist) {
            event.checklistEmitter.emit('update', checklist);
        }

        processTeamCycles(event.code, processed.currentFrame, processed.changes);

        return;
    }),

    history: eventProcedure.query(async ({ ctx }) => {
        const event = await getEvent(ctx.eventToken ?? '');

        return event.history;
    }),

    robots: publicProcedure.input(z.object({
        eventToken: z.string()
    })).subscription(async ({ input, ctx }) => {
        const event = await getEvent(input.eventToken);

        return observable<MonitorFrame>((emitter) => {
            console.log('robots subscription', event.code);
            const listener = (frame: MonitorFrame) => {
                emitter.next(frame);
            };

            event.fieldMonitorEmitter.on('update', listener);

            // const connectionId = crypto.randomUUID();
            // event.stats.clients.push({
            //     userAgent: ctx.userAgent,
            //     ip: ctx.ip,
            //     id: connectionId,
            //     connected: new Date(),
            // });

            return () => {
                event.fieldMonitorEmitter.off('update', listener);
                // event.stats.clients = event.stats.clients.filter(c => c.id !== connectionId);
            };
        });
    }),

    robotStatus: publicProcedure.input(z.object({
        eventToken: z.string()
    })).subscription(async ({ input }) => {
        const event = await getEvent(input.eventToken);

        return observable<StateChange>((emitter) => {
            console.log('robot status subscription', event.code);
            const listener = (change: StateChange) => {
                emitter.next(change);
            };

            event.robotStateChangeEmitter.on('change', listener);

            return () => {
                event.robotStateChangeEmitter.off('change', listener);
            };
        });
    }),

    fieldStatus: publicProcedure.input(z.object({
        eventToken: z.string()
    })).subscription(async ({ input }) => {
        const event = await getEvent(input.eventToken);

        return observable<FieldState>((emitter) => {
            console.log('field status subscription', event.code);
            const listener = (state: FieldState) => {
                emitter.next(state);
            };

            event.fieldStatusEmitter.on('change', (state) => {
                listener(state);
            });

            return () => {
                event.fieldStatusEmitter.off('change', listener);
            };
        });
    }),

    management: publicProcedure.input(z.object({
        token: z.string()
    })).subscription(async ({ input }) => {
        const user = await db.query.users.findFirst({
            where: and(
                eq(users.token, input.token),
                gt(users.id, -1),
                eq(users.admin, true)
            )
        });

        if (!user) {
            throw new Error('Unauthorized');
        }

        return observable<EventState>((emitter) => {
            let listeners: (() => void)[] = [];

            const addNewEvent = (eventCode: string) => {
                console.log('new event', eventCode);
                const event = events[eventCode];
                const listener = (frame: MonitorFrame) => {
                    emitter.next({
                        code: event.code,
                        name: event.name,
                        token: event.token,
                        pin: event.pin,
                        field: frame.field,
                        match: frame.match,
                        level: frame.level,
                        aheadBehind: frame.time,
                        exactAheadBehind: frame.exactAheadBehind,
                        clients: event.stats.clients,
                        extensions: event.stats.extensions
                    });
                };

                event.fieldMonitorEmitter.on('update', listener);
                listeners.push(() => event.fieldMonitorEmitter.off('update', listener));

                emitter.next({
                    code: event.code,
                    name: event.name,
                    token: event.token,
                    pin: event.pin,
                    field: event.monitorFrame.field,
                    match: event.monitorFrame.match,
                    level: event.monitorFrame.level,
                    aheadBehind: event.monitorFrame.time,
                    exactAheadBehind: event.monitorFrame.exactAheadBehind,
                    clients: event.stats.clients,
                    extensions: event.stats.extensions
                });
            };

            for (let eventCode of Object.keys(events)) {
                addNewEvent(eventCode);
            }

            newEventEmitter.on('new', addNewEvent);

            return () => {
                newEventEmitter.off('new', addNewEvent);
                for (const l of listeners) {
                    l();
                }
            };
        });
    }),
});

export interface EventState {
    code: string;
    name: string;
    token: string;
    pin: string;
    field: FieldState;
    match: number;
    level: TournamentLevel;
    aheadBehind: string;
    exactAheadBehind?: string;
    clients: {
        userAgent?: string;
        ip?: string;
        id: string;
        connected: Date;
    }[];
    extensions: {
        id: string;
        connected: Date;
        userAgent?: string;
        ip?: string;
        lastFrame: Date;
        frames: number;
        checklistUpdates: number;
    }[];
}