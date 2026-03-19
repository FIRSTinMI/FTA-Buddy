<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Badge, Button, Card, Input } from "flowbite-svelte";
	import { onMount, type ComponentProps } from "svelte";
	import { formatTime } from "../../../../shared/formatTime";
	import type { EventState } from "../../../../src/router/field-monitor";
	import { trpc } from "../../main";
	import { userStore } from "../../stores/user";

	let subscription: ReturnType<typeof trpc.field.management.subscribe> | null = null;

	let events: EventState[] = $state([]);
	let hearts: { [k: string]: boolean } = $state({});

	type EventUserEntry = { id: number; username: string; role: string };
	let eventUsers: Record<string, EventUserEntry[]> = $state({});

	type Stats = Awaited<ReturnType<typeof trpc.admin.getStats.query>>;
	type Telemetry = Awaited<ReturnType<typeof trpc.admin.getRecentTelemetry.query>>;

	let stats: Stats | null = $state(null);
	let telemetry: Telemetry | null = $state(null);
	let statsLoading = $state(true);

	onMount(() => {
		if (subscription) {
			subscription.unsubscribe();
		}
		subscription = trpc.field.management.subscribe(
			{ token: $userStore.token },
			{
				onData: (data) => {
					hearts[data.code] = true;
					setTimeout(() => {
						hearts[data.code] = false;
					}, 250);
					let idx = events.findIndex((e) => e.code === data.code);
					if (idx >= 0) {
						events[idx] = { ...events[idx], ...data };
					} else {
						events.push(data);
					}
					events = events.sort((a, b) => {
						if (a.extensions.length === b.extensions.length) {
							if (a.extensions.length === 0) return a.code.localeCompare(b.code);
							const aDate = a.extensions[0].lastFrame;
							const bDate = b.extensions[0].lastFrame;
							return bDate.toISOString().split("T")[1].localeCompare(aDate.toISOString().split("T")[1]);
						}
						return b.extensions.length - a.extensions.length;
					});
				},
			},
		);

		if ($userStore.admin) {
			Promise.all([
				trpc.admin.getStats.query(),
				trpc.admin.getRecentTelemetry.query(),
				trpc.event.getAllWithUsers.query(),
			])
				.then(([s, t, users]) => {
					stats = s;
					telemetry = t;
					eventUsers = Object.fromEntries(users.map((e) => [e.code, e.users]));
				})
				.catch((err) => console.error("[Management]", err))
				.finally(() => {
					statsLoading = false;
				});
		}
	});

	const FieldStates: Record<number, string> = {
		0: "Unknown",
		1: "Match Running Teleop",
		2: "Match Transitioning",
		3: "Match Running Auto",
		4: "Match Ready",
		5: "Prestart Completed",
		6: "Prestart Initiated",
		7: "Ready to Prestart",
		8: "Match Aborted",
		9: "Match Over",
		10: "Ready for Post Result",
		11: "Match Not Ready",
	};

	const fieldStateBadgeColor: Record<number, ComponentProps<typeof Badge>["color"]> = {
		1: "green",
		3: "green",
		4: "blue",
		5: "blue",
		6: "yellow",
		7: "yellow",
		8: "red",
		9: "purple",
		10: "indigo",
	};

	const roleColors: Record<string, ComponentProps<typeof Badge>["color"]> = {
		FTA: "blue",
		FTAA: "green",
		CSA: "yellow",
		RI: "purple",
	};

	let message = $state("");
	let effectedEvents = $state("");

	async function startIssue(msg: string, affected: string[]) {
		await trpc.app.startIssue.mutate({ message: msg, effectedEvents: affected.filter((e) => e !== "") });
	}

	async function endIssue() {
		await trpc.app.endIssue.mutate();
	}

	function formatUptime(connected: Date) {
		const secs = Math.floor((Date.now() - new Date(connected).getTime()) / 1000);
		if (secs < 60) return `${secs}s`;
		if (secs < 3600) return `${Math.floor(secs / 60)}m`;
		return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
	}

	// Shared week navigation — controls both Activity and Feature Usage
	let weekIndex = $state(0);

	function currentWeekStart(): string {
		const now = new Date();
		const daysBack = (now.getDay() - 2 + 7) % 7;
		const tuesday = new Date(now);
		tuesday.setDate(now.getDate() - daysBack);
		return tuesday.toISOString().split("T")[0];
	}

	function weekRange(tuesdayStr: string): string {
		const [y, m, d] = tuesdayStr.split("-").map(Number);
		const start = new Date(y, m - 1, d);
		const end = new Date(y, m - 1, d + 6);
		const fmt = (dt: Date) => dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
		return fmt(start) + " - " + fmt(end);
	}
	let showYtd = $state(false);

	const telemetryLabels: Record<string, string> = {
		page_view: "Page Views",
		match_log_viewed: "Match Log Views",
		station_log_viewed: "Station Log Views",
		team_history_viewed: "Team History Views",
		note_viewed: "Note Views",
		notepad_viewed: "Support Board Views",
		flashcards_viewed: "Flashcard Views",
		event_report_viewed: "Event Report Views",
	};
