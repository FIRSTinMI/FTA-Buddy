import { DEFAULT_MONITOR } from "../../../shared/constants";
import {
	FieldState,
	type FMSLogFrame,
	MatchState,
	MatchStateMap,
	type PartialMonitorFrame,
	ROBOT,
	type TournamentLevel,
} from "../../../shared/types";
import { TypedEventEmitter } from "./emitter";
import {
	CHEESY_STATION_TO_ROBOT,
	type CheesyArenaStatus,
	type CheesyEventStatus,
	type CheesyMatch,
	CheesyMatchState,
	type CheesyMatchLoad,
	type CheesyMatchTime,
	type CheesyMessage,
	type CheesyStation,
} from "./cheesyArenaTypes";
import { buildFmsMatchId, mapFieldState, mapLevel, mapLogFrame, mapRobot } from "./cheesyArenaMap";
import { compressStationLog, trpc } from "../trpc";
import type { FieldDataSource, MatchRef, ScheduleResult } from "./types";
import type { SourceEventMap } from "./emitter";

const RECONNECT_DELAY_MS = 3000;

/** Cheesy Arena station id -> FTA-Buddy robot key, with literal types preserved. */
const STATION_ENTRIES = Object.entries(CHEESY_STATION_TO_ROBOT) as [CheesyStation, ROBOT][];

/**
 * Field data source backed by a Cheesy Arena field (github.com/Team254/cheesy-arena).
 *
 * It subscribes to Cheesy Arena's `/api/arena/websocket` notifier stream and
 * maps it onto the same `frame` / `cycleTime` events the FMS source emits, so
 * `background.ts` treats both identically. REST lookups hit Cheesy Arena's
 * `/api/...` endpoints. Match logs are accumulated live from the arenaStatus
 * stream (Cheesy Arena has no FMS-style GetLog) and uploaded at match end.
 *
 * Note sync is FMS-only and unsupported here.
 */
export class CheesyArenaSource extends TypedEventEmitter<SourceEventMap> implements FieldDataSource {
	public readonly supportsNotes = false;
	public frame: PartialMonitorFrame = structuredClone(DEFAULT_MONITOR);

	private ws: WebSocket | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private stopped = false;

	// Latest notifier state.
	private matchLoad: CheesyMatchLoad | null = null;
	private eventStatus: CheesyEventStatus | null = null;
	private matchTimeSec = 0;
	private current: MatchRef = { matchNumber: 0, playNumber: 1, level: "None" };

	// Match lifecycle tracking.
	private prevField: FieldState = FieldState.UNKNOWN;
	private scoresPosted = false;
	private actualStartTime: string | null = null;
	private logBuffers: Record<ROBOT, FMSLogFrame[]> = this.emptyLogBuffers();
	private uploadingIds = new Set<string>();

	constructor(
		private readonly host: string,
		version: string,
		private readonly eventCodeProvider: () => string,
	) {
		super();
		this.frame.version = version;
	}

	// #region Lifecycle

	public async start(): Promise<void> {
		this.stopped = false;
		this.connect();
	}

