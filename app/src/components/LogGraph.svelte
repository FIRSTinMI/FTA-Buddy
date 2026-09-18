<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import type { FMSLogFrame } from "../../../shared/types";
	import { echarts, type ECharts, type ECOption } from "../util/echarts";

	/**
	 * The station log graph.
	 *
	 * One chart for the whole match, whatever it was recorded by. The field
	 * monitor frames are always here; anything a team uploaded for the same match
	 * is passed in as `overlay` and drawn on the same axis, so a 50 Hz battery
	 * trace from the team's Driver Station log sits directly over the 2 Hz one the
	 * field saw instead of in a second chart underneath.
	 *
	 * That is why the x axis is seconds from match start rather than a frame
	 * index: the two sources sample at different rates and only share a clock.
	 */
	export interface OverlaySeries {
		key: string;
		label: string;
		unit?: string;
		axis: string;
		hz: number | null;
		points: { t: number; v: number | null }[];
	}

	let {
		log,
		matchStartMs,
		overlay = [],
		markT = null,
		hide = [],
	}: {
		log: FMSLogFrame[];
		matchStartMs?: number;
		overlay?: OverlaySeries[];
		/** Field monitor series an uploaded one replaces, e.g. Voltage. */
		hide?: string[];
		/** Seconds from match start to mark, driven by the event log terminal. */
		markT?: number | null;
	} = $props();

	let chartContainer: HTMLDivElement;
	let chart: ECharts;
	let observer: ResizeObserver;

	/**
	 * Seconds from match start for each frame. The frame timestamp is exact where
	 * we have a match start to subtract it from; `matchTime` only ticks once a
	 * second while frames arrive about 600 ms apart, so it is the fallback.
	 */
	let frameT = $derived(
		log.map((f, i) =>
			matchStartMs && f.timeStamp ? (Date.parse(f.timeStamp) - matchStartMs) / 1000 : (f.matchTime ?? i),
		),
	);

	// --- Series definitions ---
	// Metric series shown in legend (indices 0-4)
	const metricSeries = [
		{
			name: "Voltage",
			color: "rgb(255, 99, 132)",
			yAxisIndex: 0,
			field: "battery" as keyof FMSLogFrame,
			hidden: false,
		},
		{
			name: "Ping",
			color: "rgb(54, 162, 235)",
			yAxisIndex: 1,
			field: "averageTripTime" as keyof FMSLogFrame,
			hidden: false,
		},
		{
			name: "Bandwidth",
			color: "rgb(75, 192, 192)",
			yAxisIndex: 2,
			field: "dataRateTotal" as keyof FMSLogFrame,
			hidden: false,
		},
		{
			name: "Signal",
			color: "rgb(153, 102, 255)",
			yAxisIndex: 3,
			field: "signal" as keyof FMSLogFrame,
			hidden: true,
		},
		{ name: "Noise", color: "rgb(255, 159, 64)", yAxisIndex: 4, field: "noise" as keyof FMSLogFrame, hidden: true },
	];

	// Status lane series (hidden from legend, always on yAxisIndex 5)
	const laneSeries = [
		{ name: "Auto", color: "rgb(255, 99, 132)", width: 4, field: (f: FMSLogFrame) => (f.auto ? 1.01 : null) },
		{ name: "Enabled", color: "rgb(54, 162, 235)", width: 4, field: (f: FMSLogFrame) => (f.enabled ? 1.01 : null) },
		{ name: "Code", color: "rgb(153, 102, 155)", width: 1, field: (f: FMSLogFrame) => (f.linkActive ? 1 : null) },
		{ name: "RIO", color: "rgb(255, 159, 64)", width: 1, field: (f: FMSLogFrame) => (f.rioLink ? 1 : null) },
		{ name: "Radio", color: "rgb(75, 192, 192)", width: 1, field: (f: FMSLogFrame) => (f.radioLink ? 1 : null) },
		{ name: "DS", color: "rgb(75, 192, 192)", width: 1, field: (f: FMSLogFrame) => (f.dsLinkActive ? 1 : null) },
	];

	const OVERLAY_COLORS = [
		"rgb(16, 185, 129)",
		"rgb(244, 114, 182)",
		"rgb(250, 204, 21)",
		"rgb(56, 189, 248)",
		"rgb(168, 85, 247)",
		"rgb(248, 113, 113)",
		"rgb(132, 204, 22)",
		"rgb(251, 146, 60)",
	];

	// Custom legend state - tracks which metric series are visible
	let visibleSeries: Record<string, boolean> = $state({});
	for (const s of metricSeries) {
		// svelte-ignore state_referenced_locally
		visibleSeries[s.name] = !s.hidden;
	}

	/**
	 * A series is drawn unless it was switched off in the legend, or unless an
	 * uploaded series measures the same thing and has replaced it.
	 */
	function shown(name: string): boolean {
		return visibleSeries[name] !== false && !hide.includes(name);
	}

	// Y-axis default show state (used to restore after mobile collapse)
	const yAxisDefaults = [
		{ show: true, position: "left" as const, min: 6, max: 14, name: "Voltage", offset: 0 },
		{ show: true, position: "right" as const, min: 0, max: 50, name: "Ping (ms)", offset: 0 },
		{ show: true, position: "right" as const, min: 0, max: 8, name: "Bandwidth (Mbps)", offset: 60 },
		{ show: false, position: "right" as const, min: -100, max: -30, name: "Signal (dBm)", offset: 120 },
		{ show: false, position: "right" as const, min: -100, max: -30, name: "Noise (dBm)", offset: 180 },
		{ show: false, position: "left" as const, min: 0, max: 1.02, name: "", offset: 0 }, // hidden lane axis
	];

	/** Which of the fixed axes an uploaded series belongs on, by unit. */
	const SHARED_AXIS: Record<string, number> = { volts: 0, ms: 1, mbps: 2, db: 3, bool: 5 };

	/** Units with no fixed axis get one appended, one per unit rather than per series. */
	let extraUnits = $derived([
		...new Set(overlay.map((s) => s.axis).filter((axis) => SHARED_AXIS[axis] === undefined)),
	]);

	function overlayAxisIndex(series: OverlaySeries): number {
		const shared = SHARED_AXIS[series.axis];
		return shared !== undefined ? shared : yAxisDefaults.length + extraUnits.indexOf(series.axis);
	}

	function buildOption(): ECOption {
		const series: ECOption["series"] = [
			// Metric series
			...metricSeries.map((s) => ({
				name: s.name,
				type: "line" as const,
				showSymbol: false,
				yAxisIndex: s.yAxisIndex,
				lineStyle: { color: s.color, width: 1, ...(shown(s.name) ? {} : { opacity: 0 }) },
				itemStyle: { color: s.color, ...(shown(s.name) ? {} : { opacity: 0 }) },
				data: log.map((f, i) => {
					const v = f[s.field];
					return v == null ? null : [frameT[i], Number(v)];
				}),
				connectNulls: false,
				silent: !shown(s.name),
				tooltip: { show: shown(s.name) },
			})),
			// Lane series
			...laneSeries.map((s) => ({
				name: s.name,
				type: "line" as const,
				showSymbol: false,
				yAxisIndex: 5,
				lineStyle: { color: s.color, width: s.width },
				itemStyle: { color: s.color },
				data: log.map((f, i) => {
					const v = s.field(f);
					return v == null ? null : [frameT[i], Number(v)];
				}),
				connectNulls: false,
				tooltip: { show: false },
			})),
			...overlay.map((s, i) => {
				const color = OVERLAY_COLORS[i % OVERLAY_COLORS.length];
				const lane = s.axis === "bool";
				// A boolean sits in the lane strip at its own height rather than
				// swinging the full plot between 0 and 1.
				const laneHeight = 0.96 - i * 0.04;
				return {
					name: s.label,
					type: "line" as const,
					step: lane ? ("end" as const) : undefined,
					showSymbol: false,
					yAxisIndex: overlayAxisIndex(s),
					// 50 Hz over a match is about 10,000 points per series. Render in
					// chunks rather than thinning them out.
					progressive: 2000,
					progressiveThreshold: 5000,
					lineStyle: {
						color,
						width: lane ? 4 : 1.5,
						...(visibleSeries[s.label] === false ? { opacity: 0 } : {}),
					},
					itemStyle: { color, ...(visibleSeries[s.label] === false ? { opacity: 0 } : {}) },
					data: s.points.map((p) => (p.v == null ? null : [p.t, lane ? (p.v ? laneHeight : null) : p.v])),
					connectNulls: false,
					silent: visibleSeries[s.label] === false,
					tooltip: { show: visibleSeries[s.label] !== false },
					markLine:
						i === 0 && markT !== null
							? {
									silent: true,
									symbol: "none",
									lineStyle: { color: "#f59e0b", width: 2 },
									label: { formatter: `${markT.toFixed(1)}s`, position: "insideEndTop" as const },
									data: [{ xAxis: markT }],
								}
							: undefined,
				};
			}),
		];

		// A marker with no uploaded series still has to be drawn somewhere.
		if (markT !== null && overlay.length === 0) {
			(series as unknown[]).push({
				name: "mark",
				type: "line",
				data: [],
				silent: true,
				markLine: {
					silent: true,
					symbol: "none",
					lineStyle: { color: "#f59e0b", width: 2 },
					label: { formatter: `${markT.toFixed(1)}s`, position: "insideEndTop" },
					data: [{ xAxis: markT }],
				},
			});
		}

		// Compute which axes should be visible based on series visibility
		const yAxes: unknown[] = yAxisDefaults.map((def, i) => {
			// Lane axis (5) is always hidden; metric axes show if their series is visible AND axis default permits
			const usedByOverlay = overlay.some((s) => overlayAxisIndex(s) === i && visibleSeries[s.label] !== false);
			const axisVisible =
				i === 5
					? false
					: i < metricSeries.length
						? (shown(metricSeries[i].name) || usedByOverlay) && def.show
						: false;
			return {
				type: "value" as const,
				show: isMobile ? (i === 0 ? true : false) : axisVisible,
				position: def.position,
				min: def.min,
				max: def.max,
				name: isMobile ? "" : axisVisible ? def.name : "",
				nameTextStyle: { fontSize: 11 },
				offset: def.offset,
				splitLine: { show: i === 0 }, // only primary axis draws grid lines
				axisLine: { show: axisVisible },
				axisTick: { show: axisVisible },
				axisLabel: { show: isMobile ? i === 0 : axisVisible },
			};
		});
		extraUnits.forEach((unit, i) => {
			const visible = !isMobile && overlay.some((s) => s.axis === unit && visibleSeries[s.label] !== false);
			yAxes.push({
				type: "value" as const,
				show: visible,
				position: "right" as const,
				offset: 240 + i * 60,
				name: visible ? unit : "",
				nameTextStyle: { fontSize: 11 },
				splitLine: { show: false },
				axisLabel: { show: visible },
			});
		});

		return {
			grid: {
				left: 50,
				right: isMobile ? 10 : 80 + extraUnits.length * 60,
				top: 10,
				bottom: 60,
				containLabel: false,
			},
			xAxis: {
				type: "value",
				min: (v: { min: number }) => Math.floor(v.min),
				max: (v: { max: number }) => Math.ceil(v.max),
				axisLabel: { formatter: (v: number) => `${v}` },
			},
			yAxis: yAxes as any,
			series: series as any,
			tooltip: {
				trigger: "axis",
				axisPointer: { type: "cross" },
				confine: true,
				triggerOn: isMobile ? "click" : "mousemove|click",
				formatter: (params: any) => {
					if (!Array.isArray(params) || params.length === 0) return "";
					const metricNames = new Set(metricSeries.map((m) => m.name));
					const fmsParam = params.find((p: any) => metricNames.has(p.seriesName)) ?? params[0];
					const idx = fmsParam?.dataIndex ?? 0;
					const frame = metricNames.has(fmsParam?.seriesName) ? log[idx] : undefined;
					const t = Array.isArray(fmsParam?.value) ? fmsParam.value[0] : undefined;

					let status = "";
					if (frame) {
						if (frame.eStopPressed) {
							status = ' - <span style="color:#ef4444;font-weight:bold">E-STOPPED</span>';
						} else if (frame.aStopPressed) {
							status = ' - <span style="color:#f97316;font-weight:bold">A-STOPPED</span>';
						} else if (!frame.dsLinkActive) {
							status = ' - <span style="color:#ef4444">No DS Link</span>';
						} else if (!frame.radioLink) {
							status = ' - <span style="color:#ef4444">No Radio</span>';
						} else if (!frame.rioLink) {
							status = ' - <span style="color:#ef4444">No RIO</span>';
						} else if (!frame.linkActive) {
							status = ' - <span style="color:#eab308">No Code</span>';
						} else if (!frame.enabled) {
							status = ' - <span style="color:#6b7280">Disabled</span>';
						} else {
							status =
								' - <span style="color:#22c55e">Enabled' +
								(frame.auto ? " (Auto)" : " (Teleop)") +
								"</span>";
						}
					}

					const boolLabels = new Map(overlay.filter((s) => s.axis === "bool").map((s) => [s.label, true]));
					let html = `<div style="text-align:left">`;
					html += `<div style="margin-bottom:4px"><b>${(frame?.matchTime ?? t ?? 0).toFixed ? Number(frame?.matchTime ?? t).toFixed(1) : frame?.matchTime}s</b>${status}</div>`;
					for (const p of params) {
						if (laneSeries.some((l) => l.name === p.seriesName)) continue;
						const value = Array.isArray(p.value) ? p.value[1] : p.value;
						if (value == null) continue;
						const shown = boolLabels.has(p.seriesName)
							? "yes"
							: typeof value === "number"
								? value.toFixed(2)
								: value;
						html += `<div>${p.marker} ${p.seriesName}: <b>${shown}</b></div>`;
					}
					html += `</div>`;
					return html;
				},
			},
			dataZoom: [
				{
					type: "inside",
					xAxisIndex: 0,
					filterMode: "none",
					zoomOnMouseWheel: true,
					moveOnMouseWheel: false,
					moveOnMouseMove: true,
					preventDefaultMouseMove: true,
					minSpan: 5,
				},
				{
					type: "slider",
					xAxisIndex: 0,
					filterMode: "none",
					bottom: 8,
					height: 20,
				},
			],
			animation: false,
		};
	}

	let isMobile = $state(typeof window !== "undefined" && window.innerWidth < 768);

	function handleResize() {
		if (!chart) return;
		const newIsMobile = chartContainer.clientWidth < 768;
		if (newIsMobile !== isMobile) {
			isMobile = newIsMobile;
			chart.setOption(buildOption(), { replaceMerge: ["yAxis"] });
		}
		chart.resize();
	}

	function toggleSeries(name: string) {
		visibleSeries[name] = visibleSeries[name] === false;
		if (chart) {
			chart.setOption(buildOption(), { replaceMerge: ["yAxis", "series"] });
		}
	}

	// A new set of uploaded series, or a moved marker, redraws without a refetch.
	$effect(() => {
		void overlay;
		void markT;
		void hide;
		if (chart) chart.setOption(buildOption(), { replaceMerge: ["yAxis", "series"] });
	});

	// --- Exported methods for external zoom control ---
	export function zoomToRange(startIndex: number, endIndex: number, padding = 10) {
		if (!chart || !log.length) return;
		const lo = Math.max(0, Math.min(startIndex, endIndex) - padding);
		const hi = Math.min(log.length - 1, Math.max(startIndex, endIndex) + padding);
		// The axis is time now, so the frame indices the analysis gives us have to
		// be turned back into seconds before they can become a zoom window.
		const all = [...frameT, ...overlay.flatMap((s) => s.points.map((p) => p.t))];
		const first = Math.min(...all);
		const last = Math.max(...all);
		const span = last - first || 1;
		const startPct = ((frameT[lo] - first) / span) * 100;
		const endPct = ((frameT[hi] - first) / span) * 100;
		chart.dispatchAction({ type: "dataZoom", dataZoomIndex: 0, start: startPct, end: endPct });
		chart.dispatchAction({ type: "dataZoom", dataZoomIndex: 1, start: startPct, end: endPct });
	}

	export function resetZoom() {
		if (!chart) return;
		chart.dispatchAction({ type: "dataZoom", dataZoomIndex: 0, start: 0, end: 100 });
		chart.dispatchAction({ type: "dataZoom", dataZoomIndex: 1, start: 0, end: 100 });
	}

	onMount(() => {
		if (!chartContainer) return;
		chart = echarts.init(chartContainer);
		chart.setOption(buildOption());

		observer = new ResizeObserver(() => handleResize());
		observer.observe(chartContainer);
	});

	onDestroy(() => {
		if (observer) observer.disconnect();
		if (chart) chart.dispose();
	});
