import { z } from "zod";
import { DSState, EnableState, FieldState, MonitorFrame, StateChange } from "../../shared/types";
import { eventProcedure, publicProcedure, router } from "../trpc";
import { getEvent } from "../util/get-event";
import { observable } from "@trpc/server/observable";
import { detectRadioNoDs, detectStatusChange, processFrameForTeamData, processTeamCycles, processTeamWarnings } from "../util/frame-processing";

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
    radioConnectionQuality: z.string().nullable(),
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
    })).mutation(async ({ input }) => {
        if (!input.eventToken && !input.eventCode) {
            throw new Error('Event token or code required');
        }

        const event = await getEvent(input.eventToken || '', input.eventCode);

        // Detect radio even if no DS
        const detectedRadio = detectRadioNoDs(input, event.history);

        // Detects raising and falling edges
        const processed = detectStatusChange(detectedRadio, event.monitorFrame);

        // Add emoji warnings
        processed.currentFrame = await processTeamWarnings(event.code, processed.currentFrame, event.monitorFrame);

        if (event.monitorFrame.field !== processed.currentFrame.field) {
            if (processed.currentFrame.field === FieldState.PRESTART_COMPLETED) {
                event.lastPrestartDone = new Date();
            } else if (processed.currentFrame.field === FieldState.MATCH_RUNNING_AUTO) {
                event.lastMatchStart = new Date();
            } else if (processed.currentFrame.field === FieldState.MATCH_OVER) {
                event.lastMatchEnd = new Date();
            } else if (event.monitorFrame.field === FieldState.READY_FOR_POST_RESULT) {
                event.lastMatchScoresPosted = new Date();
            }

            event.fieldStatusEmitter.emit('change', processed.currentFrame.field);
        }



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
    })).subscription(async ({ input }) => {
        const event = await getEvent(input.eventToken);

        return observable<MonitorFrame>((emitter) => {
            const listener = (frame: MonitorFrame) => {
                emitter.next(frame);
            };

            event.fieldMonitorEmitter.on('update', listener);

            return () => {
                event.fieldMonitorEmitter.off('update', listener);
            };
        });
    }),

    robotStatus: publicProcedure.input(z.object({
        eventToken: z.string()
    })).subscription(async ({ input }) => {
        const event = await getEvent(input.eventToken);

        return observable<StateChange>((emitter) => {
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
            const listener = (state: FieldState) => {
                emitter.next(state);
            };

            event.fieldStatusEmitter.on('change', listener);

            return () => {
                event.fieldStatusEmitter.off('change', listener);
            };
        });
    }),
});
