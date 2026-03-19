import { and, eq, inArray } from "drizzle-orm";
import { existsSync, mkdirSync } from "fs";
import jsPDF from "jspdf";
import OpenAI from "openai";
import { db } from "../db/db";
import { matchEvents, messages, notes } from "../db/schema";

const openaiApiKey = process.env.OPENAI_API_KEY ?? process.env.OPENAI_KEY;
const model = process.env.OPENAI_MODEL ?? "gpt-5";

interface NoteContext {
	id: string;
	team: number | null;
	note_type: string;
	issue_type: string | null;
	resolution_status: string | null;
	text: string;
	match_number: number | null;
	tournament_level: string | null;
	author: string;
	assigned_to: string | null;
	open_time_minutes: number | null;
	message_count: number;
	is_auto_note: boolean;
	recurrence_score: number;
	recurrence_matches: string[];
	resolution_excerpt: string[];
	diagnostic_excerpt: string[];
	timeline_excerpt: string[];
	priority_score: number;
	messages: Array<{ text: string; author: string; created_at: string | null }>;
}

interface MatchEventSummary {
	team: number;
	total: number;
	dismissed: number;
	follow_up_note_count: number;
	issue_breakdown: Record<string, number>;
	levels: Record<string, number>;
}

interface TicketDigestEntry {
	id: string;
	team: number | null;
	note_type: string;
	resolution_status: string | null;
	match_number: number | null;
	tournament_level: string | null;
	text: string;
	message_count: number;
	messages: Array<{ text: string; author: string; created_at: string | null }>;
	open_time_minutes: number | null;
	has_csa: boolean;
	is_auto_note: boolean;
	recurrence_score: number;
	recurrence_matches: string[];
	priority_score: number;
	issue_type_hint: string | null;
	diagnostic_excerpt: string[];
	resolution_excerpt: string[];
	timeline_excerpt: string[];
}

interface ClosedNoteDetail {
	team: number | null;
	text: string;
	message_count: number;
	open_time_minutes: number | null;
	recurrence_score: number;
	recurrence_matches: string[];
	diagnostic_excerpt: string[];
	resolution_excerpt: string[];
	messages: Array<{ text: string; author: string; created_at: string | null }>;
}

interface EventContext {
	event_name: string;
	event_code: string;
	start_date: string | null;
	end_date: string | null;
	team_count: number;
	stats: {
		total_notes: number;
		team_issue_notes: number;
		event_notes: number;
		match_notes: number;
		resolved_notes: number;
		open_notes: number;
		notes_with_csa: number;
		total_match_events: number;
		official_match_events: number;
		test_match_events: number;
		dismissed_match_events: number;
		followup_match_events: number;
		most_common_issues: Array<{ issue: string; count: number }>;
		most_active_threads: Array<{
			team: number | null;
			text_preview: string;
			message_count: number;
			open_time_minutes: number | null;
			recurrence_score: number;
			recurrence_matches: string[];
			resolution_excerpt: string[];
		}>;
		teams_with_most_issues: Array<{ team: number; note_count: number }>;
		teams_with_most_match_events: Array<{ team: number; total: number }>;
		teams_with_most_high_impact_match_events: Array<{ team: number; total: number }>;
		closed_note_details: ClosedNoteDetail[];
		open_note_details: Array<{
			team: number | null;
			text: string;
			message_count: number;
			open_time_minutes: number | null;
			recurrence_score: number;
			recurrence_matches: string[];
			resolution_excerpt: string[];
			diagnostic_excerpt: string[];
			match_number: number | null;
			tournament_level: string | null;
			issue_type_hint: string | null;
			messages: Array<{ text: string; author: string; created_at: string | null }>;
		}>;
		ticket_digest: TicketDigestEntry[];
	};
	match_event_summaries: MatchEventSummary[];
}

interface CollectEventDataOptions {
	includeTestMatches?: boolean;
}

const HIGH_IMPACT_MATCH_EVENT_ISSUES = new Set([
	"Bypass",
	"roboRIO Disconnect",
	"Radio Disconnect",
	"Communication Loss",
]);

