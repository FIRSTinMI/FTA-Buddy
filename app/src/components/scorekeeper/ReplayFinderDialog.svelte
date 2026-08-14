<script lang="ts">
	import { Badge, Modal } from "flowbite-svelte";
	import { untrack } from "svelte";
	import { findReplaySlots, type ReplayScheduleMatch } from "../../util/replayFinder";

	interface MatchRow {
		level: string;
		match: number;
		play: number;
		red: (number | null)[];
		blue: (number | null)[];
		isPlayed: boolean;
		scheduledStartTime: Date | null;
		finalScoreRed: number | null;
	}

	interface Props {
		open: boolean;
		matches: MatchRow[];
		initialLevel: string;
		initialMatch: number;
		teamName: (t: number | null) => string;
		onClose: () => void;
	}

	let { open = $bindable(), matches, initialLevel, initialMatch, teamName, onClose }: Props = $props();

	const levels = $derived([...new Set(matches.map((m) => m.level))]);
	// Default to the current level, but fall back to a level that actually has a
	// schedule to replay into (practice/test rarely does).
	let level = $state(
		initialLevel && matches.some((m) => m.level === initialLevel) ? initialLevel : (initialLevel ?? "Qualification"),
	);
	let replayMatch = $state(initialMatch);

	const levelMatches = $derived(
		matches.filter((m) => m.level === level && m.play === 1).sort((a, b) => a.match - b.match),
	);
	// The match most recently ended (a replay is almost always for the last match played).
	const lastPlayedMatch = $derived.by(() => {
		const played = levelMatches.filter((m) => m.finalScoreRed != null || m.isPlayed);
		return played.length ? played[played.length - 1].match : (levelMatches[0]?.match ?? initialMatch);
	});
	// Reset the match to the most-recently-ended one whenever the level changes.
	$effect(() => {
		level;
		untrack(() => (replayMatch = lastPlayedMatch));
	});

	const replayRow = $derived(levelMatches.find((m) => m.match === replayMatch) ?? null);
	const replayTeams = $derived(
		replayRow ? [...replayRow.red, ...replayRow.blue].filter((t): t is number => t != null) : [],
	);

	const candidates = $derived.by(() => {
		if (!replayTeams.length) return [];
		const schedule: ReplayScheduleMatch[] = levelMatches.map((m) => ({
			matchNumber: m.match,
			teams: [...m.red, ...m.blue].filter((t): t is number => t != null),
			timestamp: m.scheduledStartTime,
			hasScore: m.finalScoreRed != null || m.isPlayed,
		}));
		return findReplaySlots(schedule, replayTeams, { topN: 5 });
	});

	function fmtTime(d: Date | null): string {
		return d ? new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
	}
	function gapText(g: number): string {
		if (!Number.isFinite(g)) return "no conflict";
		return g === 0 ? "back-to-back" : `${g} match${g === 1 ? "" : "es"} of rest`;
	}
	const inputCls =
		"rounded-md border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm";
</script>

<Modal bind:open title="Replay finder" onclose={onClose} size="lg" outsideclose={false}>
	<div class="flex flex-col gap-4">
		<div class="flex flex-wrap items-end gap-3">
			<label class="flex flex-col gap-1 text-xs font-medium uppercase text-gray-500">
				Level
				<select bind:value={level} class={inputCls}>
					{#each levels as lv (lv)}
						<option value={lv}>{lv}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1 text-xs font-medium uppercase text-gray-500">
				Match to replay
				<input type="number" min="1" bind:value={replayMatch} class="{inputCls} w-24 font-bold" />
			</label>
			{#if replayTeams.length}
				<div class="pb-1.5 text-sm">
					<span class="font-mono font-semibold text-red-600">{replayRow?.red.filter((t) => t != null).join("  ")}</span>
					<span class="mx-1 text-gray-300">vs</span>
					<span class="font-mono font-semibold text-blue-600">{replayRow?.blue.filter((t) => t != null).join("  ")}</span>
				</div>
			{/if}
		</div>

		{#if !replayTeams.length}
			<div class="rounded-md bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-700">
				No teams known for {level} match {replayMatch}. Pick a match that's in the schedule.
			</div>
		{:else if candidates.length === 0}
			<div class="rounded-md bg-gray-50 dark:bg-neutral-800 p-3 text-sm text-gray-500">
				No valid slot in the remaining schedule (every option would put a team back-to-back).
			</div>
		{:else}
			<div class="flex flex-col gap-2">
				{#each candidates as c, i (c.index)}
					<div
						class="flex items-center justify-between gap-3 rounded-lg border p-3 {i === 0
							? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30'
							: 'border-gray-200 dark:border-neutral-700'}"
					>
						<div>
							<div class="font-semibold text-gray-900 dark:text-white">
								{#if c.afterMatch != null}Run after Match {c.afterMatch}{:else}Run before Match {c.beforeMatch}{/if}
								{#if fmtTime(c.atTime)}<span class="text-xs font-normal text-gray-500">~{fmtTime(c.atTime)}</span>{/if}
							</div>
							<div class="text-sm text-gray-600 dark:text-gray-300">
								{gapText(c.minGap)}
								{#if Number.isFinite(c.minGap) && c.tightTeams.length}
									<span class="text-gray-400">(tightest: {c.tightTeams.join(", ")})</span>
								{/if}
							</div>
						</div>
						<div class="flex shrink-0 gap-1">
							{#if i === 0}<Badge color="green">Best</Badge>{/if}
							{#if c.afterBreak}<Badge color="blue">after break</Badge>{/if}
						</div>
					</div>
				{/each}
			</div>
			<div class="text-[11px] text-gray-400">
				Ranked by rest for the replay's teams. Only slots in the not-yet-played schedule are considered, and a valid
				slot never puts one of those teams in back-to-back matches.
			</div>
		{/if}
	</div>
</Modal>
