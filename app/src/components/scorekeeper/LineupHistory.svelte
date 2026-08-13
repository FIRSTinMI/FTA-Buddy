<script lang="ts">
	import { Badge, Modal } from "flowbite-svelte";
	import { trpc } from "../../main";
	import type { HistoryCard } from "../../util/scorekeeperTypes";

	interface Props {
		open: boolean;
		allianceNumber: number;
		teamName: (team: number | null) => string;
		onClose: () => void;
	}

	let { open = $bindable(), allianceNumber, teamName, onClose }: Props = $props();

	let cards = $state<HistoryCard[]>([]);
	let loading = $state(false);
	let error = $state("");

	async function load() {
		loading = true;
		error = "";
		try {
			cards = await trpc.scorekeeper.lineups.history.query({ allianceNumber });
		} catch (err) {
			console.error("[scorekeeper] history load failed:", err);
			error = err instanceof Error ? err.message : "Failed to load history";
		} finally {
			loading = false;
		}
	}

	// Reload whenever the modal opens for a (possibly different) alliance.
	$effect(() => {
		if (open) load();
	});

	function statusColor(status: HistoryCard["status"]): "green" | "gray" | "red" {
		return status === "accepted" ? "green" : status === "superseded" ? "gray" : "red";
	}
</script>

<Modal bind:open title={`Lineup history: Alliance ${allianceNumber}`} onclose={onClose} outsideclose size="lg">
	{#if loading}
		<div class="text-gray-500">Loading...</div>
	{:else if error}
		<div class="text-red-600">{error}</div>
	{:else if cards.length === 0}
		<div class="text-gray-500">No lineups submitted yet for this alliance.</div>
	{:else}
		<div class="flex flex-col gap-2">
			{#each cards as card (card.id)}
				<div class="rounded-md border border-gray-200 dark:border-neutral-700 p-2 text-sm">
					<div class="flex items-center justify-between">
						<span class="font-semibold text-gray-900 dark:text-white">
							Match {card.match_number} - v{card.version}
						</span>
						<div class="flex gap-1">
							<Badge color={statusColor(card.status)}>{card.status}</Badge>
							{#if card.is_late}<Badge color="red">late</Badge>{/if}
							{#if card.accepted_anyway}<Badge color="yellow">accepted anyway</Badge>{/if}
							{#if card.uses_backup}<Badge color="purple">backup</Badge>{/if}
						</div>
					</div>
					<div class="mt-1 grid grid-cols-3 gap-2">
						{#each [card.station1_team, card.station2_team, card.station3_team] as team, i (i)}
							<div class="rounded bg-gray-50 dark:bg-neutral-800 p-1 text-center">
								<span class="text-[10px] text-gray-500">DS{i + 1}</span>
								<div class="font-bold">{team ?? "-"}</div>
								<div class="text-[10px] text-gray-500 truncate">{teamName(team)}</div>
							</div>
						{/each}
					</div>
					<div class="mt-1 text-xs text-gray-500">
						{new Date(card.submitted_at).toLocaleString()}
						{#if card.submitted_by_name}- {card.submitted_by_name}{/if}
						{#if card.note}<div class="italic">{card.note}</div>{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</Modal>
