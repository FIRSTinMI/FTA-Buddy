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
	}

	let { side, teamName, canEdit, onEdit, onHistory }: Props = $props();

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
</script>

<div class="rounded-lg border-2 p-3 flex flex-col gap-2 {colorClasses}">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<span class="rounded-md px-2 py-1 text-sm font-bold uppercase {chipClasses}">{side.color}</span>
			{#if side.allianceNumber}
				<span class="text-lg font-bold text-gray-900 dark:text-white">Alliance {side.allianceNumber}</span>
			{:else}
				<span class="text-lg font-bold text-gray-500">No alliance</span>
			{/if}
		</div>
		{#if side.lineup?.usesBackup}
			<Badge color="yellow">Backup in</Badge>
		{/if}
	</div>

	{#if side.allianceNumber && stations}
		<div class="grid grid-cols-3 gap-2">
			{#each [1, 2, 3] as ds (ds)}
				{@const team = ds === 1 ? stations.station1 : ds === 2 ? stations.station2 : stations.station3}
				<div class="rounded-md bg-white dark:bg-neutral-800 p-2 text-center">
					<div class="text-xs text-gray-500 uppercase">DS{ds}</div>
					<div class="text-xl font-bold text-gray-900 dark:text-white">{team ?? "-"}</div>
					<div class="text-[10px] text-gray-500 truncate" title={teamName(team)}>{teamName(team)}</div>
				</div>
			{/each}
		</div>

		<div class="flex items-center justify-between">
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
	{:else if side.allianceNumber}
		<div class="text-sm text-gray-500">Alliance {side.allianceNumber} is not set up yet.</div>
	{:else}
		<div class="text-sm text-gray-500">Assign an alliance to this side to manage its lineup.</div>
	{/if}
</div>
