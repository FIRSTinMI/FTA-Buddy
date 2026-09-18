import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import { DEFAULT_MONITOR } from "../../shared/constants";
import type {
	FTAEventNoteIssueType,
	FTAEventNoteResolutionType,
	FTAEventNoteType,
	FTANoteRecord,
} from "../../shared/fmsApiTypes";
import {
	DSState,
	EnableState,
	FMSEnums,
	FieldState,
	PartialMonitorFrame,
	ROBOT,
	type SignalRMonitorFrame,
	type TournamentLevel,
} from "../../shared/types";
import { uploadMatchLogs } from "./trpc";
import { type SourceEventMap, TypedEventEmitter } from "./sources/emitter";

export let signalRConnectionStatus: HubConnectionState = HubConnectionState.Disconnected;

/**
 * SignalR sends note payloads in PascalCase while the REST API uses camelCase.
 * Normalise to the camelCase FTANoteRecord shape so consumers don't need to care.
 */
function normalizeFmsNote(raw: any): FTANoteRecord {
	// If already camelCase (e.g. from REST), pass through
	if ("fmsEventNoteId" in raw) return raw as FTANoteRecord;
	return {
		fmsEventNoteId: raw.FMSEventNoteId ?? raw.fmsEventNoteId,
		noteType: (raw.NoteType ?? raw.noteType) as FTAEventNoteType,
		tournamentLevel: raw.TournamentLevel ?? raw.tournamentLevel ?? null,
		alliance: raw.Alliance ?? raw.alliance ?? null,
		station: raw.Station ?? raw.station ?? null,
		fmsMatchId: raw.FMSMatchId ?? raw.fmsMatchId ?? null,
		fmsTeamId: raw.FMSTeamId ?? raw.fmsTeamId ?? null,
		teamNumber: raw.TeamNumber ?? raw.teamNumber ?? null,
		matchDescription: raw.MatchDescription ?? raw.matchDescription ?? null,
		matchNumber: raw.MatchNumber ?? raw.matchNumber ?? null,
		playNumber: raw.PlayNumber ?? raw.playNumber ?? null,
		note: raw.Note ?? raw.note,
		issueType: (raw.IssueType ?? raw.issueType) as FTAEventNoteIssueType,
		resolutionStatus: (raw.ResolutionStatus ?? raw.resolutionStatus) as FTAEventNoteResolutionType,
		isPrivate: raw.IsPrivate ?? raw.isPrivate ?? false,
		isDeleted: raw.IsDeleted ?? raw.isDeleted ?? false,
	};
}

/**
 * Tournament levels the score autofill may run in. A test match reports the
 * currently active tournament level, and FMS never puts MatchMode (Test vs
 * Play) on the wire at all, so "None" is what a test match looks like before
 * any schedule is activated. Anything past that - a test match run mid-event,
 * quals, playoffs - is left alone.
 */
const SCORE_AUTOFILL_LEVELS: TournamentLevel[] = ["None", "Practice"];

/**
 * The three `RobotElementChangeType` keys, in enum order. Both of the per-robot
 * dictionaries on `ScoringElementChangedData` use this enum - the endgame one
 * too, despite `EndgameRobotElementChangeType` existing.
 */
const ROBOT_KEYS = ["Robot1", "Robot2", "Robot3"] as const;
type RobotKey = (typeof ROBOT_KEYS)[number];

/** `RobotAutoClimbType.Unknown` and `RobotEndGameType.Unknown`. Both are -1. */
const TOWER_UNKNOWN = -1;
/** `None` on both enums. FMS reads endgame as `EndgameClimbOptions[value + 1]`. */
const TOWER_NONE = 0;

/** What the tablets have picked this match, as far as we have seen. */
type TowerState = Record<RobotKey, number>;

function unknownTowers(): TowerState {
	return { Robot1: TOWER_UNKNOWN, Robot2: TOWER_UNKNOWN, Robot3: TOWER_UNKNOWN };
}

/**
 * Read a `Dictionary<RobotElementChangeType, ...>` off the wire into the
 * matching robots. System.Text.Json writes an enum dictionary key as the
 * numeric value in a string ("0"), but writes the name ("Robot1") when a string
 * enum converter is registered, so accept either.
 */
function mergeTowerData(into: TowerState, data: Record<string, unknown> | undefined) {
	for (const [rawKey, rawValue] of Object.entries(data ?? {})) {
		const index = ROBOT_KEYS.indexOf(rawKey as RobotKey);
		const key = index >= 0 ? (rawKey as RobotKey) : ROBOT_KEYS[Number(rawKey)];
		const value = Number(rawValue);
		if (key && Number.isFinite(value)) into[key] = value;
	}
}

