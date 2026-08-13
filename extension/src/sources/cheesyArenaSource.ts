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
import { buildFmsMatchId, mapEarlyLateMessage, mapFieldState, mapLevel, mapLogFrame, mapRobot } from "./cheesyArenaMap";
import { compressStationLog, trpc } from "../trpc";
import type { FieldDataSource, MatchRef, PlayoffAllianceRoster, ScheduleResult } from "./types";
import type { SourceEventMap } from "./emitter";

/** Cheesy Arena station id -> FTA-Buddy robot key, with literal types preserved. */
const STATION_ENTRIES = Object.entries(CHEESY_STATION_TO_ROBOT) as [CheesyStation, ROBOT][];

/**
 * A finished match captured at match end. Snapshotting the log buffers and
 * match context up front means a fast next-match load (which resets the live
 * buffers) can't clear the logs out from under an in-flight upload.
 */
interface MatchSnapshot {
	ref: MatchRef;
	fmsMatchId: string;
	actualStartTime: string;
	teams: CheesyMatch | undefined;
	logBuffers: Record<ROBOT, FMSLogFrame[]>;
}

/**
 * Field data source backed by a Cheesy Arena field (github.com/Team254/cheesy-arena).
 *
 * It subscribes to Cheesy Arena's `/displays/field_monitor/websocket` notifier
 * stream (the same feed its own field monitor display uses) and maps it onto the
 * same `frame` / `cycleTime` events the FMS source emits, so `background.ts`
 * treats both identically. That endpoint is a Cheesy Arena "display", so it
 * requires a `displayId` query param. REST lookups hit Cheesy Arena's `/api/...`
 * endpoints. Match logs are accumulated live from the arenaStatus stream (Cheesy
 * Arena has no FMS-style GetLog) and uploaded at match end.
 *
 * Note sync is FMS-only and unsupported here.
 */
export class CheesyArenaSource extends TypedEventEmitter<SourceEventMap> implements FieldDataSource {
	public readonly supportsNotes = false;
	public frame: PartialMonitorFrame = structuredClone(DEFAULT_MONITOR);

	private stopped = false;
	private connected = false;

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
	private uploadedIds = new Set<string>();
	private pendingUpload: MatchSnapshot | null = null;