</script>

<div class="h-full overflow-y-auto bg-gray-50 dark:bg-neutral-900">
	<div class="max-w-6xl mx-auto p-4 flex flex-col gap-6">
		<!-- Stats Cards -->
		{#if statsLoading}
			<div class="flex items-center justify-center py-8">
				<Icon icon="mdi:loading" class="w-8 h-8 animate-spin text-primary-700 dark:text-primary-400" />
			</div>
		{:else if stats}
			{@const maxWeekIdx = Math.max(stats.activityWeeks.length, (telemetry?.weeks.length ?? 1) - 1)}
			{@const weekLabel = weekRange(
				weekIndex === 0
					? currentWeekStart()
					: (stats.activityWeeks[weekIndex - 1]?.weekStart ??
							telemetry?.weeks[weekIndex]?.weekStart ??
							currentWeekStart()),
			)}
			{@const ytdActivity = {
				notesThisWeek: stats.activityWeeks.reduce((s, w) => s + w.notesThisWeek, 0),
				messagesThisWeek: stats.activityWeeks.reduce((s, w) => s + w.messagesThisWeek, 0),
				matchEventsThisWeek: stats.activityWeeks.reduce((s, w) => s + w.matchEventsThisWeek, 0),
				matchEventsConverted: stats.activityWeeks.reduce((s, w) => s + w.matchEventsConverted, 0),
				matchEventsDismissed: stats.activityWeeks.reduce((s, w) => s + w.matchEventsDismissed, 0),
				matchLogsThisWeek: stats.activityWeeks.reduce((s, w) => s + w.matchLogsThisWeek, 0),
				newUsers: stats.activityWeeks.reduce((s, w) => s + w.newUsers, 0),
				activeUsers: stats.activityWeeks.reduce((s, w) => s + w.activeUsers, 0),
				newEvents: stats.activityWeeks.reduce((s, w) => s + w.newEvents, 0),
			}}
			{@const activityData = showYtd
				? ytdActivity
				: weekIndex === 0
					? stats.activity
					: (stats.activityWeeks[weekIndex - 1] ?? stats.activity)}
			{@const weekUserEvents = showYtd
				? {
						newUsers: ytdActivity.newUsers,
						activeUsers: ytdActivity.activeUsers,
						newEvents: ytdActivity.newEvents,
					}
				: weekIndex === 0
					? {
							newUsers: stats.users.newThisWeek,
							activeUsers: stats.users.activeThisWeek,
							newEvents: stats.events.newThisWeek,
						}
					: {
							newUsers: stats.activityWeeks[weekIndex - 1]?.newUsers ?? 0,
							activeUsers: stats.activityWeeks[weekIndex - 1]?.activeUsers ?? 0,
							newEvents: stats.activityWeeks[weekIndex - 1]?.newEvents ?? 0,
						}}

			<!-- Week nav — controls all sections -->
			<div class="flex items-center justify-end gap-2">
				{#if !showYtd}
					<button
						class="p-1 rounded text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-30"
						disabled={weekIndex + 1 > maxWeekIdx}
						onclick={() => (weekIndex += 1)}
					>
						<Icon icon="mdi:chevron-left" class="w-5 h-5" />
					</button>
					<span class="text-sm text-gray-600 dark:text-gray-400 min-w-32 text-center">{weekLabel}</span>
					<button
						class="p-1 rounded text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-30"
						disabled={weekIndex === 0}
						onclick={() => (weekIndex = Math.max(0, weekIndex - 1))}
					>
						<Icon icon="mdi:chevron-right" class="w-5 h-5" />
					</button>
				{/if}
				<button
					class="text-xs px-3 py-1 rounded-full border transition-colors
						{showYtd
						? 'bg-primary-600 text-white border-primary-600'
						: 'text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-primary-500'}"
					onclick={() => {
						showYtd = !showYtd;
						weekIndex = 0;
					}}
				>
					YTD
				</button>
			</div>

			<!-- User Stats -->
			<div>
				<h2 class="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">Users</h2>
				<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
					<Card class="p-4 text-center">
						<p class="text-3xl font-bold text-primary-700 dark:text-primary-400">{stats.users.total}</p>
						<p class="text-sm text-gray-500 mt-1">Total Users</p>
					</Card>
					<Card class="p-4 text-center">
						<p class="text-3xl font-bold text-green-700 dark:text-green-400">{weekUserEvents.newUsers}</p>
						<p class="text-sm text-gray-500 mt-1">New {showYtd ? "YTD" : "This Week"}</p>
					</Card>
					<Card class="p-4 text-center">
						<p class="text-3xl font-bold text-blue-700 dark:text-blue-400">{weekUserEvents.activeUsers}</p>
						<p class="text-sm text-gray-500 mt-1">Active {showYtd ? "YTD" : "This Week"}</p>
					</Card>
					<Card class="p-4">
						<p class="text-xs font-semibold text-gray-500 mb-2">By Role</p>
						<div class="flex flex-wrap gap-1">
							{#each Object.entries(stats.users.byRole) as [role, cnt]}
								<Badge color={roleColors[role] ?? "gray"}>{role}: {cnt}</Badge>
							{/each}
						</div>
					</Card>
				</div>
			</div>

			<!-- Event Stats -->
			<div>
				<h2 class="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">Events</h2>
				<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
					<Card class="p-4 text-center">
						<p class="text-3xl font-bold text-primary-700 dark:text-primary-400">{stats.events.total}</p>
						<p class="text-sm text-gray-500 mt-1">Total Events</p>
					</Card>
					<Card class="p-4 text-center">
						<p class="text-3xl font-bold text-green-700 dark:text-green-400">{stats.events.active}</p>
						<p class="text-sm text-gray-500 mt-1">This Season</p>
					</Card>
					<Card class="p-4 text-center">
						<p class="text-3xl font-bold text-blue-700 dark:text-blue-400">{weekUserEvents.newEvents}</p>
						<p class="text-sm text-gray-500 mt-1">{showYtd ? "YTD" : "This Week"}</p>
					</Card>
					<Card class="p-4 text-center">
						<p class="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{stats.events.liveNow}</p>
						<p class="text-sm text-gray-500 mt-1">Live Now</p>
					</Card>
				</div>
			</div>

			<!-- Activity -->
			<div>
				<h2 class="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">Activity</h2>
				<div class="grid grid-cols-3 sm:grid-cols-6 gap-3">
					<Card class="p-4 text-center">
						<p class="text-2xl font-bold text-gray-800 dark:text-gray-100">{activityData.notesThisWeek}</p>
						<p class="text-xs text-gray-500 mt-1">Notes</p>
					</Card>
					<Card class="p-4 text-center">
						<p class="text-2xl font-bold text-gray-800 dark:text-gray-100">
							{activityData.messagesThisWeek}
						</p>
						<p class="text-xs text-gray-500 mt-1">Messages</p>
					</Card>
					<Card class="p-4 text-center">
						<p class="text-2xl font-bold text-gray-800 dark:text-gray-100">
							{activityData.matchEventsThisWeek}
						</p>
						<p class="text-xs text-gray-500 mt-1">Auto Events</p>
					</Card>
					<Card class="p-4 text-center">
						<p class="text-2xl font-bold text-green-700 dark:text-green-400">
							{activityData.matchEventsConverted}
						</p>
						<p class="text-xs text-gray-500 mt-1">Converted</p>
					</Card>
					<Card class="p-4 text-center">
						<p class="text-2xl font-bold text-red-600 dark:text-red-400">
							{activityData.matchEventsDismissed}
						</p>
						<p class="text-xs text-gray-500 mt-1">Dismissed</p>
					</Card>
					<Card class="p-4 text-center">
						<p class="text-2xl font-bold text-gray-800 dark:text-gray-100">
							{activityData.matchLogsThisWeek}
						</p>
						<p class="text-xs text-gray-500 mt-1">Match Logs</p>
					</Card>
				</div>
			</div>

			<!-- Feature Usage (shares the same week nav) -->
			<div>
				<h2 class="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">Feature Usage</h2>
				<Card class="p-4">
					{#if !telemetry || telemetry.eventTypes.length === 0}
						<p class="text-sm text-gray-400 italic">No telemetry data yet.</p>
					{:else}
						{@const rows = showYtd
							? telemetry.ytd
							: telemetry.eventTypes.map((type) => ({
									event_type: type,
									count: telemetry?.weeks[weekIndex]?.counts[type] ?? 0,
								}))}
						{@const max = Math.max(...rows.map((r) => r.count), 1)}
						<div class="flex flex-col gap-2">
							{#each rows as row}
								<div class="flex items-center gap-3">
									<span class="text-sm text-gray-600 dark:text-gray-400 w-44 shrink-0">
										{telemetryLabels[row.event_type] ?? row.event_type}
									</span>
									<div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
										<div
											class="bg-primary-500 h-full rounded-full transition-all duration-300"
											style="width: {Math.round((row.count / max) * 100)}%"
										></div>
									</div>
									<span
										class="text-sm font-semibold text-gray-700 dark:text-gray-300 w-14 text-right"
									>
										{row.count > 0 ? row.count.toLocaleString() : "—"}
									</span>
								</div>
							{/each}
						</div>
					{/if}
				</Card>
			</div>
		{/if}

		<!-- Known Issue Control -->
		<div>
			<h2 class="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">Known Issue</h2>
			<Card class="p-4">
				<div class="flex flex-col gap-2">
					<Input type="text" placeholder="Message" bind:value={message} />
					<Input
						type="text"
						placeholder="Affected event codes (comma-separated)"
						bind:value={effectedEvents}
					/>
					<div class="flex gap-2 mt-1">
						<Button color="red" onclick={() => startIssue(message, effectedEvents.split(","))}>
							<Icon icon="mdi:alert-circle" class="mr-1 w-4 h-4" /> Start Issue
						</Button>
						<Button color="green" onclick={endIssue}>
							<Icon icon="mdi:check-circle" class="mr-1 w-4 h-4" /> End Issue
						</Button>
					</div>
				</div>
			</Card>
		</div>

		<!-- Live Events -->
		<div>
			<h2 class="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">
				Live Events
				<span class="ml-2 text-sm font-normal text-gray-500">({events.length} known)</span>
			</h2>
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
				{#each events as event}
					<Card class="p-4 flex flex-col gap-2">
						<!-- Header -->
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<div
									class="w-2 h-2 rounded-full {hearts[event.code]
										? 'bg-green-500'
										: 'bg-gray-300'} transition-colors"
								></div>
								<span class="font-semibold text-gray-800 dark:text-gray-100"
									>{event.code.toUpperCase()}</span
								>
							</div>
							<Badge color={fieldStateBadgeColor[event.field] ?? "gray"} class="text-xs">
								{FieldStates[event.field] ?? "Unknown"}
							</Badge>
						</div>

						<p class="text-sm text-gray-500 -mt-1">{event.name ?? ""}</p>

						<!-- Match info -->
						{#if event.level && event.match}
							<p class="text-xs text-gray-500">
								{event.level} Match {event.match}
							</p>
						{/if}

						<!-- Extensions -->
						{#if event.extensions.length > 0}
							<div class="text-xs text-gray-600 dark:text-gray-400 border-t pt-2 mt-1">
								{#each event.extensions as ext}
									<div class="flex gap-2 flex-wrap">
										<span class="font-mono">{ext.ip ?? "?"}</span>
										<span>up {formatUptime(ext.connected)}</span>
										<span>{ext.frames} frames</span>
										<span class="text-gray-400">last {formatTime(ext.lastFrame)}</span>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-xs text-gray-400 italic">No extension connected</p>
						{/if}

						<!-- Clients -->
						{#if event.clients.length > 0}
							<p class="text-xs text-gray-500">
								{event.clients.length} client{event.clients.length !== 1 ? "s" : ""} connected
							</p>
						{/if}

						<!-- Users -->
						{#if eventUsers[event.code]?.length}
							<div class="flex flex-wrap gap-1 border-t pt-2 mt-1">
								{#each eventUsers[event.code] as u}
									<Badge color={roleColors[u.role] ?? "gray"} class="text-xs">
										{u.username}
									</Badge>
								{/each}
							</div>
						{/if}
					</Card>
				{/each}

				{#if events.length === 0}
					<p class="text-gray-500 col-span-3 text-center py-8">No live events detected yet.</p>
				{/if}
			</div>
		</div>
	</div>
</div>
