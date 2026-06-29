import type { PartialMonitorFrame, ScheduleBreakdown, TournamentLevel } from "../../../shared/types";
import type { SourceEventMap, TypedEventEmitter } from "./emitter";

export interface MatchRef {
	matchNumber: number;
	playNumber: number;
	level: TournamentLevel;
}

export interface ScheduleResult {
	days: ScheduleBreakdown;
	lastPlayed: number;
	matches: { match: number; level: TournamentLevel; scheduledStartTime: Date }[];
}

/**
 * A field data source feeds `background.ts` with live field monitor frames,
 * match cycle milestones, and the REST lookups it needs. Two implementations
 * exist: {@link import("./fmsSource").FmsSource} (official FMS over SignalR) and
 * {@link import("./cheesyArenaSource").CheesyArenaSource} (Cheesy Arena websocket).
 *
 * It is an event emitter (`frame`/`cycleTime`/`sendSchedule`/`noteChanged`)
 * plus the accessors background needs, so both sources are interchangeable.
 */
export interface FieldDataSource extends TypedEventEmitter<SourceEventMap> {
	/** Latest assembled monitor frame (kept warm so cycle handlers can read match/level). */
	readonly frame: PartialMonitorFrame;
	/** Whether this source supports FMS-style two-way note sync. */
	readonly supportsNotes: boolean;

	start(): Promise<void>;
	stop(): Promise<void>;
	/** True if the underlying field system is reachable. */
	ping(): Promise<boolean>;
	/** A short, human-readable connection status for diagnostics. */
	getConnectionStatus(): string;

	getCurrentMatch(): Promise<MatchRef>;
	getScheduleBreakdown(): Promise<ScheduleResult>;
	getTeamNumbers(): Promise<number[]>;
	getEventCode(): Promise<string>;

	/** Upload logs for the just-finished match. */
	uploadMatchLogs(): Promise<void>;
	/** Backfill any played matches the server is missing (FMS only; no-op for live-accumulated sources). */
	uploadAllUnimportedMatchLogs(onProgress?: (current: number, total: number) => void): Promise<void>;

	/** FMS-only; safe no-op elsewhere. */
	setFmsEventPassword(password: string | null): void;
}