function humanizeIssueType(value: string | null | undefined): string | null {
	if (!value) return null;

	const normalized = value.trim();
	if (!normalized) return null;

	const explicitMap: Record<string, string> = {
		RoboRioIssue: "roboRIO Issue",
		RioIssue: "roboRIO Issue",
		RadioIssue: "Radio Issue",
		DSIssue: "Driver Station Issue",
		CodeIssue: "Code Issue",
		BatteryIssue: "Battery Issue",
		PDHIssue: "PDH Issue",
		PDPIssue: "PDP Issue",
		PowerIssue: "Power Issue",
		RobotPwrIssue: "Robot Power Issue",
		CANIssue: "CAN Issue",
		WiringIssue: "Wiring Issue",
		MechanicalIssue: "Mechanical Issue",
		ControlSystemIssue: "Control System Issue",
		Other: "Other",

		Brownout: "Brownout",
		HighBWU: "High BWU",
		HighBandwidthUtilization: "High BWU",
		RIODisconnect: "roboRIO Disconnect",
		RoboRioDisconnect: "roboRIO Disconnect",
		RadioDisconnect: "Radio Disconnect",
		CommLoss: "Communication Loss",
		CommsLoss: "Communication Loss",
		Bypassed: "Bypass",
		Bypass: "Bypass",
		CodeDisconnect: "Code Disconnect",
		DSDisconnect: "Driver Station Disconnect",
	};

	if (explicitMap[normalized]) return explicitMap[normalized];

	return normalized
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/\bRobo Rio\b/g, "roboRIO")
		.replace(/\bRio\b/g, "RIO")
		.replace(/\bDs\b/g, "DS")
		.trim();
}

function truncate(value: string, max = 320): string {
	if (!value) return "";
	if (value.length <= max) return value;
	return `${value.slice(0, max - 1)}…`;
}

