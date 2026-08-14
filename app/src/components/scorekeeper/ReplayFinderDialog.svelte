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

	let { open = $bindable(), matches, initialLevel, initialMatch, onClose }: Props = $props();

	const levels = $derived([...new Set(matches.map((m) => m.level))]);
	let level = $state(
		initialLevel && matches.some((m) => m.level === initialLevel) ? initialLevel : (initialLevel ?? "Qualification"),
	);
	let replayMatch = $state(initialMatch);

	const levelMatches = $derived(
		matches.filter((m) => m.level === level && m.play === 1).sort((a, b) => a.match - b.match),
	);
	const lastPlayedMatch = $derived.by(() => {
		const played = levelMatches.filter((m) => m.finalScoreRed != null || m.isPlayed);
		return played.length ? played[played.length - 1].match : (levelMatches[0]?.match ?? initialMatch);
	});
	$effect(() => {
		level;
		untrack(() => (replayMatch = lastPlayedMatch));
	});

	const replayRow = $derived(levelMatches.find((m) => m.match === replayMatch) ?? null);
	const redTeams = $derived((replayRow?.red ?? []).filter((t): t is number => t != null));
	const blueTeams = $derived((replayRow?.blue ?? []).filter((t): t is number => t != null));
	const replayTeams = $derived([...redTeams, ...blueTeams]);

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
	// Group the replay's teams by how many matches of rest they get at this slot,
	// most rest first. "free" = no other match this level.
	function restGroups(teamGaps: { team: number; gap: number }[]) {
		const byGap = new Map<number, number[]>();
		for (const tg of teamGaps) byGap.set(tg.gap, [...(byGap.get(tg.gap) ?? []), tg.team]);
		return [...byGap.entries()]
			.sort((a, b) => b[0] - a[0])
			.map(([gap, teams]) => ({ label: Number.isFinite(gap) ? String(gap) : "free", teams }));
	}
	const inputCls =
		"rounded-md border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm";
</script>

<Modal bind:open title="Replay finder" onclose={onClose} size="lg" outsideclose={false}>
	<div class="flex flex-col gap-4 text-left">
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
					<span class="font-mono font-bold text-red-600 dark:text-red-400">{redTeams.join(" ")}</span>
					<span class="mx-1 font-medium text-gray-500">vs</span>
					<span class="font-mono font-bold text-blue-600 dark:text-blue-400">{blueTeams.join(" ")}</span>
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
					<div class="rounded-lg border p-3 {i === 0 ? 'border-primary-500' : 'border-gray-200 dark:border-neutral-700'}">
						<div class="flex items-center justify-between gap-2">
							<span class="font-semibold text-gray-900 dark:text-white">
								{#if c.afterMatch != null}After Match {c.afterMatch}{:else}Before Match {c.beforeMatch}{/if}
								{#if fmtTime(c.atTime)}<span class="ml-1 text-xs font-normal text-gray-500">(~{fmtTime(c.atTime)})</span>{/if}
							</span>
							<div class="flex shrink-0 gap-1">
								{#if i === 0}<Badge color="green">Best</Badge>{/if}
								{#if c.afterBreak}<Badge color="blue">after break</Badge>{/if}
							</div>
						</div>
						<div class="mt-1 text-sm text-gray-700 dark:text-gray-200">
							Rest:
							{#each restGroups(c.teamGaps) as g, gi (g.label)}{gi > 0 ? "; " : " "}<span class="font-bold tabular-nums">{g.label}</span>: {g.teams.join(", ")}{/each}
						</div>
					</div>
				{/each}
			</div>
			<div class="text-[11px] text-gray-400">
				Ranked by the least rest any of the replay's teams gets. A valid slot never puts one of those teams in
				back-to-back matches, and only not-yet-played slots are shown. "free" = the team has no other match this level.
			</div>
		{/if}
	</div>
</Modal>
