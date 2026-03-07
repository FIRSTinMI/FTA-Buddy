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
	messages: string[];
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
		}>;
		teams_with_most_issues: Array<{ team: number; note_count: number }>;
		teams_with_most_match_events: Array<{ team: number; total: number }>;
		teams_with_most_high_impact_match_events: Array<{ team: number; total: number }>;
		closed_note_details: ClosedNoteDetail[];
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
		CANIssue: "CAN Issue",
		WiringIssue: "Wiring Issue",
		MechanicalIssue: "Mechanical Issue",
		ControlSystemIssue: "Control System Issue",

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

function countFollowUpNotesForTeam(team: number | null, noteContexts: NoteContext[]): number {
	if (team === null) return 0;
	return noteContexts.filter((n) => n.team === team && n.note_type === "TeamIssue").length;
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
	const includedLevels: readonly ("None" | "Qualification" | "Playoff")[] = includeTestMatches ? ["None", "Qualification", "Playoff"] : ["Qualification", "Playoff"];

	// Fetch all notes with their messages
	const allNotes = await db.select().from(notes).where(eq(notes.event_code, eventCode)).execute();

	const allMessages = await db.select().from(messages).where(eq(messages.event_code, eventCode)).execute();

	// Group messages by note_id
	const messagesByNote = new Map<string, typeof allMessages>();
	for (const msg of allMessages) {
		if (!messagesByNote.has(msg.note_id)) messagesByNote.set(msg.note_id, []);
		messagesByNote.get(msg.note_id)!.push(msg);
	}

	// Fetch match events
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

	// Build note contexts
	const noteContexts: NoteContext[] = allNotes.map((n) => {
		const noteMessages = (messagesByNote.get(n.id) ?? []).sort(
			(a, b) => a.created_at.getTime() - b.created_at.getTime(),
		);

		let openTimeMinutes: number | null = null;
		if (n.closed_at && n.created_at) {
			openTimeMinutes = Math.round((n.closed_at.getTime() - n.created_at.getTime()) / 60000);
		}

		return {
			id: n.id,
			team: n.team ?? null,
			note_type: n.note_type ?? "TeamIssue",
			issue_type: humanizeIssueType(n.issue_type),
			resolution_status: n.resolution_status ?? null,
			text: n.text.slice(0, 300),
			match_number: n.match_number ?? null,
			tournament_level: n.tournament_level ?? null,
			author: (n.author as any)?.username ?? "unknown",
			assigned_to: (n.assigned_to as any)?.username ?? null,
			open_time_minutes: openTimeMinutes,
			message_count: noteMessages.length,
			messages: noteMessages.map((m) => `[${(m.author as any)?.username ?? "?"}]: ${m.text.slice(0, 200)}`),
		};
	});

	// Build match event summaries by team
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

		const levelLabel = me.level ?? "Unknown";
		summary.levels[levelLabel] = (summary.levels[levelLabel] ?? 0) + 1;

		const details = (me.issues as { issue: string }[] | null) ?? [{ issue: me.issue }];
		for (const detail of details) {
			const issueLabel = humanizeIssueType(detail.issue) ?? "Unknown";
			summary.issue_breakdown[issueLabel] = (summary.issue_breakdown[issueLabel] ?? 0) + 1;
		}
	}

	// Approximate follow-up note counts by team presence
	for (const summary of meSummaryMap.values()) {
		summary.follow_up_note_count = countFollowUpNotesForTeam(summary.team, noteContexts);
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

	// Derived stats
	const teamIssueNotes = noteContexts.filter((n) => n.note_type === "TeamIssue");
	const resolvedNotes = noteContexts.filter((n) => n.resolution_status === "Resolved").length;
	const openNotes = noteContexts.filter((n) => n.resolution_status === "Open").length;
	const notesWithCsa = noteContexts.filter((n) => n.assigned_to !== null).length;

	const totalMatchEvents = allMatchEvents.length;
	const testMatchEvents = allMatchEvents.filter((e) => e.level === "None").length;
	const officialMatchEvents = allMatchEvents.filter(
		(e) => e.level === "Qualification" || e.level === "Playoff",
	).length;
	const dismissedMatchEvents = allMatchEvents.filter((e) => e.status === "dismissed").length;
	const followupMatchEvents = allMatchEvents.filter((e) => e.status === "converted").length;

	// Most common issue types from notes
	const issueCounts = new Map<string, number>();
	for (const n of noteContexts) {
		if (n.issue_type) issueCounts.set(n.issue_type, (issueCounts.get(n.issue_type) ?? 0) + 1);
	}
	const mostCommonIssues = Array.from(issueCounts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([issue, count]) => ({ issue, count }));

	// Most active threads
	const mostActiveThreads = [...noteContexts]
		.filter((n) => n.message_count > 0)
		.sort((a, b) => b.message_count - a.message_count)
		.slice(0, 5)
		.map((n) => ({
			team: n.team,
			text_preview: n.text.slice(0, 120),
			message_count: n.message_count,
			thread_excerpt: n.messages.slice(0, 6),
		}));

	// Teams with most notes
	const teamNoteCounts = new Map<number, number>();
	for (const n of teamIssueNotes) {
		if (n.team !== null) teamNoteCounts.set(n.team, (teamNoteCounts.get(n.team) ?? 0) + 1);
	}
	const teamsWithMostIssues = Array.from(teamNoteCounts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(([team, note_count]) => ({ team, note_count }));

	// Richer closed note detail
	const closedNoteDetails: ClosedNoteDetail[] = noteContexts
		.filter((n) => n.resolution_status === "Resolved")
		.sort((a, b) => {
			if (b.message_count !== a.message_count) return b.message_count - a.message_count;
			return (b.open_time_minutes ?? 0) - (a.open_time_minutes ?? 0);
		})
		.slice(0, 8)
		.map((n) => ({
			team: n.team,
			issue_type: n.issue_type,
			text: n.text,
			message_count: n.message_count,
			open_time_minutes: n.open_time_minutes,
			thread_excerpt: n.messages.slice(0, 6),
		}));

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

TARGET LENGTH: ~1.0-1.5 pages of text when rendered to PDF. If event volume is low, keep it concise. If note threads or match-event volume are substantial, include more detail.

Structure the report using ONLY these section headings (ALL CAPS):

EVENT METRICS
Provide team count, total notes, breakdown by note type, open vs resolved, CSA involvement, and total match events.
Separate official match events (Qualification + Playoff) from test-match events when both are present.
Clearly distinguish dismissed match events from those that resulted in a formal follow-up note.
If match events exist only in test matches, explicitly state that rather than saying no match events were recorded.
If match events exist but dismissed=0 and follow-up notes=0, explicitly state that no match-event triage/escalation occurred in the data.

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
Identify open items and whether any represent elevated risk based on thread activity or playoff context.
Also summarize the substance of resolved notes:
- describe the issue types involved
- note whether resolution was quick or extended if open_time_minutes exists
- include concise thread-level detail from message history when available
- mention notable troubleshooting steps or closure outcomes stated in the note thread
Prefer concrete thread details over generic statements like "progress was made."
Do not speculate beyond provided data.

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

		const isHeading = line.length >= 4 && line === line.toUpperCase() && /[A-Z]/.test(line);

		if (isHeading) {
			if (y > doc.internal.pageSize.getHeight() - 30) {
				doc.addPage();
				y = marginTop;
			}
			y += paragraphGap;
			doc.setFontSize(12);
			doc.setFont("helvetica", "bold");
			doc.text(line, marginLeft, y);
			y += lineHeight + 2;
			doc.setFontSize(10);
			doc.setFont("helvetica", "normal");
		} else {
			const wrapped = doc.splitTextToSize(line, usableWidth) as string[];
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
- brownout = low severity unless repeated
- high BWU = informational
- dismissed match events = low significance

This hierarchy is for internal reasoning only and must never be printed in the output.
Do not include recommendations.
Do not speculate.
Do not include calibration notes in the report.
When resolved notes contain message history, include concise factual detail about what troubleshooting occurred and how the issue was closed.
Prefer concrete thread details over generic statements.
`,
			},
			{
				role: "user",
				content: buildPrompt(ctx),
			},
		],
		max_tokens: 3200,
		temperature: 0.15,
	});

	const reportText = completion.choices[0]?.message?.content ?? "No report generated.";
	return renderNarrativePdf(reportText, eventName, eventCode);
}