function cleanLine(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function formatTimestamp(value: Date | null | undefined): string | null {
	if (!value) return null;
	return value.toISOString().replace("T", " ").slice(0, 16);
}

function extractMatchRefs(text: string): string[] {
	const matches = text.match(/\b(?:Q|QM|P|SF|F|M)\s*\d+\b/gi) ?? [];
	const normalized = matches.map((m) => m.replace(/\s+/g, "").toUpperCase()).filter(Boolean);

	return [...new Set(normalized)];
}

function detectRecurrence(noteText: string, messageTexts: string[]): { score: number; matches: string[] } {
	const recurrencePatterns = [
		/\bhappened again\b/i,
		/\bguess what happened again\b/i,
		/\bagain in\b/i,
		/\brecur/i,
		/\bstill happening\b/i,
		/\bcontinues?\b/i,
		/\breappeared\b/i,
		/\bsame issue\b/i,
		/\banother (?:one|disconnect|brownout|trip|failure)\b/i,
		/\bsecond match\b/i,
		/\bthird match\b/i,
		/\bblew it again\b/i,
		/\blost power again\b/i,
	];

	let score = 0;
	const allTexts = [noteText, ...messageTexts];

	for (const text of allTexts) {
		if (recurrencePatterns.some((pattern) => pattern.test(text))) {
			score += 1;
		}
	}

	const matchRefs = [...new Set(allTexts.flatMap((text) => extractMatchRefs(text)))];
	if (matchRefs.length >= 2) {
		score += Math.min(3, matchRefs.length - 1);
	}

	return { score, matches: matchRefs.slice(0, 8) };
}

function isResolutionLike(text: string): boolean {
	return /\b(fixed|resolved|working|good in|better in|reconnected|replaced|swapped|secured|reseated|validated|added|lowered|closed|solved|executing|look much better|seem happy|tug test|planning to redo wiring)\b/i.test(
		text,
	);
}

function isDiagnosticLike(text: string): boolean {
	return /\b(suspect|diagnosis|issue|problem|disconnect|brownout|breaker|blown|power lead|wire|wiring|radio|roborio|rio|can|cancoder|static|packet loss|cpu|bandwidth|bwu|controller|bluetooth|fuse|grounding strap|current limit|current limits|peak|peaks)\b/i.test(
		text,
	);
}

function selectMessageExcerpts(
	noteText: string,
	rawMessages: Array<{ text: string; created_at: Date; author: any }>,
): {
	diagnostic_excerpt: string[];
	resolution_excerpt: string[];
	timeline_excerpt: string[];
} {
	const sorted = [...rawMessages].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

	const formatMessage = (m: { text: string; created_at: Date; author: any }, max = 220): string => {
		const author = (m.author as any)?.username ?? "?";
		const ts = formatTimestamp(m.created_at) ?? "?";
		return `[${ts}] ${author}: ${truncate(cleanLine(m.text), max)}`;
	};

	const diagnosticCandidates = sorted
		.filter((m) => isDiagnosticLike(m.text))
		.slice(0, 2)
		.map((m) => formatMessage(m));

	const resolutionCandidates = [...sorted]
		.reverse()
		.filter((m) => isResolutionLike(m.text))
		.slice(0, 3)
		.reverse()
		.map((m) => formatMessage(m));

	const tailMessages = sorted.slice(-2).map((m) => formatMessage(m));

	const timelineExcerpt = [
		`Note: ${truncate(cleanLine(noteText), 360)}`,
		...diagnosticCandidates,
		...resolutionCandidates,
		...tailMessages,
	].filter((value, index, arr) => arr.indexOf(value) === index);

	return {
		diagnostic_excerpt: diagnosticCandidates.slice(0, 2),
		resolution_excerpt: resolutionCandidates.slice(0, 3),
		timeline_excerpt: timelineExcerpt.slice(0, 6),
	};
}

function computePriorityScore(input: {
	messageCount: number;
	openMinutes: number | null;
	recurrenceScore: number;
	hasCsa: boolean;
	isOpen: boolean;
	isAutoNote: boolean;
	tournamentLevel: string | null;
	noteText: string;
}): number {
	let score = 0;

	score += Math.min(input.messageCount, 12) * 2;
	score += Math.min(input.recurrenceScore, 6) * 6;

	if (input.openMinutes) {
		score += Math.min(Math.floor(input.openMinutes / 30), 10);
	}

	if (input.hasCsa) score += 6;
	if (input.isOpen) score += 8;
	if (input.tournamentLevel === "Playoff") score += 8;
	if (input.tournamentLevel === "Qualification") score += 3;
	if (input.isAutoNote) score -= 4;

	if (/\bbypass|bypassed\b/i.test(input.noteText)) score += 10;
	if (/\broborio disconnect|rio disconnect|radio disconnect|comm/i.test(input.noteText)) score += 8;
	if (/\bbreaker|brownout|lost power|power lead|fuse|weidmuller|can\b/i.test(input.noteText)) score += 5;

	return score;
}

async function collectEventData(
	eventCode: string,
	eventName: string,
	startDate: string | null,
	endDate: string | null,
	teamCount: number,
	options: CollectEventDataOptions = {},
): Promise<EventContext> {
	const { includeTestMatches = true } = options;
	const includedLevels: readonly ("None" | "Practice" | "Qualification" | "Playoff")[] = includeTestMatches
		? ["None", "Practice", "Qualification", "Playoff"]
		: ["Qualification", "Playoff"];

	const allNotes = await db.select().from(notes).where(eq(notes.event_code, eventCode)).execute();
	const allMessages = await db.select().from(messages).where(eq(messages.event_code, eventCode)).execute();

	const messagesByNote = new Map<string, typeof allMessages>();
	for (const msg of allMessages) {
		if (!messagesByNote.has(msg.note_id)) messagesByNote.set(msg.note_id, []);
		messagesByNote.get(msg.note_id)!.push(msg);
	}

	const allMatchEvents = await db
		.select({
			team: matchEvents.team,
			issue: matchEvents.issue,
			issues: matchEvents.issues,
			status: matchEvents.status,
			level: matchEvents.level,
			match_number: matchEvents.match_number,
		})
		.from(matchEvents)
		.where(and(eq(matchEvents.event_code, eventCode), inArray(matchEvents.level, includedLevels)))
		.execute();

	const noteContexts: NoteContext[] = allNotes.map((n) => {
		const noteMessages = (messagesByNote.get(n.id) ?? []).sort(
			(a, b) => a.created_at.getTime() - b.created_at.getTime(),
		);

		let openTimeMinutes: number | null = null;
		if (n.closed_at && n.created_at) {
			openTimeMinutes = Math.round((n.closed_at.getTime() - n.created_at.getTime()) / 60000);
		}

		const recurrence = detectRecurrence(
			n.text,
			noteMessages.map((m) => m.text),
		);

		const excerpts = selectMessageExcerpts(n.text, noteMessages);

		const priorityScore = computePriorityScore({
			messageCount: noteMessages.length,
			openMinutes: openTimeMinutes,
			recurrenceScore: recurrence.score,
			hasCsa: n.assigned_to !== null,
			isOpen: n.resolution_status === "Open",
			isAutoNote: n.text.trim().startsWith("[Auto]"),
			tournamentLevel: n.tournament_level ?? null,
			noteText: n.text,
		});

		return {
			id: n.id,
			team: n.team ?? null,
			note_type: n.note_type ?? "TeamIssue",
			issue_type: humanizeIssueType(n.issue_type),
			resolution_status: n.resolution_status ?? null,
			text: truncate(cleanLine(n.text), 420),
			match_number: n.match_number ?? null,
			tournament_level: n.tournament_level ?? null,
			author: (n.author as any)?.username ?? "unknown",
			assigned_to: (n.assigned_to as any)?.username ?? null,
			open_time_minutes: openTimeMinutes,
			message_count: noteMessages.length,
			is_auto_note: n.text.trim().startsWith("[Auto]"),
			recurrence_score: recurrence.score,
			recurrence_matches: recurrence.matches,
			diagnostic_excerpt: excerpts.diagnostic_excerpt,
			resolution_excerpt: excerpts.resolution_excerpt,
			timeline_excerpt: excerpts.timeline_excerpt,
			priority_score: priorityScore,
			messages: noteMessages.map((m) => ({
				text: truncate(cleanLine(m.text), 500),
				author: (m.author as any)?.username ?? "unknown",
				created_at: formatTimestamp(m.created_at),
			})),
		};
	});

	const meSummaryMap = new Map<number, MatchEventSummary>();
	for (const me of allMatchEvents) {
		if (!meSummaryMap.has(me.team)) {
			meSummaryMap.set(me.team, {
				team: me.team,
				total: 0,
				dismissed: 0,
				follow_up_note_count: 0,
				issue_breakdown: {},
				levels: {},
			});
		}

		const summary = meSummaryMap.get(me.team)!;
		summary.total++;

		if (me.status === "dismissed") summary.dismissed++;
		if (me.status === "converted") summary.follow_up_note_count++;

		const levelLabel = me.level ?? "Unknown";
		summary.levels[levelLabel] = (summary.levels[levelLabel] ?? 0) + 1;

		const details = (me.issues as { issue: string }[] | null) ?? [{ issue: me.issue }];
		for (const detail of details) {
			const issueLabel = humanizeIssueType(detail.issue) ?? "Unknown";
			summary.issue_breakdown[issueLabel] = (summary.issue_breakdown[issueLabel] ?? 0) + 1;
		}
	}

	const matchEventSummaries = Array.from(meSummaryMap.values()).sort((a, b) => b.total - a.total);

	const teamsWithMostMatchEvents = matchEventSummaries
		.slice(0, 5)
		.map((summary) => ({ team: summary.team, total: summary.total }));

	const teamsWithMostHighImpactMatchEvents = matchEventSummaries
		.map((summary) => {
			const total = Object.entries(summary.issue_breakdown).reduce((acc, [issue, count]) => {
				return HIGH_IMPACT_MATCH_EVENT_ISSUES.has(issue) ? acc + count : acc;
			}, 0);
			return { team: summary.team, total };
		})
		.filter((entry) => entry.total > 0)
		.sort((a, b) => b.total - a.total)
		.slice(0, 5);

	const teamIssueNotes = noteContexts.filter((n) => n.note_type === "TeamIssue");
	const resolvedNotes = noteContexts.filter((n) => n.resolution_status === "Resolved").length;
	const openNotes = noteContexts.filter((n) => n.resolution_status === "Open").length;
	const notesWithCsa = noteContexts.filter((n) => n.assigned_to !== null).length;

	const totalMatchEvents = allMatchEvents.length;
	const testMatchEvents = allMatchEvents.filter((e) => e.level === "None" || e.level === "Practice").length;
	const officialMatchEvents = allMatchEvents.filter(
		(e) => e.level === "Qualification" || e.level === "Playoff",
	).length;
	const dismissedMatchEvents = allMatchEvents.filter((e) => e.status === "dismissed").length;
	const followupMatchEvents = allMatchEvents.filter((e) => e.status === "converted").length;

	const issueCounts = new Map<string, number>();
	for (const n of noteContexts) {
		if (n.issue_type) issueCounts.set(n.issue_type, (issueCounts.get(n.issue_type) ?? 0) + 1);
	}
	const mostCommonIssues = Array.from(issueCounts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([issue, count]) => ({ issue, count }));

	const mostActiveThreads = [...noteContexts]
		.filter((n) => n.message_count > 0)
		.sort((a, b) => {
			if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
			if (b.message_count !== a.message_count) return b.message_count - a.message_count;
			return (b.open_time_minutes ?? 0) - (a.open_time_minutes ?? 0);
		})
		.slice(0, 5)
		.map((n) => ({
			team: n.team,
			text_preview: truncate(n.text, 180),
			message_count: n.message_count,
			open_time_minutes: n.open_time_minutes,
			recurrence_score: n.recurrence_score,
			recurrence_matches: n.recurrence_matches,
			resolution_excerpt: n.resolution_excerpt,
		}));

	const teamNoteCounts = new Map<number, number>();
	for (const n of teamIssueNotes) {
		if (n.team !== null) teamNoteCounts.set(n.team, (teamNoteCounts.get(n.team) ?? 0) + 1);
	}
	const teamsWithMostIssues = Array.from(teamNoteCounts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(([team, note_count]) => ({ team, note_count }));

	const closedNoteDetails: ClosedNoteDetail[] = noteContexts
		.filter((n) => n.resolution_status === "Resolved")
		.sort((a, b) => {
			if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
			if (b.message_count !== a.message_count) return b.message_count - a.message_count;
			return (b.open_time_minutes ?? 0) - (a.open_time_minutes ?? 0);
		})
		.slice(0, 10)
		.map((n) => ({
			team: n.team,
			text: n.text,
			message_count: n.message_count,
			open_time_minutes: n.open_time_minutes,
			recurrence_score: n.recurrence_score,
			recurrence_matches: n.recurrence_matches,
			diagnostic_excerpt: n.diagnostic_excerpt,
			resolution_excerpt: n.resolution_excerpt,
			messages: n.messages,
		}));

	const openNoteDetails = noteContexts
		.filter((n) => n.resolution_status === "Open")
		.sort((a, b) => {
			if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
			if (b.message_count !== a.message_count) return b.message_count - a.message_count;
			return (b.open_time_minutes ?? 0) - (a.open_time_minutes ?? 0);
		})
		.map((n) => ({
			team: n.team,
			text: n.text,
			message_count: n.message_count,
			open_time_minutes: n.open_time_minutes,
			recurrence_score: n.recurrence_score,
			recurrence_matches: n.recurrence_matches,
			resolution_excerpt: n.resolution_excerpt,
			diagnostic_excerpt: n.diagnostic_excerpt,
			match_number: n.match_number,
			tournament_level: n.tournament_level,
			issue_type_hint: n.issue_type,
			messages: n.messages,
		}));

	const ticketDigest: TicketDigestEntry[] = [...noteContexts]
		.map((n) => ({
			id: n.id,
			team: n.team,
			note_type: n.note_type,
			resolution_status: n.resolution_status,
			match_number: n.match_number,
			tournament_level: n.tournament_level,
			text: n.text,
			message_count: n.message_count,
			open_time_minutes: n.open_time_minutes,
			has_csa: n.assigned_to !== null,
			is_auto_note: n.is_auto_note,
			recurrence_score: n.recurrence_score,
			recurrence_matches: n.recurrence_matches,
			priority_score: n.priority_score,
			issue_type_hint: n.issue_type,
			diagnostic_excerpt: n.diagnostic_excerpt,
			resolution_excerpt: n.resolution_excerpt,
			timeline_excerpt: n.timeline_excerpt,
			messages: n.messages,
		}))
		.sort((a, b) => {
			// Tickets without a team number go last
			if (a.team === null && b.team === null) return 0;
			if (a.team === null) return 1;
			if (b.team === null) return -1;
			return a.team - b.team;
		});

	return {
		event_name: eventName,
		event_code: eventCode,
		start_date: startDate,
		end_date: endDate,
		team_count: teamCount,
		stats: {
			total_notes: noteContexts.length,
			team_issue_notes: teamIssueNotes.length,
			event_notes: noteContexts.filter((n) => n.note_type === "EventNote").length,
			match_notes: noteContexts.filter((n) => n.note_type === "MatchNote").length,
			resolved_notes: resolvedNotes,
			open_notes: openNotes,
			notes_with_csa: notesWithCsa,
			total_match_events: totalMatchEvents,
			official_match_events: officialMatchEvents,
			test_match_events: testMatchEvents,
			dismissed_match_events: dismissedMatchEvents,
			followup_match_events: followupMatchEvents,
			most_common_issues: mostCommonIssues,
			most_active_threads: mostActiveThreads,
			teams_with_most_issues: teamsWithMostIssues,
			teams_with_most_match_events: teamsWithMostMatchEvents,
			teams_with_most_high_impact_match_events: teamsWithMostHighImpactMatchEvents,
			closed_note_details: closedNoteDetails,
			open_note_details: openNoteDetails,
			ticket_digest: ticketDigest,
		},
		match_event_summaries: matchEventSummaries,
	};
}

function buildPrompt(ctx: EventContext): string {
	return `You are writing a technical event operations summary for FIRST HQ.

Audience: Lead FTA and Program Technical Staff.

This is an internal technical report.
Do NOT include recommendations.
Do NOT speculate.
Do NOT include training suggestions.
Do NOT include motivational language.
Do NOT describe the event atmosphere.
Use concise, operations-focused FRC language.

VERY IMPORTANT INTERPRETATION RULES

MATCH EVENTS
- Match events are automatic detections recorded during matches.
- They are NOT matches themselves.
- A single match can contain multiple match events.
- Examples include brownouts, roboRIO disconnects, radio disconnects, high bandwidth utilization, and bypass events.
- Some match events are dismissed and never become tickets.
- Some match events result in a follow-up ticket and troubleshooting thread.
- When discussing match events, distinguish clearly between:
  1) raw automatic detections
  2) dismissed detections
  3) detections that resulted in follow-up notes

TICKET PRIORITIZATION
Prioritize tickets using these signals:
- many thread messages
- long open time
- recurrence across multiple matches
- notes that explicitly say things like "happened again", "blew again", "again in Q23", or similar
- CSA involvement
- issues persisting late in quals or into playoffs
- issues that affected match play
- unresolved open tickets

Treat tickets with many messages over a large timespan as high-interest incidents, even if their issue label is vague or inaccurate.

CRITICAL GROUNDING RULES
- Do NOT rely heavily on issue_type labels for interpretation or prioritization.
- Issue labels are only hints and may be inaccurate.
- Prefer note text, message excerpts, recurrence evidence, and resolution excerpts over issue labels.
- If the note or message says "main breaker blew", "positive power lead fell out", "loose RIO power wire", "blown radio fuse", "PhotonVision web GUI open", "duplicate CAN IDs", "CAN leads into the PDH were loose", "controller only connects via Bluetooth", or similar, use that specific language.
- Do not flatten concrete failures into generic phrases when specific wording exists.
- Use resolution excerpts to describe how the issue was fixed or mitigated.
- If the cause is uncertain in the thread, say that it was uncertain rather than asserting a definite cause.
- If the thread shows recurrence, state that explicitly.
- If a ticket remains open, state the exact unresolved condition from the note and excerpts.

TARGET LENGTH
Aim for approximately 1.5 to 2.5 pages of text when rendered to PDF.

Use ONLY these section headings:

EVENT METRICS
Provide team count, total notes, breakdown by note type, open vs resolved, CSA involvement, and total match events.
Separate official match events from test-match events.
Distinguish dismissed automatic detections from detections that produced follow-up notes.

ISSUE BREAKDOWN
Summarize issue categories factually, but do not over-trust the labels.
List the top 5 teams by total match events.
List the top 5 teams by high-impact match events.
List teams with the most formal notes.
Identify the most active troubleshooting threads.

MATCH EVENT REVIEW
Summarize the automatic match-event detections.
State totals for brownouts, disconnects, high BWU, and bypasses where present.
Clearly state how many were dismissed and how many produced follow-up notes.
If official match-event volume is zero but test-match detections exist, state that clearly.

RESOLUTION STATUS
Summarize resolution rate numerically.
Identify open items and whether they appear operationally significant based on recurrence, thread length, or late-event context.
Summarize the most important resolved tickets using the concrete thread details and fixes.

KEY INCIDENTS
Focus on the most operationally significant tickets.
These are usually tickets with long threads, high recurrence, long open time, CSA involvement, or repeated match impact.
Use the order already provided in stats.ticket_digest and discuss the highest-priority incidents first.
This section should be selective and emphasize the tickets the reader would care most about.

TICKET SUMMARY
Provide a concise bullet summary for EVERY ticket in the dataset, listed in ascending team number order (as already ordered in stats.ticket_digest). Tickets without a team number appear last.
Use one bullet per ticket.
Each bullet should include:
- team number when present
- match number / level when useful
- the concrete issue description from the note text
- recurrence if supported
- the key fix or outcome from resolution excerpts if present
- whether the ticket remains open
Do not omit any ticket.
Do not merge tickets.
Use plain text bullets beginning with "- ".

EVENT DATA (COMPACT JSON):
${JSON.stringify(ctx)}`;
}

function renderNarrativePdf(text: string, eventName: string, eventCode: string): string {
	const doc = new jsPDF({ format: "letter" });
	const marginLeft = 15;
	const marginTop = 20;
	const pageWidth = doc.internal.pageSize.getWidth();
	const usableWidth = pageWidth - marginLeft * 2;

	doc.setFontSize(18);
	doc.setFont("helvetica", "bold");
	doc.text(`AI Event Summary: ${eventName}`, marginLeft, marginTop);

	doc.setFontSize(10);
	doc.setFont("helvetica", "normal");
	doc.text(`Event Code: ${eventCode}  |  Generated: ${new Date().toLocaleDateString()}`, marginLeft, marginTop + 8);

	doc.setDrawColor(0);
	doc.line(marginLeft, marginTop + 12, pageWidth - marginLeft, marginTop + 12);

	let y = marginTop + 20;
	const lineHeight = 6;
	const paragraphGap = 4;
	const lines = text.split("\n");

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) {
			y += paragraphGap;
			continue;
		}

		const cleanedLine = line.replace(/\*\*/g, "");
		const isHeading =
			cleanedLine.length >= 4 &&
			cleanedLine === cleanedLine.toUpperCase() &&
			/[A-Z]/.test(cleanedLine) &&
			!cleanedLine.startsWith("-");

		if (isHeading) {
			if (y > doc.internal.pageSize.getHeight() - 30) {
				doc.addPage();
				y = marginTop;
			}
			y += paragraphGap;
			doc.setFontSize(12);
			doc.setFont("helvetica", "bold");
			doc.text(cleanedLine, marginLeft, y);
			y += lineHeight + 2;
			doc.setFontSize(10);
			doc.setFont("helvetica", "normal");
		} else {
			const wrapped = doc.splitTextToSize(cleanedLine, usableWidth) as string[];
			for (const wrappedLine of wrapped) {
				if (y > doc.internal.pageSize.getHeight() - 20) {
					doc.addPage();
					y = marginTop;
				}
				doc.text(wrappedLine, marginLeft, y);
				y += lineHeight;
			}
		}
	}

	if (!existsSync("/data/reports")) mkdirSync("/data/reports", { recursive: true });
	const filePath = `/data/reports/ai-summary-${eventCode}.pdf`;
	doc.save(filePath);
	return `/report/ai-summary-${eventCode}.pdf`;
}

