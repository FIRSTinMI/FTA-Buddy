import {
	DEFAULT_POWER_ALERT_SETTINGS,
	DEFAULT_SLOW_WARNING_SETTINGS,
	type EventIntegrationStatus,
	type NexusEventStatus,
	type NexusStatus,
	type PowerAlertSettings,
	type SlowWarningSettings,
} from "../../shared/types";

/** The columns of one `events` row (plus the joined Slack team name) this mapping reads. */
export interface EventIntegrationRow {
	code: string;
	name: string;
	nexusApiKey: string | null;
	slackChannel: string | null;
	slackTeam: string | null;
	/** `slack_servers.team_name` for `slackTeam`; null when no workspace row exists. */
	slackTeamName: string | null;
	fmsEventPassword: string | null;
	notepadOnly: boolean;
	publicTicketSubmit: boolean;
	playoffMode: boolean;
	extensionsEnabled: boolean;
	powerMonitoring: boolean;
	powerAlertSettings: Partial<PowerAlertSettings> | null;
	meshedEvent: unknown;
	slowWarningSettings: Partial<SlowWarningSettings> | null;
	timezone: string | null;
	startDate: string | null;
	endDate: string | null;
}

/** The in-memory slice of this instance's event. Per instance: the other instance has its own. */
export interface LiveEventState {
	nexus: NexusStatus;
	nexusEventStatus?: NexusEventStatus;
}

export interface IntegrationContext {
	/** Sub-event code to the meshed parent's code, built from every row. */
	parentByChild: Map<string, string>;
	/** In-memory state of this instance, by event code. */
	live: Record<string, LiveEventState | undefined>;
	/** Online extensions per event code, from Redis. Undefined when not read. */
	extensionsOnline?: Record<string, number>;
}

function iso(d: Date | string | undefined): string | undefined {
	if (!d) return undefined;
	const date = d instanceof Date ? d : new Date(d);
	return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function parseSubEvents(meshed: unknown): { code: string; label: string }[] {
	if (!Array.isArray(meshed)) return [];
	return meshed
		.filter((s): s is { code: string; label?: string } => !!s && typeof (s as { code?: unknown }).code === "string")
		.map((s) => ({ code: s.code, label: typeof s.label === "string" ? s.label : "" }));
}

export function buildParentMap(rows: Pick<EventIntegrationRow, "code" | "meshedEvent">[]): Map<string, string> {
	const map = new Map<string, string>();
	for (const row of rows) {
		for (const sub of parseSubEvents(row.meshedEvent)) map.set(sub.code, row.code);
	}
	return map;
}

/** Pure mapping from a DB row (plus in-memory state) to the admin card status. Never copies a secret. */
export function toEventIntegrationStatus(row: EventIntegrationRow, ctx: IntegrationContext): EventIntegrationStatus {
	const nexusConfigured = !!row.nexusApiKey;
	const live = ctx.live[row.code];
	const online = ctx.extensionsOnline?.[row.code];

	const slow = { ...DEFAULT_SLOW_WARNING_SETTINGS, ...(row.slowWarningSettings ?? {}) };
	const power = { ...DEFAULT_POWER_ALERT_SETTINGS, ...(row.powerAlertSettings ?? {}) };

	return {
		code: row.code,
		name: row.name,
		nexus: {
			configured: nexusConfigured,
			...(nexusConfigured && live
				? {
						poll: {
							state: live.nexus.state,
							lastSuccessAt: iso(live.nexus.lastSuccessAt),
							lastErrorAt: iso(live.nexus.lastErrorAt),
							lastErrorMessage: live.nexus.lastErrorMessage,
							isAllInspected: live.nexus.isAllInspected,
							scheduleDataAsOf: live.nexusEventStatus?.dataAsOfTime,
						},
					}
				: {}),
		},
		slack: {
			connected: !!row.slackChannel && !!row.slackTeam,
			channelId: row.slackChannel,
			teamId: row.slackTeam,
			teamName: row.slackTeamName,
			workspaceInstalled: row.slackTeamName !== null,
		},
		fms: {
			passwordSet: !!row.fmsEventPassword,
			...(online !== undefined ? { extensionsOnline: online } : {}),
		},
		notepadOnly: row.notepadOnly,
		publicTicketSubmit: row.publicTicketSubmit,
		playoffMode: row.playoffMode,
		extensionsEnabled: row.extensionsEnabled,
		powerMonitoring: row.powerMonitoring,
		powerAlertsEnabled: power.enabled === true,
		meshed: {
			subEvents: parseSubEvents(row.meshedEvent),
			parentCode: ctx.parentByChild.get(row.code) ?? null,
		},
		slowWarning: { enabled: slow.enabled === true, mode: slow.mode },
		timezone: row.timezone,
		startDate: row.startDate,
		endDate: row.endDate,
	};
}
