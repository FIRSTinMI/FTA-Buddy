<script lang="ts">
	import Icon from "@iconify/svelte";
	import { onMount } from "svelte";
	import { trpc } from "../../main";

	/**
	 * The Driver Station's event log as a terminal, on the match clock.
	 *
	 * The point of putting it next to the chart is the pairing: a line that says
	 * "Input Voltage Brownout" is worth something on its own, but worth a great
	 * deal more when you can see the voltage trace at that instant. Hovering a
	 * line marks it on the chart.
	 */
	let { uploadId, matchId, onhover }: { uploadId: string; matchId: string; onhover?: (t: number | null) => void } =
		$props();

	type Line = { t: number | null; text: string; file: string };

	let lines = $state<Line[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let filter = $state("");
	let pinned = $state<number | null>(null);

	let shown = $derived(
		filter.trim() ? lines.filter((l) => l.text.toLowerCase().includes(filter.trim().toLowerCase())) : lines,
	);

	/** Warnings and errors are what a volunteer scans for. */
	function tone(text: string): string {
		if (/error|brownout|disconnect|timeout|watchdog|too-stale|fault/i.test(text)) return "text-red-400";
		if (/warning|overrun|limit/i.test(text)) return "text-amber-400";
		if (/FMS|Match|enabled|starting|complete|connected/i.test(text)) return "text-sky-400";
		return "text-gray-300";
	}

	function stamp(t: number | null): string {
		if (t === null) return "     ";
		const sign = t < 0 ? "-" : " ";
		const a = Math.abs(t);
		return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${(a % 60).toFixed(1).padStart(4, "0")}`;
	}

	function hover(line: Line) {
		if (pinned !== null) return;
		onhover?.(line.t);
	}

	function pin(line: Line) {
		pinned = pinned === line.t ? null : line.t;
		onhover?.(pinned);
	}

	onMount(async () => {
		try {
			const result = await trpc.uploads.events.query({ id: uploadId, matchId });
			lines = result.lines;
		} catch (err) {
			error = err instanceof Error ? err.message : "Could not read the event log.";
		} finally {
			loading = false;
		}
	});
</script>

<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-2 text-left">
	<div class="mb-1 flex items-center gap-2">
		<h3 class="text-sm font-semibold text-black dark:text-white">Driver Station events</h3>
		<input
			bind:value={filter}
			placeholder="Filter"
			class="ml-auto w-40 rounded border border-gray-300 bg-white px-2 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-800"
		/>
		{#if pinned !== null}
			<button class="text-xs underline text-gray-500" onclick={() => ((pinned = null), onhover?.(null))}>
				unpin
			</button>
		{/if}
	</div>

	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{:else if loading}
		<p class="text-xs text-gray-500">Reading...</p>
	{:else if lines.length === 0}
		<p class="text-xs text-gray-500">No Driver Station event log in this upload.</p>
	{:else}
		<div
			class="max-h-64 overflow-y-auto rounded bg-gray-950 p-2 font-mono text-[11px] leading-relaxed"
			onmouseleave={() => pinned === null && onhover?.(null)}
			role="log"
		>
			{#each shown as line, i (i)}
				<button
					class="flex w-full gap-2 text-left hover:bg-gray-800 {pinned === line.t ? 'bg-gray-800' : ''}"
					onmouseenter={() => hover(line)}
					onfocus={() => hover(line)}
					onclick={() => pin(line)}
					title="Click to pin this moment on the chart"
				>
					<span class="shrink-0 tabular-nums text-gray-500">{stamp(line.t)}</span>
					<span class="{tone(line.text)} whitespace-pre-wrap break-words">{line.text}</span>
				</button>
			{/each}
		</div>
		<p class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
			<Icon icon="heroicons:cursor-arrow-rays-16-solid" class="inline size-3.5" />
			Hover a line to mark it on the chart, click to pin it. Times are from match start.
		</p>
	{/if}
</div>
