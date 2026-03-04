<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Badge, Button, Toggle } from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import type { MatchEvent, MatchEventUpdateEventData, MonitorFrame, Note, NoteUpdateEventData, RobotInfo } from "../../../../shared/types";
	import { DSState, ROBOT } from "../../../../shared/types";
	import { frameHandler, subscribeToFieldMonitor } from "../../field-monitor";
	import { trpc } from "../../main";
	import { navigate } from "../../router";
	import { eventStore } from "../../stores/event";
	import { userStore } from "../../stores/user";
	import type { MonitorEvent } from "../../util/monitorFrameHandler";
	import MatchEventCard from "../MatchEventCard.svelte";
	import Spinner from "../Spinner.svelte";
	import AddQuickNoteModal from "./AddQuickNoteModal.svelte";

	// Match index for prev/next navigation
	interface MatchInfo {
		id: string;
		match_number: number;
		play_number: number;
		level: string;
		blue1: number | null;
		blue2: number | null;
		blue3: number | null;
		red1: number | null;
		red2: number | null;
		red3: number | null;
	}

	let allMatches: MatchInfo[] = $state([]);
	let matchIndex = $state(-1); // -1 = live/current match
	let autoAdvance = $state(true);

	let monitorFrame: MonitorFrame | undefined = $state(frameHandler.getFrame());

	// Current 6 teams
	let teams = $derived.by(() => {
		if (matchIndex >= 0 && matchIndex < allMatches.length) {
			const m = allMatches[matchIndex];
			return {
				blue1: m.blue1 ?? 0,
				blue2: m.blue2 ?? 0,
				blue3: m.blue3 ?? 0,
				red1: m.red1 ?? 0,
				red2: m.red2 ?? 0,
				red3: m.red3 ?? 0,
				match_number: m.match_number,
				play_number: m.play_number,
				level: m.level,
			};
		}
		if (monitorFrame) {
			return {
				blue1: monitorFrame.blue1.number,
				blue2: monitorFrame.blue2.number,
				blue3: monitorFrame.blue3.number,
				red1: monitorFrame.red1.number,
				red2: monitorFrame.red2.number,
				red3: monitorFrame.red3.number,
				match_number: monitorFrame.match,
				play_number: monitorFrame.play,
				level: monitorFrame.level,
			};
		}
		return null;
	});

	let matchLabel = $derived.by(() => {
		if (!teams) return "No match data";
		const lvl = teams.level === "Qualification" ? "Qual" : teams.level === "Playoff" ? "Playoff" : teams.level;
		return `${lvl} Match ${teams.match_number}${teams.play_number > 1 ? ` P${teams.play_number}` : ""}`;
	});

	let isLive = $derived(matchIndex === -1);

	interface TeamData {
		teamNumber: number;
		notes: Note[];
		matchEvents: MatchEvent[];
		loading: boolean;
	}

	let teamData: Record<number, TeamData> = $state({});

	// Modal state
	let modalOpen = $state(false);
	let modalTeamNum = $state(0);

	// Notes for a team
	async function loadTeamData(teamNumber: number) {
		if (teamNumber === 0) return;
		if (teamData[teamNumber] && !teamData[teamNumber].loading) return;

		teamData[teamNumber] = { teamNumber, notes: [], matchEvents: [], loading: true };

		try {
			const [teamNotes, teamMatchEvents] = await Promise.all([
				trpc.notes.getAllByTeam.query({ team_number: teamNumber }),
				trpc.matchEvents.getByTeam.query({ team_number: teamNumber }),
			]);
			teamData[teamNumber] = {
				teamNumber,
				notes: teamNotes,
				matchEvents: teamMatchEvents,
				loading: false,
			};
		} catch (err) {
			console.error(`Failed to load data for team ${teamNumber}:`, err);
			teamData[teamNumber] = { teamNumber, notes: [], matchEvents: [], loading: false };
		}
	}

	let teamKey = $derived.by(() => {
		if (!teams) return "";
		return `${teams.blue1},${teams.blue2},${teams.blue3},${teams.red1},${teams.red2},${teams.red3}`;
	});

	// Load all 6 teams only when the team key change
	let lastTeamKey = "";
	$effect(() => {
		const key = teamKey;
		if (key && key !== lastTeamKey) {
			lastTeamKey = key;
			teamData = {};
			if (teams) {
				const nums = [teams.blue1, teams.blue2, teams.blue3, teams.red1, teams.red2, teams.red3];
				for (const n of nums) {
					if (n && n > 0) loadTeamData(n);
				}
			}
		}
	});

	function onFrame(evt: Event) {
		monitorFrame = (evt as MonitorEvent).detail.frame;
	}

	function onPrestart(evt: Event) {
		if (autoAdvance) {
			matchIndex = -1; // snap to live
			monitorFrame = (evt as MonitorEvent).detail.frame;
		}
	}

	// Match navigation
	async function loadMatchIndex() {
		try {
			allMatches = await trpc.match.getMatches.query({});
		} catch {
			allMatches = [];
		}
	}

	function goToPrevMatch() {
		autoAdvance = false;
		if (matchIndex === -1) {
			if (allMatches.length > 0) {
				matchIndex = allMatches.length - 1;
			}
		} else if (matchIndex > 0) {
			matchIndex--;
		}
	}

	function goToNextMatch() {
		if (matchIndex >= 0 && matchIndex < allMatches.length - 1) {
			autoAdvance = false;
			matchIndex++;
		}
	}

	// When autoAdvance is turned on (via toggle), immediately snap back to live
	$effect(() => {
		if (autoAdvance) matchIndex = -1;
	});

	function goToLive() {
		matchIndex = -1;
		autoAdvance = true;
	}

	function openNoteModal(teamNumber: number) {
		modalTeamNum = teamNumber;
		modalOpen = true;
	}

	function onModalSaved() {
		delete teamData[modalTeamNum];
		loadTeamData(modalTeamNum);
	}

	// Live subscription for updates
	type NoteSubscription = ReturnType<typeof trpc.notes.updateSubscription.subscribe>;
	type MatchEventSubscription = ReturnType<typeof trpc.matchEvents.updateSubscription.subscribe>;
	let subscription: NoteSubscription | undefined;
	let matchEventSubscription: MatchEventSubscription | undefined;

	function startSubscription() {
		subscription?.unsubscribe();
		subscription = trpc.notes.updateSubscription.subscribe(
			{ eventToken: $userStore.eventToken, source: `${$userStore.username}.field` },
			{
				onError: console.error,
				onData: (data: NoteUpdateEventData) => {
					switch (data.kind) {
						case "create": {
							const teamNum = data.note.team;
							if (teamNum !== null && teamData[teamNum]) {
								teamData[teamNum].notes = [...teamData[teamNum].notes, data.note];
							}
							break;
						}
						case "edit": {
							const teamNum = data.note.team;
							if (teamNum !== null && teamData[teamNum]) {
								const td = teamData[teamNum];
								const idx = td.notes.findIndex((n) => n.id === data.note.id);
								if (idx !== -1) td.notes[idx] = data.note;
								td.notes = [...td.notes];
							}
							break;
						}
						case "delete": {
							const teamNum = data.note.team;
							if (teamNum !== null && teamData[teamNum]) {
								teamData[teamNum].notes = teamData[teamNum].notes.filter((n) => n.id !== data.note.id);
							}
							break;
						}
						case "status": {
							for (const td of Object.values(teamData)) {
								if (!td) continue;
								const note = td.notes.find((n) => n.id === data.note_id);
								if (note) {
									note.resolution_status = data.resolution_status;
									note.updated_at = new Date();
									td.notes = [...td.notes];
									break;
								}
							}
							break;
						}
						case "assign": {
							for (const td of Object.values(teamData)) {
								if (!td) continue;
								const note = td.notes.find((n) => n.id === data.note_id);
								if (note) {
									note.assigned_to = data.assigned_to;
									note.assigned_to_id = data.assigned_to_id;
									note.updated_at = new Date();
									td.notes = [...td.notes];
									break;
								}
							}
							break;
						}
					}
				},
			},
		);
	}

	function startMatchEventSubscription() {
		matchEventSubscription?.unsubscribe();
		matchEventSubscription = trpc.matchEvents.updateSubscription.subscribe(
			{ eventToken: $userStore.eventToken },
			{
				onError: console.error,
				onData: (data: MatchEventUpdateEventData) => {
					switch (data.kind) {
						case "match_event_create": {
							const teamNum = data.matchEvent.team;
							if (teamNum !== null && teamData[teamNum]) {
								teamData[teamNum].matchEvents = [...teamData[teamNum].matchEvents, data.matchEvent];
							}
							break;
						}
						case "match_event_dismiss":
						case "match_event_convert": {
							for (const td of Object.values(teamData)) {
								if (!td) continue;
								const idx = td.matchEvents.findIndex((e) => e.id === data.id);
								if (idx !== -1) {
									td.matchEvents = td.matchEvents.filter((e) => e.id !== data.id);
									break;
								}
							}
							break;
						}
					}
				},
			},
		);
	}

	onMount(() => {
		if (!frameHandler.getFrame()) {
			subscribeToFieldMonitor();
		}
		frameHandler.addEventListener("frame", onFrame);
		frameHandler.addEventListener("prestart", onPrestart);
		loadMatchIndex();
		startSubscription();
		startMatchEventSubscription();
	});

	onDestroy(() => {
		frameHandler.removeEventListener("frame", onFrame);
		frameHandler.removeEventListener("prestart", onPrestart);
		subscription?.unsubscribe();
		matchEventSubscription?.unsubscribe();
	});

	function dsColor(ds: number): string {
		if (ds === DSState.ESTOP || ds === DSState.ASTOP) return "bg-red-800";
		if (ds === DSState.RED) return "bg-red-600";
		if (ds === DSState.MOVE_STATION || ds === DSState.WAITING) return "bg-yellow-400";
		if (ds === DSState.BYPASS) return "bg-orange-400";
		return "bg-green-500";
	}
