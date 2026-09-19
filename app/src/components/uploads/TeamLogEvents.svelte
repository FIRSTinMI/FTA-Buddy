<script lang="ts">
	import { onMount } from "svelte";
	import { trpc } from "../../main";

	/**
	 * The Driver Station's own event log, on the match clock.
	 *
	 * A line reading "Input Voltage Brownout" is worth something on its own and
	 * worth a great deal more next to the voltage trace at that instant, so
	 * hovering a line marks the moment on the graph above, and clicking the graph
	 * at a dip scrolls this to what the robot was saying then.
	 */
	let {
		uploadId,
		matchId,
		onhover,
		jumpTo = null,
	}: {
		uploadId: string;
		matchId: string;
		onhover?: (t: number | null) => void;
		/** Seconds from match start to scroll to, from a click on the graph. */
		jumpTo?: number | null;
	} = $props();

	type Line = { t: number | null; text: string; file: string };

	let lines = $state<Line[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let filter = $state("");
	let pinned = $state<number | null>(null);
	let terminal = $state<HTMLDivElement | null>(null);
	let rows: HTMLButtonElement[] = [];

	let shown = $derived(
		filter.trim() ? lines.filter((l) => l.text.toLowerCase().includes(filter.trim().toLowerCase())) : lines,
	);

	/**
	 * Scroll to the last line at or before a moment picked on the graph, and pin
	 * it so the marker stays put while a volunteer reads around it.
	 *
	 * Last-at-or-before rather than nearest: a brownout is explained by what the
	 * robot had just said, and a line a second later is the consequence. Searched
	 * within what the filter leaves on screen, so a jump never lands on a line
	 * that is not there.
	 */
	let lastJump: number | null = null;

	$effect(() => {
		const target = jumpTo;
		// `shown` is read so a jump survives the list not being built yet, but the
		// guard stops every keystroke in the filter from yanking the view back.
		if (target === null || shown.length === 0 || target === lastJump) return;
		lastJump = target;

		let index = -1;
		for (let i = 0; i < shown.length; i++) {
			const t = shown[i].t;
			if (t !== null && t <= target) index = i;
		}
		// Before the first line: the first one is still the closest thing to it.
		if (index === -1) index = shown.findIndex((l) => l.t !== null);
		if (index === -1) return;

		pinned = shown[index].t;
		onhover?.(pinned);

		const row = rows[index];
		if (row && terminal) {
			// On a short window the terminal can be below the fold, and then a click
			// on the graph appears to do nothing. "nearest" moves the page by the
			// least it can, so the graph you just clicked stays where it was.
			terminal.scrollIntoView({ block: "nearest" });
			// The line itself is scrolled inside the terminal by hand: scrollIntoView
			// walks every scrolling ancestor, and centring the row that way would
			// take the graph off screen.
			const rowBox = row.getBoundingClientRect();
			const box = terminal.getBoundingClientRect();
			terminal.scrollTop += rowBox.top - box.top - (box.height - rowBox.height) / 2;
		}
	});

	/** Warnings and errors are what a volunteer scans for. */
	function tone(text: string): string {
		if (/error|brownout|disconnect|timeout|watchdog|too-stale|fault/i.test(text)) return "text-red-400";
		if (/warning|overrun|limit/i.test(text)) return "text-amber-400";
		if (/FMS|Match|enabled|starting|complete|connected/i.test(text)) return "text-sky-400";
		return "text-gray-300";
	}

	function stamp(t: number | null): string {
		if (t === null) return "      ";
		const sign = t < 0 ? "-" : " ";
		const a = Math.abs(t);
		return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${(a % 60).toFixed(1).padStart(4, "0")}`;
	}

	function hover(line: Line) {
		if (pinned === null) onhover?.(line.t);
	}

	function pin(line: Line) {
		pinned = pinned === line.t ? null : line.t;
		onhover?.(pinned);
	}

	async function load() {
		loading = true;
		error = null;
		try {
			lines = (await trpc.uploads.events.query({ id: uploadId, matchId })).lines;
		} catch (err) {
			error = err instanceof Error ? err.message : "Unable to load the event log";
		} finally {
			loading = false;
		}
	}

	onMount(load);
</script>

<div class="text-left">
	<div class="mb-1 flex items-center gap-2">
		<p class="text-sm font-medium text-gray-900 dark:text-white">Driver Station events</p>
		<input
			bind:value={filter}
			placeholder="Filter"
			aria-label="Filter events"
			class="ml-auto w-40 rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
		/>
		{#if pinned !== null}
			<button
				class="text-xs text-gray-500 underline dark:text-gray-400"
				onclick={() => ((pinned = null), onhover?.(null))}>Unpin</button
			>
		{/if}
	</div>

	{#if loading}
		<p class="text-xs text-gray-500 dark:text-gray-400">Loading…</p>
	{:else if error}
		<p class="text-sm text-red-600 dark:text-red-400">
			{error}
			<button class="underline" onclick={load}>Retry</button>
		</p>
	{:else if lines.length === 0}
		<p class="text-xs text-gray-500 dark:text-gray-400">No events</p>
	{:else}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={terminal}
			class="max-h-64 overflow-y-auto rounded-lg bg-gray-950 p-2 font-mono text-[11px] leading-relaxed"
			onmouseleave={() => pinned === null && onhover?.(null)}
			role="log"
		>
			{#each shown as line, i (i)}
				<button
					bind:this={rows[i]}
					class="flex w-full gap-2 text-left hover:bg-gray-800 {pinned === line.t
						? 'bg-gray-700 ring-1 ring-sky-500'
						: ''}"
					onmouseenter={() => hover(line)}
					onfocus={() => hover(line)}
					onclick={() => pin(line)}
				>
					<span class="shrink-0 tabular-nums whitespace-pre text-gray-500">{stamp(line.t)}</span>
					<span class="{tone(line.text)} whitespace-pre-wrap break-words">{line.text}</span>
				</button>
			{:else}
				<span class="text-gray-500">No matches</span>
			{/each}
		</div>
	{/if}
</div>
