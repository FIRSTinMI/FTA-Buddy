<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Badge, Button } from "flowbite-svelte";
	import type { MatchEvent, Note } from "../../../../shared/types";
	import MatchEventCard from "../../components/MatchEventCard.svelte";
	import NoteCard from "../../components/NoteCard.svelte";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { route } from "../../router";
	import { track } from "../../util/telemetry";

	const { team } = route.getParams("/notepad/team/:team");
	const teamNumber = parseInt(team, 10);

	track("team_history_viewed", undefined, { team: teamNumber });

	type TBANextMatch = Awaited<ReturnType<typeof trpc.matchEvents.getNextMatchForTeam.query>>;

	let notes: Note[] = $state([]);
	let matchEvents: MatchEvent[] = $state([]);
	let nextMatch: TBANextMatch = $state(null);
	let loading = $state(true);
	let error: string | null = $state(null);

	async function fetchAll() {
		loading = true;
		error = null;
		try {
			const [fetchedNotes, fetchedEvents, fetchedNext] = await Promise.all([
				trpc.notes.getAllByTeam.query({ team_number: teamNumber }),
				trpc.matchEvents.getAllByTeam.query({ team_number: teamNumber }),
				trpc.matchEvents.getNextMatchForTeam.query({ team_number: teamNumber }),
			]);
			notes = fetchedNotes;
			matchEvents = fetchedEvents;
			nextMatch = fetchedNext;
		} catch (err: any) {
			error = err?.message ?? "Unknown error";
		} finally {
			loading = false;
		}
	}

	function formatNextMatch(m: NonNullable<TBANextMatch>): string {
		const levelMap: Record<string, string> = { qm: "Qual", qf: "QF", sf: "SF", f: "Final", ef: "EF" };
		const level = levelMap[m.comp_level] ?? m.comp_level.toUpperCase();
		if (m.comp_level === "qm") return `${level} ${m.match_number}`;
		return `${level} ${m.set_number}-${m.match_number}`;
	}

	function nextMatchAlliance(m: NonNullable<TBANextMatch>): "red" | "blue" | null {
		const key = `frc${teamNumber}`;
		if (m.alliances.red.team_keys.includes(key)) return "red";
		if (m.alliances.blue.team_keys.includes(key)) return "blue";
		return null;
	}

	function formatMatchTime(m: NonNullable<TBANextMatch>): string {
		const epoch = m.predicted_time ?? m.time;
		if (!epoch) return "";
		return new Date(epoch * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	}

	fetchAll();

	type FeedItem = { kind: "note"; note: Note; date: Date } | { kind: "event"; matchEvent: MatchEvent; date: Date };

	let feed = $derived.by(() => {
		const items: FeedItem[] = [
			...notes.map((n) => ({ kind: "note" as const, note: n, date: new Date(n.updated_at) })),
			...matchEvents.map((e) => ({ kind: "event" as const, matchEvent: e, date: new Date(e.created_at) })),
		];
		return items.sort((a, b) => b.date.getTime() - a.date.getTime());
	});

	let openNotes = $derived(notes.filter((n) => n.resolution_status === "Open").length);
	let resolvedNotes = $derived(notes.filter((n) => n.resolution_status === "Resolved").length);
	let activeEvents = $derived(matchEvents.filter((e) => e.status === "active").length);
	let dismissedEvents = $derived(matchEvents.filter((e) => e.status === "dismissed").length);
	let convertedEvents = $derived(matchEvents.filter((e) => e.status === "converted").length);

	function back() {
		history.back();
	}

	function setMatchEventStatus(id: string, status: MatchEvent["status"]) {
		matchEvents = matchEvents.map((event) => (event.id === id ? { ...event, status } : event));
	}
</script>

<div class="container max-w-4xl mx-auto px-2 pt-2 h-full flex flex-col gap-3">
	<!-- Header -->
	<div class="flex items-center gap-3 px-2 pt-2">
		<Button size="sm" color="alternative" onclick={back}>
			<Icon icon="mdi:arrow-left" class="size-4 mr-1" />Back
		</Button>
		<h1 class="text-2xl font-bold text-black dark:text-white">
			Team {teamNumber} - Full History
		</h1>
	</div>

	<!-- Content -->
	<div class="flex-1 min-h-0 overflow-y-auto pb-6">
		{#if loading}
			<div class="flex justify-center items-center py-16">
				<Spinner />
			</div>
		{:else if error}
			<div class="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
				<Icon icon="mdi:alert-circle-outline" class="size-12 text-red-400" />
				<p class="text-lg font-medium text-red-400">Failed to load data</p>
				<p class="text-sm">{error}</p>
				<Button size="sm" color="alternative" onclick={fetchAll}>
					<Icon icon="charm:refresh" class="size-4 mr-1" />Retry
				</Button>
			</div>
		{:else}
			{#if nextMatch}
				{@const alliance = nextMatchAlliance(nextMatch)}
				<p class="text-xs px-2 mb-4">
					<span
						class="font-semibold {alliance === 'red'
							? 'text-red-600 dark:text-red-400'
							: alliance === 'blue'
								? 'text-blue-600 dark:text-blue-400'
								: 'text-gray-500 dark:text-gray-400'}"
					>
						Next: {formatNextMatch(nextMatch)}{#if alliance}
							<span class="capitalize">{alliance}</span>{/if}
					</span>
					{#if formatMatchTime(nextMatch)}
						<span class="text-gray-400 dark:text-gray-500"> {formatMatchTime(nextMatch)}</span>
					{/if}
				</p>
			{/if}

			<!-- Stats bar -->
			<div class="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pb-4 text-sm text-gray-500 dark:text-gray-400">
				<div class="flex items-center gap-1.5">
					<Icon icon="mdi:note-multiple-outline" class="size-4" />
					<span>{notes.length} note{notes.length !== 1 ? "s" : ""}</span>
				</div>
				{#if openNotes > 0}
					<div class="flex items-center gap-1.5">
						<span class="inline-block size-2 rounded-full bg-green-500"></span>
						<span>{openNotes} open</span>
					</div>
				{/if}
				{#if resolvedNotes > 0}
					<div class="flex items-center gap-1.5">
						<span class="inline-block size-2 rounded-full bg-gray-400"></span>
						<span>{resolvedNotes} resolved</span>
					</div>
				{/if}
				<div class="flex items-center gap-1.5">
					<Icon icon="mdi:alert-circle-outline" class="size-4" />
					<span>{matchEvents.length} event{matchEvents.length !== 1 ? "s" : ""}</span>
				</div>
				{#if activeEvents > 0}
					<div class="flex items-center gap-1.5">
						<span class="inline-block size-2 rounded-full bg-amber-500"></span>
						<span>{activeEvents} active</span>
					</div>
				{/if}
				{#if dismissedEvents > 0}
					<div class="flex items-center gap-1.5">
						<span class="inline-block size-2 rounded-full bg-gray-400"></span>
						<span>{dismissedEvents} dismissed</span>
					</div>
				{/if}
				{#if convertedEvents > 0}
					<div class="flex items-center gap-1.5">
						<span class="inline-block size-2 rounded-full bg-blue-400"></span>
						<span>{convertedEvents} → note</span>
					</div>
				{/if}
			</div>

			{#if feed.length === 0}
				<div class="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
					<Icon icon="mdi:note-off-outline" class="size-12" />
					<p class="text-lg font-medium">No history for team {teamNumber}</p>
					<p class="text-sm">Notes and auto-detected events will appear here.</p>
				</div>
			{:else}
				<div class="flex flex-col gap-2 px-1">
					{#each feed as item}
						{#if item.kind === "note"}
							<NoteCard note={item.note} />
						{:else}
							<MatchEventCard
								matchEvent={item.matchEvent}
								onDismiss={(id) => setMatchEventStatus(id, "dismissed")}
								onConvert={(id) => setMatchEventStatus(id, "converted")}
							/>
						{/if}
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>
