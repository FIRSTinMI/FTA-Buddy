<script lang="ts">
	import { Button, Toggle } from "flowbite-svelte";
	import Icon from "@iconify/svelte";
	import { onDestroy, onMount } from "svelte";
	import { POWER_HIGH_CURRENT, POWER_LOW_VOLTAGE, type PowerTelemetry } from "../../../shared/types";
	import { trpc } from "../main";
	import { eventStore } from "../stores/event";
	import { userStore as user } from "../stores/user";
	import { echarts, type ECharts, type ECOption } from "../util/echarts";

	/** Seconds of live history held in memory and drawn. */
	const LIVE_WINDOW_S = 60;
	/** A monitor that has said nothing for this long is shown as disconnected. */
	const STALE_MS = 5000;
	/** Redraw cadence. The stream is 2 Hz per monitor; redrawing on every message is wasted work. */
	const REDRAW_MS = 500;

	const SERIES_COLORS = ["#2bb1cf", "#fc7425", "#780aff", "#22c55e", "#cf0048", "#ffd000"];

	interface LivePoint {
		ts: number;
		volts: number;
		amps: number;
	}

	interface MonitorState {
		id: string;
		ip?: string;
		last: PowerTelemetry | null;
		lastAt: number;
		points: LivePoint[];
	}

	let monitors = $state<Record<string, MonitorState>>({});
	let monitorIds = $derived(Object.keys(monitors).sort());
	let now = $state(Date.now());

	let showEvent = $state(false);
	let summary = $state<Awaited<ReturnType<typeof trpc.power.summary.query>>>([]);
	let summaryError = $state("");
	let loadingEvent = $state(false);

	let ampsContainer: HTMLDivElement;
	let voltsContainer: HTMLDivElement;
	let eventContainer: HTMLDivElement;
	let ampsChart: ECharts | undefined;
	let voltsChart: ECharts | undefined;
	let eventChart: ECharts | undefined;
	let redrawTimer: ReturnType<typeof setInterval> | undefined;
	let observer: ResizeObserver | undefined;

	function colorFor(id: string) {
		return SERIES_COLORS[monitorIds.indexOf(id) % SERIES_COLORS.length];
	}

	function isConnected(m: MonitorState) {
		return now - m.lastAt < STALE_MS;
	}

	/** Fold one reading into its monitor, dropping anything older than the live window. */
	function ingest(telemetry: PowerTelemetry) {
		if (!telemetry?.id) return;
		const existing = monitors[telemetry.id];
		const state: MonitorState = existing ?? { id: telemetry.id, last: null, lastAt: 0, points: [] };

		state.last = telemetry;
		state.lastAt = telemetry.ts || Date.now();
		if (telemetry.ip) state.ip = telemetry.ip;

		if (telemetry.ok && telemetry.v !== null && telemetry.a !== null) {
			state.points.push({ ts: state.lastAt, volts: telemetry.v, amps: telemetry.a });
			const cutoff = state.lastAt - LIVE_WINDOW_S * 1000;
			while (state.points.length > 0 && state.points[0].ts < cutoff) state.points.shift();
		}

		monitors = { ...monitors, [telemetry.id]: state };
	}

	/**
	 * Telemetry from the extension on this machine. The page cannot reach the
	 * monitors itself - they are plain HTTP on the event network and this is an
	 * HTTPS origin - so the extension forwards every reading into the window.
	 */
	function handleWindowMessage(evt: MessageEvent) {
		if (evt.source !== window) return;
		if (evt.data?.source !== "ext" || evt.data?.type !== "powerTelemetry") return;
		ingest(evt.data.telemetry as PowerTelemetry);
	}

	function liveOption(field: "amps" | "volts"): ECOption {
		const isAmps = field === "amps";
		const threshold = isAmps ? POWER_HIGH_CURRENT : POWER_LOW_VOLTAGE;

		return {
			grid: { left: 48, right: 12, top: 12, bottom: 28 },
			xAxis: {
				type: "time",
				min: now - LIVE_WINDOW_S * 1000,
				max: now,
				axisLabel: {
					formatter: (value: number) => {
						const d = new Date(value);
						return `${d.getMinutes().toString().padStart(2, "0")}:${d
							.getSeconds()
							.toString()
							.padStart(2, "0")}`;
					},
				},
			},
			yAxis: {
				type: "value",
				name: isAmps ? "Amps" : "Volts",
				nameTextStyle: { fontSize: 11 },
				min: isAmps ? 0 : (value: { min: number }) => Math.min(105, Math.floor(value.min - 2)),
				max: isAmps
					? (value: { max: number }) => Math.max(POWER_HIGH_CURRENT + 2, Math.ceil(value.max + 2))
					: (value: { max: number }) => Math.max(126, Math.ceil(value.max + 2)),
				splitLine: { show: true },
			},
			tooltip: {
				trigger: "axis",
				axisPointer: { type: "cross" },
				confine: true,
				valueFormatter: (value) => `${Number(value).toFixed(isAmps ? 2 : 1)}${isAmps ? "A" : "V"}`,
			},
			series: monitorIds.map((id, index) => ({
				name: id,
				type: "line" as const,
				showSymbol: false,
				lineStyle: { color: colorFor(id), width: 2 },
				itemStyle: { color: colorFor(id) },
				data: monitors[id].points.map((p) => [p.ts, isAmps ? p.amps : p.volts]),
				// The threshold line goes on the first series only; one line, not one per monitor.
				markLine:
					index === 0
						? {
								silent: true,
								symbol: "none",
								lineStyle: { color: "#ef4444", type: "dashed" as const, width: 1 },
								label: { formatter: isAmps ? `${threshold}A` : `${threshold}V`, fontSize: 10 },
								data: [{ yAxis: threshold }],
							}
						: undefined,
			})) as ECOption["series"],
			animation: false,
		};
	}

	function redraw() {
		now = Date.now();
		ampsChart?.setOption(liveOption("amps"), { replaceMerge: ["series"] });
		voltsChart?.setOption(liveOption("volts"), { replaceMerge: ["series"] });
	}

	/** Whole-event current draw, bucketed by the server to something a chart can hold. */
	async function loadEvent() {
		loadingEvent = true;
		summaryError = "";
		try {
			const [history, totals] = await Promise.all([
				trpc.power.history.query({ bucketSeconds: 30 }),
				trpc.power.summary.query(),
			]);
			summary = totals;

			const ids = Object.keys(history.monitors).sort();
			const option: ECOption = {
				grid: { left: 48, right: 12, top: 12, bottom: 56 },
				xAxis: { type: "time" },
				yAxis: { type: "value", name: "Amps", nameTextStyle: { fontSize: 11 }, min: 0 },
				tooltip: {
					trigger: "axis",
					axisPointer: { type: "cross" },
					confine: true,
					valueFormatter: (value) => `${Number(value).toFixed(2)}A`,
				},
				dataZoom: [
					{ type: "inside", xAxisIndex: 0, filterMode: "none" },
					{ type: "slider", xAxisIndex: 0, filterMode: "none", bottom: 8, height: 20 },
				],
				series: ids.map((id) => ({
					name: id,
					type: "line" as const,
					showSymbol: false,
					lineStyle: { color: colorFor(id), width: 1 },
					itemStyle: { color: colorFor(id) },
					// The mean hides the spike that tripped the breaker, so the peak of
					// each bucket is what gets drawn.
					data: history.monitors[id].map((p) => [p.time, p.ampsMax]),
				})) as ECOption["series"],
				animation: false,
			};

			if (!eventChart && eventContainer) eventChart = echarts.init(eventContainer);
			eventChart?.setOption(option, { replaceMerge: ["series"] });
		} catch (err: any) {
			summaryError = err?.message ?? "Could not load event history";
		} finally {
			loadingEvent = false;
		}
	}

	$effect(() => {
		if (showEvent) loadEvent();
	});

	onMount(() => {
		window.addEventListener("message", handleWindowMessage);

		ampsChart = echarts.init(ampsContainer);
		voltsChart = echarts.init(voltsContainer);
		redraw();
		redrawTimer = setInterval(redraw, REDRAW_MS);

		observer = new ResizeObserver(() => {
			ampsChart?.resize();
			voltsChart?.resize();
			eventChart?.resize();
		});
		observer.observe(ampsContainer);

		// Devices without the extension (every phone and tablet at the event) get
		// the same stream relayed by the server.
		const sub = $user.eventToken
			? trpc.power.live.subscribe(undefined, {
					onData: (batch) => {
						for (const telemetry of batch) ingest(telemetry);
					},
					onError: (err) => console.warn("[Power] live subscription error:", err),
				})
			: undefined;

		return () => sub?.unsubscribe();
	});

	onDestroy(() => {
		window.removeEventListener("message", handleWindowMessage);
		if (redrawTimer) clearInterval(redrawTimer);
		observer?.disconnect();
		ampsChart?.dispose();
		voltsChart?.dispose();
		eventChart?.dispose();
	});
