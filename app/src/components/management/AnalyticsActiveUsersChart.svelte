<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Card } from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import type { ActiveUsersPoint } from "../../../../shared/types";
	import { trpc } from "../../main";
	import { echarts, type ECharts, type ECOption } from "../../util/echarts";

	const REFRESH_MS = 5 * 60 * 1000;
	const WINDOW_MS = 4 * 24 * 60 * 60 * 1000;
	const USERS_COLOR = "#2bb1cf";
	const MONITORS_COLOR = "#fc7425";

	let bucketMinutes = $state<5 | 15>(5);
	let points = $state<ActiveUsersPoint[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let dark = $state(false);

	let container: HTMLDivElement;
	let chart: ECharts | undefined;
	let observer: ResizeObserver | undefined;
	let themeObserver: MutationObserver | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;
	let requestId = 0;

	let hasActivity = $derived(points.some((p) => p.users > 0 || p.fieldMonitors > 0));

	async function load() {
		const id = ++requestId;
		try {
			const result = await trpc.admin.getActiveUsers.query({ bucketMinutes });
			if (id !== requestId) return;
			points = result;
			error = null;
		} catch (err) {
			if (id !== requestId) return;
			console.error("[Analytics]", err);
			error = `Active users failed: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			if (id === requestId) loading = false;
		}
	}

	function setBucket(minutes: 5 | 15) {
		if (minutes === bucketMinutes) return;
		bucketMinutes = minutes;
		loading = true;
		load();
	}

	const pad = (n: number) => String(n).padStart(2, "0");
	const fmtTime = (ms: number) => {
		const d = new Date(ms);
		return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
	};

	/** Local midnights inside the range, drawn as day boundaries. */
	function midnights(from: number, to: number): number[] {
		const out: number[] = [];
		const d = new Date(from);
		d.setHours(24, 0, 0, 0);
		for (let t = d.getTime(); t <= to; ) {
			out.push(t);
			const next = new Date(t);
			next.setDate(next.getDate() + 1);
			t = next.getTime();
		}
		return out;
	}

	function buildOption(): ECOption {
		const text = dark ? "#d1d5db" : "#4b5563";
		const grid = dark ? "#404040" : "#e5e7eb";
		const end = points.length ? points[points.length - 1].t + bucketMinutes * 60000 : Date.now();
		const start = points.length ? points[0].t : end - WINDOW_MS;
		return {
			animation: false,
			textStyle: { color: text },
			grid: { left: 40, right: 16, top: 24, bottom: 28 },
			tooltip: {
				trigger: "axis",
				confine: true,
				backgroundColor: dark ? "#262626" : "#ffffff",
				borderColor: grid,
				textStyle: { color: dark ? "#f3f4f6" : "#111827" },
				formatter: (raw) => {
					const items = (Array.isArray(raw) ? raw : [raw]) as unknown as {
						axisValue: number;
						value: [number, number];
						marker: string;
						seriesName: string;
					}[];
					if (!items.length) return "";
					const rows = items.map((i) => `${i.marker}${i.seriesName}: <b>${i.value[1]}</b>`).join("<br/>");
					return `${fmtTime(items[0].axisValue)}<br/>${rows}`;
				},
			},
			xAxis: {
				type: "time",
				min: start,
				max: end,
				axisLabel: {
					color: text,
					hideOverlap: true,
					formatter: {
						day: "{MMM} {d}",
						hour: "{HH}:{mm}",
						minute: "{HH}:{mm}",
						second: "{HH}:{mm}:{ss}",
					},
				},
				axisLine: { lineStyle: { color: grid } },
				splitLine: { show: false },
			},
			yAxis: {
				type: "value",
				min: 0,
				minInterval: 1,
				axisLabel: { color: text, formatter: (v: number) => String(Math.round(v)) },
				splitLine: { lineStyle: { color: grid } },
			},
			series: [
				{
					name: "Active users",
					type: "line",
					showSymbol: false,
					step: false,
					lineStyle: { width: 2, color: USERS_COLOR },
					itemStyle: { color: USERS_COLOR },
					areaStyle: { color: USERS_COLOR, opacity: 0.15 },
					data: points.map((p) => [p.t, p.users]),
					markLine: {
						silent: true,
						symbol: "none",
						animation: false,
						lineStyle: { color: dark ? "#737373" : "#9ca3af", type: "dashed" },
						label: { show: false },
						data: midnights(start, end).map((t) => ({ xAxis: t })),
					},
				},
				{
					name: "Field monitors",
					type: "line",
					showSymbol: false,
					lineStyle: { width: 2, color: MONITORS_COLOR },
					itemStyle: { color: MONITORS_COLOR },
					areaStyle: { color: MONITORS_COLOR, opacity: 0.15 },
					data: points.map((p) => [p.t, p.fieldMonitors]),
				},
			],
		};
	}

	function readTheme() {
		dark = document.documentElement.classList.contains("dark");
	}

	$effect(() => {
		// Redraw whenever data or theme changes.
		void points;
		void dark;
		void bucketMinutes;
		chart?.setOption(buildOption(), true);
	});

	onMount(() => {
		readTheme();
		chart = echarts.init(container);
		chart.setOption(buildOption(), true);
		observer = new ResizeObserver(() => chart?.resize());
		observer.observe(container);
		themeObserver = new MutationObserver(readTheme);
		themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
		load();
		timer = setInterval(load, REFRESH_MS);
	});

	onDestroy(() => {
		requestId++;
		if (timer) clearInterval(timer);
		observer?.disconnect();
		themeObserver?.disconnect();
		chart?.dispose();
		chart = undefined;
	});
</script>

<Card class="p-4 max-w-none">
	<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-2">
		<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
			<span class="inline-flex items-center gap-1.5">
				<span class="w-3 h-3 rounded-sm" style="background:{USERS_COLOR}"></span>Active users
			</span>
			<span class="inline-flex items-center gap-1.5">
				<span class="w-3 h-3 rounded-sm" style="background:{MONITORS_COLOR}"></span>Field monitors
			</span>
		</div>
		<div
			class="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden"
			role="group"
			aria-label="Bucket"
		>
			{#each [5, 15] as const as m (m)}
				<button
					type="button"
					class="px-3 py-1 text-xs transition-colors {bucketMinutes === m
						? 'bg-primary-600 text-white'
						: 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-700'}"
					aria-pressed={bucketMinutes === m}
					onclick={() => setBucket(m)}
				>
					{m} min
				</button>
			{/each}
		</div>
	</div>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400 mb-2" role="alert">{error}</p>
	{/if}

	<div class="relative">
		<div bind:this={container} class="w-full h-64 sm:h-80"></div>
		{#if loading}
			<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
				<Icon icon="mdi:loading" class="w-8 h-8 animate-spin text-primary-700 dark:text-primary-400" />
			</div>
		{:else if !error && !hasActivity}
			<p class="absolute inset-0 flex items-center justify-center text-sm text-gray-500 pointer-events-none">
				No activity
			</p>
		{/if}
	</div>
</Card>
