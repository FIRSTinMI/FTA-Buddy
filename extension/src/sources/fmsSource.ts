import {
	getAlliances,
	getCurrentMatch,
	getEventCode,
	getScheduleBreakdown,
	getTeamNumbers,
	setFmsEventPassword,
} from "../fmsapi";
import { SignalR } from "../signalR";
import { uploadAllUnimportedMatchLogs, uploadMatchLogs } from "../trpc";
import type { FieldDataSource, MatchRef, PlayoffAllianceRoster, ScheduleResult } from "./types";

/**
 * The official FMS source: SignalR realtime stream plus the FMS REST lookups.
 * This is a thin adapter so `background.ts` can treat FMS and Cheesy Arena
 * identically through {@link FieldDataSource}. Behaviour is unchanged from the
 * original direct-`fmsapi` wiring.
 */
export class FmsSource extends SignalR implements FieldDataSource {
	public readonly supportsNotes = true;
	private readonly fmsHost: string;

	constructor(ip: string, version: string) {
		super(ip, version);
		this.fmsHost = ip;
	}

	/** Narrow SignalR's `Promise<void | [...]>` start return to `Promise<void>`. */
	public async start(): Promise<void> {
		await super.start();
	}

	public async ping(): Promise<boolean> {
		try {
			const controller = new AbortController();
			setTimeout(() => controller.abort(), 500);
			const res = await fetch(`http://${this.fmsHost}/FieldMonitor`, { signal: controller.signal });
			return res.ok;
		} catch {
			return false;
		}
	}

	public getConnectionStatus(): string {
		return this.connection?.state ?? "Unknown";
	}

	public getCurrentMatch(): Promise<MatchRef> {
		return getCurrentMatch();
	}

	public getScheduleBreakdown(): Promise<ScheduleResult> {
		return getScheduleBreakdown();
	}

	public getAlliances(): Promise<PlayoffAllianceRoster[]> {
		return getAlliances();
	}

	public getTeamNumbers(): Promise<number[]> {
		return getTeamNumbers();
	}

	public getEventCode(): Promise<string> {
		return getEventCode();
	}

	public uploadMatchLogs(): Promise<void> {
		return uploadMatchLogs();
	}

	public uploadAllUnimportedMatchLogs(onProgress?: (current: number, total: number) => void): Promise<void> {
		return uploadAllUnimportedMatchLogs(onProgress);
	}

	public setFmsEventPassword(password: string | null): void {
		setFmsEventPassword(password);
	}
}
