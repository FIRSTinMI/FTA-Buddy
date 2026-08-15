<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Badge, Button } from "flowbite-svelte";
	import type { LineupSide } from "../../util/scorekeeperTypes";

	interface Props {
		side: LineupSide;
		teamName: (team: number | null) => string;
		canEdit: boolean;
		onEdit: () => void;
		onHistory: () => void;
		/** Override the "Alliance N" header (e.g. for a practice/test field lineup). */
		title?: string | null;
		/** Hide the resolution badge + History/Enter buttons. */
		hideActions?: boolean;
		/** Text shown for an empty station (default "-"; e.g. "bypass" for field lineups). */
		emptyLabel?: string;
	}

	let { side, teamName, canEdit, onEdit, onHistory, title = null, hideActions = false, emptyLabel = "-" }: Props =
		$props();

	const colorClasses = $derived(
		side.color === "red"
			? "border-red-500 bg-red-50 dark:bg-red-950/40"
			: "border-blue-500 bg-blue-50 dark:bg-blue-950/40",
	);
	const chipClasses = $derived(
		side.color === "red" ? "bg-red-600 text-white" : "bg-blue-600 text-white",
	);

	const stations = $derived(side.lineup?.stations ?? null);
	const resolution = $derived(side.lineup?.resolution ?? null);

	// Lay the stations out like the lineup card / input: blue side is Blue 1/2/3
	// top-to-bottom, red side is Red 3/2/1 top-to-bottom.
	const rows = $derived.by<[string, number | null][]>(() => {
		if (!stations) return [];
		return side.color === "blue"
			? [["Blue 1", stations.station1], ["Blue 2", stations.station2], ["Blue 3", stations.station3]]
			: [["Red 3", stations.station3], ["Red 2", stations.station2], ["Red 1", stations.station1]];
	});
</script>

<div class="rounded-lg border-2 p-3 flex flex-col gap-2 {colorClasses}">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<span class="rounded-md px-2 py-1 text-sm font-bold uppercase {chipClasses}">{side.color}</span>
			{#if title != null}
				{#if title}<span class="text-lg font-bold text-gray-900 dark:text-white">{title}</span>{/if}
			{:else if side.allianceNumber}
				<span class="text-lg font-bold text-gray-900 dark:text-white">Alliance {side.allianceNumber}</span>
			{:else}
				<span class="text-lg font-bold text-gray-500">No alliance</span>
			{/if}
		</div>
		{#if side.lineup?.usesBackup}
			<Badge color="yellow">Backup in</Badge>
		{/if}
	</div>

	{#if stations && (side.allianceNumber || title != null)}
		<div class="flex flex-col gap-2">
			{#each rows as [label, team] (label)}
				<div class="flex items-center gap-3 rounded-md bg-white dark:bg-neutral-800 px-3 py-3 min-h-[4.5rem]">
					<span class="w-12 shrink-0 text-xs font-semibold uppercase text-gray-500">{label}</span>
					{#if team != null}
						<span class="text-5xl font-bold text-gray-900 dark:text-white tabular-nums leading-none">{team}</span>
						<span class="truncate text-xs text-gray-500" title={teamName(team)}>{teamName(team)}</span>
					{:else}
						<span class="text-sm italic text-gray-400">{emptyLabel}</span>
					{/if}
				</div>
			{/each}
		</div>

		{#if !hideActions}
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="text-xs text-gray-500">
					{#if resolution === "submitted"}
						<span class="inline-flex items-center gap-1"><Icon icon="mdi:check-circle" class="size-4" /> Submitted lineup</span>
					{:else if resolution === "carried-forward"}
						<span class="inline-flex items-center gap-1"><Icon icon="mdi:arrow-right-bold" class="size-4" /> Carried forward (T613)</span>
					{:else}
						<span class="inline-flex items-center gap-1"><Icon icon="mdi:information-outline" class="size-4" /> Default lineup</span>
					{/if}
				</div>
				<div class="flex gap-2">
					<Button size="xs" color="alternative" onclick={onHistory}>History</Button>
					{#if canEdit}
						<Button size="xs" color="primary" onclick={onEdit}>Enter / change</Button>
					{/if}
				</div>
			</div>
		{/if}
	{:else if side.allianceNumber}
		<div class="text-sm text-gray-500">Alliance {side.allianceNumber} is not set up yet.</div>
	{:else}
		<div class="text-sm text-gray-500">Assign an alliance to this side to manage its lineup.</div>
	{/if}
</div>