export async function generateAiEventReport(
	eventCode: string,
	eventName: string,
	startDate: string | null,
	endDate: string | null,
	teamCount: number,
): Promise<string> {
	if (!openaiApiKey) {
		throw new Error("AI report generation is disabled: OPENAI_API_KEY is not configured.");
	}

	const openai = new OpenAI({ apiKey: openaiApiKey });
	const ctx = await collectEventData(eventCode, eventName, startDate, endDate, teamCount, {
		includeTestMatches: true,
	});

	const systemPrompt = `
You are an experienced FRC FTA writing an internal technical event report.

Your job is to identify the tickets the reader will care most about and explain them clearly.
Prefer:
- recurrence
- long threads
- long open time
- CSA involvement
- concrete diagnostics
- concrete fixes
Do not over-weight database issue labels. They are hints only and may be wrong.
Use the note text and message excerpts as the primary source of truth.
`;

	const response = await openai.responses.create({
		model,
		input: [
			{
				role: "developer",
				content: systemPrompt,
			},
			{
				role: "user",
				content: buildPrompt(ctx),
			},
		],
	});

	console.log("[AI Report] response:", JSON.stringify(response, null, 2));

	const reportText = response.output_text?.trim() || "No report generated.";

	return renderNarrativePdf(reportText, eventName, eventCode);
}
