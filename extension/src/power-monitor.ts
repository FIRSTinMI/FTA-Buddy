import type { PowerTelemetry } from "../../shared/types";

/**
 * Field power monitors (ESP32-P4 + PZEM-004T) on the event network.
 *
 * The page cannot talk to them itself: FTA Buddy is served over HTTPS and the
 * monitors are plain HTTP on a private address, so every browser blocks it as
 * mixed content. The extension is the only piece that can, which is why
 * discovery and streaming live here and the page only ever sees forwarded
 * messages.
 */

/**
 * Event-network subnet. FMS owns 10.0.100.5 and monitors take DHCP leases
 * alongside it, so this is the default - but it is overridable, because a bench
 * test happens on whatever network the bench is on.
 */
export const DEFAULT_SUBNET_PREFIX = "10.0.100";

/** Accepts the first three octets of a /24, e.g. "10.0.100". */
export function isValidSubnetPrefix(prefix: string): boolean {
	const parts = prefix.trim().split(".");
	return parts.length === 3 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

/** The host permissions the sweep needs, read straight from the manifest. */
export function monitorOrigins(): string[] {
	const manifest = chrome.runtime.getManifest() as chrome.runtime.Manifest & {
		optional_host_permissions?: string[];
	};
	return manifest.optional_host_permissions ?? [];
}

const FIRST_HOST = 2;
const LAST_HOST = 254;

/** Per-probe budget. A monitor answers /api/id in single-digit milliseconds; anything slower is not one. */
const PROBE_TIMEOUT_MS = 350;
/** Probes in flight. The whole /24 at once makes Chrome queue them anyway and blows the timeout. */
const PROBE_CONCURRENCY = 48;

/** Backoff between reconnect attempts for a monitor that has dropped. */
const RECONNECT_DELAY_MS = 3_000;
/** A stream that has said nothing for this long is treated as dead, not idle. */
const STALE_STREAM_MS = 5_000;
/** How often to re-sweep once at least one monitor is streaming. */
const RESWEEP_INTERVAL_MS = 5 * 60_000;
/**
 * How often to re-sweep while NOTHING is connected. A sweep that runs before
 * the boards have their DHCP leases finds an empty network, and waiting five
 * minutes to look again reads as broken.
 */
const IDLE_SWEEP_INTERVAL_MS = 20_000;

export interface DiscoveredMonitor {
	id: string;
	ip: string;
}

export interface MonitorStatus extends DiscoveredMonitor {
	connected: boolean;
	lastMessage: number | null;
}

/** Probe one address for the discovery endpoint. Resolves null for anything that is not a monitor. */
async function probe(ip: string): Promise<DiscoveredMonitor | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
	try {
		const res = await fetch(`http://${ip}/api/id`, { signal: controller.signal, cache: "no-store" });
		if (!res.ok) return null;
		const body = (await res.json()) as { type?: string; id?: string };
		if (body?.type !== "pwr-monitor" || !body.id) return null;
		return { id: body.id, ip };
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Sweep the event subnet for power monitors. 253 probes, `PROBE_CONCURRENCY` at
 * a time, so a full sweep costs roughly two seconds even when nothing answers.
 */
export async function sweepSubnet(prefix = DEFAULT_SUBNET_PREFIX): Promise<DiscoveredMonitor[]> {
	const addresses: string[] = [];
	for (let host = FIRST_HOST; host <= LAST_HOST; host++) addresses.push(`${prefix}.${host}`);

	const found: DiscoveredMonitor[] = [];
	let cursor = 0;

	async function worker() {
		while (cursor < addresses.length) {
			const ip = addresses[cursor++];
			const monitor = await probe(ip);
			if (monitor) found.push(monitor);
		}
	}

	await Promise.all(Array.from({ length: PROBE_CONCURRENCY }, worker));
	return found.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * One SSE connection to one monitor.
 *
 * `EventSource` does not exist in an MV3 service worker, so the stream is read
 * off `fetch` instead and the `data:` lines are parsed here. Where EventSource
 * IS available (a content script, an offscreen document) it is used as-is,
 * because it handles reconnection and retry timing for free.
 */
class MonitorStream {
	private abort: AbortController | null = null;
	private source: EventSource | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private stopped = false;

	lastMessage: number | null = null;

	constructor(
		readonly monitor: DiscoveredMonitor,
		private readonly onTelemetry: (telemetry: PowerTelemetry) => void,
	) {}

	get connected(): boolean {
		return this.lastMessage !== null && Date.now() - this.lastMessage < STALE_STREAM_MS;
	}

	start() {
		this.stopped = false;
		if (typeof EventSource !== "undefined") this.startEventSource();
		else this.startFetchStream().catch(() => this.scheduleReconnect());
	}

	stop() {
		this.stopped = true;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;
		this.source?.close();
		this.source = null;
		this.abort?.abort();
		this.abort = null;
	}

	private handlePayload(raw: string) {
		let parsed: Partial<PowerTelemetry> & { id?: string };
		try {
			parsed = JSON.parse(raw);
		} catch {
			return;
		}
		if (!parsed?.id) return;
		this.lastMessage = Date.now();
		this.onTelemetry({
			id: parsed.id,
			ok: parsed.ok ?? true,
			v: parsed.v ?? null,
			a: parsed.a ?? null,
			w: parsed.w ?? null,
			hz: parsed.hz ?? null,
			pf: parsed.pf ?? null,
			kwh: parsed.kwh ?? null,
			alarm: parsed.alarm ?? false,
			up: parsed.up,
			ts: Date.now(),
			ip: this.monitor.ip,
		});
	}

	private startEventSource() {
		this.source = new EventSource(`http://${this.monitor.ip}/events`);
		this.source.onmessage = (evt) => this.handlePayload(evt.data);
		this.source.onerror = () => {
			// EventSource retries on its own, but a monitor that was unplugged and
			// re-leased a new address never comes back; the re-sweep handles that.
			this.lastMessage = null;
		};
	}

	private async startFetchStream() {
		this.abort = new AbortController();
		const res = await fetch(`http://${this.monitor.ip}/events`, {
			signal: this.abort.signal,
			headers: { accept: "text/event-stream" },
			cache: "no-store",
		});
		if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		while (!this.stopped) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			// SSE frames are separated by a blank line; a frame can carry several
			// data: lines that concatenate.
			let split: number;
			while ((split = buffer.indexOf("\n\n")) !== -1) {
				const frame = buffer.slice(0, split);
				buffer = buffer.slice(split + 2);
				const data = frame
					.split("\n")
					.filter((line) => line.startsWith("data:"))
					.map((line) => line.slice(5).trim())
					.join("");
				if (data) this.handlePayload(data);
			}
		}

		if (!this.stopped) this.scheduleReconnect();
	}

	private scheduleReconnect() {
		if (this.stopped || this.reconnectTimer) return;
		this.lastMessage = null;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			if (!this.stopped) this.start();
		}, RECONNECT_DELAY_MS);
	}
}

