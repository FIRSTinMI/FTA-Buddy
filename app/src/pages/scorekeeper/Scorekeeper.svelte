<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button } from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import Spinner from "../../components/Spinner.svelte";
	import AllianceLineupCard from "../../components/scorekeeper/AllianceLineupCard.svelte";
	import LineupCardDialog from "../../components/scorekeeper/LineupCardDialog.svelte";
	import LineupHistory from "../../components/scorekeeper/LineupHistory.svelte";
	import { frameHandler, subscribeToFieldMonitor } from "../../field-monitor";
	import { trpc } from "../../main";
	import { eventStore } from "../../stores/event";
	import { userStore } from "../../stores/user";
	import type { Alliance, ForMatch, LineupSide } from "../../util/scorekeeperTypes";

	// FTA/FTAA/Scorekeeper/admin may edit; everyone with the view may read.
	const canEdit = $derived(
		$userStore.admin || ["Scorekeeper", "FTA", "FTAA", "System"].includes($userStore.role),
	);

	// Team number -> short name.
	let teamNames = $derived.by(() => {
		const map: Record<string, string> = {};
		for (const t of $eventStore.teams ?? []) map[String(t.number)] = t.name ?? "";
		return map;
	});
	function teamName(team: number | null): string {
		if (team == null) return "";
		const n = teamNames[String(team)] ?? "";
		return n.length > 20 ? n.slice(0, 20) + "..." : n;
	}

	// ---- Live field monitor (drives the "current match") -------------------
	let monitorFrame = $state(frameHandler.getFrame());
	function onFrame(evt: Event) {
		monitorFrame = (evt as CustomEvent).detail.frame;
		if (following) syncToLive();
	}
	function onPrestart() {
		if (following) syncToLive();
	}

	// ---- Cycle data (ahead/behind, cycle times, schedule) ------------------
	let cycleData = $state<Awaited<ReturnType<typeof trpc.cycles.getCycleData.query>> | null>(null);
	const scheduleMatches = $derived(cycleData?.scheduleDetails?.matches ?? []);

	// ---- Match list (played + scheduled, qual + playoff) -------------------
	let scheduledMatches = $state<Awaited<ReturnType<typeof trpc.match.getScheduledMatches.query>>>([]);

	interface MatchRow {
		level: string;
		match: number;
		play: number;
		red: (number | null)[];
		blue: (number | null)[];
		redAllianceNumber: number | null;
		blueAllianceNumber: number | null;
		isPlayed: boolean;
		scheduledStartTime: Date | null;
		actualStartTime: Date | null;
		cycleTime: string | null;
		finalScoreRed: number | null;
		finalScoreBlue: number | null;
		status: string | null;
	}

	const LEVEL_ORDER: Record<string, number> = { Practice: 0, Qualification: 1, Playoff: 2, None: 3 };
	const allNull = (a: (number | null)[]) => a.every((x) => x == null);

	// Merge getScheduledMatches (actual start, teams, cycle) with scheduleDetails.matches
	// (scheduled times, alliance numbers, teams + final scores from FMS - no TBA needed).
	const allMatches = $derived.by<MatchRow[]>(() => {
		const byKey = new Map<string, MatchRow>();
		const key = (level: string, match: number, play: number) => `${level}:${match}:${play}`;
		for (const m of scheduledMatches) {
			byKey.set(key(m.level, m.match_number, m.play_number), {
				level: m.level,
				match: m.match_number,
				play: m.play_number,
				red: [m.red1, m.red2, m.red3],
				blue: [m.blue1, m.blue2, m.blue3],
				redAllianceNumber: null,
				blueAllianceNumber: null,
				isPlayed: m.isPlayed,
				scheduledStartTime: m.scheduledStartTime,
				actualStartTime: m.actualStartTime,
				cycleTime: m.cycleTime,
				finalScoreRed: null,
				finalScoreBlue: null,
				status: null,
			});
		}
		for (const s of scheduleMatches) {
			const k = key(s.level, s.match, 1);
			const existing = byKey.get(k);
			if (existing) {
				existing.scheduledStartTime = existing.scheduledStartTime ?? new Date(s.scheduledStartTime);
				existing.redAllianceNumber = s.redAllianceNumber ?? existing.redAllianceNumber;
				existing.blueAllianceNumber = s.blueAllianceNumber ?? existing.blueAllianceNumber;
				if (s.red && allNull(existing.red)) existing.red = s.red;
				if (s.blue && allNull(existing.blue)) existing.blue = s.blue;
				existing.finalScoreRed = s.finalScoreRed ?? existing.finalScoreRed;
				existing.finalScoreBlue = s.finalScoreBlue ?? existing.finalScoreBlue;
				existing.status = s.status ?? existing.status;
			} else {
				byKey.set(k, {
					level: s.level,
					match: s.match,
					play: 1,
					red: s.red ?? [null, null, null],
					blue: s.blue ?? [null, null, null],
					redAllianceNumber: s.redAllianceNumber ?? null,
					blueAllianceNumber: s.blueAllianceNumber ?? null,
					isPlayed: s.finalScoreRed != null || s.status === "Played" || s.status === "Complete",
					scheduledStartTime: new Date(s.scheduledStartTime),
					actualStartTime: null,
					cycleTime: null,
					finalScoreRed: s.finalScoreRed ?? null,
					finalScoreBlue: s.finalScoreBlue ?? null,
					status: s.status ?? null,
				});
			}
		}
		return [...byKey.values()].sort(
			(a, b) => (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9) || a.match - b.match || a.play - b.play,
		);
	});

	// Search filter: match number, level, or any team number.
	let search = $state("");
	const filteredMatches = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return allMatches;
		return allMatches.filter((m) => {
			if (String(m.match).includes(q)) return true;
			if (m.level.toLowerCase().includes(q)) return true;
			return [...m.red, ...m.blue].some((t) => t != null && String(t).includes(q));
		});
	});

	function fmtDelta(sched: Date | null, actual: Date | null): { text: string; late: boolean } | null {
		if (!sched || !actual) return null;
		const diff = actual.getTime() - sched.getTime(); // positive = started late/behind
		const secs = Math.round(Math.abs(diff) / 1000);
		const m = Math.floor(secs / 60);
		const mag = m > 0 ? `${m}m` : `${secs}s`;
		return { text: `${mag} ${diff > 0 ? "late" : "early"}`, late: diff > 0 };
	}

	// ---- Selection / follow-live -------------------------------------------
	let following = $state(true);
	let selLevel = $state<string>("Playoff");
	let selMatch = $state(1);
	let selPlay = $state(1);

	function syncToLive() {
		const f = monitorFrame;
		if (f?.match && f.level && f.level !== "None") {
			selLevel = f.level;
			selMatch = f.match;
			selPlay = f.play || 1;
		}
	}

	// Current position in the browsable list: exact match first, then by level+match
	// (play numbers can differ from the schedule), else -1 (not in the list yet).
	const navIndex = $derived.by(() => {
		let i = allMatches.findIndex((m) => m.level === selLevel && m.match === selMatch && m.play === selPlay);
		if (i < 0) i = allMatches.findIndex((m) => m.level === selLevel && m.match === selMatch);
		return i;
	});
	const selectedRow = $derived(navIndex >= 0 ? allMatches[navIndex] : null);
	const atFirst = $derived(allMatches.length === 0 || navIndex === 0);
	const atLast = $derived(allMatches.length === 0 || (navIndex >= 0 && navIndex === allMatches.length - 1));

	function step(delta: number) {
		following = false;
		if (allMatches.length === 0) return;
		let i = navIndex;
		if (i < 0) {
			// Current selection isn't in the list - snap in by the nearest match at this
			// level so a play/level quirk never freezes navigation.
			const sameLevel = allMatches.filter((m) => m.level === selLevel);
			if (sameLevel.length) {
				const target = sameLevel.find((m) => m.match >= selMatch) ?? sameLevel[sameLevel.length - 1];
				i = allMatches.indexOf(target);
			} else {
				i = delta > 0 ? -1 : allMatches.length;
			}
		}
		const next = allMatches[i + delta];
		if (!next) return;
		selLevel = next.level;
		selMatch = next.match;
		selPlay = next.play;
	}
	function goLive() {
		following = true;
		syncToLive();
	}

	// ---- Playoff lineup payload for the selected match ----------------------
	let forMatch = $state<ForMatch | null>(null);
	let loadingMatch = $state(false);
	let alliances = $state<Alliance[]>([]);

	async function loadForMatch() {
		if (selLevel !== "Playoff") {
			forMatch = null;
			return;
		}
		loadingMatch = true;
		try {
			forMatch = await trpc.scorekeeper.lineups.forMatch.query({ matchNumber: selMatch, playNumber: selPlay });
		} catch (err) {
			console.error("[scorekeeper] forMatch failed:", err);
			forMatch = null;
		} finally {
			loadingMatch = false;
		}
	}

	async function loadAlliances() {
		try {
			alliances = await trpc.scorekeeper.alliances.list.query();
		} catch (err) {
			console.error("[scorekeeper] alliance list failed:", err);
		}
	}

	async function loadCycle() {
		if (!$eventStore.code) return;
		try {
			cycleData = await trpc.cycles.getCycleData.query({ eventCode: $eventStore.code });
		} catch (err) {
			console.error("[scorekeeper] cycle load failed:", err);
		}
	}

	async function loadScheduledMatches() {
		try {
			scheduledMatches = await trpc.match.getScheduledMatches.query();
		} catch (err) {
			console.error("[scorekeeper] scheduled matches failed:", err);
		}
	}

	// Reload the lineup payload whenever the selected match changes.
	$effect(() => {
		selLevel;
		selMatch;
		selPlay;
		loadForMatch();
	});

	// ---- Live countdown to the T613 deadline -------------------------------
	let now = $state(Date.now());
	let clock: ReturnType<typeof setInterval>;
	const deadlineMs = $derived(forMatch?.deadlineAt ? new Date(forMatch.deadlineAt).getTime() : null);
	const countdown = $derived.by(() => {
		if (deadlineMs == null) return null;
		const diff = Math.round((deadlineMs - now) / 1000);
		const past = diff < 0;
		const s = Math.abs(diff);
		const label = s < 3600 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 3600)}h`;
		return { past, label };
	});

	// ---- Dialog / history state --------------------------------------------
	let dialogOpen = $state(false);
	let dialogAlliance = $state<number | null>(null);
	let historyOpen = $state(false);
	let historyAllianceNumber = $state(1);

	function openDialog(alliance: number | null = null) {
		dialogAlliance = alliance;
		dialogOpen = true;
	}
	function openHistory(side: LineupSide) {
		if (!side.allianceNumber) return;
		historyAllianceNumber = side.allianceNumber;
		historyOpen = true;
	}

	function fmtTime(d: Date | string | null): string {
		if (!d) return "-";
		return new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
	}

	let cycleSub: { unsubscribe: () => void } | undefined;
	let lineupSub: { unsubscribe: () => void } | undefined;

	onMount(async () => {
		clock = setInterval(() => (now = Date.now()), 1000);

		if (!frameHandler.getFrame()) subscribeToFieldMonitor();
		frameHandler.addEventListener("frame", onFrame);
		frameHandler.addEventListener("prestart", onPrestart);

		await Promise.all([loadAlliances(), loadCycle(), loadScheduledMatches()]);
		syncToLive();
		await loadForMatch();

		// Live cycle/schedule updates (fixes the "needs a manual refresh" problem).
		cycleSub = trpc.cycles.subscription.subscribe(
			{ eventCode: $eventStore.code },
			{
				// The subscription is a change trigger; re-fetch the full cycle snapshot
				// (with scheduleDetails.matches) so ahead/behind, the deadline and the
				// schedule table all update live without a manual refresh.
				onData: () => {
					loadCycle();
					loadScheduledMatches();
				},
				onError: (err) => console.warn("[scorekeeper] cycle sub error:", err),
			},
		);
		// Live alliance/lineup updates.
		lineupSub = trpc.scorekeeper.lineups.subscribe.subscribe(undefined, {
			onData: () => {
				loadAlliances();
				loadForMatch();
			},
			onError: (err) => console.warn("[scorekeeper] lineup sub error:", err),
		});
	});

	onDestroy(() => {
		clearInterval(clock);
		frameHandler.removeEventListener("frame", onFrame);
		frameHandler.removeEventListener("prestart", onPrestart);
		cycleSub?.unsubscribe();
		lineupSub?.unsubscribe();
	});

	const stats = $derived([
		["Ahead/behind", cycleData?.exactAheadBehind ?? cycleData?.aheadBehind ?? "-"],
		["Last cycle", cycleData?.lastCycleTime ?? "-"],
		["Avg cycle", cycleData?.averageCycleTime ? `${Math.round(cycleData.averageCycleTime / 1000)}s` : "-"],
		["Best cycle", cycleData?.bestCycleTime ?? "-"],
	] as const);
</script>

<div class="flex flex-col gap-3 p-3 max-w-3xl mx-auto w-full">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Scorekeeper</h1>
		{#if canEdit}
			<Button color="primary" size="sm" onclick={() => openDialog()}>
				<Icon icon="mdi:clipboard-plus-outline" class="size-4 mr-1" /> File lineup card
			</Button>
		{/if}
	</div>

	<!-- Match selector: follows live, browsable -->
	<div class="flex items-center justify-between rounded-lg border border-gray-200 dark:border-neutral-700 p-2">
		<Button size="sm" color="alternative" onclick={() => step(-1)} disabled={atFirst}>
			<Icon icon="mdi:chevron-left" class="size-5" />
		</Button>
		<div class="text-center">
			<div class="text-xs text-gray-500 uppercase">{selLevel}{selPlay > 1 ? ` (play ${selPlay})` : ""}</div>
			<div class="text-xl font-bold text-gray-900 dark:text-white">Match {selMatch}</div>
			<button
				class="text-xs {following ? 'text-green-600' : 'text-primary-600 underline'}"
				onclick={goLive}
			>
				{following ? "● Following live" : "Jump to live"}
			</button>
		</div>
		<Button size="sm" color="alternative" onclick={() => step(1)} disabled={atLast}>
			<Icon icon="mdi:chevron-right" class="size-5" />
		</Button>
	</div>

	<!-- Cycle stats (ahead/behind + cycle times) - directly under the match number -->
	<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
		{#each stats as [label, value] (label)}
			<div class="rounded-md border border-gray-200 dark:border-neutral-700 p-2 text-center">
				<div class="text-xs text-gray-500 uppercase">{label}</div>
				<div class="text-lg font-bold text-gray-900 dark:text-white">{value}</div>
			</div>
		{/each}
	</div>

	<!-- Playoff lineup view for the selected match -->
	{#if selLevel === "Playoff"}
		<div class="flex items-center justify-between">
			{#if countdown}
				<div class="text-sm {countdown.past ? 'text-red-600 font-semibold' : 'text-gray-700 dark:text-gray-200'}">
					T613 deadline {fmtTime(forMatch?.deadlineAt ?? null)} ·
					<span class="font-mono font-bold">{countdown.past ? `+${countdown.label} late` : `${countdown.label} left`}</span>
				</div>
			{:else}
				<div class="text-xs text-amber-600">No scheduled start yet — deadline not enforced.</div>
			{/if}
		</div>

		{#if loadingMatch && !forMatch}
			<Spinner />
		{:else if forMatch}
			<div class="grid gap-3 md:grid-cols-2">
				<AllianceLineupCard side={forMatch.blue} {teamName} {canEdit} onEdit={() => openDialog(forMatch!.blue.allianceNumber)} onHistory={() => openHistory(forMatch!.blue)} />
				<AllianceLineupCard side={forMatch.red} {teamName} {canEdit} onEdit={() => openDialog(forMatch!.red.allianceNumber)} onHistory={() => openHistory(forMatch!.red)} />
			</div>
		{/if}
	{/if}

	<!-- Match schedule table -->
	<div class="mt-2 flex items-center justify-between gap-2">
		<h2 class="text-lg font-bold text-gray-900 dark:text-white">Match schedule</h2>
		<input
			bind:value={search}
			placeholder="Search match or team #"
			class="w-44 rounded-md border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1 text-sm"
		/>
	</div>
	<div class="overflow-x-auto">
		<table class="w-full text-sm">
			<thead>
				<tr class="text-left text-xs uppercase text-gray-500 border-b border-gray-200 dark:border-neutral-700">
					<th class="py-1 pr-2">Match</th>
					<th class="py-1 pr-2">Teams</th>
					<th class="py-1 pr-2">Sched</th>
					<th class="py-1 pr-2">Actual</th>
					<th class="py-1 pr-2">Delta</th>
					<th class="py-1 pr-2">Cycle</th>
					<th class="py-1 pr-2">Result</th>
				</tr>
			</thead>
			<tbody>
				{#each filteredMatches as m (m.level + m.match + m.play)}
					{@const delta = fmtDelta(m.scheduledStartTime, m.actualStartTime)}
					<tr
						class="border-b border-gray-100 dark:border-neutral-800 cursor-pointer {m.level === selLevel && m.match === selMatch && m.play === selPlay ? 'bg-primary-50 dark:bg-primary-950/40' : ''}"
						onclick={() => {
							following = false;
							selLevel = m.level;
							selMatch = m.match;
							selPlay = m.play;
						}}
					>
						<td class="py-1 pr-2 whitespace-nowrap">
							<span class="text-gray-400 text-xs">{m.level.slice(0, 4)}</span>
							<span class="font-semibold">{m.match}{m.play > 1 ? `-${m.play}` : ""}</span>
						</td>
						<td class="py-1 pr-2 whitespace-nowrap text-xs">
							<span class="text-red-600">{m.red.filter((t) => t != null).join(" ") || "-"}</span>
							<span class="text-gray-300">/</span>
							<span class="text-blue-600">{m.blue.filter((t) => t != null).join(" ") || "-"}</span>
						</td>
						<td class="py-1 pr-2 whitespace-nowrap font-mono">{fmtTime(m.scheduledStartTime)}</td>
						<td class="py-1 pr-2 whitespace-nowrap font-mono text-gray-500">{fmtTime(m.actualStartTime)}</td>
						<td class="py-1 pr-2 whitespace-nowrap text-xs {delta ? (delta.late ? 'text-red-600' : 'text-green-600') : 'text-gray-400'}">{delta?.text ?? "-"}</td>
						<td class="py-1 pr-2 font-mono text-gray-500">{m.cycleTime ?? "-"}</td>
						<td class="py-1 pr-2 whitespace-nowrap">
							{#if m.finalScoreRed != null && m.finalScoreBlue != null}
								<span class="text-red-600 {m.finalScoreRed > m.finalScoreBlue ? 'font-bold' : ''}">{m.finalScoreRed}</span>-<span class="text-blue-600 {m.finalScoreBlue > m.finalScoreRed ? 'font-bold' : ''}">{m.finalScoreBlue}</span>
							{:else if m.isPlayed}
								<span class="text-green-600">Played</span>
							{:else}
								<span class="text-gray-400">Pending</span>
							{/if}
						</td>
					</tr>
				{/each}
				{#if filteredMatches.length === 0}
					<tr><td colspan="7" class="py-2 text-gray-500">{search ? "No matches match your search." : "No schedule loaded yet."}</td></tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>

{#if dialogOpen}
	<LineupCardDialog
		bind:open={dialogOpen}
		{alliances}
		scheduleMatches={scheduleMatches.map((m) => ({ match: m.match, level: m.level, redAllianceNumber: m.redAllianceNumber, blueAllianceNumber: m.blueAllianceNumber }))}
		liveMatchNumber={selMatch}
		initialAlliance={dialogAlliance}
		{teamName}
		onClose={() => (dialogOpen = false)}
		onSubmitted={() => {
			loadForMatch();
			loadAlliances();
		}}
	/>
{/if}

<LineupHistory bind:open={historyOpen} allianceNumber={historyAllianceNumber} {teamName} onClose={() => (historyOpen = false)} />
