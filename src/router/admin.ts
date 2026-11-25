import { and, count, desc, eq, gt, gte, ilike, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/db";
import {
	appTelemetry,
	debugLogs,
	events,
	matchEvents,
	matchLogs,
	messages,
	notes,
	slackServers,
	users,
} from "../db/schema";
import type {
	ActiveUsersPoint,
	AdminExtensionEntry,
	EventIntegrationStatus,
	ExtensionConfig,
} from "../../shared/types";
import { events as eventsInMemory } from "../state";
import { adminProcedure, router } from "../trpc";
import { getActiveUsers } from "../util/active-users";
import { debugLog, listLogCategories } from "../util/debug-log";

/** Log rows with `data` bigger than this are listed without it. */
const LOG_DATA_INLINE_BYTES = 8 * 1024;
import { bus } from "../util/eventBus";
import {
	extensionConfigSchema,
	getPresence,
	legacyEventCodeFor,
	listExtensions,
	setPendingConfig,
} from "../util/extension-presence";
import { buildParentMap, toEventIntegrationStatus, type LiveEventState } from "../util/event-integrations";
import { filterSeasonEvents } from "../util/season-events";
import { listEventsWithExtensionsOff, setEventExtensionsEnabled } from "../util/event-extensions";
import { TRPCError } from "@trpc/server";
import type { ExtensionConfigPush } from "./extension";

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
			newUsersList,
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
			db
				.select({ id: users.id, username: users.username, role: users.role })
				.from(users)
				.where(gt(users.created_at, weekStart)),
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

		return {
			users: {
				total: totalUsers,
				newThisWeek: newUsersThisWeek,
				newThisWeekList: newUsersList,
				activeThisWeek: activeUsersThisWeek,
				byRole: roleMap,
			},
			events: {
				total: totalEvents,
				active: activeEvents,
				newThisWeek: newEventsThisWeek,
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

	// #region Debug logs

	/**
	 * Distinct categories present in `debug_logs`, sorted, for the filter dropdown.
	 * A recursive index skip scan with a 30 s cache (see `listLogCategories`), so it
	 * stays fast with millions of rows.
	 */
	getLogCategories: adminProcedure.query(async (): Promise<string[]> => listLogCategories()),

	/**
	 * Filtered log rows, newest first. Every query is bounded by a time window
	 * (`range`, default 24 h, "all" only when asked) so the message `ilike` and the
	 * level filter never scan the whole table. Rows whose `data` is over 8 KB come
	 * back without it (`dataBytes` says how big); `getLogData` fetches one.
	 */
	queryLogs: adminProcedure
		.input(
			z.object({
				eventCode: z.string().optional(),
				category: z.string().optional(),
				level: z.enum(["debug", "info", "warn", "error"]).optional(),
				search: z.string().optional(),
				range: z.enum(["1h", "24h", "7d", "all"]).default("24h"),
				since: z.date().optional(),
				until: z.date().optional(),
				limit: z.number().int().min(1).max(1000).default(200),
				cursor: z.date().optional(),
			}),
		)
		.query(async ({ input }) => {
			const filters = [];
			if (input.eventCode) filters.push(eq(debugLogs.event_code, input.eventCode));
			if (input.category) filters.push(eq(debugLogs.category, input.category));
			if (input.level) filters.push(eq(debugLogs.level, input.level));
			if (input.search) filters.push(ilike(debugLogs.message, `%${input.search}%`));
			const windowMs = { "1h": 3_600_000, "24h": 86_400_000, "7d": 604_800_000, all: 0 }[input.range];
			const since = input.since ?? (windowMs ? new Date(Date.now() - windowMs) : undefined);
			if (since) filters.push(gte(debugLogs.timestamp, since));
			if (input.until) filters.push(lte(debugLogs.timestamp, input.until));
			if (input.cursor) filters.push(lte(debugLogs.timestamp, input.cursor));

			const rows = await db
				.select({
					id: debugLogs.id,
					timestamp: debugLogs.timestamp,
					event_code: debugLogs.event_code,
					category: debugLogs.category,
					level: debugLogs.level,
					message: debugLogs.message,
					data: sql<unknown>`CASE WHEN pg_column_size(${debugLogs.data}) > ${LOG_DATA_INLINE_BYTES} THEN NULL ELSE ${debugLogs.data} END`,
					dataBytes: sql<number | null>`pg_column_size(${debugLogs.data})`,
				})
				.from(debugLogs)
				.where(filters.length ? and(...filters) : undefined)
				.orderBy(desc(debugLogs.timestamp))
				.limit(input.limit + 1);

			const hasMore = rows.length > input.limit;
			const items = hasMore ? rows.slice(0, input.limit) : rows;
			const nextCursor = hasMore ? items[items.length - 1].timestamp : null;
			return { items, nextCursor };
		}),

	/** The `data` of one log row (queryLogs leaves out data over 8 KB). */
	getLogData: adminProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }) => {
		const [row] = await db.select({ data: debugLogs.data }).from(debugLogs).where(eq(debugLogs.id, input.id));
		return row?.data ?? null;
	}),

	clearLogs: adminProcedure
		.input(z.object({ category: z.string().optional(), eventCode: z.string().optional() }).optional())
		.mutation(async ({ input }) => {
			const filters = [];
			if (input?.category) filters.push(eq(debugLogs.category, input.category));
			if (input?.eventCode) filters.push(eq(debugLogs.event_code, input.eventCode));
			const result = await db
				.delete(debugLogs)
				.where(filters.length ? and(...filters) : undefined)
				.execute();
			return { deleted: result.rowCount ?? 0 };
		}),

	// #endregion

	// #region Extensions

	/**
	 * Every extension that sent a heartbeat in the last 24 h, plus legacy
	 * extensions (no heartbeat) known from any instance's in-memory event stats.
	 * Legacy rows come from 20-second Redis snapshots, so they can lag by up to
	 * 20 s; `online` for them means a frame or state report in the last 150 s, so
	 * a legacy notepad-only extension (no frames) shows offline after that.
	 */
	listExtensions: adminProcedure.query(async (): Promise<AdminExtensionEntry[]> => listExtensions()),

	/**
	 * Change an extension's settings. Queued in Redis (10 min) for its next
	 * heartbeat, which reaches it even when disabled or without an event, and,
	 * when it is attached to an event, also pushed on the event's config channel
	 * so a running extension applies it at once.
	 */
	setExtensionConfig: adminProcedure
		.input(z.object({ extensionId: z.string().min(1).max(64), config: extensionConfigSchema }))
		.mutation(async ({ ctx, input }): Promise<{ eventCode: string | null; pushedLive: boolean }> => {
			const config: ExtensionConfig = input.config;
			if (Object.keys(config).length === 0) return { eventCode: null, pushedLive: false };

			await setPendingConfig(input.extensionId, config);

			const presence = await getPresence(input.extensionId);
			const eventCode = presence ? presence.eventCode : await legacyEventCodeFor(input.extensionId);
			let pushedLive = false;
			if (eventCode) {
				const payload: ExtensionConfigPush = { extensionId: input.extensionId, config };
				bus.publish(`event:${eventCode}:extension-config`, payload);
				pushedLive = true;
				// Same optimistic update the event-scoped setConfig does, so the host
				// UI on this instance reflects it before the extension confirms.
				const event = eventsInMemory[eventCode];
				if (event) {
					for (const e of event.stats.extensions) {
						if (e.id === input.extensionId) e.config = { ...e.config, ...config };
					}
					bus.publish(`event:${eventCode}:extension-state`, event.stats.extensions);
				}
			}

			debugLog({
				category: "extension-admin",
				eventCode,
				message: `${ctx.user.username} (id ${ctx.user.id}) set extension ${input.extensionId} config ${JSON.stringify(config)}${eventCode ? ` on ${eventCode}` : ""}`,
				data: {
					adminUserId: ctx.user.id,
					adminUsername: ctx.user.username,
					extensionId: input.extensionId,
					eventCode,
					config,
				},
			});

			return { eventCode, pushedLive };
		}),

	/**
	 * Switch every extension on an event off or on. Stored on the event row
	 * (durable), synced to both instances and to open app clients
	 * (`event.settings` -> `extensionsEnabled`). Off: new extensions stop within
	 * one heartbeat and resume by themselves when switched back on; old
	 * extensions get `{ enabled: false }` and stay off until re-enabled locally.
	 */
	setEventExtensionEnabled: adminProcedure
		.input(z.object({ eventCode: z.string().min(1).max(64), enabled: z.boolean() }))
		.mutation(async ({ ctx, input }): Promise<{ eventCode: string; enabled: boolean }> => {
			const eventCode = input.eventCode.trim().toLowerCase();
			const found = await setEventExtensionsEnabled(eventCode, input.enabled);
			if (!found) throw new TRPCError({ code: "NOT_FOUND", message: `Event ${eventCode} not found` });
			debugLog({
				category: "extension-admin",
				eventCode,
				message: `${ctx.user.username} (id ${ctx.user.id}) switched extensions ${input.enabled ? "on" : "off"} for ${eventCode}`,
				data: { adminUserId: ctx.user.id, adminUsername: ctx.user.username, eventCode, enabled: input.enabled },
			});
			return { eventCode, enabled: input.enabled };
		}),

	/** Every event whose extensions are switched off (all others are on). */
	listEventsWithExtensionsOff: adminProcedure.query(
		async (): Promise<{ code: string; name: string }[]> => listEventsWithExtensionsOff(),
	),

	/**
	 * Integration state for every unarchived event, keyed by event code, for the
	 * admin event cards. One DB query (events left-joined to slack_servers).
	 * Config fields come from Postgres. `nexus.poll` is read from THIS instance's
	 * memory (production runs two instances, so it is omitted for events this
	 * instance has not loaded and may differ between them). `fms.extensionsOnline`
	 * comes from Redis and covers both instances. No secret is returned.
	 */
	getEventIntegrations: adminProcedure.query(async (): Promise<Record<string, EventIntegrationStatus>> => {
		const rows = await db
			.select({
				code: events.code,
				name: events.name,
				nexusApiKey: events.nexusApiKey,
				slackChannel: events.slackChannel,
				slackTeam: events.slackTeam,
				slackTeamName: slackServers.team_name,
				fmsEventPassword: events.fmsEventPassword,
				notepadOnly: events.notepadOnly,
				publicTicketSubmit: events.publicTicketSubmit,
				playoffMode: events.playoffMode,
				extensionsEnabled: events.extensionsEnabled,
				powerMonitoring: events.powerMonitoring,
				powerAlertSettings: events.powerAlertSettings,
				meshedEvent: events.meshedEvent,
				slowWarningSettings: events.slowWarningSettings,
				timezone: events.timezone,
				startDate: events.startDate,
				endDate: events.endDate,
			})
			.from(events)
			.leftJoin(slackServers, eq(slackServers.team_id, events.slackTeam))
			.where(eq(events.archived, false));

		const live: Record<string, LiveEventState | undefined> = {};
		for (const row of rows) {
			const mem = eventsInMemory[row.code];
			if (mem) live[row.code] = { nexus: mem.nexus, nexusEventStatus: mem.nexusEventStatus };
		}

		let extensionsOnline: Record<string, number> | undefined;
		try {
			extensionsOnline = {};
			for (const ext of await listExtensions()) {
				if (ext.online && ext.eventCode)
					extensionsOnline[ext.eventCode] = (extensionsOnline[ext.eventCode] ?? 0) + 1;
			}
		} catch (err) {
			console.warn("[admin] getEventIntegrations: extension presence unavailable:", (err as Error)?.message);
			extensionsOnline = undefined;
		}

		const parentByChild = buildParentMap(rows);
		const result: Record<string, EventIntegrationStatus> = {};
		for (const row of rows) {
			result[row.code] = toEventIntegrationStatus(row as Parameters<typeof toEventIntegrationStatus>[0], {
				parentByChild,
				live,
				extensionsOnline,
			});
		}
		return result;
	}),

	/**
	 * Event codes for the current season (UTC calendar year, the same year the
	 * year-end archive uses), newest first, for a dropdown.
	 */
	getSeasonEventCodes: adminProcedure.query(
		async (): Promise<{ code: string; name: string; startDate: string | null }[]> => {
			const rows = await db
				.select({
					code: events.code,
					name: events.name,
					startDate: events.startDate,
					endDate: events.endDate,
					created_at: events.created_at,
				})
				.from(events)
				.execute();
			return filterSeasonEvents(rows, new Date().getUTCFullYear());
		},
	),

	// #endregion

	// #region Active users

	/** Distinct app users per bucket over the last 4 days, oldest first, zeros included. */
	getActiveUsers: adminProcedure
		.input(z.object({ bucketMinutes: z.union([z.literal(5), z.literal(15)]).default(5) }).optional())
		.query(async ({ input }): Promise<ActiveUsersPoint[]> => getActiveUsers(input?.bucketMinutes ?? 5)),

	// #endregion
});
