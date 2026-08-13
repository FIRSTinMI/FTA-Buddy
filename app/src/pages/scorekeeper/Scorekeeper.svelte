<script lang="ts">
	import { Button, Select } from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import Spinner from "../../components/Spinner.svelte";
	import AllianceLineupCard from "../../components/scorekeeper/AllianceLineupCard.svelte";
	import AllianceSetup from "../../components/scorekeeper/AllianceSetup.svelte";
	import LineupEditor from "../../components/scorekeeper/LineupEditor.svelte";
	import LineupHistory from "../../components/scorekeeper/LineupHistory.svelte";
	import type { LineupStations } from "../../../../shared/types";
	import { trpc } from "../../main";
	import { eventStore } from "../../stores/event";
	import { userStore } from "../../stores/user";
	import type { Alliance, ForMatch, LineupSide } from "../../util/scorekeeperTypes";

	// FTA/FTAA/Scorekeeper/admin may edit; everyone with the view may read.
	const canEdit = $derived(
		$userStore.admin ||
			["Scorekeeper", "FTA", "FTAA", "System"].includes($userStore.role),
	);

	let tab = $state<"lineups" | "alliances" | "quals">("lineups");

	// Team number -> short name, from the event store roster.
	let teamNames = $derived.by(() => {
		const map: Record<string, string> = {};
		for (const t of $eventStore.teams ?? []) map[String(t.number)] = t.name ?? "";
		return map;
	});
	function teamName(team: number | null): string {
		if (team == null) return "";
		const n = teamNames[String(team)] ?? "";
		return n.length > 22 ? n.slice(0, 22) + "..." : n;
	}

	let alliances = $state<Alliance[]>([]);
	async function loadAlliances() {
		try {
			alliances = await trpc.scorekeeper.alliances.list.query();
		} catch (err) {
			console.error("[scorekeeper] alliance list failed:", err);
		}
	}

	// Current match + red/blue selection.
	let matchNumber = $state(1);
	let playNumber = $state(1);
	let redAlliance = $state<number | null>(null);
	let blueAlliance = $state<number | null>(null);
	let forMatch = $state<ForMatch | null>(null);
	let loadingMatch = $state(false);

	const allianceOptions = $derived([
		{ value: 0, name: "Auto / none" },
		...Array.from({ length: 8 }, (_, i) => ({ value: i + 1, name: `Alliance ${i + 1}` })),
	]);

	async function loadForMatch() {
		loadingMatch = true;
		try {
			forMatch = await trpc.scorekeeper.lineups.forMatch.query({
				matchNumber,
				playNumber,
				redAlliance,
				blueAlliance,
			});
			// Reflect the resolved alliances back into the selectors.
			redAlliance = forMatch.red.allianceNumber;
			blueAlliance = forMatch.blue.allianceNumber;
		} catch (err) {
			console.error("[scorekeeper] forMatch failed:", err);
			forMatch = null;
		} finally {
			loadingMatch = false;
		}
	}

	async function changeMatch(n: number) {
		if (n < 1) return;
		matchNumber = n;
		// Reset selection so the server can auto-detect for the new match.
		redAlliance = null;
		blueAlliance = null;
		await loadForMatch();
	}

	// Editor / history modal state.
	let editorOpen = $state(false);
	let editorAlliance = $state<Alliance | null>(null);
	let editorInitial = $state<LineupStations | null>(null);
	let historyOpen = $state(false);
	let historyAllianceNumber = $state(1);

	function openEditor(side: LineupSide) {
		if (!side.allianceNumber) return;
		const alliance = alliances.find((a) => a.number === side.allianceNumber);
		if (!alliance) return;
		editorAlliance = alliance;
		editorInitial = side.lineup?.stations ?? null;
		editorOpen = true;
	}
	function openHistory(side: LineupSide) {
		if (!side.allianceNumber) return;
		historyAllianceNumber = side.allianceNumber;
		historyOpen = true;
	}

	// Qualification panel (reuses existing cycle data).
	let cycleData = $state<Awaited<ReturnType<typeof trpc.cycles.getCycleData.query>> | null>(null);
	let eventCycles = $state<Awaited<ReturnType<typeof trpc.cycles.getEventCycles.query>>>([]);
	async function loadQuals() {
		const code = $eventStore.code;
		if (!code) return;
		try {
			[cycleData, eventCycles] = await Promise.all([
				trpc.cycles.getCycleData.query({ eventCode: code }),
				trpc.cycles.getEventCycles.query({ eventCode: code }),
			]);
		} catch (err) {
			console.error("[scorekeeper] quals load failed:", err);
		}
	}
	const completedCycles = $derived(
		[...eventCycles]
			.filter((c) => c.calculated_cycle_time)
			.sort((a, b) => b.match_number - a.match_number),
	);

	let sub: { unsubscribe: () => void } | undefined;
	onMount(async () => {
		await loadAlliances();
		// Default to the live match when it is a playoff match.
		try {
			const live = await trpc.cycles.getCycleData.query({ eventCode: $eventStore.code });
			if (live?.level === "Playoff" && live.match) matchNumber = live.match;
		} catch {
			// non-fatal; scorekeeper can pick the match manually
		}
		await loadForMatch();
		await loadQuals();

		// Live refresh when any device changes alliances or lineups.
		sub = trpc.scorekeeper.lineups.subscribe.subscribe(undefined, {
			onData: () => {
				loadAlliances();
				loadForMatch();
			},
			onError: (err) => console.warn("[scorekeeper] subscription error:", err),
		});
	});
	onDestroy(() => sub?.unsubscribe());

	function onLineupSubmitted() {
		editorOpen = false;
		loadForMatch();
	}
