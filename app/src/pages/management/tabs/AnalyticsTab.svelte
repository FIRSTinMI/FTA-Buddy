<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Badge, Card } from "flowbite-svelte";
	import { onMount, type ComponentProps } from "svelte";
	import AnalyticsActiveUsersChart from "../../../components/management/AnalyticsActiveUsersChart.svelte";
	import { trpc } from "../../../main";

	type Stats = Awaited<ReturnType<typeof trpc.admin.getStats.query>>;
	type Telemetry = Awaited<ReturnType<typeof trpc.admin.getRecentTelemetry.query>>;

	let stats: Stats | null = $state(null);
	let telemetry: Telemetry | null = $state(null);
	let statsLoading = $state(true);
	let statsError: string | null = $state(null);

	onMount(() => {
		Promise.all([trpc.admin.getStats.query(), trpc.admin.getRecentTelemetry.query()])
			.then(([s, t]) => {
				stats = s;
				telemetry = t;
			})
			.catch((err) => {
				console.error("[Analytics]", err);
				statsError = `Stats failed: ${err instanceof Error ? err.message : String(err)}`;
			})
			.finally(() => {
				statsLoading = false;
			});
	});

	const roleColors: Record<string, ComponentProps<typeof Badge>["color"]> = {
		FTA: "blue",
		FTAA: "green",
		CSA: "yellow",
		RI: "purple",
	};

	// Shared week navigation - controls both Activity and Feature Usage
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

<div class="flex flex-col gap-6">
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

		<!-- Week nav - controls all sections -->
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
				<Card class="p-4 text-center max-w-none">
					<p class="text-3xl font-bold text-primary-700 dark:text-primary-400">{stats.users.total}</p>
					<p class="text-sm text-gray-500 mt-1">Total Users</p>
				</Card>
				<Card class="p-4 text-center max-w-none">
					<p class="text-3xl font-bold text-green-700 dark:text-green-400">{weekUserEvents.newUsers}</p>
					<p class="text-sm text-gray-500 mt-1">New {showYtd ? "YTD" : "This Week"}</p>
				</Card>
				<Card class="p-4 text-center max-w-none">
					<p class="text-3xl font-bold text-blue-700 dark:text-blue-400">{weekUserEvents.activeUsers}</p>
					<p class="text-sm text-gray-500 mt-1">Active {showYtd ? "YTD" : "This Week"}</p>
				</Card>
				<Card class="p-4 max-w-none">
					<p class="text-xs font-semibold text-gray-500 mb-2">By Role</p>
					<div class="flex flex-wrap gap-1">
						{#each Object.entries(stats.users.byRole) as [role, cnt]}
							<Badge color={roleColors[role] ?? "gray"}>{role}: {cnt}</Badge>
						{/each}
					</div>
				</Card>
			</div>
			{#if !showYtd && weekIndex === 0 && stats.users.newThisWeekList.length > 0}
				<div class="flex flex-wrap gap-1 mt-2">
					{#each stats.users.newThisWeekList as u}
						<Badge color={roleColors[u.role] ?? "gray"} class="text-xs">{u.username}</Badge>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Event Stats -->
		<div>
			<h2 class="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">Events</h2>
			<div class="grid grid-cols-3 gap-3">
				<Card class="p-4 text-center max-w-none">
					<p class="text-3xl font-bold text-primary-700 dark:text-primary-400">{stats.events.total}</p>
					<p class="text-sm text-gray-500 mt-1">Total Events</p>
				</Card>
				<Card class="p-4 text-center max-w-none">
					<p class="text-3xl font-bold text-green-700 dark:text-green-400">{stats.events.active}</p>
					<p class="text-sm text-gray-500 mt-1">This Season</p>
				</Card>
				<Card class="p-4 text-center max-w-none">
					<p class="text-3xl font-bold text-blue-700 dark:text-blue-400">{weekUserEvents.newEvents}</p>
					<p class="text-sm text-gray-500 mt-1">{showYtd ? "YTD" : "This Week"}</p>
				</Card>
			</div>
		</div>

		<!-- Activity -->
		<div>
			<h2 class="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">Activity</h2>
			<div class="grid grid-cols-3 sm:grid-cols-6 gap-3">
				<Card class="p-4 text-center max-w-none">
					<p class="text-2xl font-bold text-gray-800 dark:text-gray-100">{activityData.notesThisWeek}</p>
					<p class="text-xs text-gray-500 mt-1">Notes</p>
				</Card>
				<Card class="p-4 text-center max-w-none">
					<p class="text-2xl font-bold text-gray-800 dark:text-gray-100">
						{activityData.messagesThisWeek}
					</p>
					<p class="text-xs text-gray-500 mt-1">Messages</p>
				</Card>
				<Card class="p-4 text-center max-w-none">
					<p class="text-2xl font-bold text-gray-800 dark:text-gray-100">
						{activityData.matchEventsThisWeek}
					</p>
					<p class="text-xs text-gray-500 mt-1">Auto Events</p>
				</Card>
				<Card class="p-4 text-center max-w-none">
					<p class="text-2xl font-bold text-green-700 dark:text-green-400">
						{activityData.matchEventsConverted}
					</p>
					<p class="text-xs text-gray-500 mt-1">Converted</p>
				</Card>
				<Card class="p-4 text-center max-w-none">
					<p class="text-2xl font-bold text-red-600 dark:text-red-400">
						{activityData.matchEventsDismissed}
					</p>
					<p class="text-xs text-gray-500 mt-1">Dismissed</p>
				</Card>
				<Card class="p-4 text-center max-w-none">
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
			<Card class="p-4 max-w-none">
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
								<span class="text-sm font-semibold text-gray-700 dark:text-gray-300 w-14 text-right">
									{row.count > 0 ? row.count.toLocaleString() : "-"}
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</Card>
		</div>
	{:else if statsError}
		<p class="text-sm text-red-600 dark:text-red-400" role="alert">{statsError}</p>
	{/if}

	<!-- Active users -->
	<div>
		<h2 class="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">Active users</h2>
		<AnalyticsActiveUsersChart />
	</div>
</div>