</script>

{#snippet teamCard(teamNum: number, alliance: "blue" | "red", slot: 1 | 2 | 3)}
	{@const stationKey = `${alliance}${slot}` as ROBOT}
	{@const liveRobot = monitorFrame?.[stationKey] as RobotInfo | undefined}
	{@const currentMatchId = matchIndex >= 0 ? allMatches[matchIndex]?.id : undefined}
	{@const td = teamData[teamNum]}
	{@const teamName = $eventStore.teams.find((t) => t.number === String(teamNum))?.name ?? ""}
	{@const allItems =
		td && !td.loading
			? [
				...td.notes.map((n) => ({ kind: "note" as const, date: n.updated_at, note: n })),
				...td.matchEvents.map((e) => ({ kind: "event" as const, date: new Date(e.created_at), matchEvent: e })),
			].sort((a, b) => b.date.getTime() - a.date.getTime())
			: []}
	{@const eventSummaries = td && !td.loading && td.matchEvents.length > 0
		? Object.entries(
			td.matchEvents.reduce<Record<string, number>>((acc, e) => {
				acc[e.issue] = (acc[e.issue] ?? 0) + 1;
				return acc;
			}, {})
		).map(([issue, count]) => `${issue} x${count}`)
		: []}
	<div class="flex-1 min-h-0 flex flex-col rounded-lg overflow-hidden shadow dark:bg-neutral-800 bg-white">
		<div class="shrink-0 flex {alliance === 'blue' ? 'bg-blue-600' : 'bg-red-600'}">
			<button
				class="flex-1 px-3 py-1.5 font-bold text-white text-left flex items-center gap-2"
				onclick={() => navigate("/notepad/team/:team", { params: { team: String(teamNum) } })}
			>
				#{teamNum}
				{#if teamName}
					<span class="text-sm font-normal opacity-80">{teamName}</span>
				{/if}
			</button>
			{#if currentMatchId}
				<button
					class="px-2 py-1.5 text-white hover:bg-white/20 flex items-center gap-1 text-xs border-l border-white/20"
					onclick={() =>
						navigate("/logs/:matchid/:station", {
							params: { matchid: currentMatchId, station: stationKey },
						})}
					title="View station log"
				>
					<Icon icon="mdi:chart-line" class="size-3.5" />Log
				</button>
			{/if}
		</div>
		{#if liveRobot && isLive}
			<div
				class="shrink-0 flex items-center gap-1 sm:gap-2 px-2 py-1 sm:py-1.5 border-b border-gray-200 dark:border-gray-700 text-xs"
			>
				<div
					class="size-4 sm:size-6 rounded-sm flex items-center justify-center text-black font-bold text-[9px] sm:text-[10px] shrink-0 {dsColor(
						liveRobot.ds,
					)}"
					title="Driver Station: {liveRobot.ds === DSState.GREEN_X
						? 'Green X'
						: liveRobot.ds === DSState.BYPASS
							? 'Bypass'
							: liveRobot.ds === DSState.ESTOP
								? 'E-Stop'
								: liveRobot.ds === DSState.ASTOP
									? 'A-Stop'
									: liveRobot.ds === DSState.MOVE_STATION
										? 'Move Station'
										: liveRobot.ds === DSState.WAITING
											? 'Waiting'
											: liveRobot.ds === DSState.RED
												? 'No DS'
												: 'Connected'}"
				>
					{#if liveRobot.ds === DSState.GREEN_X}X
					{:else if liveRobot.ds === DSState.BYPASS}B
					{:else if liveRobot.ds === DSState.ESTOP}E
					{:else if liveRobot.ds === DSState.ASTOP}A
					{:else if liveRobot.ds === DSState.MOVE_STATION}M
					{/if}
				</div>
				<div
					class="size-4 sm:size-6 rounded-sm shrink-0 {liveRobot.radio || liveRobot.radioConnected
						? 'bg-green-500'
						: 'bg-red-600'}"
					title="Radio: {liveRobot.radio
						? 'Connected'
						: liveRobot.radioConnected
							? 'Connected (no data)'
							: 'No radio'}"
				></div>
				<div
					class="size-4 sm:size-6 rounded-sm flex items-center justify-center text-black text-[9px] sm:text-[10px] font-bold shrink-0 {liveRobot.rio
						? 'bg-green-500'
						: 'bg-red-600'}"
					title="RoboRIO: {liveRobot.rio ? (liveRobot.code ? 'Code running' : 'No code') : 'Not connected'}"
				>
					{#if liveRobot.rio && !liveRobot.code}X{/if}
				</div>
				<span
					class="tabular-nums font-mono text-[10px] sm:text-xs text-black dark:text-white shrink-0"
					title="Battery voltage">{liveRobot.battery.toFixed(1)}v</span
				>
				<span
					class="tabular-nums font-mono text-[10px] sm:text-xs text-black dark:text-white shrink-0"
					title="Round-trip ping">{liveRobot.ping}ms</span
				>
				<span
					class="tabular-nums font-mono text-[10px] sm:text-xs text-black dark:text-white shrink-0"
					title="Bandwidth utilization">{liveRobot.bwu.toFixed(2)}</span
				>
				<span
					class="tabular-nums font-mono text-[10px] sm:text-xs text-black dark:text-white shrink-0"
					title="Signal strength">{liveRobot.signal ?? 0}dBm</span
				>
			</div>
		{/if}
		<div class="min-h-0 overflow-hidden px-3">
			{#if td?.loading}
				<div class="flex justify-center py-2"><Spinner /></div>
			{:else}
				{#if eventSummaries.length > 0}
					<div class="py-1 border-b border-amber-200 dark:border-amber-800/40">
						<div class="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
							<Icon icon="mdi:alert-circle-outline" class="size-3 shrink-0" />
							<span class="font-semibold truncate">{eventSummaries.join(", ")}</span>
						</div>
					</div>
				{/if}
				{#if allItems.length > 0}
					{#each allItems.slice(0, 2) as item (item.kind === "note" ? `n-${item.note.id}` : `e-${item.matchEvent.id}`)}
						{#if item.kind === "note"}
							<button
								class="w-full text-left pt-1 mt-1 hover:bg-gray-50 dark:hover:bg-neutral-700 rounded px-0.5"
								onclick={() => navigate("/notepad/view/:id", { params: { id: item.note.id } })}
							>
								<div class="flex items-center gap-1 text-xs">
									<Badge color="blue" class="text-xs">Note</Badge>
									{#if item.note.resolution_status === "Open"}
										<span class="text-green-500 font-bold">Open</span>
									{:else if item.note.resolution_status === "Resolved"}
										<span class="text-gray-500">Resolved</span>
									{/if}
									{#if item.note.match_number}
										<span class="text-gray-400">M{item.note.match_number}</span>
									{/if}
								</div>
								<p class="text-sm text-black dark:text-white truncate">{item.note.text}</p>
							</button>
						{:else}
							<div class="pt-1 mt-1 px-0.5">
								<MatchEventCard matchEvent={item.matchEvent} compact
									onDismiss={(id) => { if (td) td.matchEvents = td.matchEvents.filter((e) => e.id !== id); }}
									onConvert={(id) => { if (td) td.matchEvents = td.matchEvents.filter((e) => e.id !== id); }}
								/>
							</div>
						{/if}
					{/each}
				{/if}
			{/if}
		</div>
		<button
			class="shrink-0 w-full text-left px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-neutral-700 flex items-center gap-1.5 transition-colors"
			onclick={() => openNoteModal(teamNum)}
		>
			<Icon icon="mdi:plus-circle-outline" class="size-3.5 shrink-0" />
			{allItems.length === 0 ? "No notes yet - click to add" : "Click to add note"}
		</button>
		{#if allItems.length > 2}
			<button
				class="shrink-0 text-xs text-blue-500 hover:underline py-1 text-center w-full border-t border-gray-200 dark:border-gray-700"
				onclick={() => navigate("/notepad/team/:team", { params: { team: String(teamNum) } })}
			>
				See more (+{allItems.length - 2})
			</button>
		{/if}
	</div>
{/snippet}

<AddQuickNoteModal
	bind:open={modalOpen}
	teamNumber={modalTeamNum}
	teamName={$eventStore.teams.find((t) => t.number === String(modalTeamNum))?.name ?? ""}
	alliance={modalTeamNum > 0 && teams
		? [teams.blue1, teams.blue2, teams.blue3].includes(modalTeamNum)
			? "blue"
			: "red"
		: "blue"}
	match_number={teams?.match_number}
	play_number={teams?.play_number}
	level={teams?.level}
	onSaved={onModalSaved}
	onClose={() => (modalOpen = false)}
/>

{#if !teams}
	<div class="flex items-center justify-center h-64">
		<p class="text-gray-500 dark:text-gray-400 text-lg">
			No field data available. Make sure the extension is connected.
		</p>
	</div>
{:else}
	<div class="flex flex-col h-full">
		<div class="shrink-0 px-3 pt-2 pb-1">
			<div class="flex items-center justify-between gap-2">
				<Button size="sm" color="alternative" onclick={goToPrevMatch} disabled={matchIndex === 0}>
					<Icon icon="mdi:chevron-left" class="size-5" />
				</Button>

				<div class="flex flex-col items-center min-w-0">
					<p
						class="font-bold text-lg sm:text-2xl leading-tight text-black dark:text-white text-center truncate"
					>
						{matchLabel}
					</p>
					<Badge
						color="green"
						class="text-xs mt-0.5 transition-opacity {isLive
							? 'opacity-100'
							: 'opacity-0 pointer-events-none'}">LIVE</Badge
					>
				</div>

				<Button
					size="sm"
					color="alternative"
					onclick={goToNextMatch}
					disabled={isLive || matchIndex >= allMatches.length - 1}
				>
					<Icon icon="mdi:chevron-right" class="size-5" />
				</Button>
			</div>
			<div class="flex justify-end items-center gap-1.5 mt-1">
				<Toggle size="small" bind:checked={autoAdvance} />
				<span class="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Current match</span>
			</div>
		</div>

		<div class="flex-1 min-h-0 grid grid-cols-2 gap-2 px-2 pb-2">
			<div class="flex flex-col gap-2 min-h-0">
				{#each [teams.blue1, teams.blue2, teams.blue3] as teamNum, i}
					{@render teamCard(teamNum, "blue", (i + 1) as 1 | 2 | 3)}
				{/each}
			</div>
			<div class="flex flex-col gap-2 min-h-0">
				{#each [teams.red1, teams.red2, teams.red3] as teamNum, i}
					{@render teamCard(teamNum, "red", (i + 1) as 1 | 2 | 3)}
				{/each}
			</div>
		</div>
	</div>
{/if}
