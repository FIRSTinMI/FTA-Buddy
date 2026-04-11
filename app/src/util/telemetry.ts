import { trpc } from "../main";

interface TelemetryEvent {
	event_type: string;
	event_code?: string;
	metadata?: Record<string, unknown>;
}

const queue: TelemetryEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function track(event_type: string, event_code?: string, metadata?: Record<string, unknown>) {
	queue.push({ event_type, event_code, metadata });
	if (!flushTimer) {
		flushTimer = setTimeout(flush, 30_000);
	}
}

function flush() {
	if (queue.length === 0) return;
	const batch = queue.splice(0, 20);
	flushTimer = null;
	trpc.telemetry.batchTrack.mutate({ events: batch }).catch(() => {});
}

if (typeof window !== "undefined") {
	window.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") flush();
	});
}
