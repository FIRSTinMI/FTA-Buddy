import { and, eq, inArray } from "drizzle-orm";
import { existsSync, mkdirSync } from "fs";
import jsPDF from "jspdf";
import OpenAI from "openai";
import { db } from "../db/db";
import { matchEvents, messages, notes } from "../db/schema";

const openaiApiKey = process.env.OPENAI_API_KEY ?? process.env.OPENAI_KEY;
const model = process.env.OPENAI_MODEL ?? "gpt-4o";

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
	messages: string[];
	timeline_excerpt: string[];
}

interface MatchEventSummary {
	team: number;
	total: number;
	dismissed: number;
	follow_up_note_count: number;
	issue_breakdown: Record<string, number>;
	levels: Record<string, number>;
}

interface ClosedNoteDetail {
	team: number | null;
	issue_type: string | null;
	text: string;
	message_count: number;
	open_time_minutes: number | null;
	thread_excerpt: string[];
	timeline_excerpt: string[];
}

interface TicketDigestEntry {
	team: number | null;
	issue_type: string | null;
	severity: number;
	match_number: number | null;
	tournament_level: string | null;
	text: string;
	thread_excerpt: string[];
	timeline_excerpt: string[];
	open_time_minutes: number | null;
	resolution_status: string | null;
	is_auto_note: boolean;
}

interface EventContext {
	event_name: string;
	event_code: string;
	start_date: string | null;
	end_date: string | null;
	team_count: number;
	notes: NoteContext[];
	match_event_summaries: MatchEventSummary[];
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
			thread_excerpt: string[];
			timeline_excerpt: string[];
		}>;
		teams_with_most_issues: Array<{ team: number; note_count: number }>;
		teams_with_most_match_events: Array<{ team: number; total: number }>;
		teams_with_most_high_impact_match_events: Array<{ team: number; total: number }>;
		closed_note_details: ClosedNoteDetail[];
		open_note_details: Array<{
			team: number | null;
			issue_type: string | null;
			text: string;
			message_count: number;
			open_time_minutes: number | null;
			thread_excerpt: string[];
			timeline_excerpt: string[];
			match_number: number | null;
			tournament_level: string | null;
		}>;
		ticket_digest: TicketDigestEntry[];
	};
}

interface CollectEventDataOptions {
	includeTestMatches?: boolean;
}

const HIGH_IMPACT_ISSUES = new Set([
	"Bypass",
	"roboRIO Disconnect",
	"Radio Disconnect",
	"Communication Loss",
]);

const ISSUE_SEVERITY: Record<string, number> = {
	Bypass: 5,
	"roboRIO Disconnect": 5,
	"roboRIO Issue": 4,
	"Radio Disconnect": 4,
	"Communication Loss": 4,
	"Robot Power Issue": 4,
	"Radio Issue": 3,
	"Brownout": 3,
	"Code Issue": 3,
	"Driver Station Issue": 3,
	"CAN Issue": 3,
	"Mechanical Issue": 2,
	"Wiring Issue": 2,
	"PDH Issue": 2,
	"PDP Issue": 2,
	"Power Issue": 2,
	"Battery Issue": 2,
	"Control System Issue": 2,
	"High BWU": 1,
	Other: 1,
};

