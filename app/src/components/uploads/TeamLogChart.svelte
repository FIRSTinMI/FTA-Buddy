<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, Modal } from "flowbite-svelte";
	import { onDestroy, onMount, tick } from "svelte";
	import { defaultSeriesKeys, DSLOG_SERIES, FMS_SERIES, SUPERSEDED_BY } from "../../../../shared/logs/series";
	import { trpc } from "../../main";
	import { echarts, type ECharts, type ECOption } from "../../util/echarts";

	/**
	 * A team's own logs against the field's, on one time axis.
	 *
	 * The station log viewer already shows what FMS saw. What a CSA actually needs
	 * is the ordering: did the battery sag before the field lost the robot, or
	 * after? So everything here is plotted in seconds from match start, with a
	 * line at zero, and the axes are grouped by unit so volts and milliseconds do
	 * not end up on the same scale.
	 *
	 * The two clocks are different machines. The team's laptop can be minutes out,
	 * and when it is, the trace sits in the wrong place. That is said on screen
	 * rather than hidden, because a silently shifted trace is worse than none.
	 */
	let {
		uploadId,
		matchId,
		code,
		hasDsLog = false,
		/** Seconds from match start to mark, driven by hovering the event log. */
		markT = null,
	}: { uploadId: string; matchId: string; code: string; hasDsLog?: boolean; markT?: number | null } = $props();

	type SeriesData = Awaited<ReturnType<typeof trpc.uploads.series.query>>;

	/**
	 * Where the team's Driver Station log records the same quantity as the field
	 * monitor, it wins by default: it records every control packet, so 50 Hz, and a sag shows its actual
	 * shape instead of one averaged dip. The field's own radio numbers have no
	 * counterpart, so they stay on. Every series is labelled with the rate it
	 * actually arrived at rather than one we assumed.
	 */
	let selected = $state<string[]>(defaultSeriesKeys({ hasDsLog }));
	let data = $state<SeriesData | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let pickerOpen = $state(false);
	let catalog = $state<string | null>(null);
	let extraKeys = $state<string[]>([]);

	let container: HTMLDivElement | undefined = $state();
	let chart: ECharts | undefined;
	let observer: ResizeObserver | undefined;

	/** Axis index per unit group, so volts, ms, percent and amps each get their own. */
	function axisGroup(def: { axis: string; unit?: string }): string {
		return def.axis;
	}

	function buildOption(loaded: SeriesData): ECOption {
		const groups = [...new Set(loaded.series.map((s) => axisGroup(s)))];
		return {
			animation: false,
			tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
			legend: { type: "scroll", top: 0, textStyle: { fontSize: 10 } },
			grid: { left: 48, right: 48, top: 28, bottom: 28 },
			xAxis: {
				type: "value",
				name: "s from match start",
				nameLocation: "middle",
				nameGap: 18,
				min: (v: { min: number }) => Math.floor(v.min),
				max: (v: { max: number }) => Math.ceil(v.max),
			},
			yAxis: groups.map((group, index) => ({
				type: "value",
				name: group === "bool" ? "" : group,
				position: index % 2 === 0 ? "left" : "right",
				offset: Math.floor(index / 2) * 40,
				min: group === "bool" ? 0 : undefined,
				max: group === "bool" ? 1 : undefined,
				splitLine: { show: index === 0 },
			})),
			series: [
				// A one-point series carrying only a markLine, so the marker can move
				// without rebuilding every trace.
				{
					name: "event",
					type: "line" as const,
					data: [] as [number, number][],
					silent: true,
					markLine:
						markT === null
							? undefined
							: {
									silent: true,
									symbol: "none",
									lineStyle: { color: "#f59e0b", width: 2 },
									label: { formatter: `${markT.toFixed(1)}s`, position: "insideEndTop" },
									data: [{ xAxis: markT }],
								},
				},
			].concat(
				loaded.series.map((s) => ({
					name: `${s.label}${s.unit ? ` (${s.unit})` : ""}${s.hz ? ` ${s.hz < 10 ? s.hz.toFixed(1) : s.hz.toFixed(0)}Hz` : ""}`,
					type: "line",
					step: s.axis === "bool" ? "end" : undefined,
					showSymbol: false,
					// Render in chunks rather than thinning: a 50 Hz trace over a match is
					// about 10,000 points per series and the whole point is to keep them.
					progressive: 2000,
					progressiveThreshold: 5000,
					lineStyle: { width: s.from === "fms" ? 2 : 1.5, type: s.from === "fms" ? "solid" : "dashed" },
					yAxisIndex: groups.indexOf(axisGroup(s)),
					// A gap has to read as a gap, not as a line drawn across it.
					data: s.points.map((p) => [p.t, p.v]),
					connectNulls: false,
					markLine:
						s.from === "fms" && groups.indexOf(axisGroup(s)) === 0
							? { silent: true, symbol: "none", data: [{ xAxis: 0, label: { formatter: "start" } }] }
							: undefined,
				})) as never[],
			),
		} as ECOption;
	}

	async function load() {
		if (selected.length === 0) {
			data = null;
			return;
		}
		loading = true;
		error = null;
		try {
			// The window is the match plus 20 s either side. At 50 Hz that is about
			// 10,250 samples per series, so asking for more than that means nothing
			// is thinned, which is the one thing this chart exists to avoid.
			data = await trpc.uploads.series.query({
				id: uploadId,
				matchId,
				keys: selected.slice(0, 8),
				points: 12_000,
			});
			await tick();
			if (container) {
				chart ??= echarts.init(container);
				chart.setOption(buildOption(data), { replaceMerge: ["yAxis", "series"] });
			}
		} catch (err) {
			error = err instanceof Error ? err.message : "Could not read those series.";
		} finally {
			loading = false;
		}
	}

	async function openPicker() {
		pickerOpen = true;
		if (catalog === null) {
			try {
				const result = await trpc.uploads.seriesCatalog.query({ id: uploadId });
				catalog = result.text;
				// Anything the upload offers that is not in the fixed lists, e.g. the
				// team's own data log entries and CSV signals.
				extraKeys = [...result.text.matchAll(/^\s{2}(log\.\S+|csv\.\S+|ds\.pd\.\d+)/gm)].map((m) => m[1]);
			} catch {
				catalog = "Could not load the list of series.";
			}
		}
	}

	function toggle(key: string) {
		if (selected.includes(key)) {
			selected = selected.filter((k) => k !== key);
		} else {
			if (selected.length >= 8) return;
			selected = [...selected, key];
		}
		void load();
	}

	/**
	 * The same series as a table.
	 *
	 * Volunteers read the chart to find the moment and the table to quote the
	 * number. The two sources sample at different rates, so the rows are the union
	 * of every timestamp and a series that had nothing at that instant is blank
	 * rather than carried forward. Carrying a value forward would invent a 50 Hz
	 * FMS log that does not exist.
	 */
	let showTable = $state(false);

	type Row = { t: number; v: (number | null)[] };

	let rows = $derived.by<Row[]>(() => {
		if (!data) return [];
		const byTime = new Map<number, (number | null)[]>();
		const width = data.series.length;
		data.series.forEach((s, col) => {
			for (const point of s.points) {
				if (point.v === null) continue;
				// Milliseconds is finer than either log records, so this groups the
				// samples that really are simultaneous without merging distinct ones.
				const key = Math.round(point.t * 1000);
				let row = byTime.get(key);
				if (!row) byTime.set(key, (row = new Array(width).fill(null)));
				row[col] = point.v;
			}
		});
		return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([key, v]) => ({ t: key / 1000, v }));
	});

	const ROW_PX = 24;
	const OVERSCAN = 12;
	let tableScroll = $state(0);
	let tableHeight = $state(384);
	let firstRow = $derived(Math.max(0, Math.floor(tableScroll / ROW_PX) - OVERSCAN));
	let lastRow = $derived(Math.min(rows.length, Math.ceil((tableScroll + tableHeight) / ROW_PX) + OVERSCAN));
	let window_ = $derived(rows.slice(firstRow, lastRow));

	function cell(value: number | null, axis: string): string {
		if (value === null) return "";
		if (axis === "bool") return value ? "Y" : "N";
		return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
	}

	function downloadCsv() {
		if (!data) return;
		const header = ["t", ...data.series.map((s) => s.key)].join(",");
		const body = rows.map((row) => [row.t.toFixed(3), ...row.v.map((v) => (v === null ? "" : v))].join(","));
		const url = URL.createObjectURL(new Blob([`${header}\n${body.join("\n")}\n`], { type: "text/csv" }));
		const link = document.createElement("a");
		link.href = url;
		link.download = `${code}-match-series.csv`;
		link.click();
		URL.revokeObjectURL(url);
	}

	// Moving the marker must not refetch: the series are unchanged.
	$effect(() => {
		void markT;
		if (chart && data) chart.setOption(buildOption(data), { replaceMerge: ["series"] });
	});

	onMount(() => {
		void load();
		if (container) {
			observer = new ResizeObserver(() => chart?.resize());
			observer.observe(container);
		}
	});

	onDestroy(() => {
		observer?.disconnect();
		chart?.dispose();
	});