</script>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 text-left">
	<div class="flex items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold">Field Power</h1>
			<p class="text-sm text-gray-500">
				{$eventStore.code?.toUpperCase()} - live AC draw from the field power monitors
			</p>
		</div>
		<div class="flex items-center gap-2">
			<span class="text-sm">Whole event</span>
			<Toggle size="small" bind:checked={showEvent} />
		</div>
	</div>

	{#if monitorIds.length === 0}
		<div class="rounded-xl border border-gray-200 bg-white p-6 text-center dark:border-neutral-700 dark:bg-neutral-900">
			<Icon icon="mdi:lightning-bolt-outline" class="mx-auto size-10 text-gray-400" />
			<p class="mt-2 font-semibold">No monitors reporting</p>
			<p class="mt-1 text-sm text-gray-500">
				Turn on <span class="font-medium">Field Power Monitors</span> in the extension popup, then check that
				each board has a link light and a DHCP lease on the event network.
			</p>
		</div>
	{/if}

	<!-- Per-monitor status -->
	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		{#each monitorIds as id}
			{@const m = monitors[id]}
			{@const connected = isConnected(m)}
			{@const lowVolts = connected && m.last?.v !== null && (m.last?.v ?? 999) < POWER_LOW_VOLTAGE}
			{@const highAmps = connected && (m.last?.a ?? 0) > POWER_HIGH_CURRENT}
			<div
				class="rounded-xl border bg-white p-3 dark:bg-neutral-900 {lowVolts || highAmps
					? 'border-red-500'
					: 'border-gray-200 dark:border-neutral-700'}"
			>
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<span
							class="size-2.5 rounded-full {connected ? 'bg-green-500' : 'bg-red-500'}"
							style={connected ? `background-color: ${colorFor(id)}` : ""}
						></span>
						<span class="font-semibold">{id}</span>
					</div>
					<span class="text-xs text-gray-500">{m.ip ?? ""}</span>
				</div>

				{#if !connected}
					<p class="mt-2 text-sm text-red-500">Disconnected</p>
				{:else if m.last && !m.last.ok}
					<p class="mt-2 text-sm text-red-500">Meter not answering</p>
				{:else if m.last}
					<div class="mt-2 grid grid-cols-3 gap-2 text-center">
						<div>
							<div class="text-xl font-bold {lowVolts ? 'text-red-500' : ''}">
								{m.last.v?.toFixed(1)}
							</div>
							<div class="text-xs text-gray-500">Volts</div>
						</div>
						<div>
							<div class="text-xl font-bold {highAmps ? 'text-red-500' : ''}">
								{m.last.a?.toFixed(2)}
							</div>
							<div class="text-xs text-gray-500">Amps</div>
						</div>
						<div>
							<div class="text-xl font-bold">{m.last.w?.toFixed(0)}</div>
							<div class="text-xs text-gray-500">Watts</div>
						</div>
					</div>
					<div class="mt-2 grid grid-cols-3 gap-2 text-center text-xs text-gray-500">
						<div>{m.last.hz?.toFixed(1) ?? "-"} Hz</div>
						<div class:text-amber-500={(m.last.pf ?? 1) < 0.7}>
							{m.last.pf?.toFixed(2) ?? "-"} PF
						</div>
						<div>{m.last.kwh?.toFixed(2) ?? "-"} kWh</div>
					</div>
					{#if m.last.alarm}
						<p class="mt-2 text-sm font-medium text-red-500">Meter over-power alarm</p>
					{/if}
					{#if lowVolts}
						<p class="mt-2 text-sm font-medium text-red-500">
							Voltage below {POWER_LOW_VOLTAGE}V
						</p>
					{/if}
					{#if highAmps}
						<p class="mt-2 text-sm font-medium text-red-500">
							Current above {POWER_HIGH_CURRENT}A
						</p>
					{/if}
				{/if}
			</div>
		{/each}
	</div>

	<!-- Live charts -->
	<div class="flex flex-col gap-4" class:hidden={showEvent}>
		<div class="rounded-xl border border-gray-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
			<div class="mb-1 flex items-center justify-between">
				<h2 class="font-semibold">Current draw</h2>
				<span class="text-xs text-gray-500">last {LIVE_WINDOW_S}s</span>
			</div>
			<div bind:this={ampsContainer} class="h-56 w-full"></div>
		</div>

		<div class="rounded-xl border border-gray-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
			<div class="mb-1 flex items-center justify-between">
				<h2 class="font-semibold">Voltage</h2>
				<span class="text-xs text-gray-500">last {LIVE_WINDOW_S}s</span>
			</div>
			<div bind:this={voltsContainer} class="h-56 w-full"></div>
		</div>
	</div>

	<!-- Whole event -->
	<div class="flex flex-col gap-4" class:hidden={!showEvent}>
		<div class="rounded-xl border border-gray-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
			<div class="mb-1 flex items-center justify-between">
				<h2 class="font-semibold">Peak current, whole event</h2>
				<Button size="xs" color="alternative" onclick={loadEvent} disabled={loadingEvent}>
					{loadingEvent ? "Loading..." : "Refresh"}
				</Button>
			</div>
			<div bind:this={eventContainer} class="h-72 w-full"></div>
			{#if summaryError}
				<p class="text-sm text-red-500">{summaryError}</p>
			{/if}
		</div>

		<div class="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
			<table class="w-full text-sm">
				<thead class="border-b border-gray-200 text-left dark:border-neutral-700">
					<tr>
						<th class="p-2">Monitor</th>
						<th class="p-2 text-right">Energy</th>
						<th class="p-2 text-right">Peak A</th>
						<th class="p-2 text-right">Lowest V</th>
						<th class="p-2 text-right">Avg W</th>
						<th class="p-2 text-right">Peak W</th>
						<th class="p-2 text-right">Worst PF</th>
						<th class="p-2 text-right">Alarms</th>
					</tr>
				</thead>
				<tbody>
					{#each summary as row}
						<tr class="border-b border-gray-100 last:border-0 dark:border-neutral-800">
							<td class="p-2 font-medium">{row.monitorId}</td>
							<td class="p-2 text-right">{row.energyKwh.toFixed(2)} kWh</td>
							<td class="p-2 text-right" class:text-red-500={row.peakAmps > POWER_HIGH_CURRENT}>
								{row.peakAmps.toFixed(1)} A
							</td>
							<td class="p-2 text-right" class:text-red-500={row.minVolts < POWER_LOW_VOLTAGE}>
								{row.minVolts.toFixed(1)} V
							</td>
							<td class="p-2 text-right">{row.avgWatts.toFixed(0)}</td>
							<td class="p-2 text-right">{row.peakWatts.toFixed(0)}</td>
							<td class="p-2 text-right" class:text-amber-500={(row.minPf ?? 1) < 0.7}>
								{row.minPf?.toFixed(2) ?? "-"}
							</td>
							<td class="p-2 text-right" class:text-red-500={row.alarmSeconds > 0}>
								{row.alarmSeconds > 0 ? `${row.alarmSeconds}s` : "-"}
							</td>
						</tr>
					{/each}
					{#if summary.length > 1}
						<tr class="font-semibold">
							<td class="p-2">Total</td>
							<td class="p-2 text-right">
								{summary.reduce((sum, r) => sum + r.energyKwh, 0).toFixed(2)} kWh
							</td>
							<td colspan="5"></td>
						</tr>
					{/if}
					{#if summary.length === 0 && !loadingEvent}
						<tr>
							<td class="p-3 text-center text-gray-500" colspan="7">
								Nothing stored for this event yet.
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