function humanizeIssueType(value: string | null | undefined): string | null {
	if (!value) return null;

	const normalized = value.trim();
	if (!normalized) return null;

	const explicitMap: Record<string, string> = {
		// Note issue types
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

		// Match event issues
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

function getSeverity(issue: string | null): number {
	if (!issue) return 1;
	return ISSUE_SEVERITY[issue] ?? 1;
}

function formatTimestamp(value: Date | null | undefined): string | null {
	if (!value) return null;
	return value.toISOString().replace("T", " ").slice(0, 16);
}

function truncate(value: string, max = 240): string {
	if (value.length <= max) return value;
	return `${value.slice(0, max - 1)}…`;
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

		const messageLines = noteMessages.map((m) => {
			const ts = formatTimestamp(m.created_at);
			const author = (m.author as any)?.username ?? "?";
			return `[${ts ?? "?"}] ${author}: ${truncate(m.text, 400)}`;
		});

		const timelineExcerpt = [
			`Opened: ${formatTimestamp(n.created_at) ?? "unknown"}`,
			...(n.closed_at ? [`Closed: ${formatTimestamp(n.closed_at)}`] : []),
			...messageLines.slice(0, 8),
		];

		return {
			id: n.id,
			team: n.team ?? null,
			note_type: n.note_type ?? "TeamIssue",
			issue_type: humanizeIssueType(n.issue_type),
			resolution_status: n.resolution_status ?? null,
			text: n.text,
			match_number: n.match_number ?? null,
			tournament_level: n.tournament_level ?? null,
			author: (n.author as any)?.username ?? "unknown",
			assigned_to: (n.assigned_to as any)?.username ?? null,
			open_time_minutes: openTimeMinutes,
			message_count: noteMessages.length,
			is_auto_note: n.text.trim().startsWith("[Auto]"),
			messages: messageLines,
			timeline_excerpt: timelineExcerpt,
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
				return HIGH_IMPACT_ISSUES.has(issue) ? acc + count : acc;
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
		.sort((a, b) => b.message_count - a.message_count)
		.slice(0, 5)
		.map((n) => ({
			team: n.team,
			text_preview: truncate(n.text, 160),
			message_count: n.message_count,
			thread_excerpt: n.messages.slice(0, 6),
			timeline_excerpt: n.timeline_excerpt.slice(0, 8),
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
			const severityDiff = getSeverity(b.issue_type) - getSeverity(a.issue_type);
			if (severityDiff !== 0) return severityDiff;
			if (b.message_count !== a.message_count) return b.message_count - a.message_count;
			return (b.open_time_minutes ?? 0) - (a.open_time_minutes ?? 0);
		})
		.slice(0, 12)
		.map((n) => ({
			team: n.team,
			issue_type: n.issue_type,
			text: n.text,
			message_count: n.message_count,
			open_time_minutes: n.open_time_minutes,
			thread_excerpt: n.messages.slice(0, 8),
			timeline_excerpt: n.timeline_excerpt.slice(0, 10),
		}));

	const openNoteDetails = noteContexts
		.filter((n) => n.resolution_status === "Open")
		.sort((a, b) => {
			const severityDiff = getSeverity(b.issue_type) - getSeverity(a.issue_type);
			if (severityDiff !== 0) return severityDiff;
			if (b.message_count !== a.message_count) return b.message_count - a.message_count;
			return (b.open_time_minutes ?? 0) - (a.open_time_minutes ?? 0);
		})
		.map((n) => ({
			team: n.team,
			issue_type: n.issue_type,
			text: n.text,
			message_count: n.message_count,
			open_time_minutes: n.open_time_minutes,
			thread_excerpt: n.messages.slice(0, 8),
			timeline_excerpt: n.timeline_excerpt.slice(0, 10),
			match_number: n.match_number,
			tournament_level: n.tournament_level,
		}));

	const ticketDigest: TicketDigestEntry[] = [...noteContexts]
		.map((n) => ({
			team: n.team,
			issue_type: n.issue_type,
			severity: getSeverity(n.issue_type),
			match_number: n.match_number,
			tournament_level: n.tournament_level,
			text: truncate(n.text, 260),
			thread_excerpt: n.messages.slice(0, 6),
			timeline_excerpt: n.timeline_excerpt.slice(0, 8),
			open_time_minutes: n.open_time_minutes,
			resolution_status: n.resolution_status,
			is_auto_note: n.is_auto_note,
		}))
		.sort((a, b) => {
			if (b.severity !== a.severity) return b.severity - a.severity;

			const aOpen = a.resolution_status === "Open" ? 1 : 0;
			const bOpen = b.resolution_status === "Open" ? 1 : 0;
			if (bOpen !== aOpen) return bOpen - aOpen;

			const aOfficial =
				a.tournament_level === "Playoff" || a.tournament_level === "Qualification" ? 1 : 0;
			const bOfficial =
				b.tournament_level === "Playoff" || b.tournament_level === "Qualification" ? 1 : 0;
			if (bOfficial !== aOfficial) return bOfficial - aOfficial;

			return (b.open_time_minutes ?? 0) - (a.open_time_minutes ?? 0);
		});

	return {
		event_name: eventName,
		event_code: eventCode,
		start_date: startDate,
		end_date: endDate,
		team_count: teamCount,
		notes: noteContexts,
		match_event_summaries: matchEventSummaries,
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
	};
}

function buildPrompt(ctx: EventContext): string {
	return `You are writing a technical event operations summary for FIRST HQ.

Audience: Lead FTA and Program Technical Staff.

This is an internal technical report.
Do NOT include recommendations.
Do NOT speculate.
Do NOT include training suggestions.
Do NOT include motivational or event atmosphere language.
Do NOT describe minor issues as major failures.

Use precise FRC terminology without defining acronyms.

TARGET LENGTH: ~1.25-2.0 pages of text when rendered to PDF. Keep it concise, but include complete ticket coverage in the final section.

Structure the report using ONLY these section headings (ALL CAPS):

EVENT METRICS
Provide team count, total notes, breakdown by note type, open vs resolved, CSA involvement, and total match events.
Separate official match events (Qualification + Playoff) from test-match events when both are present.
Clearly distinguish dismissed match events from those that resulted in a formal follow-up note.
If match events exist only in test matches, explicitly state that rather than saying no match events were recorded.
If dismissed match events > 0 and follow-up match events > 0, state both counts plainly and do NOT say that no triage/escalation occurred.
Only say that no match-event triage/escalation occurred if follow-up_match_events is exactly 0.

ISSUE BREAKDOWN
Summarize issue types with counts and relative frequency using human-readable issue labels.
Explicitly list the top 5 teams by:
- total match events
- high-impact match events (Bypass, roboRIO Disconnect, Radio Disconnect, Communication Loss)
Also list teams with the most formal notes, and the single most active note thread if any.
Keep this factual: counts, team numbers, issue categories, thread activity, and event types. No editorial commentary.

MATCH EVENT REVIEW
Summarize brownouts, disconnects, high BWU, and bypasses where present.
Clearly state:
- total occurrences
- how many were dismissed
- how many resulted in a follow-up note
If official match-event volume is zero but test-match events exist, state that clearly.

RESOLUTION STATUS
Summarize resolution rate numerically.
Identify open items and whether any represent elevated risk based on thread activity, recurrence, bypass history, or playoff context.
Also summarize the substance of resolved notes:
- describe the actual issue/failure mode using the wording from the notes/messages when possible
- note whether resolution was quick or extended if open_time_minutes exists
- include concise thread-level detail from message history when available
- mention notable troubleshooting steps or closure outcomes stated in the note thread
- prefer concrete thread details over generic statements like "power issue" or "made adjustments"

TICKET SUMMARY
Provide a concise one-sentence summary for EVERY ticket in the dataset.
Sort the ticket summaries in the exact order provided in stats.ticket_digest.
Include severity order naturally by preserving that order, but do NOT print numeric severity values.
For each ticket:
- include the team number when present
- include match number and level when useful
- describe the concrete failure mode using note text and thread text
- mention the specific troubleshooting step or resolution if present
- mention if the issue recurred, if the thread shows recurrence
- mention if the ticket remains open
Keep each ticket to one sentence where possible.
Do not omit any ticket.
Do not merge multiple tickets into one bullet.
Use plain text bullets beginning with "- ".

CRITICAL GROUNDING RULES:
- Base the narrative primarily on note text and thread/message content, not just issue_type buckets.
- If the note says "main breaker blew", say "main breaker blew" or "repeated main-breaker trips" rather than generic "power issue".
- If the thread says "positive power lead fell out", "loose RIO power wire", "blown radio fuse", "PhotonVision web GUI open", "duplicate CAN IDs", "CAN leads into the PDH were loose", "controller only connects via Bluetooth", or similar, use those specifics.
- Do not invent causes or fixes. Only state causes/fixes explicitly present in the notes or messages.
- Do not rewrite a specific field failure into a vague summary if a concrete detail exists.
- Manual notes and message threads are usually more informative than auto-generated note titles. Use auto note titles mainly for count context unless the thread adds real detail.
- When multiple updates show recurrence, say so explicitly if supported by the thread.
- When a note remains open, describe the exact unresolved condition from the note/thread.
- Avoid bland phrases like "implemented current limits" unless the note actually says current limits were added or lowered.

Write in a concise, technical, operations-focused tone.
Use complete sentences.
No recommendations section.

EVENT DATA (JSON):
${JSON.stringify(ctx, null, 2)}`;
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

	const completion = await openai.chat.completions.create({
		model,
		messages: [
			{
				role: "system",
				content: `
You are an FRC Field Technical Advisor writing a technical internal event summary for HQ.

Use the following severity hierarchy when determining impact tone:
- Bypass = match participation impact
- roboRIO disconnect = high impact
- radio disconnect = high impact
- robot power issues are medium-high impact, especially when recurrent
- brownout = low severity unless repeated
- high BWU = informational
- dismissed match events = low significance

This hierarchy is for internal reasoning only and must never be printed in the output.

Do not include recommendations.
Do not speculate.
Do not include calibration notes in the report.

Most important instruction:
Prefer exact factual language from note text and message history over generic categorization.
If the data says "main breaker blew", "breaker wide open", "loose RIO power wire", "blown radio fuse", "PhotonVision web GUI open", "duplicate CAN IDs", "controller only connects via Bluetooth", or similar, use that specific wording in the narrative.
Do not flatten concrete failures into vague phrases like "power issue" or "code issue" when more specific information exists.

When resolved notes contain message history, include concise factual detail about what troubleshooting occurred and how the issue was closed.
Prefer concrete thread details over generic statements.
If the thread shows recurrence across multiple matches, state that explicitly.
If a cause is uncertain in the thread, say it was unclear rather than presenting a definitive cause.

In the TICKET SUMMARY section, cover every ticket, preserve the provided order exactly, and give one concise grounded summary per ticket.
`,
			},
			{
				role: "user",
				content: buildPrompt(ctx),
			},
		],
		max_tokens: 5200,
		temperature: 0.1,
	});

	const reportText = completion.choices[0]?.message?.content ?? "No report generated.";
	return renderNarrativePdf(reportText, eventName, eventCode);
}