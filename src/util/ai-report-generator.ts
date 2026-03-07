import { and, eq, inArray, ne, sql } from "drizzle-orm";
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
	converted: number;
	issue_breakdown: Record<string, number>;
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
		most_common_issues: Array<{ issue: string; count: number }>;
		most_active_threads: Array<{ team: number | null; text_preview: string; message_count: number }>;
		teams_with_most_issues: Array<{ team: number; note_count: number }>;
		teams_with_most_match_events: Array<{ team: number; total: number }>;
	};
}

async function collectEventData(
	eventCode: string,
	eventName: string,
	startDate: string | null,
	endDate: string | null,
	teamCount: number,
): Promise<EventContext> {
	// Fetch all notes with their messages
	const allNotes = await db.select().from(notes).where(eq(notes.event_code, eventCode)).execute();

	const allMessages = await db.select().from(messages).where(eq(messages.event_code, eventCode)).execute();

	// Group messages by note_id
	const messagesByNote = new Map<string, typeof allMessages>();
	for (const msg of allMessages) {
		if (!messagesByNote.has(msg.note_id)) messagesByNote.set(msg.note_id, []);
		messagesByNote.get(msg.note_id)!.push(msg);
	}

	// Fetch match events (Qual + Playoff, no Bypassed)
	const allMatchEvents = await db
		.select({
			team: matchEvents.team,
			issue: matchEvents.issue,
			issues: matchEvents.issues,
			status: matchEvents.status,
		})
		.from(matchEvents)
		.where(
			and(
				eq(matchEvents.event_code, eventCode),
				inArray(matchEvents.level, ["Qualification", "Playoff"]),
				ne(matchEvents.issue, "Bypassed"),
			),
		)
		.execute();

	// Build note contexts
	const noteContexts: NoteContext[] = allNotes.map((n) => {
		const noteMessages = messagesByNote.get(n.id) ?? [];
		let openTimeMinutes: number | null = null;
		if (n.closed_at && n.created_at) {
			openTimeMinutes = Math.round((n.closed_at.getTime() - n.created_at.getTime()) / 60000);
		}
		return {
			id: n.id,
			team: n.team ?? null,
			note_type: n.note_type ?? "TeamIssue",
			issue_type: n.issue_type ?? null,
			resolution_status: n.resolution_status ?? null,
			text: n.text.slice(0, 300),
			match_number: n.match_number ?? null,
			tournament_level: n.tournament_level ?? null,
			author: (n.author as any)?.username ?? "unknown",
			assigned_to: (n.assigned_to as any)?.username ?? null,
			open_time_minutes: openTimeMinutes,
			message_count: noteMessages.length,
			messages: noteMessages
				.sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
				.map((m) => `[${(m.author as any)?.username ?? "?"}]: ${m.text.slice(0, 200)}`),
		};
	});

	// Build match event summaries by team
	const meSummaryMap = new Map<number, MatchEventSummary>();
	for (const me of allMatchEvents) {
		if (!meSummaryMap.has(me.team)) {
			meSummaryMap.set(me.team, { team: me.team, total: 0, dismissed: 0, converted: 0, issue_breakdown: {} });
		}
		const s = meSummaryMap.get(me.team)!;
		s.total++;
		if (me.status === "dismissed") s.dismissed++;
		if (me.status === "converted") s.converted++;
		const details = (me.issues as { issue: string }[] | null) ?? [{ issue: me.issue }];
		for (const d of details) {
			s.issue_breakdown[d.issue] = (s.issue_breakdown[d.issue] ?? 0) + 1;
		}
	}
	const matchEventSummaries = Array.from(meSummaryMap.values()).sort((a, b) => b.total - a.total);

	const HIGH_IMPACT_ISSUES = new Set([
		"Bypassed",
		"RIO disconnect",
		"Radio disconnect",
		"Communication loss",
		"Lost comms",
		"Comms loss",
	]);

	const teamsWithMostMatchEvents = matchEventSummaries
		.slice(0, 5)
		.map((s) => ({ team: s.team, total: s.total }));

	const teamsWithMostHighImpactMatchEvents = matchEventSummaries
		.map((s) => {
			const hi = Object.entries(s.issue_breakdown).reduce((acc, [issue, count]) => {
				return acc + (HIGH_IMPACT_ISSUES.has(issue) ? count : 0);
			}, 0);
			return { team: s.team, high_impact_total: hi };
		})
		.sort((a, b) => b.high_impact_total - a.high_impact_total)
		.slice(0, 5);

	// Derived stats
	const teamIssueNotes = noteContexts.filter((n) => n.note_type === "TeamIssue");
	const resolvedNotes = noteContexts.filter((n) => n.resolution_status === "Resolved").length;
	const openNotes = noteContexts.filter((n) => n.resolution_status === "Open").length;
	const notesWithCsa = noteContexts.filter((n) => n.assigned_to !== null).length;

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
		.map((n) => ({ team: n.team, text_preview: n.text.slice(0, 80), message_count: n.message_count }));

	// Teams with most notes
	const teamNoteCounts = new Map<number, number>();
	for (const n of teamIssueNotes) {
		if (n.team !== null) teamNoteCounts.set(n.team, (teamNoteCounts.get(n.team) ?? 0) + 1);
	}
	const teamsWithMostIssues = Array.from(teamNoteCounts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(([team, note_count]) => ({ team, note_count }));

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
			most_common_issues: mostCommonIssues,
			most_active_threads: mostActiveThreads,
			teams_with_most_issues: teamsWithMostIssues,
			teams_with_most_match_events: teamsWithMostMatchEvents,
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

TARGET LENGTH: ~1.0-1.5 pages of text when rendered to PDF (letter). If match event volume is high, use additional detail.

Structure the report using ONLY these section headings (ALL CAPS):

EVENT METRICS
Provide team count, total notes, breakdown by note type, open vs resolved, CSA involvement, and total match events. Clearly distinguish dismissed match events from those that resulted in a formal note.
If match events exist but dismissed=0 and follow-up notes=0, explicitly state that no match-event triage/escalation occurred in the data.

ISSUE BREAKDOWN
Summarize issue types with counts and relative frequency.
Explicitly list the top 5 teams by:
- total match events
- high-impact match events (bypass + RIO disconnect + radio disconnect/comm loss)
Also list teams with the most formal notes (if any), and the single most active note thread (if any).
Keep this factual (counts, team numbers, event types). No editorial commentary.

MATCH EVENT REVIEW
Summarize brownouts, disconnects, and high BWU occurrences. Clearly state:
- Total occurrences
- How many were dismissed
- How many resulted in a follow-up note (instead of using the term "converted")
Do not characterize brownouts or BWU as severe unless data indicates repeated impact.

RESOLUTION STATUS
Summarize resolution rate numerically. Identify open items and whether any represent elevated risk based on thread activity or playoff context. Do not speculate beyond provided data.

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

	// Title
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
	const sectionGap = 8;

	const lines = text.split("\n");

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) {
			y += paragraphGap;
			continue;
		}

		// Detect ALL-CAPS headings (at least 4 chars, mostly uppercase)
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
			for (const wl of wrapped) {
				if (y > doc.internal.pageSize.getHeight() - 20) {
					doc.addPage();
					y = marginTop;
				}
				doc.text(wl, marginLeft, y);
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
	const ctx = await collectEventData(eventCode, eventName, startDate, endDate, teamCount);

	const completion = await openai.chat.completions.create({
		model,
		messages: [
			{
				role: "system",
				content: `
You are an FRC Field Technical Advisor writing a technical internal event summary for HQ.

Use the following severity hierarchy when determining impact tone:
- Bypass = match participation impact
- RIO disconnect = high impact
- Radio disconnect = high impact
- Brownout = low severity unless repeated
- High BWU = informational
- Dismissed match events = low significance

This hierarchy is for internal reasoning only and must never be printed in the output.
Do not include recommendations.
Do not speculate.
Do not include calibration notes in the report.
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