</script>

<div class="flex flex-col gap-1">
	<div class="flex flex-wrap justify-center gap-x-3 gap-y-1 text-sm px-1">
		{#each metricSeries as s}
			<button
				class="flex items-center gap-1 cursor-pointer select-none"
				class:opacity-40={!shown(s.name)}
				onclick={() => toggleSeries(s.name)}
			>
				<span class="inline-block w-3 h-3 rounded-sm" style="background-color: {s.color}"></span>
				<span class:line-through={!shown(s.name)}>{s.name}</span>
			</button>
		{/each}
		{#each overlay as s, i (s.key)}
			<button
				class="flex items-center gap-1 cursor-pointer select-none"
				class:opacity-40={visibleSeries[s.label] === false}
				onclick={() => toggleSeries(s.label)}
			>
				<span
					class="inline-block w-3 h-3 rounded-sm"
					style="background-color: {OVERLAY_COLORS[i % OVERLAY_COLORS.length]}"
				></span>
				<span class:line-through={visibleSeries[s.label] === false}>{s.label}</span>
			</button>
		{/each}
	</div>
	<div
		bind:this={chartContainer}
		class="w-full"
		style="height: {isMobile ? 'calc(80vw)' : '50vh'}; min-height: 300px; touch-action: pan-y;"
	></div>
</div>
