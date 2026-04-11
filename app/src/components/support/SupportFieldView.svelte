<script lang="ts">
	import confetti from "canvas-confetti";
	import Icon from "@iconify/svelte";
	import { Badge, Button, Modal, Textarea, Toggle } from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import type {
		MatchEvent,
		MatchEventUpdateEventData,
		MonitorFrame,
		Note,
		NoteUpdateEventData,
		RobotInfo,
		ScheduleDetails,
		TournamentLevel,
	} from "../../../../shared/types";
	import { DSState, MatchState, MatchStateMap, ROBOT, RobotWarnings } from "../../../../shared/types";
	import { cycleTimeToMS } from "../../../../shared/cycleTimeToMS";
	import { formatTimeShortNoAgo, formatTimeShortNoAgoSeconds } from "../../../../shared/formatTime";
	import { frameHandler, subscribeToFieldMonitor } from "../../field-monitor";
	import { trpc } from "../../main";
	import { navigate } from "../../router";
	import { eventStore } from "../../stores/event";
	import { settingsStore } from "../../stores/settings";
	import { userStore } from "../../stores/user";
	import type { MonitorEvent } from "../../util/monitorFrameHandler";
	import Spinner from "../Spinner.svelte";
	import AddQuickNoteModal from "./AddQuickNoteModal.svelte";
	import { toast } from "../../util/toast";

	// Match index for prev/next navigation
	interface MatchInfo {
		id: string | null; // null for unplayed/scheduled matches not yet in DB
		match_number: number;
		play_number: number;
		level: string;
		blue1: number | null;
		blue2: number | null;
		blue3: number | null;
		red1: number | null;
		red2: number | null;
		red3: number | null;
		isPlayed: boolean;
		scheduledStartTime: Date | null;
		cycleTime: string | null;
	}

	let allMatches: MatchInfo[] = $state([]);
	let matchIndex = $state(-1); // -1 = live/current match
	let autoAdvance = $state(true);

	let monitorFrame: MonitorFrame | undefined = $state(frameHandler.getFrame());

	// Nexus live status (fallback when no field monitor connection)
	type NexusTeamSet = { red1: number | null; red2: number | null; red3: number | null; blue1: number | null; blue2: number | null; blue3: number | null };
	type NexusLiveStatus = { available: boolean; nowQueuing: string | null; nowQueuingTeams: NexusTeamSet | null; dataAsOfTime: number | null };
	let nexusLiveStatus = $state<NexusLiveStatus | null>(null);

	let nexusTeams = $derived.by(() => {
		if (!nexusLiveStatus?.nowQueuingTeams) return null;
		const q = nexusLiveStatus.nowQueuingTeams;
		// Try to find the matching scheduled entry in allMatches
		const match = allMatches.find(
			(m) =>
				m.blue1 === q.blue1 &&
				m.blue2 === q.blue2 &&
				m.blue3 === q.blue3 &&
				m.red1 === q.red1 &&
				m.red2 === q.red2 &&
				m.red3 === q.red3,
		);
		if (match) {
			return {
				blue1: match.blue1 ?? 0,
				blue2: match.blue2 ?? 0,
				blue3: match.blue3 ?? 0,
				red1: match.red1 ?? 0,
				red2: match.red2 ?? 0,
				red3: match.red3 ?? 0,
				match_number: match.match_number,
				play_number: match.play_number,
				level: match.level,
			};
		}
		// Teams known from Nexus but not yet in allMatches
		if (q.blue1 !== null && q.blue2 !== null && q.blue3 !== null && q.red1 !== null && q.red2 !== null && q.red3 !== null) {
			return { blue1: q.blue1, blue2: q.blue2, blue3: q.blue3, red1: q.red1, red2: q.red2, red3: q.red3, match_number: 0, play_number: 1, level: "Qualification" };
		}
		return null;
	});

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
		if (matchIndex === -1 && nexusTeams) return nexusTeams;
		return null;
	});

	let teamsSource = $derived.by(() => {
		if (matchIndex >= 0 && matchIndex < allMatches.length) return "nav" as const;
		if (monitorFrame) return "monitor" as const;
		if (matchIndex === -1 && nexusTeams) return "nexus" as const;
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
		return notes.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
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
			const sorted = [...bypass].sort(
				(a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
			);
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
		matchStartTime = new Date();
	}

	// Match navigation
	async function loadMatchIndex() {
		try {
			allMatches = await trpc.match.getScheduledMatches.query();
		} catch {
			allMatches = [];
		}
	}

	/** Find the index in allMatches that corresponds to the current live/field-monitor match. */
	function findLiveMatchIndex(): number {
		if (!monitorFrame || allMatches.length === 0) return -1;
		const idx = allMatches.findIndex(
			(m) =>
				m.match_number === monitorFrame!.match &&
				m.play_number === monitorFrame!.play &&
				m.level === monitorFrame!.level,
		);
		return idx;
	}

	let liveIdx = $derived(findLiveMatchIndex());

	/** If the current matchIndex lands on the live match, snap back to live mode. */
	function snapToLiveIfMatched() {
		const li = findLiveMatchIndex();
		if (li >= 0 && matchIndex === li) {
			matchIndex = -1;
			autoAdvance = true;
		}
	}

	function goToPrevMatch() {
		autoAdvance = false;
		if (matchIndex === -1) {
			// From live, go to the match right before the current one
			const li = findLiveMatchIndex();
			if (li > 0) {
				matchIndex = li - 1;
			} else if (li === 0) {
				matchIndex = 0; // already at the first match
			} else if (allMatches.length > 0) {
				// Couldn't find live match - fall back to last played
				const lastPlayed = allMatches.findLastIndex((m) => m.isPlayed);
				matchIndex = lastPlayed >= 0 ? lastPlayed : allMatches.length - 1;
			}
		} else if (matchIndex > 0) {
			matchIndex--;
		}
		snapToLiveIfMatched();
		updateMatchUrl();
	}

	function goToNextMatch() {
		autoAdvance = false;
		if (matchIndex === -1) {
			// From live, go to the match right after the current one
			const li = findLiveMatchIndex();
			if (li >= 0 && li < allMatches.length - 1) {
				matchIndex = li + 1;
			} else if (li === -1 && allMatches.length > 0) {
				// Couldn't find live match - go to first unplayed
				const firstUnplayed = allMatches.findIndex((m) => !m.isPlayed);
				matchIndex = firstUnplayed >= 0 ? firstUnplayed : allMatches.length - 1;
			}
		} else if (matchIndex < allMatches.length - 1) {
			matchIndex++;
		}
		snapToLiveIfMatched();
		updateMatchUrl();
	}

	// When autoAdvance is turned on (via toggle), immediately snap back to live
	$effect(() => {
		if (autoAdvance) matchIndex = -1;
	});

	function goToLive() {
		matchIndex = -1;
		autoAdvance = true;
		updateMatchUrl();
	}

	/** Persist or clear the current match in the URL so back-navigation restores it. */
	function updateMatchUrl() {
		if (typeof window === "undefined") return;
		const url = new URL(window.location.href);
		if (matchIndex === -1 || !allMatches[matchIndex]) {
			url.searchParams.delete("m");
		} else {
			const m = allMatches[matchIndex];
			url.searchParams.set("m", `${m.level}:${m.match_number}:${m.play_number}`);
		}
		window.history.replaceState(null, "", url.toString());
	}

	// Restore match from URL once the match list loads (e.g. after back-nav from ViewNote)
	let matchRestoredFromUrl = false;
	$effect(() => {
		if (allMatches.length > 0 && !matchRestoredFromUrl) {
			matchRestoredFromUrl = true;
			const mKey = new URLSearchParams(window.location.search).get("m");
			if (mKey) {
				const [level, numStr, playStr] = mKey.split(":");
				const num = parseInt(numStr),
					play = parseInt(playStr);
				const idx = allMatches.findIndex(
					(x) => x.level === level && x.match_number === num && x.play_number === play,
				);
				if (idx >= 0) {
					matchIndex = idx;
					autoAdvance = false;
				}
			}
		}
	});

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
									note.resolved_by = data.resolved_by;
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

	let nexusInterval: ReturnType<typeof setInterval> | undefined;
	let allMatchesInterval: ReturnType<typeof setInterval> | undefined;

	async function fetchNexusStatus() {
		try {
			nexusLiveStatus = await trpc.event.getNexusLiveStatus.query();
		} catch {
			// ignore — nexus may not be configured
		}
	}

	onMount(() => {
		if (!frameHandler.getFrame()) {
			subscribeToFieldMonitor();
		}
		frameHandler.addEventListener("frame", onFrame);
		frameHandler.addEventListener("prestart", onPrestart);
		frameHandler.addEventListener("match-start", onMatchStart);
		loadMatchIndex();
		startSubscription();
		startMatchEventSubscription();
		window.addEventListener("resize", handleResize);
		// Initialise match start time so T: starts counting from the right point
		trpc.cycles.getLastPrestart.query().then((t) => {
			if (t) matchStartTime = new Date(t);
		});
		trpc.cycles.getLastMatchStart.query().then((t) => {
			if (t) matchStartTime = new Date(t);
		});
		trpc.cycles.getScheduleDetails.query().then((d) => {
			if (d) scheduleDetails = d;
		});
		cycleInterval = setInterval(() => {
			currentCycleTime = formatTimeShortNoAgo(matchStartTime);
		}, 1000);
		// Nexus fallback: poll live status every 30s
		fetchNexusStatus();
		nexusInterval = setInterval(fetchNexusStatus, 30_000);
		// Refresh match list every 60s when no field monitor (picks up Nexus-sourced matches)
		allMatchesInterval = setInterval(() => {
			if (!monitorFrame) loadMatchIndex();
		}, 60_000);
	});

	onDestroy(() => {
		frameHandler.removeEventListener("frame", onFrame);
		frameHandler.removeEventListener("prestart", onPrestart);
		frameHandler.removeEventListener("match-start", onMatchStart);
		subscription?.unsubscribe();
		matchEventSubscription?.unsubscribe();
		window.removeEventListener("resize", handleResize);
		if (cycleInterval) clearInterval(cycleInterval);
		if (nexusInterval) clearInterval(nexusInterval);
		if (allMatchesInterval) clearInterval(allMatchesInterval);
	});

	// Match note modal
	let matchNoteOpen = $state(false);
	let matchNoteText = $state("");
	let savingMatchNote = $state(false);

	async function saveMatchNote() {
		const text = matchNoteText.trim();
		if (!text || savingMatchNote) return;
		savingMatchNote = true;
		try {
			await trpc.notes.create.mutate({
				team: null,
				text,
				note_type: "MatchNote",
				match_number: teams?.match_number ?? null,
				play_number: teams?.play_number ?? null,
				tournament_level: (teams?.level as TournamentLevel) ?? null,
			});
			toast("Match note created", "", "green-500");
			matchNoteText = "";
			matchNoteOpen = false;
		} catch (err: any) {
			toast("Error creating note", err.message);
		} finally {
			savingMatchNote = false;
		}
	}

	function dsColor(ds: number): string {
		if (ds === DSState.ESTOP || ds === DSState.BYPASS) return "bg-red-800";
		if (ds === DSState.ASTOP) return "bg-green-600";
		if (ds === DSState.RED) return "bg-red-600";
		if (ds === DSState.MOVE_STATION || ds === DSState.WAITING) return "bg-yellow-400";
		return "bg-green-500";
	}

	// Compact mode for shorter screens (e.g. 1366x768)
	let isShortScreen = $state(typeof window !== "undefined" && window.innerHeight < 900);
	function handleResize() {
		isShortScreen = window.innerHeight < 900;
	}

	// Cycle time counting
	let matchStartTime = $state(new Date());
	let currentCycleTime = $state("0");
	let cycleInterval: ReturnType<typeof setInterval> | undefined;

	// Schedule details for confetti
	let scheduleDetails: ScheduleDetails | undefined;

	function getScheduledCycleTimeMS(matchNumber: number): number | undefined {
		if (!scheduleDetails) return undefined;
		const now = new Date().getTime();
		let day = 0;
		for (let i = 0; i < scheduleDetails.days.length; i++) {
			if (new Date(scheduleDetails.days[i].date).getTime() <= now) {
				day = i;
			}
		}
		const cts = scheduleDetails.days[day]?.cycleTimes;
		if (!cts || cts.length === 0) return undefined;
		let minutes = cts[0].minutes;
		for (const ct of cts) {
			if (ct.match <= matchNumber) minutes = ct.minutes;
		}
		return minutes * 60 * 1000;
	}

	function fireConfetti() {
		if (!$settingsStore.confetti) return;
		const defaults = { startVelocity: 30, spread: 70, ticks: 180, zIndex: 9999 };
		confetti({ ...defaults, particleCount: 80, angle: 60, origin: { x: 0, y: 0.7 } });
		confetti({ ...defaults, particleCount: 80, angle: 120, origin: { x: 1, y: 0.7 } });
	}

	function onMatchStart(evt: Event) {
		const frame = (evt as MonitorEvent).detail.frame;
		const lastCycleTimeMS = Date.now() - matchStartTime.getTime();
		const scheduledCycleTimeMS = getScheduledCycleTimeMS(frame?.match ?? 0);
		if (scheduledCycleTimeMS && lastCycleTimeMS > 0 && lastCycleTimeMS < scheduledCycleTimeMS) {
			fireConfetti();
		}
	}

	function formatScheduledTime(d: Date | string | null | undefined): string | null {
		if (!d) return null;
		const dt = d instanceof Date ? d : new Date(d as string);
		if (isNaN(dt.getTime())) return null;
		return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
	}

	function fmtCT(ct: string | null | undefined): string | null {
		if (!ct || ct === "unk" || ct === "") return null;
		const ms = cycleTimeToMS(ct);
		if (isNaN(ms) || ms <= 0) return null;
		return formatTimeShortNoAgoSeconds(ms);
	}

	// Show scheduled start time for the current unstarted match or future scheduled matches.
	// Hide once a match is running, and never show for already-played matches.
	let scheduledStartTime = $derived.by(() => {
		if (isLive) {
			if (monitorFrame && MatchStateMap[monitorFrame.field] === MatchState.RUNNING) return null;
			const liveMatch = liveIdx >= 0 ? allMatches[liveIdx] : null;
			return liveMatch?.scheduledStartTime ?? null;
		}
		if (matchIndex >= 0) {
			const m = allMatches[matchIndex];
			if (!m || m.isPlayed) return null;
			return m.scheduledStartTime ?? null;
		}
		return null;
	});
	let formattedStartTime = $derived(formatScheduledTime(scheduledStartTime));
	let isPastStartTime = $derived(!!scheduledStartTime && Date.now() > new Date(scheduledStartTime as Date).getTime());
	let aheadBehindText = $derived.by(() => {
		if (!isLive || !monitorFrame) return null;
		const text = monitorFrame.exactAheadBehind ?? monitorFrame.time;
		if (!text || text === "unk") return null;
		return text;
	});
	let cycleTimeText = $derived.by(() => {
		if (isLive) {
			const isRunning = monitorFrame && MatchStateMap[monitorFrame.field] === MatchState.RUNNING;
			if (isRunning) {
				// Match is running - show last completed cycle time
				const c = fmtCT(monitorFrame?.lastCycleTime ?? null);
				return c ? `C: ${c}` : null;
			}
			// Prestart / waiting - show counting-up timer
			return `T: ${currentCycleTime}`;
		}
		if (matchIndex >= 0 && allMatches[matchIndex]?.isPlayed) {
			const c = fmtCT(allMatches[matchIndex]?.cycleTime ?? null);
			return c ? `C: ${c}` : null;
		}
		return null;
	});
</script>

{#snippet teamCard(teamNum: number, alliance: "blue" | "red", slot: 1 | 2 | 3)}
	{@const stationKey = `${alliance}${slot}` as ROBOT}
	{@const liveRobot = monitorFrame?.[stationKey] as RobotInfo | undefined}
	{@const currentMatchId = matchIndex >= 0 ? (allMatches[matchIndex]?.id ?? undefined) : undefined}
	{@const td = teamData[teamNum]}
	{@const teamName = $eventStore.teams.find((t) => t.number === String(teamNum))?.name ?? ""}
	{@const currentEventCodes = [$eventStore.code, ...($eventStore.subEvents?.map((se) => se.code) ?? [])]}
	{@const currentNotes = td && !td.loading ? td.notes.filter((n) => currentEventCodes.includes(n.event_code)) : []}
	{@const hasOpenNote = currentNotes.some((n) => n.resolution_status === "Open" || n.resolution_status === null)}
	{@const itemCount = td && !td.loading ? currentNotes.length + td.matchEvents.length : 0}
	{@const activeEvents = td && !td.loading ? td.matchEvents.filter((e) => e.status === "active") : []}
	{@const eventSummaries =
		td && !td.loading && td.matchEvents.length > 0
			? Object.entries(
					td.matchEvents.reduce<Record<string, { total: number; active: number }>>((acc, e) => {
						if (!acc[e.issue]) acc[e.issue] = { total: 0, active: 0 };
						acc[e.issue].total += 1;
						if (e.status === "active") acc[e.issue].active += 1;
						return acc;
					}, {}),
				).map(([issue, { total, active }]) => ({ issue, total, active }))
			: []}
	<div class="flex-1 min-h-0 flex flex-col rounded-lg overflow-hidden shadow dark:bg-neutral-800 bg-white">
		<div class="shrink-0 flex {alliance === 'blue' ? 'bg-blue-600' : 'bg-red-600'}">
			<button
				class="flex-1 px-2.5 sm:px-3 {isShortScreen
					? 'py-0.5 sm:py-1'
					: 'py-1 sm:py-1.5'} font-bold text-white text-left flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base {isShortScreen
					? ''
					: 'lg:text-lg'}"
				onclick={() => navigate("/notepad/team/:team", { params: { team: String(teamNum) } })}
			>
				<span class="leading-none">#{teamNum}</span>
				{#if teamName}
					<span class="text-[11px] sm:text-sm lg:text-base font-normal opacity-80 truncate">{teamName}</span>
				{/if}
			</button>
			{#if currentMatchId}
				<button
					class="px-1.5 sm:px-2 {isShortScreen
						? 'py-0.5'
						: 'py-1 sm:py-1.5'} text-white hover:bg-white/20 flex items-center gap-1 text-[10px] sm:text-xs lg:text-sm border-l border-white/20"
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
				class="shrink-0 flex items-center gap-1 sm:gap-2 px-2 {isShortScreen
					? 'py-0.5'
					: 'py-1 sm:py-1.5'} border-b border-gray-200 dark:border-gray-700 text-[11px] sm:text-xs lg:text-sm"
			>
				<div
					class="{isShortScreen
						? 'size-3.5'
						: 'size-4 sm:size-6'} rounded-sm flex items-center justify-center text-black font-bold text-[9px] sm:text-[10px] shrink-0 {dsColor(
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
					class="{isShortScreen ? 'size-3.5' : 'size-4 sm:size-6'} rounded-sm shrink-0 {liveRobot.radio ||
					liveRobot.radioConnected
						? 'bg-green-500'
						: 'bg-red-600'}"
					title="Radio: {liveRobot.radio
						? 'Connected'
						: liveRobot.radioConnected
							? 'Connected (no data)'
							: 'No radio'}"
				></div>
				<div
					class="{isShortScreen
						? 'size-3.5'
						: 'size-4 sm:size-6'} rounded-sm flex items-center justify-center text-black text-[9px] sm:text-[10px] font-bold shrink-0 {liveRobot.rio
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
				{#if hasOpenNote || liveRobot.warnings.includes(RobotWarnings.NOT_INSPECTED) || liveRobot.warnings.includes(RobotWarnings.RADIO_NOT_FLASHED) || liveRobot.warnings.includes(RobotWarnings.PREVIOUS_MATCH_EVENT)}
					<div class="ml-auto flex items-center gap-0.5 sm:gap-1 shrink-0">
						{#if hasOpenNote}
							<div
								class="{isShortScreen
									? 'size-3.5'
									: 'size-4 sm:size-6'} rounded-sm bg-yellow-400 flex items-center justify-center shrink-0"
								title="Open note"
							>
								<Icon
									icon="mdi:pencil"
									class="{isShortScreen ? 'size-2.5' : 'size-3 sm:size-4'} text-black"
								/>
							</div>
						{/if}
						{#if liveRobot.warnings.includes(RobotWarnings.NOT_INSPECTED)}
							<div
								class="{isShortScreen
									? 'size-3.5'
									: 'size-4 sm:size-6'} rounded-sm bg-yellow-400 flex items-center justify-center shrink-0"
								title="Not inspected"
							>
								<Icon
									icon="mdi:magnify"
									class="{isShortScreen ? 'size-2.5' : 'size-3 sm:size-4'} text-black"
								/>
							</div>
						{/if}
						{#if liveRobot.warnings.includes(RobotWarnings.RADIO_NOT_FLASHED)}
							<div
								class="{isShortScreen
									? 'size-3.5'
									: 'size-4 sm:size-6'} rounded-sm bg-yellow-400 flex items-center justify-center shrink-0"
								title="Radio not programmed"
							>
								<Icon
									icon="mdi:wifi-off"
									class="{isShortScreen ? 'size-2.5' : 'size-3 sm:size-4'} text-black"
								/>
							</div>
						{/if}
						{#if liveRobot.warnings.includes(RobotWarnings.PREVIOUS_MATCH_EVENT)}
							<div
								class="{isShortScreen
									? 'size-3.5'
									: 'size-4 sm:size-6'} rounded-sm bg-yellow-400 flex items-center justify-center shrink-0"
								title="Previous match event"
							>
								<Icon
									icon="mdi:wrench"
									class="{isShortScreen ? 'size-2.5' : 'size-3 sm:size-4'} text-black"
								/>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
		<div class="min-h-0 overflow-y-auto px-2 sm:px-3 {itemCount > 0 || td?.loading ? 'flex-1' : ''}">
			{#if td?.loading}
				<div class="flex justify-center py-2"><Spinner /></div>
			{:else}
				{#if eventSummaries.length > 0}
					<div class="py-1">
						<div class="flex items-center gap-1.5 text-xs sm:text-sm lg:text-base font-semibold flex-wrap">
							<Icon
								icon="mdi:alert-circle-outline"
								class="size-3.5 sm:size-4 lg:size-5 shrink-0 text-amber-700 dark:text-amber-400"
							/>
							{#each eventSummaries as { issue, total, active }, i}
								<span
									class={active > 0
										? "text-amber-700 dark:text-amber-400"
										: "text-gray-400 dark:text-gray-500"}
									>{issue} x{total}{#if active > 0 && active < total}
										({active} active){/if}{#if active === 0}
										(resolved){/if}</span
								>{#if i < eventSummaries.length - 1}<span class="text-gray-400">,</span>{/if}
							{/each}
						</div>
					</div>
				{/if}
				{#if currentNotes.length > 0}
					{#each [...currentNotes].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()) as note}
						<button
							class="w-full text-left {isShortScreen
								? 'py-0.5'
								: 'py-1'} border-b border-gray-100 dark:border-neutral-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-neutral-700/50 rounded transition-colors {note.resolution_status ===
							'Resolved'
								? 'opacity-50'
								: ''}"
							onclick={() => navigate("/notepad/view/:id", { params: { id: note.id } })}
						>
							<p
								class="text-[11px] sm:text-xs lg:text-sm text-black dark:text-white {isShortScreen
									? 'line-clamp-1'
									: 'line-clamp-2'} leading-snug"
							>
								{note.text}
							</p>
							<div class="flex items-center gap-1.5 {isShortScreen ? 'mt-0' : 'mt-0.5'}">
								<span
									class="text-[10px] sm:text-[11px] lg:text-xs {note.resolution_status === 'Open'
										? 'text-green-500'
										: 'text-gray-400'}"
									>{note.resolution_status}{#if note.resolution_status === "Resolved" && note.resolved_by}
										by {note.resolved_by.username}{/if}</span
								>
								{#if note.match_number}
									<span class="text-[10px] sm:text-[11px] lg:text-xs text-gray-400"
										>· {note.tournament_level === "Qualification"
											? "Q"
											: note.tournament_level === "Playoff"
												? "PO"
												: note.tournament_level === "Practice"
													? "P"
													: ""}{note.match_number}</span
									>
								{/if}
								{#if note.author?.username && !isShortScreen}
									<span class="text-[10px] sm:text-[11px] lg:text-xs text-gray-400"
										>· {note.author.username}</span
									>
								{/if}
							</div>
						</button>
					{/each}
				{/if}
				{#if itemCount > 0}
					<button
						class="shrink-0 w-full text-left {isShortScreen
							? 'py-0'
							: 'py-1'} text-[10px] sm:text-[11px] lg:text-xs text-blue-500 hover:text-blue-400 rounded flex items-center gap-1 transition-colors"
						onclick={() => navigate("/notepad/team/:team", { params: { team: String(teamNum) } })}
					>
						<Icon icon="mdi:open-in-new" class="size-2.5 sm:size-3 shrink-0" />
						Full history ({itemCount})
					</button>
				{/if}
			{/if}
		</div>
		<button
			class="w-full flex items-center justify-center gap-1.5 transition-colors text-[11px] sm:text-xs lg:text-sm text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-neutral-700
				{itemCount === 0 && !td?.loading
					? 'flex-1 py-4'
					: 'shrink-0 text-left px-3 ' + (isShortScreen ? 'py-0.5' : 'py-1.5')}"
			onclick={() => openNoteModal(teamNum)}
		>
			<Icon icon="mdi:plus-circle-outline" class="size-3 sm:size-3.5 lg:size-4 shrink-0" />
			<span>Add note</span>
		</button>
	</div>
{/snippet}

<Modal bind:open={matchNoteOpen} size="md" onclose={() => (matchNoteOpen = false)}>
	{#snippet header()}
		<span class="font-bold">Match Note - {matchLabel}</span>
	{/snippet}
	<Textarea
		class="w-full"
		rows={4}
		placeholder="Describe the observation or issue…"
		bind:value={matchNoteText}
		autofocus
		onkeydown={(e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "Enter") saveMatchNote();
		}}
	/>
	<p class="mt-1 text-xs text-gray-400">Tip: Ctrl+Enter to save</p>
	{#snippet footer()}
		<Button color="blue" disabled={!matchNoteText.trim() || savingMatchNote} onclick={saveMatchNote}>
			{savingMatchNote ? "Saving…" : "Save Note"}
		</Button>
		<Button color="alternative" onclick={() => (matchNoteOpen = false)}>Cancel</Button>
	{/snippet}
</Modal>

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
		<div class="shrink-0 px-3 {isShortScreen ? 'py-0.5' : 'pt-2 pb-1'}">
			<div class="flex items-center justify-between gap-2">
				<Button
					size="xs"
					color="alternative"
					onclick={goToPrevMatch}
					disabled={matchIndex === 0 || (isLive && liveIdx === 0)}
				>
					<Icon icon="mdi:chevron-left" class={isShortScreen ? "size-3.5" : "size-4 sm:size-5"} />
				</Button>

				<div class="flex-1 flex flex-col items-center min-w-0">
					<div class="flex items-center justify-center {isShortScreen ? 'gap-2' : 'gap-2 sm:gap-4'} w-full">
						<div class="flex flex-col items-end gap-0.5 shrink-0">
							{#if formattedStartTime}
								<span
									class="{isShortScreen ? 'text-xs' : 'text-xs sm:text-sm'} {isPastStartTime
										? 'text-red-500 dark:text-red-400 font-semibold'
										: 'text-gray-500 dark:text-gray-400'}"
								>
									<span class="opacity-60">Sched:</span>
									{formattedStartTime}
								</span>
							{/if}
							<button
								class="text-[11px] sm:text-xs lg:text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 transition-colors"
								onclick={() => (matchNoteOpen = true)}
								title="Add match note"
							>
								<Icon icon="mdi:plus-circle-outline" class="size-3 sm:size-3.5 shrink-0" />
								{#if !isShortScreen}Match note{/if}
							</button>
						</div>
						<p
							class="font-bold {isShortScreen
								? 'text-sm'
								: 'text-base sm:text-xl lg:text-3xl'} leading-tight text-black dark:text-white text-center shrink-0"
						>
							{matchLabel}
						</p>
						{#if aheadBehindText || cycleTimeText}
							<div class="flex flex-col items-start gap-0.5 shrink-0">
								{#if aheadBehindText}
									<span
										class="{isShortScreen
											? 'text-xs'
											: 'text-xs sm:text-sm'} {aheadBehindText.startsWith('-')
											? 'text-orange-500 dark:text-orange-400'
											: 'text-black dark:text-white'}">{aheadBehindText}</span
									>
								{/if}
								{#if cycleTimeText}
									<span
										class="{isShortScreen
											? 'text-xs'
											: 'text-xs sm:text-sm'} text-gray-500 dark:text-gray-400"
										>{cycleTimeText}</span
									>
								{/if}
							</div>
						{/if}
					</div>
					{#if !isShortScreen}
						<div class="h-5 flex items-center gap-1.5">
							{#if isLive}
								{#if teamsSource === "nexus"}
									<Badge color="purple" class="text-xs">via Nexus</Badge>
								{:else}
									<Badge color="green" class="text-xs">LIVE</Badge>
								{/if}
							{:else if matchIndex >= 0 && !allMatches[matchIndex]?.isPlayed}
								<Badge color="yellow" class="text-xs">SCHEDULED</Badge>
							{/if}
						</div>
					{/if}
				</div>

				<Button
					size={isShortScreen ? "xs" : "sm"}
					color="alternative"
					onclick={goToNextMatch}
					disabled={matchIndex === allMatches.length - 1 ||
						(isLive && (liveIdx === -1 || liveIdx === allMatches.length - 1))}
				>
					<Icon icon="mdi:chevron-right" class={isShortScreen ? "size-3.5" : "size-4 sm:size-5"} />
				</Button>
			</div>
			<div class="flex justify-end items-center gap-1.5 {isShortScreen ? 'mt-0' : 'mt-1'}">
				<Toggle size="small" bind:checked={autoAdvance} />
				<span class="text-[11px] sm:text-xs lg:text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap"
					>Current match</span
				>
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