export class SignalR extends TypedEventEmitter<SourceEventMap> {
	public connection: HubConnection | null = null;
	public infrastructureConnection: HubConnection | null = null;
	public ftaAppHubConnection: HubConnection | null = null;
	public gameSpecificConnection: HubConnection | null = null;

	/** Opt-in, off unless the host turns it on. See {@link autofillUnsetScores}. */
	private scoreAutofill = false;
	/** level-match-play of the last autofill, so a repeated status does not resend. */
	private lastScoreAutofillKey: string | null = null;
	/**
	 * Every tower selection the tablets have broadcast since the last prestart.
	 * gameSpecificHub relays each change to every client, so watching that
	 * stream is how we know which robots a ref has already dealt with.
	 */
	private towers = {
		Red: { auto: unknownTowers(), endgame: unknownTowers() },
		Blue: { auto: unknownTowers(), endgame: unknownTowers() },
	};

	public frame: PartialMonitorFrame = DEFAULT_MONITOR;
	private ip: string;

	private statusInterval: ReturnType<typeof setInterval> | null = null;

	constructor(ip: string, version: string) {
		super();
		this.ip = ip;
		this.frame.version = version;
	}

	/**
	 * Turn the score autofill on or off. Takes effect on the next
	 * {@link start}, since the gameSpecificHub connection is only opened when
	 * the feature is on.
	 */
	public setScoreAutofill(enabled: boolean) {
		this.scoreAutofill = enabled;
	}

	/**
	 * Fill in the tower selections a ref never made, so a test or practice match
	 * can be committed without walking the scoring panel.
	 *
	 * Auto Tower and Endgame Tower both start at Unknown (-1) and FMS refuses the
	 * commit until all six robots have a selection - "Robot N requires a Auto
	 * Tower selection", from ScoringIsValid in GameSpecificControllerBase. During
	 * field setup nobody is on the tablets, so the match cannot be closed out
	 * without a lot of clicking.
	 *
	 * Only the entries still at Unknown are sent. The tablets broadcast each
	 * change through gameSpecificHub to every client, so {@link towers} holds
	 * what they have picked since prestart and a ref's own selections are left
	 * alone. A robot we never saw a change for is treated as unset, which is the
	 * safe direction: at worst we send None for something already None.
	 *
	 * FMS applies whatever arrives through
	 * GameSpecificMatchController.UpdateScoringElement, and the hub relays with
	 * no filtering (Clients.All), so an alliance with nothing unset gets no
	 * message at all.
	 */
	private async autofillUnsetScores(level: TournamentLevel, matchNumber: number, playNumber: number) {
		if (!this.scoreAutofill) return;
		if (!SCORE_AUTOFILL_LEVELS.includes(level)) {
			console.log(`Score autofill skipped: tournament level is ${level}`);
			return;
		}

		const connection = this.gameSpecificConnection;
		if (connection?.state !== HubConnectionState.Connected) {
			console.warn(`Score autofill skipped: gameSpecificHub is ${connection?.state ?? "not connected"}`);
			return;
		}

		// FMS re-broadcasts the current match status on request, so the same
		// WaitingForCommit can arrive more than once. Send once per match. The
		// numbers come off the message rather than `this.frame`, which is only
		// updated at the end of this handler and at prestart.
		const key = `${level}-${matchNumber}-${playNumber}`;
		if (this.lastScoreAutofillKey === key) return;
		this.lastScoreAutofillKey = key;

		for (const alliance of ["Red", "Blue"] as const) {
			const payload = this.unsetTowerPayload(alliance);
			if (!payload) {
				console.log(`Score autofill: ${alliance} already set, nothing to send`);
				continue;
			}
			// invoke, not send: invoke waits for the server's completion message,
			// so a hub method that does not exist or a payload the server cannot
			// bind to `ScoringElementChangedData` comes back as a rejection we can
			// log. `send` would drop both silently. This is the only thing FTA
			// Buddy writes to FMS, so it is worth knowing when it does not land.
			const method = `${alliance}ScoringElementsChanged`;
			try {
				await connection.invoke(method, payload);
				console.log(`Score autofill: ${method} accepted`, payload);
			} catch (err) {
				console.warn(`Score autofill: ${method} rejected:`, err);
			}
		}
	}

