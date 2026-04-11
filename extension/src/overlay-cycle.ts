/**
 * overlay-cycle.ts - Local cycle time tracking for the extension overlay.
 *
 * Tracks field state transitions (PRESTART_COMPLETED → MATCH_RUNNING_AUTO →
 * READY_FOR_POST_RESULT / MATCH_OVER) to compute current and last cycle times.
 * No server connection required - purely derived from live Angular data.
 */

import { FieldState } from "../../shared/types";

export interface CycleTimeState {
	prestartAt: number | null;
	matchStartAt: number | null;
	lastCycleMs: number | null;
	bestCycleMs: number | null;
	cycleTimes: number[]; // last 10 completed cycles
	prevFieldState: FieldState | null;
}

export function makeCycleTimeState(): CycleTimeState {
	return {
		prestartAt: null,
		matchStartAt: null,
		lastCycleMs: null,
		bestCycleMs: null,
		cycleTimes: [],
		prevFieldState: null,
	};
}

export function updateCycleTimeState(field: FieldState, state: CycleTimeState): void {
	if (field === state.prevFieldState) return;
	const prev = state.prevFieldState;
	state.prevFieldState = field;

	if (field === FieldState.PRESTART_COMPLETED) {
		state.prestartAt = Date.now();
	} else if (field === FieldState.MATCH_RUNNING_AUTO) {
		state.matchStartAt = Date.now();
	} else if (
		(field === FieldState.READY_FOR_POST_RESULT || field === FieldState.MATCH_OVER) &&
		state.prestartAt !== null &&
		prev !== FieldState.READY_FOR_POST_RESULT // avoid double-counting
	) {
		const cycleMs = Date.now() - state.prestartAt;
		state.lastCycleMs = cycleMs;
		state.cycleTimes.push(cycleMs);
		if (state.cycleTimes.length > 10) state.cycleTimes.shift();
		if (state.bestCycleMs === null || cycleMs < state.bestCycleMs) {
			state.bestCycleMs = cycleMs;
		}
		// Clear prestartAt so it doesn't accumulate into the next cycle
		// Keep matchStartAt so T: keeps counting after match ends
		state.prestartAt = null;
	}
}

export function avgCycleMs(state: CycleTimeState): number | null {
	if (state.cycleTimes.length === 0) return null;
	return state.cycleTimes.reduce((a, b) => a + b, 0) / state.cycleTimes.length;
}

export function formatCycleMs(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const m = Math.floor(totalSeconds / 60);
	const s = totalSeconds % 60;
	if (m === 0) return `${s}s`;
	return `${m}m${s.toString().padStart(2, "0")}s`;
}

/** Elapsed ms since prestart, or null if prestart not set. */
export function currentCycleElapsedMs(state: CycleTimeState): number | null {
	if (state.prestartAt === null) return null;
	return Date.now() - state.prestartAt;
}

/** Elapsed ms since the last match auto-start, or null if never seen one. */
export function currentMatchElapsedMs(state: CycleTimeState): number | null {
	if (state.matchStartAt === null) return null;
	return Date.now() - state.matchStartAt;
}
