<script lang="ts">
	import { Alert, Button, Input } from "flowbite-svelte";
	import { trpc } from "../../main";
	import type { Alliance } from "../../util/scorekeeperTypes";

	interface Props {
		alliances: Alliance[];
		canEdit: boolean;
		onChanged: () => void;
	}

	let { alliances, canEdit, onChanged }: Props = $props();

	// "" represents an empty input (flowbite Input rejects null).
	interface Row {
		captain: number | "";
		pick1: number | "";
		pick2: number | "";
		backup: number | "";
	}

	// Editable rows for alliances 1..8, seeded from existing data.
	let rows = $state<Row[]>([]);
	$effect(() => {
		rows = Array.from({ length: 8 }, (_, i) => {
			const a = alliances.find((al) => al.number === i + 1);
			return {
				captain: a?.captain_team ?? "",
				pick1: a?.pick1_team ?? "",
				pick2: a?.pick2_team ?? "",
				backup: a?.backup_team ?? "",
			};
		});
	});

	const orNull = (v: number | "") => (v === "" ? null : v);

	let busy = $state(false);
	let error = $state("");
	let importing = $state(false);

	async function save(index: number) {
		const row = rows[index];
		if (row.captain === "" || row.pick1 === "") {
			error = `Alliance ${index + 1} needs at least a captain and first pick.`;
			return;
		}
		busy = true;
		error = "";
		try {
			await trpc.scorekeeper.alliances.upsert.mutate({
				number: index + 1,
				captainTeam: row.captain,
				pick1Team: row.pick1,
				pick2Team: orNull(row.pick2),
				backupTeam: orNull(row.backup),
			});
			onChanged();
		} catch (err) {
			console.error("[scorekeeper] alliance save failed:", err);
			error = err instanceof Error ? err.message : "Failed to save alliance";
		} finally {
			busy = false;
		}
	}

	async function importFromTBA() {
		importing = true;
		error = "";
		try {
			const res = await trpc.scorekeeper.alliances.importFromTBA.mutate();
			onChanged();
			if (res.imported === 0) error = "TBA returned no alliances yet.";
		} catch (err) {
			console.error("[scorekeeper] TBA import failed:", err);
			error = err instanceof Error ? err.message : "Failed to import from TBA";
		} finally {
			importing = false;
		}
	}
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-bold text-gray-900 dark:text-white">Alliances</h2>
		{#if canEdit}
			<Button size="sm" color="alternative" onclick={importFromTBA} disabled={importing}>
				{importing ? "Importing..." : "Import from TBA"}
			</Button>
		{/if}
	</div>

	{#if error}
		<Alert color="red">{error}</Alert>
	{/if}

	<div class="flex flex-col gap-2">
		{#each rows as row, i (i)}
			<div class="flex items-center gap-2 rounded-md border border-gray-200 dark:border-neutral-700 p-2">
				<span class="w-16 shrink-0 font-bold text-gray-900 dark:text-white">A{i + 1}</span>
				<Input type="number" size="sm" placeholder="Captain" bind:value={row.captain} disabled={!canEdit} />
				<Input type="number" size="sm" placeholder="Pick 1" bind:value={row.pick1} disabled={!canEdit} />
				<Input type="number" size="sm" placeholder="Pick 2" bind:value={row.pick2} disabled={!canEdit} />
				<Input type="number" size="sm" placeholder="Backup" bind:value={row.backup} disabled={!canEdit} />
				{#if canEdit}
					<Button size="xs" color="primary" onclick={() => save(i)} disabled={busy}>Save</Button>
				{/if}
			</div>
		{/each}
	</div>
</div>