	/**
	 * A `ScoringElementChangedData` carrying None for this alliance's robots that
	 * are still Unknown, or null when the refs left nothing unset.
	 *
	 * Property names are FMS's own; the MessagePack `[Key(n)]` attributes on the
	 * class do not apply to us because we speak the JSON hub protocol, which
	 * binds by property name. Dictionary keys go out as enum *names* and values
	 * as *numbers*: System.Text.Json parses an enum dictionary key with
	 * `Enum.TryParse`, which takes either a name or a number, while enum values
	 * need numbers unless a string converter is registered (and
	 * `JsonStringEnumConverter` accepts numbers anyway). That pairing binds under
	 * either configuration. The remaining fields are inert:
	 * `ChangeSourceIsPLC` is never read and the two `Goal_AutoDone` flags only do
	 * anything while the match state is MatchTeleop.
	 */
	private unsetTowerPayload(alliance: "Red" | "Blue") {
		const state = this.towers[alliance];
		const pick = (towers: TowerState) =>
			Object.fromEntries(
				ROBOT_KEYS.filter((key) => towers[key] === TOWER_UNKNOWN).map((key) => [key, TOWER_NONE]),
			);

		const AutoRobotData = pick(state.auto);
		const EndgameRobotData = pick(state.endgame);
		if (!Object.keys(AutoRobotData).length && !Object.keys(EndgameRobotData).length) return null;

		return {
			AutoRobotData,
			EndgameRobotData,
			GoalPhaseCountData: {},
			ChangeSourceIsPLC: false,
			Blue_Goal_AutoDone: false,
			Red_Goal_AutoDone: false,
		};
	}

	/** Forget last match's selections so the next one starts from Unknown. */
	private resetTowers() {
		this.towers = {
			Red: { auto: unknownTowers(), endgame: unknownTowers() },
			Blue: { auto: unknownTowers(), endgame: unknownTowers() },
		};
	}

	private buildConnection(url: string, logPrefix: string, onRetry?: () => void): HubConnection {
		return new HubConnectionBuilder()
			.withUrl(url)
			.withServerTimeout(30000)
			.withKeepAliveInterval(15000)
			.configureLogging({
				log: (logLevel: LogLevel, message: string) => {
					if (
						message.startsWith("Failed to complete negotiation") ||
						message.startsWith("Failed to start the connection") ||
						message.startsWith("Error from HTTP request") ||
						message.startsWith("No client method with the name")
					)
						return;

					[console.debug, console.debug, console.log, console.warn, console.error][logLevel](
						`[${logPrefix} ${logLevel}] ${message}`,
					);
				},
			})
			.withAutomaticReconnect({
				nextRetryDelayInMilliseconds(retryContext) {
					onRetry?.();
					return Math.min(2_000 * retryContext.previousRetryCount, 120_000);
				},
			})
			.build();
	}

