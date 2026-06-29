import {
	DSState,
	EnableState,
	FieldState,
	type FMSLogFrame,
	type PartialRobotInfo,
	type TournamentLevel,
} from "../../../shared/types";
import {
	type CheesyAllianceStation,
	CheesyMatchState,
	CheesyMatchType,
} from "./cheesyArenaTypes";

/**
 * Pure mappers from Cheesy Arena's wire shapes onto FTA-Buddy's internal model.
 * No side effects, so these can be unit-tested against captured fixtures.
 */

/** Cheesy Arena ConnectionQuality (1-4) -> FTA-Buddy radio quality label. */
export function mapConnectionQuality(q: number | undefined): PartialRobotInfo["radioConnectionQuality"] {
	switch (q) {
		case 1:
			return "Caution";
		case 2:
			return "Warning";
		case 3:
			return "Good";
		case 4:
			return "Excellent";
		default:
			return null;
	}
}

/** Cheesy Arena MatchType -> FTA-Buddy tournament level. */
export function mapLevel(type: CheesyMatchType): TournamentLevel {
	switch (type) {
		case CheesyMatchType.Practice:
			return "Practice";
		case CheesyMatchType.Qualification:
			return "Qualification";
		case CheesyMatchType.Playoff:
			return "Playoff";
		default:
			return "None";
	}
}

/**
 * Map a Cheesy Arena MatchState to a FTA-Buddy FieldState. Note that the
 * prestart and scores-posted edges come from the `matchLoad` / `scorePosted`
 * notifiers (handled in the source), not from MatchState.
 */
export function mapFieldState(state: CheesyMatchState, canStartMatch: boolean): FieldState {
	switch (state) {
		case CheesyMatchState.PreMatch:
			return canStartMatch ? FieldState.MATCH_READY : FieldState.MATCH_NOT_READY;
		case CheesyMatchState.StartMatch:
		case CheesyMatchState.AutoPeriod:
			return FieldState.MATCH_RUNNING_AUTO;
		case CheesyMatchState.PausePeriod:
			return FieldState.MATCH_TRANSITIONING;
		case CheesyMatchState.TeleopPeriod:
			return FieldState.MATCH_RUNNING_TELEOP;
		case CheesyMatchState.PostMatch:
			return FieldState.MATCH_OVER;
		case CheesyMatchState.TimeoutActive:
		case CheesyMatchState.PostTimeout:
			return FieldState.MATCH_NOT_READY;
		default:
			return FieldState.UNKNOWN;
	}
}

function dsState(station: CheesyAllianceStation, fieldState: FieldState): DSState {
	const dsConn = station.DsConn;
	if (station.Bypass) return DSState.BYPASS;
	if (station.EStop || dsConn?.EStop) return DSState.ESTOP;
	if ((station.AStop || dsConn?.AStop) && fieldState === FieldState.MATCH_RUNNING_AUTO) return DSState.ASTOP;
	if (dsConn?.DsLinked) {
		// Cheesy Arena has no GREEN_X / WAITING sub-states; a linked DS in the
		// wrong station is the one nuance it exposes.
		if (dsConn.WrongStation) return DSState.MOVE_STATION;
		return DSState.GREEN;
	}
	return DSState.RED;
}

function enableState(station: CheesyAllianceStation): EnableState {
	const dsConn = station.DsConn;
	if (station.EStop || dsConn?.EStop) return EnableState.ESTOP;
	if (station.AStop || dsConn?.AStop) return EnableState.ASTOP;
	if (dsConn?.Enabled) return dsConn.Auto ? EnableState.GREEN_A : EnableState.GREEN_T;
	return EnableState.RED;
}

/** Map one Cheesy Arena alliance station to a FTA-Buddy robot frame. */
export function mapRobot(station: CheesyAllianceStation, fieldState: FieldState): PartialRobotInfo {
	const dsConn = station.DsConn;
	const wifi = station.WifiStatus;
	return {
		number: dsConn?.TeamId || station.Team?.Id || 0,
		ds: dsState(station, fieldState),
		radio: dsConn?.RadioLinked ?? false,
		rio: dsConn?.RioLinked ?? false,
		code: dsConn?.RobotLinked ?? false,
		enabled: enableState(station),
		bwu: wifi?.MBits ?? 0,
		battery: dsConn?.BatteryVoltage ?? 0,
		ping: dsConn?.DsRobotTripTimeMs ?? 0,
		packets: dsConn?.MissedPacketCount ?? 0,
		// Cheesy Arena does not expose these wireless details.
		MAC: null,
		RX: wifi?.RxRate ?? null,
		RXMCS: null,
		TX: wifi?.TxRate ?? null,
		TXMCS: null,
		SNR: wifi?.SignalNoiseRatio ?? null,
		noise: null,
		signal: null,
		versionmm: false,
		radioConnected: wifi?.RadioLinked ?? null,
		radioConnectionQuality: mapConnectionQuality(wifi?.ConnectionQuality),
	};
}

/** Build one match-log frame for a station from a live arenaStatus snapshot. */
export function mapLogFrame(
	station: CheesyAllianceStation,
	timeStamp: string,
	matchTimeSec: number,
	auto: boolean,
): FMSLogFrame {
	const dsConn = station.DsConn;
	const wifi = station.WifiStatus;
	return {
		timeStamp,
		matchTimeBase: 0,
		matchTime: matchTimeSec,
		auto,
		dsLinkActive: dsConn?.DsLinked ?? false,
		enabled: dsConn?.Enabled ?? false,
		aStopPressed: station.AStop || (dsConn?.AStop ?? false),
		eStopPressed: station.EStop || (dsConn?.EStop ?? false),
		linkActive: dsConn?.RobotLinked ?? false,
		radioLink: dsConn?.RadioLinked ?? false,
		rioLink: dsConn?.RioLinked ?? false,
		averageTripTime: dsConn?.DsRobotTripTimeMs ?? 0,
		lostPackets: dsConn?.MissedPacketCount ?? 0,
		sentPackets: 0,
		battery: dsConn?.BatteryVoltage ?? 0,
		brownout: false,
		signal: null,
		noise: null,
		snr: wifi?.SignalNoiseRatio ?? null,
		txRate: wifi?.TxRate ?? null,
		txMCS: null,
		rxRate: wifi?.RxRate ?? null,
		rxMCS: null,
		dataRateTotal: wifi?.MBits ?? 0,
	};
}

/**
 * Deterministic synthetic fmsMatchId so the server's id-keyed dedup is stable
 * across reconnects (Cheesy Arena has no FMS match id).
 */
export function buildFmsMatchId(
	eventCode: string,
	level: TournamentLevel,
	matchNumber: number,
	playNumber: number,
): string {
	return `cheesy-${eventCode}-${level}-${matchNumber}-${playNumber}`;
}
