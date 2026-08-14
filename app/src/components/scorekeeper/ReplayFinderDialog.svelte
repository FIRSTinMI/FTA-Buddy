<script lang="ts">
	import { Badge, Modal } from "flowbite-svelte";
	import Icon from "@iconify/svelte";
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

	let level = $state(initialLevel);
	let replayMatch = $state(initialMatch);

	// Matches for the chosen level, in play order.
	const levelMatches = $derived(
		matches.filter((m) => m.level === level && m.play === 1).sort((a, b) => a.match - b.match),
	);
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
		return d ? new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—";
	}
	function gapText(g: number): string {
		if (!Number.isFinite(g)) return "no conflict";
		return g === 0 ? "back-to-back" : `${g} match${g === 1 ? "" : "es"} rest`;
	}
</script>

<Modal bind:open title="Replay finder" onclose={onClose} size="lg" outsideclose={false}>
	<div class="flex flex-col gap-4">
		<div class="flex flex-wrap items-end gap-3 text-sm text-gray-600 dark:text-gray-300">
			<label class="flex flex-col gap-1">
				Level
				<select
					bind:value={level}
					class="rounded-md border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1"
				>
					{#each [...new Set(matches.map((m) => m.level))] as lv (lv)}
						<option value={lv}>{lv}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1">
				Match to replay
				<input
					type="number"
					min="1"
					bind:value={replayMatch}
					class="w-24 rounded-md border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1 font-semibold"
				/>
			</label>
			{#if replayTeams.length}
				<div class="text-xs text-gray-500">
					Teams: <span class="text-red-600">{replayRow?.red.filter((t) => t != null).join(" ")}</span>
					<span class="text-gray-300">/</span>
					<span class="text-blue-600">{replayRow?.blue.filter((t) => t != null).join(" ")}</span>
				</div>
			{/if}
		</div>

		{#if !replayTeams.length}
			<div class="text-sm text-amber-600">
				No teams known for {level} match {replayMatch} — pick a match that's in the schedule.
			</div>
		{:else if candidates.length === 0}
			<div class="text-sm text-gray-500">No valid slot found in the remaining schedule (every option puts a team back-to-back).</div>
		{:else}
			<div class="text-xs text-gray-500">Best places to run the replay (most rest for its teams first):</div>
			<div class="flex flex-col gap-2">
				{#each candidates as c, i (c.index)}
					<div class="rounded-lg border-2 p-3 {i === 0 ? 'border-primary-500' : 'border-gray-200 dark:border-neutral-700'}">
						<div class="flex items-center justify-between">
							<div class="font-semibold text-gray-900 dark:text-white">
								{#if c.afterMatch != null}
									Run after Match {c.afterMatch}
								{:else}
									Run before Match {c.beforeMatch}
								{/if}
								<span class="text-xs font-normal text-gray-500">(~{fmtTime(c.atTime)})</span>
							</div>
							<div class="flex gap-1">
								{#if i === 0}<Badge color="green">Best</Badge>{/if}
								{#if c.afterBreak}<Badge color="blue">after break</Badge>{/if}
							</div>
						</div>
						<div class="mt-1 text-sm">
							Tightest spacing: <span class="font-semibold">{gapText(c.minGap)}</span>
							{#if Number.isFinite(c.minGap) && c.tightTeams.length}
								<span class="text-gray-500">
									(team{c.tightTeams.length > 1 ? "s" : ""}
									{#each c.tightTeams as t, j (t)}{j > 0 ? ", " : ""}{t}{/each})
								</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
			<div class="text-[11px] text-gray-400">
				<Icon icon="mdi:information-outline" class="inline size-3" /> Only slots in the not-yet-played part of the schedule
				are considered; a valid slot never puts one of the replay's teams in back-to-back matches.
			</div>
		{/if}
	</div>
</Modal>
