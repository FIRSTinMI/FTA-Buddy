import type { FTANoteRecord } from "../../../shared/fmsApiTypes";
import type { PartialMonitorFrame } from "../../../shared/types";

/**
 * Events emitted by any field data source (FMS SignalR, Cheesy Arena, ...).
 * Keeping this shared lets `background.ts` consume every source identically.
 */
export type SourceEventMap = {
	/** Emitted every time a field monitor frame is processed. */
	frame: [frame: PartialMonitorFrame];
	/** Emitted for match cycle time milestones. */
	cycleTime: [
		type: "lastCycleTime" | "prestart" | "matchReady" | "start" | "end" | "refsDone" | "scoresPosted",
		time: string,
	];
	/** Emitted when the active tournament level changes and the schedule should be re-fetched. */
	sendSchedule: [];
	/** Emitted when a note is added/updated/resolved/etc (FMS ftaAppHub only). */
	noteChanged: [action: "added" | "updated" | "reopened" | "resolved" | "deleted", note: FTANoteRecord];
};

export class TypedEventEmitter<T extends Record<string, any[]>> {
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