</script>

<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-2 text-left">
	<div class="flex items-center gap-2 mb-1">
		<h3 class="text-sm font-semibold text-black dark:text-white">Team's own logs</h3>
		<span class="text-xs text-gray-500">upload {code}</span>
		<Button size="xs" color="light" class="ml-auto" onclick={openPicker}>
			<Icon icon="heroicons:adjustments-horizontal-16-solid" class="size-4" /><span class="ml-1">Series</span>
		</Button>
	</div>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}

	<div bind:this={container} class="w-full h-72"></div>

	{#if loading}
		<p class="text-xs text-gray-500">Reading the logs...</p>
	{/if}

	{#if data}
		{#each data.series.filter((s) => s.supersededBy) as slower (slower.key)}
			<p class="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
				{slower.label}: {slower.supersededBy?.because}.
				<button class="underline" onclick={() => toggle(slower.supersededBy?.key ?? "")}>Use that</button>
			</p>
		{/each}
		{#if data.notes.length > 0}
			<ul class="mt-1 text-xs text-gray-500 dark:text-gray-400 list-disc pl-4">
				{#each data.notes as note}
					<li>{note}</li>
				{/each}
			</ul>
		{/if}
		<p class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
			Solid is the field's log, dashed is the team's. A trace sitting far from the match is a laptop clock that is
			out.
		</p>

		<div class="mt-2 flex items-center gap-2">
			<Button size="xs" color="light" onclick={() => (showTable = !showTable)}>
				<Icon
					icon={showTable ? "heroicons:chevron-down-16-solid" : "heroicons:chevron-right-16-solid"}
					class="size-4"
				/>
				<span class="ml-1">{showTable ? "Hide" : "Show"} data table</span>
			</Button>
			<span class="text-[11px] text-gray-500">{rows.length.toLocaleString()} rows</span>
			{#if showTable}
				<Button size="xs" color="light" class="ml-auto" onclick={downloadCsv}>
					<Icon icon="heroicons:arrow-down-tray-16-solid" class="size-4" /><span class="ml-1">CSV</span>
				</Button>
			{/if}
		</div>

		{#if showTable}
			<div
				class="mt-1 overflow-auto rounded border border-gray-200 dark:border-gray-700"
				style="height: {tableHeight}px"
				onscroll={(e) => (tableScroll = e.currentTarget.scrollTop)}
			>
				<table class="min-w-full text-xs text-left tabular-nums">
					<thead class="sticky top-0 z-10 bg-gray-50 uppercase text-gray-700 dark:bg-black dark:text-white">
						<tr>
							<th class="px-2 py-1 font-semibold">s</th>
							{#each data.series as s (s.key)}
								<th class="px-2 py-1 font-semibold whitespace-nowrap"
									>{s.label}{s.unit ? ` (${s.unit})` : ""}</th
								>
							{/each}
						</tr>
					</thead>
					<tbody>
						<tr style="height: {firstRow * ROW_PX}px"></tr>
						{#each window_ as row (row.t)}
							<tr
								class="border-b dark:border-gray-700 odd:bg-white even:bg-gray-50 odd:dark:bg-gray-900 even:dark:bg-gray-800"
								style="height: {ROW_PX}px"
							>
								<td class="px-2 text-gray-800 dark:text-white">{row.t.toFixed(2)}</td>
								{#each data.series as s, col (s.key)}
									<td class="px-2 text-gray-600 dark:text-gray-300">{cell(row.v[col], s.axis)}</td>
								{/each}
							</tr>
						{/each}
						<tr style="height: {Math.max(0, rows.length - lastRow) * ROW_PX}px"></tr>
					</tbody>
				</table>
			</div>
			<p class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
				Every series you pick gets a column. A blank cell means that log had no sample at that instant.
			</p>
		{/if}
	{/if}
</div>

<Modal bind:open={pickerOpen} size="md" outsideclose title="Pick series">
	<div class="text-left flex flex-col gap-3">
		<p class="text-xs text-gray-500">Up to 8 at a time. {selected.length} picked.</p>

		<div>
			<p class="text-sm font-semibold mb-1">From the field's log</p>
			<div class="flex flex-wrap gap-1">
				{#each FMS_SERIES as def (def.key)}
					<button
						onclick={() => toggle(def.key)}
						title={hasDsLog && SUPERSEDED_BY[def.key]
							? `The team's log has this faster: ${SUPERSEDED_BY[def.key].because}`
							: undefined}
						class="rounded-full border px-2 py-0.5 text-xs {selected.includes(def.key)
							? 'border-primary-500 bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-100'
							: 'border-gray-300 dark:border-gray-600'}"
					>
						{def.label}{hasDsLog && SUPERSEDED_BY[def.key] ? " (slower)" : ""}
					</button>
				{/each}
			</div>
		</div>

		<div>
			<p class="text-sm font-semibold mb-1">From the team's Driver Station log</p>
			<div class="flex flex-wrap gap-1">
				{#each DSLOG_SERIES as def (def.key)}
					<button
						onclick={() => toggle(def.key)}
						class="rounded-full border px-2 py-0.5 text-xs {selected.includes(def.key)
							? 'border-primary-500 bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-100'
							: 'border-gray-300 dark:border-gray-600'}"
					>
						{def.label}
					</button>
				{/each}
			</div>
		</div>

		{#if extraKeys.length > 0}
			<div>
				<p class="text-sm font-semibold mb-1">From the team's own logging</p>
				<div class="flex flex-wrap gap-1 max-h-48 overflow-y-auto">
					{#each extraKeys as key (key)}
						<button
							onclick={() => toggle(key)}
							class="rounded-full border px-2 py-0.5 text-xs {selected.includes(key)
								? 'border-primary-500 bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-100'
								: 'border-gray-300 dark:border-gray-600'}"
						>
							{key.replace(/^(log|csv)\./, "")}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		{#if catalog}
			<details class="text-xs text-gray-500">
				<summary class="cursor-pointer">Everything this upload can plot</summary>
				<pre class="whitespace-pre-wrap mt-1 max-h-60 overflow-y-auto">{catalog}</pre>
			</details>
		{/if}

		<Button size="sm" onclick={() => (pickerOpen = false)}>Done</Button>
	</div>
</Modal>
