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
} from "../../shared/types";
import { uploadMatchLogs } from "./trpc";

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

type SignalREventMap = {
	/** Emitted every time a field monitor frame is processed. */
	frame: [frame: PartialMonitorFrame];
	/** Emitted for match cycle time milestones. */
	cycleTime: [type: "lastCycleTime" | "prestart" | "start" | "end" | "refsDone" | "scoresPosted", time: string];
	/** Emitted when the active tournament level changes and the schedule should be re-fetched. */
	sendSchedule: [];
	/** Emitted when a note is added/updated/resolved/etc on ftaAppHub. */
	noteChanged: [action: "added" | "updated" | "reopened" | "resolved" | "deleted", note: FTANoteRecord];
};

class TypedEventEmitter<T extends Record<string, any[]>> {
	private _listeners = new Map<keyof T, Set<(...args: any[]) => void>>();

	on<K extends keyof T>(event: K, listener: (...args: T[K]) => void): this {
		if (!this._listeners.has(event)) this._listeners.set(event, new Set());
		this._listeners.get(event)!.add(listener as (...args: any[]) => void);
		return this;
	}

	off<K extends keyof T>(event: K, listener: (...args: T[K]) => void): this {
		this._listeners.get(event)?.delete(listener as (...args: any[]) => void);
		return this;
	}

	protected emit<K extends keyof T>(event: K, ...args: T[K]): void {
		this._listeners.get(event)?.forEach((l) => l(...args));
	}
}

export class SignalR extends TypedEventEmitter<SignalREventMap> {
	public connection: HubConnection | null = null;
	public infrastructureConnection: HubConnection | null = null;
	public ftaAppHubConnection: HubConnection | null = null;

	public frame: PartialMonitorFrame = DEFAULT_MONITOR;
	private ip: string;

	private statusInterval: ReturnType<typeof setInterval> | null = null;

	constructor(ip: string, version: string) {
		super();
		this.ip = ip;
		this.frame.version = version;
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
					setTimeout(async () => await uploadMatchLogs(), 3000);
					break;
				case "WaitingForPostResults":
					this.frame.field = FieldState.READY_FOR_POST_RESULT;
					this.emit("cycleTime", "scoresPosted", "");
					await uploadMatchLogs();
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

		return Promise.all([
			this.connection.start(),
			this.infrastructureConnection.start(),
			this.ftaAppHubConnection.start().catch(() => {
				// ftaAppHub is optional; swallow connection errors so the rest of SignalR still starts
				console.warn("ftaAppHub connection failed to start (no FMS event password configured?)");
			}),
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
			if (data.StationStatus === "WrongStation") return DSState.MOVE_STATION;
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
