import { debugLog } from "./debug-log";

/**
 * Live client subscriber count per event (field-monitor streams on this
 * instance). Every connect and disconnect updates the count, but a row is
 * written only when the count settled on a different value than the last one
 * recorded, after a quiet period, so a reconnect storm is one row.
 */

export const SUBSCRIBER_SETTLE_MS = 10_000;

export interface SubscriberLogEntry {
	eventCode: string;
	from: number;
	to: number;
}

export class SubscriberTracker {
	private counts = new Map<string, number>();
	private logged = new Map<string, number>();
	private timers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(
		private onChange: (entry: SubscriberLogEntry) => void,
		private settleMs = SUBSCRIBER_SETTLE_MS,
	) {}

	/** Add (+1) or remove (-1) a subscriber for an event. */
	adjust(eventCode: string, delta: 1 | -1): void {
		const next = Math.max(0, (this.counts.get(eventCode) ?? 0) + delta);
		if (next === 0) this.counts.delete(eventCode);
		else this.counts.set(eventCode, next);

		const pending = this.timers.get(eventCode);
		if (pending) clearTimeout(pending);
		const timer = setTimeout(() => this.settle(eventCode), this.settleMs);
		// Never keep the process alive for a log row.
		(timer as { unref?: () => void }).unref?.();
		this.timers.set(eventCode, timer);
	}

	current(eventCode: string): number {
		return this.counts.get(eventCode) ?? 0;
	}

	private settle(eventCode: string): void {
		this.timers.delete(eventCode);
		const to = this.counts.get(eventCode) ?? 0;
		const from = this.logged.get(eventCode) ?? 0;
		if (to === from) return;
		if (to === 0) this.logged.delete(eventCode);
		else this.logged.set(eventCode, to);
		this.onChange({ eventCode, from, to });
	}
}

export const subscriberTracker = new SubscriberTracker(({ eventCode, from, to }) => {
	debugLog({
		category: "field-monitor",
		eventCode,
		level: "info",
		message: `Client subscribers ${from} -> ${to}`,
		data: { from, to },
	});
});