	public async stop(): Promise<void> {
		this.stopped = true;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.ws) {
			this.ws.onclose = null;
			try {
				this.ws.close();
			} catch {
				/* already closing */
			}
			this.ws = null;
		}
	}

	private connect(): void {
		if (this.stopped) return;
		const url = `ws://${this.host}/api/arena/websocket`;
		console.log(`Connecting to Cheesy Arena (${url})`);
		let ws: WebSocket;
		try {
			ws = new WebSocket(url);
		} catch (err) {
			console.error("Cheesy Arena websocket construction failed:", err);
			this.scheduleReconnect();
			return;
		}
		this.ws = ws;

		ws.onopen = () => console.log("Cheesy Arena websocket connected");
		ws.onmessage = (ev) => {
			try {
				this.handleMessage(JSON.parse(ev.data as string) as CheesyMessage);
			} catch (err) {
				console.error("Failed to handle Cheesy Arena message:", err, ev.data);
			}
		};
		ws.onerror = (ev) => console.warn("Cheesy Arena websocket error:", ev);
		ws.onclose = () => {
			console.warn("Cheesy Arena websocket closed");
			this.scheduleReconnect();
		};
	}

	private scheduleReconnect(): void {
		if (this.stopped || this.reconnectTimer) return;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, RECONNECT_DELAY_MS);
	}

	public getConnectionStatus(): string {
		switch (this.ws?.readyState) {
			case WebSocket.CONNECTING:
				return "Connecting";
			case WebSocket.OPEN:
				return "Connected";
			case WebSocket.CLOSING:
				return "Disconnecting";
			default:
				return "Disconnected";
		}
	}

	// #region Message handling

	private handleMessage(msg: CheesyMessage): void {
		switch (msg.type) {
			case "arenaStatus":
				this.handleArenaStatus(msg.data as CheesyArenaStatus);
				break;
			case "matchLoad":
				this.handleMatchLoad(msg.data as CheesyMatchLoad);
				break;
			case "matchTime":
				this.matchTimeSec = (msg.data as CheesyMatchTime).MatchTimeSec;
				break;
			case "eventStatus":
				this.eventStatus = msg.data as CheesyEventStatus;
				break;
			case "scorePosted":
				this.handleScorePosted();
				break;
		}
	}

	private handleMatchLoad(data: CheesyMatchLoad): void {
		this.matchLoad = data;
		this.current = {
			matchNumber: data.Match.TypeOrder,
			playNumber: data.IsReplay ? 2 : 1,
			level: mapLevel(data.Match.Type),
		};
		// A freshly loaded match is the Cheesy Arena analog of FMS prestart-complete.
		this.scoresPosted = false;
		this.actualStartTime = null;
		this.logBuffers = this.emptyLogBuffers();
		this.frame.field = FieldState.PRESTART_COMPLETED;
		this.frame.match = this.current.matchNumber;
		this.frame.play = this.current.playNumber;
		this.frame.level = this.current.level;
		this.prevField = FieldState.PRESTART_COMPLETED;
		this.emit("cycleTime", "prestart", "");
		this.emit("sendSchedule");
	}

	private handleArenaStatus(status: CheesyArenaStatus): void {
		const baseField = mapFieldState(status.MatchState, status.CanStartMatch);
		// Keep showing post-result until the next match is loaded.
		const field =
			this.scoresPosted && status.MatchState === CheesyMatchState.PostMatch
				? FieldState.READY_FOR_POST_RESULT
				: baseField;

		this.frame.field = field;
		this.frame.match = this.current.matchNumber;
		this.frame.play = this.current.playNumber;
		this.frame.level = this.current.level;
		this.frame.time = this.eventStatus?.EarlyLateMessage || "unk";
		this.frame.lastCycleTime = this.eventStatus?.CycleTime || "unk";

		for (const [station, robot] of STATION_ENTRIES) {
			const allianceStation = status.AllianceStations[station];
			if (allianceStation) this.frame[robot] = mapRobot(allianceStation, field);
		}

		this.frame.frameTime = Date.now();
		this.handleFieldTransition(field);
		this.accumulateLogs(status);
		this.emit("frame", this.frame);
	}

	private handleFieldTransition(field: FieldState): void {
		if (field === this.prevField) return;
		this.prevField = field;
		switch (field) {
			case FieldState.MATCH_READY:
				this.emit("cycleTime", "matchReady", "");
				break;
			case FieldState.MATCH_RUNNING_AUTO:
				this.actualStartTime = new Date().toISOString();
				this.emit("cycleTime", "start", "");
				break;
			case FieldState.MATCH_OVER:
				this.emit("cycleTime", "end", "");
				setTimeout(() => this.uploadMatchLogs().catch((err) => console.error("CA log upload failed:", err)), 1500);
				break;
		}
	}

	private handleScorePosted(): void {
		this.scoresPosted = true;
		this.frame.field = FieldState.READY_FOR_POST_RESULT;
		this.emit("cycleTime", "scoresPosted", "");
		this.uploadMatchLogs().catch((err) => console.error("CA log upload failed:", err));
	}

	private accumulateLogs(status: CheesyArenaStatus): void {
		// Only record while the match is actually running.
		if (MatchStateMap[this.frame.field] !== MatchState.RUNNING) return;
		const timeStamp = new Date().toISOString();
		const auto =
			status.MatchState === CheesyMatchState.StartMatch || status.MatchState === CheesyMatchState.AutoPeriod;
		for (const [station, robot] of STATION_ENTRIES) {
			const allianceStation = status.AllianceStations[station];
			if (allianceStation) this.logBuffers[robot].push(mapLogFrame(allianceStation, timeStamp, this.matchTimeSec, auto));
		}
	}

	// #region REST accessors

	public async ping(): Promise<boolean> {
		try {
			const controller = new AbortController();
			setTimeout(() => controller.abort(), 1000);
			const res = await fetch(`http://${this.host}/api/matches/qualification`, { signal: controller.signal });
			return res.ok;
		} catch {
			return false;
		}
	}

	public async getCurrentMatch(): Promise<MatchRef> {
		return this.current;
	}

	public async getTeamNumbers(): Promise<number[]> {
		const matches = await this.fetchMatches("qualification");
		const teams = new Set<number>();
		for (const { Match: m } of matches) {
			for (const t of [m.Red1, m.Red2, m.Red3, m.Blue1, m.Blue2, m.Blue3]) {
				if (t > 0) teams.add(t);
			}
		}
		return [...teams];
	}

	public async getEventCode(): Promise<string> {
		// Cheesy Arena has no FMS-style event code endpoint; FTA-Buddy already
		// owns the configured event code, so surface that.
		return this.eventCodeProvider();
	}

	public async getScheduleBreakdown(): Promise<ScheduleResult> {
		const matches = await this.fetchMatches("qualification");
		const days: ScheduleResult["days"] = [];
		const matchList: ScheduleResult["matches"] = [];
		let lastPlayed = 0;
		let day = -1;

		for (let i = 0; i < matches.length; i++) {
			const m = matches[i].Match;
			const startTime = new Date(m.Time);
			const prev = i > 0 ? matches[i - 1].Match : null;
			const next = i + 1 < matches.length ? matches[i + 1].Match : null;
			const today = day in days ? days[day] : null;
			const todayIsNew = !today || today.date.getDate() !== startTime.getDate();

			matchList.push({ scheduledStartTime: startTime, match: m.TypeOrder, level: "Qualification" });

			const cycleTime = Math.abs(
				Math.round(
					prev && !todayIsNew
						? startTime.getTime() - new Date(prev.Time).getTime()
						: next
							? startTime.getTime() - new Date(next.Time).getTime()
							: 8 * 60 * 1000,
				) /
					1000 /
					60,
			);

			if (todayIsNew) {
				day++;
				days[day] = {
					date: startTime,
					start: m.TypeOrder,
					end: m.TypeOrder,
					endTime: null,
					lunch: null,
					lunchTime: null,
					cycleTimes: [{ match: m.TypeOrder, minutes: cycleTime }],
				};
				if (day - 1 in days && prev) {
					days[day - 1].end = prev.TypeOrder;
					days[day - 1].endTime = new Date(prev.Time);
				}
			} else {
				const cur = days[day];
				if (cycleTime !== cur.cycleTimes[cur.cycleTimes.length - 1].minutes) {
					cur.cycleTimes.push({ match: m.TypeOrder, minutes: cycleTime });
				}
				if (!next) {
					cur.end = m.TypeOrder;
					cur.endTime = startTime;
				}
			}

			if (m.Status === "complete" || matches[i].Result) lastPlayed = m.TypeOrder;
		}

		return { days, lastPlayed, matches: matchList };
	}

	private async fetchMatches(type: "qualification" | "playoff" | "practice") {
		const res = await fetch(`http://${this.host}/api/matches/${type}`);
		if (!res.ok) throw new Error(`Cheesy Arena /api/matches/${type} returned ${res.status}`);
		return (await res.json()) as { Match: CheesyMatch; Result: unknown | null }[];
	}

	// #region Match log upload

	public async uploadMatchLogs(): Promise<void> {
		const eventCode = this.eventCodeProvider();
		if (!eventCode) {
			console.warn("CA uploadMatchLogs: no event code configured, skipping");
			return;
		}
		const fmsMatchId = buildFmsMatchId(eventCode, this.current.level, this.current.matchNumber, this.current.playNumber);
		if (this.uploadingIds.has(fmsMatchId)) return;

		const hasFrames = Object.values(this.logBuffers).some((frames) => frames.length > 0);
		if (!hasFrames) {
			console.log(`CA uploadMatchLogs: no frames buffered for ${fmsMatchId}, skipping`);
			return;
		}

		const teams = this.matchLoad?.Match;
		this.uploadingIds.add(fmsMatchId);
		try {
			await trpc.match.putCompressedMatchLogs.mutate({
				event: eventCode,
				fmsMatchId,
				fmsEventId: eventCode,
				matchNumber: this.current.matchNumber,
				playNumber: this.current.playNumber,
				level: this.current.level,
				actualStartTime: this.actualStartTime ?? new Date().toISOString(),
				teamNumberRed1: teams?.Red1,
				teamNumberRed2: teams?.Red2,
				teamNumberRed3: teams?.Red3,
				teamNumberBlue1: teams?.Blue1,
				teamNumberBlue2: teams?.Blue2,
				teamNumberBlue3: teams?.Blue3,
				logs: {
					red1: compressStationLog(this.logBuffers.red1),
					red2: compressStationLog(this.logBuffers.red2),
					red3: compressStationLog(this.logBuffers.red3),
					blue1: compressStationLog(this.logBuffers.blue1),
					blue2: compressStationLog(this.logBuffers.blue2),
					blue3: compressStationLog(this.logBuffers.blue3),
				},
			});
			console.log(`CA match logs uploaded for ${fmsMatchId}`);
		} finally {
			this.uploadingIds.delete(fmsMatchId);
		}
	}

	public async uploadAllUnimportedMatchLogs(): Promise<void> {
		// Cheesy Arena logs are accumulated live and uploaded at match end, so
		// there is nothing to backfill from a REST endpoint.
	}

	public setFmsEventPassword(): void {
		// No-op: Cheesy Arena has no FMS event password / note sync.
	}

	// #region Helpers

	private emptyLogBuffers(): Record<ROBOT, FMSLogFrame[]> {
		return {
			[ROBOT.red1]: [],
			[ROBOT.red2]: [],
			[ROBOT.red3]: [],
			[ROBOT.blue1]: [],
			[ROBOT.blue2]: [],
			[ROBOT.blue3]: [],
		};
	}
}
