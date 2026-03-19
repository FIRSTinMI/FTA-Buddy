import { count, gt, eq, and, sql } from "drizzle-orm";
import { db } from "../db/db";
import { appTelemetry, events, matchEvents, matchLogs, messages, notes, users } from "../db/schema";
import { adminProcedure, router } from "../trpc";
import { events as liveEvents } from "../state";

/** Returns midnight on the most recent Tuesday (the start of the FRC event week). */
function getWeekStart(): Date {
	const now = new Date();
	// JS day: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
	const daysBack = (now.getDay() - 2 + 7) % 7;
	const tuesday = new Date(now);
	tuesday.setDate(now.getDate() - daysBack);
	tuesday.setHours(0, 0, 0, 0);
	return tuesday;
}

/** Builds a SQL expression that truncates a timestamp column to its most recent Tuesday. */
function tuesdayWeek(col: any) {
	return sql<string>`((${col} - make_interval(days := (EXTRACT(DOW FROM ${col})::int - 2 + 7) % 7))::date)`;
}

export const adminRouter = router({
	getStats: adminProcedure.query(async () => {
		const weekStart = getWeekStart();
		const yearStart = new Date(new Date().getFullYear(), 0, 1);

		const [
			[{ totalUsers }],
			[{ newUsersThisWeek }],
			[{ activeUsersThisWeek }],
			usersByRoleRows,
			[{ totalEvents }],
			[{ activeEvents }],
			[{ newEventsThisWeek }],
			[{ notesThisWeek }],
			[{ messagesThisWeek }],
			[{ matchEventsThisWeek }],
			[{ matchEventsConverted }],
			[{ matchEventsDismissed }],
			[{ matchLogsThisWeek }],
			// Weekly history rows (YTD, grouped by Tuesday week)
			notesWeekly,
			messagesWeekly,
			matchEventsWeekly,
			convertedWeekly,
			dismissedWeekly,
			matchLogsWeekly,
			newUsersWeekly,
			activeUsersWeekly,
			newEventsWeekly,
		] = await Promise.all([
			db.select({ totalUsers: count() }).from(users),
			db.select({ newUsersThisWeek: count() }).from(users).where(gt(users.created_at, weekStart)),
			db.select({ activeUsersThisWeek: count() }).from(users).where(gt(users.last_seen, weekStart)),
			db.select({ role: users.role, cnt: count() }).from(users).groupBy(users.role),
			db.select({ totalEvents: count() }).from(events),
			db.select({ activeEvents: count() }).from(events).where(eq(events.archived, false)),
			db.select({ newEventsThisWeek: count() }).from(events).where(gt(events.created_at, weekStart)),
			db.select({ notesThisWeek: count() }).from(notes).where(gt(notes.created_at, weekStart)),
			db.select({ messagesThisWeek: count() }).from(messages).where(gt(messages.created_at, weekStart)),
			db.select({ matchEventsThisWeek: count() }).from(matchEvents).where(gt(matchEvents.created_at, weekStart)),
			db
				.select({ matchEventsConverted: count() })
				.from(matchEvents)
				.where(and(eq(matchEvents.status, "converted"), gt(matchEvents.created_at, weekStart))),
			db
				.select({ matchEventsDismissed: count() })
				.from(matchEvents)
				.where(and(eq(matchEvents.status, "dismissed"), gt(matchEvents.created_at, weekStart))),
			db.select({ matchLogsThisWeek: count() }).from(matchLogs).where(gt(matchLogs.start_time, weekStart)),
			// Yearly weekly breakdowns
			db
				.select({ week: tuesdayWeek(notes.created_at), cnt: count() })
				.from(notes)
				.where(gt(notes.created_at, yearStart))
				.groupBy(tuesdayWeek(notes.created_at)),
			db
				.select({ week: tuesdayWeek(messages.created_at), cnt: count() })
				.from(messages)
				.where(gt(messages.created_at, yearStart))
				.groupBy(tuesdayWeek(messages.created_at)),
			db
				.select({ week: tuesdayWeek(matchEvents.created_at), cnt: count() })
				.from(matchEvents)
				.where(gt(matchEvents.created_at, yearStart))
				.groupBy(tuesdayWeek(matchEvents.created_at)),
			db
				.select({ week: tuesdayWeek(matchEvents.created_at), cnt: count() })
				.from(matchEvents)
				.where(and(eq(matchEvents.status, "converted"), gt(matchEvents.created_at, yearStart)))
				.groupBy(tuesdayWeek(matchEvents.created_at)),
			db
				.select({ week: tuesdayWeek(matchEvents.created_at), cnt: count() })
				.from(matchEvents)
				.where(and(eq(matchEvents.status, "dismissed"), gt(matchEvents.created_at, yearStart)))
				.groupBy(tuesdayWeek(matchEvents.created_at)),
			db
				.select({ week: tuesdayWeek(matchLogs.start_time), cnt: count() })
				.from(matchLogs)
				.where(gt(matchLogs.start_time, yearStart))
				.groupBy(tuesdayWeek(matchLogs.start_time)),
			db
				.select({ week: tuesdayWeek(users.created_at), cnt: count() })
				.from(users)
				.where(gt(users.created_at, yearStart))
				.groupBy(tuesdayWeek(users.created_at)),
			db
				.select({ week: tuesdayWeek(users.last_seen), cnt: count() })
				.from(users)
				.where(gt(users.last_seen, yearStart))
				.groupBy(tuesdayWeek(users.last_seen)),
			db
				.select({ week: tuesdayWeek(events.created_at), cnt: count() })
				.from(events)
				.where(gt(events.created_at, yearStart))
				.groupBy(tuesdayWeek(events.created_at)),
		]);

		const roleMap: Record<string, number> = {};
		for (const row of usersByRoleRows) {
			roleMap[row.role] = row.cnt;
		}

		// Merge weekly activity rows into a sorted array of weeks
		const allWeekKeys = new Set([
			...notesWeekly.map((r) => String(r.week)),
			...messagesWeekly.map((r) => String(r.week)),
			...matchEventsWeekly.map((r) => String(r.week)),
			...matchLogsWeekly.map((r) => String(r.week)),
			...newUsersWeekly.map((r) => String(r.week)),
			...activeUsersWeekly.map((r) => String(r.week)),
			...newEventsWeekly.map((r) => String(r.week)),
		]);
		const toMap = (rows: { week: string; cnt: number }[]) => new Map(rows.map((r) => [String(r.week), r.cnt]));
		const notesMap = toMap(notesWeekly as any);
		const messagesMap = toMap(messagesWeekly as any);
		const matchEventsMap = toMap(matchEventsWeekly as any);
		const convertedMap = toMap(convertedWeekly as any);
		const dismissedMap = toMap(dismissedWeekly as any);
		const matchLogsMap = toMap(matchLogsWeekly as any);
		const newUsersMap = toMap(newUsersWeekly as any);
		const activeUsersMap = toMap(activeUsersWeekly as any);
		const newEventsMap = toMap(newEventsWeekly as any);

		const activityWeeks = Array.from(allWeekKeys)
			.sort((a, b) => b.localeCompare(a))
			.map((week) => ({
				weekStart: week,
				notesThisWeek: notesMap.get(week) ?? 0,
				messagesThisWeek: messagesMap.get(week) ?? 0,
				matchEventsThisWeek: matchEventsMap.get(week) ?? 0,
				matchEventsConverted: convertedMap.get(week) ?? 0,
				matchEventsDismissed: dismissedMap.get(week) ?? 0,
				matchLogsThisWeek: matchLogsMap.get(week) ?? 0,
				newUsers: newUsersMap.get(week) ?? 0,
				activeUsers: activeUsersMap.get(week) ?? 0,
				newEvents: newEventsMap.get(week) ?? 0,
			}));

		const liveEventCount = Object.values(liveEvents).filter((e) => e.stats.extensions.length > 0).length;

		return {
			users: {
				total: totalUsers,
				newThisWeek: newUsersThisWeek,
				activeThisWeek: activeUsersThisWeek,
				byRole: roleMap,
			},
			events: {
				total: totalEvents,
				active: activeEvents,
				newThisWeek: newEventsThisWeek,
				liveNow: liveEventCount,
			},
			activity: {
				notesThisWeek,
				messagesThisWeek,
				matchEventsThisWeek,
				matchEventsConverted,
				matchEventsDismissed,
				matchLogsThisWeek,
			},
			activityWeeks,
		};
	}),

	getRecentTelemetry: adminProcedure.query(async () => {
		const yearStart = new Date(new Date().getFullYear(), 0, 1);

		// SQL expression that truncates a timestamp to the most recent Tuesday (00:00 local)
		const weekStartExpr = sql<string>`((${appTelemetry.created_at} - make_interval(days := (EXTRACT(DOW FROM ${appTelemetry.created_at})::int - 2 + 7) % 7))::date)`;

		const [ytdRows, weeklyRows] = await Promise.all([
			// YTD totals per event_type
			db
				.select({ event_type: appTelemetry.event_type, cnt: count() })
				.from(appTelemetry)
				.where(gt(appTelemetry.created_at, yearStart))
				.groupBy(appTelemetry.event_type)
				.orderBy(sql`count(*) desc`),

			// All rows since Jan 1, grouped by (event_type, week_start)
			db
				.select({ event_type: appTelemetry.event_type, week_start: weekStartExpr, cnt: count() })
				.from(appTelemetry)
				.where(gt(appTelemetry.created_at, yearStart))
				.groupBy(appTelemetry.event_type, weekStartExpr)
				.orderBy(sql`${weekStartExpr} desc`, sql`count(*) desc`),
		]);

		// Pivot weekly rows into { weekStart -> { event_type -> count } }
		const weekMap = new Map<string, Map<string, number>>();
		for (const row of weeklyRows) {
			const key = String(row.week_start);
			if (!weekMap.has(key)) weekMap.set(key, new Map());
			weekMap.get(key)!.set(row.event_type, row.cnt);
		}

		// Sorted newest-first
		const weeks = Array.from(weekMap.entries())
			.sort((a, b) => b[0].localeCompare(a[0]))
			.map(([weekStart, counts]) => ({
				weekStart,
				counts: Object.fromEntries(counts),
			}));

		const ytd = ytdRows.map((r) => ({ event_type: r.event_type, count: r.cnt }));
		const eventTypes = ytd.map((r) => r.event_type);

		return { ytd, weeks, eventTypes };
	}),
});