	public async start() {
		console.log(`Starting SignalR (http://${this.ip})`);

		this.connection = this.buildConnection(`http://${this.ip}/fieldMonitorHub`, "fieldMonitor", () => {
			signalRConnectionStatus = HubConnectionState.Reconnecting;
			console.warn("Retrying fieldMonitor connection...");
		});

		this.infrastructureConnection = this.buildConnection(
			`http://${this.ip}/infrastructureHub`,
			"infrastructure",
			() => console.log("Retrying infrastructure connection..."),
		);

		this.ftaAppHubConnection = this.buildConnection(`http://${this.ip}/ftaAppHub`, "ftaAppHub", () =>
			console.log("Retrying ftaAppHub connection..."),
		);

		// Only opened when the score autofill is on - it is the one hub we ever
		// send to, and an idle connection per extension is load FMS does not need.
		this.gameSpecificConnection = this.scoreAutofill
			? this.buildConnection(`http://${this.ip}/gameSpecificHub`, "gameSpecific", () =>
					console.log("Retrying gameSpecificHub connection..."),
				)
			: null;

		if (this.statusInterval) clearInterval(this.statusInterval);
		this.statusInterval = setInterval(() => {
			signalRConnectionStatus = this.connection?.state ?? HubConnectionState.Disconnected;
		}, 5000);

		// #region fieldMonitorHub

		this.connection.on("matchstatusinfochanged", async (data) => {
			switch (data.MatchState) {
				case 0:
				case 1:
					break;
				case "WaitingForPrestart":
				case "WaitingForPrestartTO":
					this.frame.field = FieldState.READY_TO_PRESTART;
					break;
				case "Prestarting":
				case "PrestartingTO":
					this.frame.field = FieldState.PRESTART_INITIATED;
					break;
				case "WaitingForSetAudience":
				case "WaitingForSetAudienceTO":
				case "WaitingForMatchPreview":
				case "WaitingForMatchPreviewTO":
					this.frame.field = FieldState.PRESTART_COMPLETED;
					this.resetTowers();
					this.frame.match = data.MatchNumber;
					this.frame.play = data.PlayNumber;
					this.frame.level = data.Level;
					this.emit("cycleTime", "prestart", "");
					break;
				case "WaitingForMatchReady":
					this.frame.field = FieldState.MATCH_NOT_READY;
					break;
				case "WaitingForMatchStart":
					this.frame.field = FieldState.MATCH_READY;
					this.emit("cycleTime", "matchReady", "");
					break;
				case "GameSpecific":
					this.frame.field = FieldState.UNKNOWN;
					break;
				case "MatchAuto":
					this.frame.field = FieldState.MATCH_RUNNING_AUTO;
					this.emit("cycleTime", "start", "");
					break;
				case "MatchTransition":
					this.frame.field = FieldState.MATCH_TRANSITIONING;
					break;
				case "MatchTeleop":
					this.frame.field = FieldState.MATCH_RUNNING_TELEOP;
					break;
				case "WaitingForCommit":
					this.frame.field = FieldState.MATCH_OVER;
					this.emit("cycleTime", "end", "");
					// Not awaited: a slow or hung hub call must not hold up the
					// match log upload below.
					void this.autofillUnsetScores(data.Level, data.MatchNumber, data.PlayNumber);
					setTimeout(async () => await uploadMatchLogs(), 3000);
					break;
				case "WaitingForPostResults":
					this.frame.field = FieldState.READY_FOR_POST_RESULT;
					this.emit("cycleTime", "scoresPosted", "");
					await uploadMatchLogs();
					// Re-post the schedule so the just-posted final scores are captured.
					this.emit("sendSchedule");
					break;
				case "TournamentLevelComplete":
					this.frame.field = FieldState.UNKNOWN;
					break;
				case "MatchCancelled":
					this.frame.field = FieldState.MATCH_ABORTED;
					setTimeout(async () => await uploadMatchLogs(), 3000);
					break;
			}

			this.frame.match = data.MatchNumber;
		});

		this.connection.on("fieldmonitordatachanged", (data: SignalRMonitorFrame[]) => {
			for (let i = 0; i < data.length; i++) {
				const team: ROBOT = ((data[i].Alliance === "Red" ? "red" : "blue") +
					FMSEnums.StationType[data[i].Station]) as ROBOT;

				this.frame[team] = {
					number: data[i].TeamNumber,
					ds: this.dsState(data[i]),
					radio: data[i].RadioLink,
					rio: data[i].RIOLink,
					code: data[i].LinkActive,
					bwu: data[i].DataRateTotal,
					battery: data[i].Battery,
					ping: data[i].AverageTripTime,
					packets: data[i].LostPackets,
					MAC: data[i].MACAddress,
					RX: data[i].RxRate,
					RXMCS: data[i].RxMCS,
					TX: data[i].TxRate,
					TXMCS: data[i].TxMCS,
					SNR: data[i].SNR,
					noise: data[i].Noise,
					signal: data[i].Signal,
					versionmm: this.frame[team].versionmm ?? false,
					enabled: this.enableState(data[i]),
					radioConnected: data[i].RadioConnectedToAp || null,
					radioConnectionQuality: data[i].RadioConnectionQuality || null,
				};
			}

			this.frame.frameTime = Date.now();
			this.emit("frame", this.frame);
		});

		this.connection.on("scheduleaheadbehindchanged", (data) => {
			this.frame.time = data;
		});

		this.connection.onreconnecting(() => console.log("fieldMonitor connection lost, reconnecting"));
		this.connection.onclose(() => console.log("fieldMonitor connection closed"));

		// #region infrastructureHub

		this.infrastructureConnection.on("robotversiondatachanged", (data) => {
			const team: ROBOT = ((data.Alliance === "Red" ? "red" : "blue") +
				data.Station.replace("Station", "")) as ROBOT;
			this.frame[team].versionData = data.Versions;
		});

		this.infrastructureConnection.on("activetournamentlevelchanged", () => {
			this.emit("sendSchedule");
		});

		this.infrastructureConnection.on("plc_match_status_changed", (data) => {
			if (data.RefDone) this.emit("cycleTime", "refsDone", "");
		});

		this.infrastructureConnection.on("lastcycletimecalculated", (data) => {
			this.frame.lastCycleTime = data;
			this.emit("cycleTime", "lastCycleTime", data);
		});

		this.infrastructureConnection.on("scheduleaheadbehindchanged", (data) => {
			this.frame.time = data;
		});

		this.infrastructureConnection.onreconnecting(() => console.log("infrastructure connection lost, reconnecting"));
		this.infrastructureConnection.onclose(() => console.log("infrastructure connection closed"));

		// #region ftaAppHub

		this.ftaAppHubConnection.on("noteadded", (note: FTANoteRecord) => {
			this.emit("noteChanged", "added", normalizeFmsNote(note));
		});

		this.ftaAppHubConnection.on("noteupdated", (note: FTANoteRecord) => {
			this.emit("noteChanged", "updated", normalizeFmsNote(note));
		});

		this.ftaAppHubConnection.on("notereopened", (note: FTANoteRecord) => {
			this.emit("noteChanged", "reopened", normalizeFmsNote(note));
		});

		this.ftaAppHubConnection.on("noteresolved", (note: FTANoteRecord) => {
			this.emit("noteChanged", "resolved", normalizeFmsNote(note));
		});

		this.ftaAppHubConnection.on("notedeleted", (note: FTANoteRecord) => {
			this.emit("noteChanged", "deleted", normalizeFmsNote(note));
		});

		this.ftaAppHubConnection.onreconnecting(() => console.log("ftaAppHub connection lost, reconnecting"));
		this.ftaAppHubConnection.onclose(() => console.log("ftaAppHub connection closed"));

		// #region gameSpecificHub

		// The tablets' changes are relayed to every client, so this is how we
		// learn which towers a ref has already picked. FMS itself never answers
		// with the current state - its RequestUpdate handlers return
		// Task.CompletedTask - and nothing in the REST API exposes the live,
		// uncommitted scoring view models, so this stream is the only source.
		for (const alliance of ["Red", "Blue"] as const) {
			this.gameSpecificConnection?.on(`${alliance}ScoringElementsChanged`, (data: any) => {
				mergeTowerData(this.towers[alliance].auto, data?.AutoRobotData ?? data?.autoRobotData);
				mergeTowerData(this.towers[alliance].endgame, data?.EndgameRobotData ?? data?.endgameRobotData);
			});
		}

		this.gameSpecificConnection?.onreconnecting(() => console.log("gameSpecificHub connection lost, reconnecting"));
		this.gameSpecificConnection?.onclose(() => console.log("gameSpecificHub connection closed"));

		return Promise.all([
			this.connection.start(),
			this.infrastructureConnection.start(),
			this.ftaAppHubConnection.start().catch(() => {
				// ftaAppHub is optional; swallow connection errors so the rest of SignalR still starts
				console.warn("ftaAppHub connection failed to start (no FMS event password configured?)");
			}),
			this.gameSpecificConnection?.start().catch(() => {
				// Also optional; without it the autofill just does nothing.
				console.warn("gameSpecificHub connection failed to start");
			}) ?? Promise.resolve(),
		]).catch(console.log);
	}

