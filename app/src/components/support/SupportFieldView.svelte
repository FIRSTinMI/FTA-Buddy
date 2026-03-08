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

	function sortNotes(notes: Note[]): Note[] {
		return notes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
	}

	// Modal state
	let modalOpen = $state(false);
	let modalTeamNum = $state(0);

	// Consolidate bypass events into a single entry
    type BypassGroup = { matchEvent: MatchEvent; bypassGroup?: MatchEvent[] };
	function consolidateBypassEvents(events: MatchEvent[]): BypassGroup[] {
		const nonBypass: BypassGroup[] = events.filter((e) => e.issue !== "Bypassed").map((e) => ({ matchEvent: e }));
		const bypass = events.filter((e) => e.issue === "Bypassed");
		if (bypass.length > 0) {
			const sorted = [...bypass].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
			nonBypass.push({ matchEvent: sorted[0], bypassGroup: bypass.length > 1 ? bypass : undefined });
		}
		return nonBypass;
	}

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
				notes: sortNotes(teamNotes),
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
								teamData[teamNum].notes = sortNotes([...teamData[teamNum].notes, data.note]);
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
		window.addEventListener("resize", handleResize);
	});

	onDestroy(() => {
		frameHandler.removeEventListener("frame", onFrame);
		frameHandler.removeEventListener("prestart", onPrestart);
		subscription?.unsubscribe();
		matchEventSubscription?.unsubscribe();
		window.removeEventListener("resize", handleResize);
	});

	function dsColor(ds: number): string {
		if (ds === DSState.ESTOP || ds === DSState.ASTOP) return "bg-red-800";
		if (ds === DSState.RED) return "bg-red-600";
		if (ds === DSState.MOVE_STATION || ds === DSState.WAITING) return "bg-yellow-400";
		if (ds === DSState.BYPASS) return "bg-orange-400";
		return "bg-green-500";
	}

	// Compact mode for shorter screens (e.g. 1366x768)
	let isShortScreen = $state(typeof window !== "undefined" && window.innerHeight < 900);
	function handleResize() {
		isShortScreen = window.innerHeight < 900;
	}
</script>