</script>

<div class="flex flex-col gap-3 p-3 max-w-3xl mx-auto w-full">
	<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Scorekeeper</h1>

	<div class="flex gap-1 border-b border-gray-200 dark:border-neutral-700">
		{#each [["lineups", "Lineups"], ["alliances", "Alliances"], ["quals", "Qualification"]] as [id, label] (id)}
			<button
				class="px-3 py-2 text-sm font-medium -mb-px border-b-2 {tab === id
					? 'border-primary-600 text-primary-700 dark:text-primary-400'
					: 'border-transparent text-gray-500'}"
				onclick={() => (tab = id as typeof tab)}
			>
				{label}
			</button>
		{/each}
	</div>

	{#if tab === "lineups"}
		<div class="flex flex-wrap items-end gap-2">
			<div class="flex items-center gap-1">
				<Button size="sm" color="alternative" onclick={() => changeMatch(matchNumber - 1)}>-</Button>
				<div class="text-center">
					<div class="text-xs text-gray-500 uppercase">Playoff match</div>
					<div class="text-xl font-bold text-gray-900 dark:text-white">{matchNumber}</div>
				</div>
				<Button size="sm" color="alternative" onclick={() => changeMatch(matchNumber + 1)}>+</Button>
			</div>
			<label class="flex flex-col gap-1 text-xs text-gray-500">
				Red alliance
				<Select
					class="w-36"
					items={allianceOptions}
					value={redAlliance ?? 0}
					onchange={(e) => {
						redAlliance = parseInt((e.target as HTMLSelectElement).value) || null;
						loadForMatch();
					}}
				/>
			</label>
			<label class="flex flex-col gap-1 text-xs text-gray-500">
				Blue alliance
				<Select
					class="w-36"
					items={allianceOptions}
					value={blueAlliance ?? 0}
					onchange={(e) => {
						blueAlliance = parseInt((e.target as HTMLSelectElement).value) || null;
						loadForMatch();
					}}
				/>
			</label>
		</div>

		{#if forMatch?.deadlineAt}
			<div class="text-xs text-gray-500">
				T613 lineup deadline: <span class="font-semibold"
					>{new Date(forMatch.deadlineAt).toLocaleTimeString()}</span
				>
				(2 min before expected start)
			</div>
		{:else}
			<div class="text-xs text-amber-600">
				No scheduled start for this match, so the T613 deadline cannot be enforced automatically.
			</div>
		{/if}

		{#if loadingMatch && !forMatch}
			<Spinner />
		{:else if forMatch}
			<div class="grid gap-3 md:grid-cols-2">
				<AllianceLineupCard
					side={forMatch.red}
					{teamName}
					{canEdit}
					onEdit={() => openEditor(forMatch!.red)}
					onHistory={() => openHistory(forMatch!.red)}
				/>
				<AllianceLineupCard
					side={forMatch.blue}
					{teamName}
					{canEdit}
					onEdit={() => openEditor(forMatch!.blue)}
					onHistory={() => openHistory(forMatch!.blue)}
				/>
			</div>
		{/if}
	{:else if tab === "alliances"}
		<AllianceSetup {alliances} {canEdit} onChanged={loadAlliances} />
	{:else if tab === "quals"}
		<div class="flex flex-col gap-3">
			<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
				{#each [["Ahead/behind", cycleData?.exactAheadBehind ?? cycleData?.aheadBehind ?? "-"], ["Last cycle", cycleData?.lastCycleTime ?? "-"], ["Avg cycle", cycleData?.averageCycleTime ? `${Math.round(cycleData.averageCycleTime / 1000)}s` : "-"], ["Best cycle", cycleData?.bestCycleTime ?? "-"]] as [label, value] (label)}
					<div class="rounded-md border border-gray-200 dark:border-neutral-700 p-2 text-center">
						<div class="text-xs text-gray-500 uppercase">{label}</div>
						<div class="text-lg font-bold text-gray-900 dark:text-white">{value}</div>
					</div>
				{/each}
			</div>
			<h2 class="text-lg font-bold text-gray-900 dark:text-white">Completed matches</h2>
			{#if completedCycles.length === 0}
				<div class="text-gray-500 text-sm">No completed cycle times recorded yet.</div>
			{:else}
				<div class="flex flex-col gap-1">
					{#each completedCycles as c (c.id)}
						<div class="flex justify-between rounded border border-gray-200 dark:border-neutral-700 px-2 py-1 text-sm">
							<span>{c.level} {c.match_number}{c.play_number > 1 ? `-${c.play_number}` : ""}</span>
							<span class="font-mono">{c.calculated_cycle_time}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if editorOpen && editorAlliance}
	{#key `${editorAlliance.number}-${matchNumber}`}
		<LineupEditor
			bind:open={editorOpen}
			alliance={editorAlliance}
			{matchNumber}
			{playNumber}
			initial={editorInitial}
			{teamName}
			onClose={() => (editorOpen = false)}
			onSubmitted={onLineupSubmitted}
		/>
	{/key}
{/if}

<LineupHistory
	bind:open={historyOpen}
	allianceNumber={historyAllianceNumber}
	{teamName}
	onClose={() => (historyOpen = false)}
/>