	/**
	 * Number of finalized plays seen for each `${level}-${matchNumber}` key.
	 * Cheesy Arena's wire data has no replay index, so we derive a monotonically
	 * increasing play number locally to keep each replay's fmsMatchId distinct.
	 */
	private playCounts = new Map<string, number>();

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
		// The field monitor websocket is NOT opened here. Cheesy Arena's upgrader
		// enforces a same-origin check that rejects the service worker's
		// chrome-extension:// origin, and Chrome's declarativeNetRequest cannot
		// strip the Origin header on a websocket handshake. Instead the
		// `cheesy-inject` content script opens the feed from the Cheesy Arena field
		// monitor page (whose origin is the Cheesy Arena host, so it passes) and
		// relays every message here via chrome.runtime -> background -> ingest().
		this.stopped = false;
	}

	public async stop(): Promise<void> {
		this.stopped = true;
		this.connected = false;
	}

	/**
	 * Feed a raw Cheesy Arena message relayed from the page-context websocket.
	 * background.ts calls this for each `cheesyWs` runtime message.
	 */
	public ingest(msg: CheesyMessage): void {
		if (this.stopped) return;
		this.handleMessage(msg);
	}

	/** Track whether the page-context websocket is currently connected. */
	public setConnected(connected: boolean): void {
		this.connected = connected;
	}

	public getConnectionStatus(): string {
		if (this.stopped) return "Disconnected";
		return this.connected ? "Connected" : "Waiting for Cheesy Arena page";
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
		const level = mapLevel(data.Match.Type);
		const matchNumber = data.Match.TypeOrder;
		const key = this.matchKey(level, matchNumber);
		let playNumber = (this.playCounts.get(key) ?? 0) + 1;
		// If Cheesy Arena flags a replay but we have no local history for it (e.g.
		// the service worker restarted mid-event), floor at 2 so the replay's
		// fmsMatchId can't collide with the original play 1.
		if (data.IsReplay && playNumber < 2) playNumber = 2;
		this.current = { matchNumber, playNumber, level };
		// A freshly loaded match is the Cheesy Arena analog of FMS prestart-complete.
		this.scoresPosted = false;
		this.actualStartTime = null;
		this.pendingUpload = null;
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
		this.frame.time = mapEarlyLateMessage(this.eventStatus?.EarlyLateMessage) || "unk";
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
				this.finalizeMatch();
				break;
		}
	}

	private handleScorePosted(): void {
		this.scoresPosted = true;
		this.frame.field = FieldState.READY_FOR_POST_RESULT;
		this.emit("cycleTime", "scoresPosted", "");
		// Fallback in case the match-over path was missed; uploadedIds dedups so
		// this won't re-send what finalizeMatch already uploaded.
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

	public async getAlliances(): Promise<PlayoffAllianceRoster[]> {
		// Cheesy Arena playoff-alliance sync is not wired up yet; scorekeeper
		// alliances stay empty for this source until it is.
		return [];
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

	/**
	 * Snapshot the just-finished match and upload it. Marking the play finalized
	 * here (rather than on the next load) means a replay of the same match gets
	 * the next play number instead of colliding on the same fmsMatchId.
	 */
	private finalizeMatch(): void {
		const snapshot = this.snapshotMatch();
		if (!snapshot) return;
		this.pendingUpload = snapshot;
		this.playCounts.set(this.matchKey(snapshot.ref.level, snapshot.ref.matchNumber), snapshot.ref.playNumber);
		this.uploadSnapshot(snapshot).catch((err) => console.error("CA log upload failed:", err));
	}

	/**
	 * Capture the current match context and log buffers. Returns null when there
	 * is nothing worth uploading (no event code, or no frames recorded).
	 */
	private snapshotMatch(): MatchSnapshot | null {
		const eventCode = this.eventCodeProvider();
		if (!eventCode) {
			console.warn("CA snapshotMatch: no event code configured, skipping");
			return null;
		}
		const hasFrames = Object.values(this.logBuffers).some((frames) => frames.length > 0);
		if (!hasFrames) {
			console.log("CA snapshotMatch: no frames buffered, skipping");
			return null;
		}
		// handleMatchLoad reassigns this.logBuffers to a fresh object and stops
		// accumulating once the match is over, so holding this reference is safe.
		return {
			ref: { ...this.current },
			fmsMatchId: buildFmsMatchId(eventCode, this.current.level, this.current.matchNumber, this.current.playNumber),
			actualStartTime: this.actualStartTime ?? new Date().toISOString(),
			teams: this.matchLoad?.Match,
			logBuffers: this.logBuffers,
		};
	}

	public async uploadMatchLogs(): Promise<void> {
		const snapshot = this.pendingUpload ?? this.snapshotMatch();
		if (!snapshot) return;
		await this.uploadSnapshot(snapshot);
	}

	private async uploadSnapshot(snap: MatchSnapshot): Promise<void> {
		if (this.uploadedIds.has(snap.fmsMatchId) || this.uploadingIds.has(snap.fmsMatchId)) return;
		const eventCode = this.eventCodeProvider();
		if (!eventCode) return;

		const teams = snap.teams;
		this.uploadingIds.add(snap.fmsMatchId);
		try {
			await trpc.match.putCompressedMatchLogs.mutate({
				event: eventCode,
				fmsMatchId: snap.fmsMatchId,
				fmsEventId: eventCode,
				matchNumber: snap.ref.matchNumber,
				playNumber: snap.ref.playNumber,
				level: snap.ref.level,
				actualStartTime: snap.actualStartTime,
				teamNumberRed1: teams?.Red1,
				teamNumberRed2: teams?.Red2,
				teamNumberRed3: teams?.Red3,
				teamNumberBlue1: teams?.Blue1,
				teamNumberBlue2: teams?.Blue2,
				teamNumberBlue3: teams?.Blue3,
				logs: {
					red1: compressStationLog(snap.logBuffers.red1),
					red2: compressStationLog(snap.logBuffers.red2),
					red3: compressStationLog(snap.logBuffers.red3),
					blue1: compressStationLog(snap.logBuffers.blue1),
					blue2: compressStationLog(snap.logBuffers.blue2),
					blue3: compressStationLog(snap.logBuffers.blue3),
				},
			});
			this.uploadedIds.add(snap.fmsMatchId);
			console.log(`CA match logs uploaded for ${snap.fmsMatchId}`);
		} finally {
			this.uploadingIds.delete(snap.fmsMatchId);
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

	private matchKey(level: TournamentLevel, matchNumber: number): string {
		return `${level}-${matchNumber}`;
	}

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