{#snippet teamCard(teamNum: number, alliance: "blue" | "red", slot: 1 | 2 | 3)}
	{@const stationKey = `${alliance}${slot}` as ROBOT}
	{@const liveRobot = monitorFrame?.[stationKey] as RobotInfo | undefined}
	{@const currentMatchId = matchIndex >= 0 ? allMatches[matchIndex]?.id : undefined}
	{@const td = teamData[teamNum]}
	{@const teamName = $eventStore.teams.find((t) => t.number === String(teamNum))?.name ?? ""}
	{@const itemCount = td && !td.loading ? td.notes.length + td.matchEvents.length : 0}
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
				class="flex-1 px-2.5 sm:px-3 {isShortScreen ? 'py-0.5 sm:py-1' : 'py-1 sm:py-1.5'} font-bold text-white text-left flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base {isShortScreen ? '' : 'lg:text-lg'}"
				onclick={() => navigate("/notepad/team/:team", { params: { team: String(teamNum) } })}
			>
				<span class="leading-none">#{teamNum}</span>
				{#if teamName}
					<span class="text-[11px] sm:text-sm lg:text-base font-normal opacity-80 truncate">{teamName}</span>
				{/if}
			</button>
			{#if currentMatchId}
				<button
					class="px-1.5 sm:px-2 {isShortScreen ? 'py-0.5' : 'py-1 sm:py-1.5'} text-white hover:bg-white/20 flex items-center gap-1 text-[10px] sm:text-xs lg:text-sm border-l border-white/20"
					onclick={() =>
						navigate("/logs/:matchid/:station", {
							params: { matchid: currentMatchId, station: stationKey },
						})}
					title="View station log"
				>
					<Icon icon="mdi:chart-line" class="size-3 sm:size-3.5 lg:size-4" />Log
				</button>
			{/if}
		</div>
		{#if liveRobot && isLive}
			<div
				class="shrink-0 flex items-center gap-1 sm:gap-2 px-2 {isShortScreen ? 'py-0.5' : 'py-1 sm:py-1.5'} border-b border-gray-200 dark:border-gray-700 text-[11px] sm:text-xs lg:text-sm"
			>
				<div
					class="{isShortScreen ? 'size-3.5' : 'size-4 sm:size-6'} rounded-sm flex items-center justify-center text-black font-bold text-[9px] sm:text-[10px] shrink-0 {dsColor(
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
					class="{isShortScreen ? 'size-3.5' : 'size-4 sm:size-6'} rounded-sm shrink-0 {liveRobot.radio || liveRobot.radioConnected
						? 'bg-green-500'
						: 'bg-red-600'}"
					title="Radio: {liveRobot.radio
						? 'Connected'
						: liveRobot.radioConnected
							? 'Connected (no data)'
							: 'No radio'}"
				></div>
				<div
					class="{isShortScreen ? 'size-3.5' : 'size-4 sm:size-6'} rounded-sm flex items-center justify-center text-black text-[9px] sm:text-[10px] font-bold shrink-0 {liveRobot.rio
						? 'bg-green-500'
						: 'bg-red-600'}"
					title="RoboRIO: {liveRobot.rio ? (liveRobot.code ? 'Code running' : 'No code') : 'Not connected'}"
				>
					{#if liveRobot.rio && !liveRobot.code}X{/if}
				</div>
				<span
					class="tabular-nums font-mono text-[9px] sm:text-xs lg:text-sm text-black dark:text-white shrink-0"
					title="Battery voltage">{liveRobot.battery.toFixed(1)}v</span
				>
				<span
					class="tabular-nums font-mono text-[9px] sm:text-xs lg:text-sm text-black dark:text-white shrink-0"
					title="Round-trip ping">{liveRobot.ping}ms</span
				>
				<span
					class="tabular-nums font-mono text-[9px] sm:text-xs lg:text-sm text-black dark:text-white shrink-0"
					title="Bandwidth utilization">{liveRobot.bwu.toFixed(2)}</span
				>
				<span
					class="tabular-nums font-mono text-[9px] sm:text-xs lg:text-sm text-black dark:text-white shrink-0"
					title="Signal strength">{liveRobot.signal ?? 0}dBm</span
				>
			</div>
		{/if}
		<div class="min-h-0 overflow-y-auto px-2 sm:px-3 flex-1">
			{#if td?.loading}
				<div class="flex justify-center py-2"><Spinner /></div>
			{:else}
				{#if eventSummaries.length > 0}
					<div class="{isShortScreen ? 'py-0.5' : 'py-1'}">
						<div class="flex items-center gap-1.5 {isShortScreen ? 'text-[10px]' : 'text-xs sm:text-sm lg:text-base'} text-amber-700 dark:text-amber-400 font-semibold">
							<Icon icon="mdi:alert-circle-outline" class="size-3.5 sm:size-4 lg:size-5 shrink-0" />
							<span class="truncate">{eventSummaries.join(", ")}</span>
						</div>
					</div>
				{/if}
				{#if td && td.notes.length > 0}
					{#each [...td.notes].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()) as note}
						<button
							class="w-full text-left {isShortScreen ? 'py-0.5' : 'py-1'} border-b border-gray-100 dark:border-neutral-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-neutral-700/50 rounded transition-colors"
							onclick={() => navigate("/notepad/view/:id", { params: { id: note.id } })}
						>
							<p class="text-[11px] sm:text-xs lg:text-sm text-black dark:text-white {isShortScreen ? 'line-clamp-1' : 'line-clamp-2'} leading-snug">{note.text}</p>
							<div class="flex items-center gap-1.5 {isShortScreen ? 'mt-0' : 'mt-0.5'}">
								<span class="text-[10px] sm:text-[11px] lg:text-xs {note.resolution_status === 'Open' ? 'text-green-500' : 'text-gray-400'}">{note.resolution_status}</span>
								{#if note.match_number}
									<span class="text-[10px] sm:text-[11px] lg:text-xs text-gray-400">· {note.tournament_level === 'Qualification' ? 'Q' : note.tournament_level === 'Playoff' ? 'PO' : note.tournament_level === 'Practice' ? 'P' : ''}{note.match_number}</span>
								{/if}
								{#if note.author?.username && !isShortScreen}
									<span class="text-[10px] sm:text-[11px] lg:text-xs text-gray-400">· {note.author.username}</span>
								{/if}
							</div>
						</button>
					{/each}
				{/if}
				{#if itemCount > 0}
					<button
						class="shrink-0 w-full text-left {isShortScreen ? 'py-0' : 'py-1'} text-[10px] sm:text-[11px] lg:text-xs text-blue-500 hover:text-blue-400 rounded flex items-center gap-1 transition-colors"
						onclick={() => navigate("/notepad/team/:team", { params: { team: String(teamNum) } })}
					>
						<Icon icon="mdi:open-in-new" class="size-2.5 sm:size-3 shrink-0" />
						Full history ({itemCount})
					</button>
				{/if}
			{/if}
		</div>
		<button
			class="shrink-0 w-full text-left px-3 {isShortScreen ? 'py-0.5' : 'py-1.5'} text-[11px] sm:text-xs lg:text-sm text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-neutral-700 flex items-center gap-1.5 transition-colors"
			onclick={() => openNoteModal(teamNum)}
		>
			<Icon icon="mdi:plus-circle-outline" class="size-3 sm:size-3.5 lg:size-4 shrink-0" />
			Add note
		</button>
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
		<div class="shrink-0 px-3 {isShortScreen ? 'py-1' : 'pt-2 pb-1'}">
			<div class="flex items-center justify-between gap-2">
				<Button size="sm" color="alternative" onclick={goToPrevMatch} disabled={matchIndex === 0}>
					<Icon icon="mdi:chevron-left" class="size-4 sm:size-5" />
				</Button>

				<div class="flex flex-col items-center min-w-0">
					<p
						class="font-bold {isShortScreen ? 'text-base sm:text-lg' : 'text-base sm:text-xl lg:text-3xl'} leading-tight text-black dark:text-white text-center truncate"
					>
						{matchLabel}
					</p>
					<Badge
						color="green"
						class="text-xs {isShortScreen ? '' : 'mt-0.5'} transition-opacity {isLive
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
					<Icon icon="mdi:chevron-right" class="size-4 sm:size-5" />
				</Button>
			</div>
			<div class="flex justify-end items-center gap-1.5 {isShortScreen ? 'mt-0' : 'mt-1'}">
				<Toggle size="small" bind:checked={autoAdvance} />
				<span class="text-[11px] sm:text-xs lg:text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">Current match</span>
			</div>
		</div>

		<div class="flex-1 min-h-0 grid grid-cols-2 {isShortScreen ? 'gap-1 px-1 pb-1' : 'gap-2 px-2 pb-2'}">
			<div class="flex flex-col {isShortScreen ? 'gap-1' : 'gap-2'} min-h-0">
				{#each [teams.blue1, teams.blue2, teams.blue3] as teamNum, i}
					{@render teamCard(teamNum, "blue", (i + 1) as 1 | 2 | 3)}
				{/each}
			</div>
			<div class="flex flex-col {isShortScreen ? 'gap-1' : 'gap-2'} min-h-0">
				{#each [teams.red1, teams.red2, teams.red3] as teamNum, i}
					{@render teamCard(teamNum, "red", (i + 1) as 1 | 2 | 3)}
				{/each}
			</div>
		</div>
	</div>
{/if}