/**
 * Discovery + streaming for every monitor at the event. One instance lives in
 * the background service worker for as long as the toggle is on.
 */
export class PowerMonitorManager {
	private streams = new Map<string, MonitorStream>();
	private resweepTimer: ReturnType<typeof setInterval> | null = null;
	private sweeping = false;
	private lastSweepAt = 0;

	constructor(
		private readonly onTelemetry: (telemetry: PowerTelemetry) => void,
		/** Read at each sweep, so changing the setting takes effect on the next one. */
		private readonly getSubnet: () => string = () => DEFAULT_SUBNET_PREFIX,
	) {}

	get running(): boolean {
		return this.resweepTimer !== null;
	}

	async start() {
		if (this.running) return;
		// One timer, two cadences: keep looking hard until something answers,
		// then drop back to an occasional check for a monitor that moved.
		this.resweepTimer = setInterval(() => {
			const idle = this.connectedCount === 0;
			const due = Date.now() - this.lastSweepAt >= (idle ? IDLE_SWEEP_INTERVAL_MS : RESWEEP_INTERVAL_MS);
			if (due) this.discover().catch(console.warn);
		}, IDLE_SWEEP_INTERVAL_MS);
		await this.discover();
	}

	stop() {
		if (this.resweepTimer) clearInterval(this.resweepTimer);
		this.resweepTimer = null;
		for (const stream of this.streams.values()) stream.stop();
		this.streams.clear();
	}

	/** Sweep, then open a stream for anything new. Existing healthy streams are left alone. */
	async discover(): Promise<DiscoveredMonitor[]> {
		if (this.sweeping) return this.list();
		this.sweeping = true;
		this.lastSweepAt = Date.now();
		try {
			const prefix = this.getSubnet();
			const subnet = isValidSubnetPrefix(prefix) ? prefix.trim() : DEFAULT_SUBNET_PREFIX;
			const found = await sweepSubnet(subnet);

			// Drop anything outside the subnet being swept. Without this, changing
			// the setting leaves the old network's monitors streaming forever and
			// the status list shows monitors that are no longer being looked for.
			for (const [id, stream] of this.streams) {
				if (stream.monitor.ip.startsWith(`${subnet}.`)) continue;
				stream.stop();
				this.streams.delete(id);
			}

			for (const monitor of found) {
				const existing = this.streams.get(monitor.id);
				if (existing && existing.monitor.ip === monitor.ip) continue;
				// Same monitor on a new lease: drop the stale stream and re-open.
				existing?.stop();
				const stream = new MonitorStream(monitor, this.onTelemetry);
				this.streams.set(monitor.id, stream);
				stream.start();
			}
			return found;
		} finally {
			this.sweeping = false;
		}
	}

	list(): MonitorStatus[] {
		return [...this.streams.values()].map((s) => ({
			id: s.monitor.id,
			ip: s.monitor.ip,
			connected: s.connected,
			lastMessage: s.lastMessage,
		}));
	}

	get connectedCount(): number {
		return this.list().filter((m) => m.connected).length;
	}
}