	public async stop() {
		if (this.statusInterval) {
			clearInterval(this.statusInterval);
			this.statusInterval = null;
		}
		const stops: Promise<void>[] = [];
		if (this.connection) {
			stops.push(this.connection.stop());
			this.connection = null;
		}
		if (this.infrastructureConnection) {
			stops.push(this.infrastructureConnection.stop());
			this.infrastructureConnection = null;
		}
		if (this.ftaAppHubConnection) {
			stops.push(this.ftaAppHubConnection.stop());
			this.ftaAppHubConnection = null;
		}
		if (this.gameSpecificConnection) {
			stops.push(this.gameSpecificConnection.stop());
			this.gameSpecificConnection = null;
		}
		await Promise.allSettled(stops);
		signalRConnectionStatus = HubConnectionState.Disconnected;
		console.log("SignalR stopped");
	}

	// #region Helpers

	private dsState(data: SignalRMonitorFrame): DSState {
		if (data.IsBypassed) return DSState.BYPASS;
		if (data.IsEStopped) return DSState.ESTOP;
		if (data.IsAStopped && this.frame.field === FieldState.MATCH_RUNNING_AUTO) return DSState.ASTOP;
		if (data.Connection) {
			if (data.DSLinkActive) return DSState.GREEN;
			if (data.StationStatus === "WrongStation") return DSState.MOVE_STATION; // M = move to another station
			if (data.StationStatus === "WrongMatch") return DSState.WAITING; // W = wrong match / waiting
			if (data.StationStatus === "Waiting") return DSState.WAITING;
			return DSState.GREEN_X;
		}
		return DSState.RED;
	}

	private enableState(data: SignalRMonitorFrame): EnableState {
		if (data.IsEStopped) return EnableState.ESTOP;
		if (data.IsAStopPressed) return EnableState.ASTOP;
		if (data.IsEnabled) {
			if (data.IsAuto) return EnableState.GREEN_A;
			return EnableState.GREEN_T;
		}
		return EnableState.RED;
	}
}
