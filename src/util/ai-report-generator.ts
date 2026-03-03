import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { existsSync, mkdirSync } from "fs";
import jsPDF from "jspdf";
import OpenAI from "openai";
import { db } from "../db/db";
import { matchEvents, messages, notes } from "../db/schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });
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
    };
}

async function collectEventData(eventCode: string, eventName: string, startDate: string | null, endDate: string | null, teamCount: number): Promise<EventContext> {
    // Fetch all notes with their messages
    const allNotes = await db
        .select()
        .from(notes)
        .where(eq(notes.event_code, eventCode))
        .execute();

    const allMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.event_code, eventCode))
        .execute();

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
        s.issue_breakdown[me.issue] = (s.issue_breakdown[me.issue] ?? 0) + 1;
    }
    const matchEventSummaries = Array.from(meSummaryMap.values()).sort((a, b) => b.total - a.total);

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
        },
    };
}

function buildPrompt(ctx: EventContext): string {
    return `You are an experienced FIRST Robotics Competition (FRC) Field Technical Advisor (FTA) writing a post-event summary report. Generate a professional 1-2 page narrative report for the event.

The report should cover:
1. **Event Overview** - Event name, dates, team count, general summary
2. **Technical Issues Summary** - Most common robot/field issues observed, which issue types dominated
3. **Team Support** - Which teams needed the most support, notable team situations, whether CSAs were heavily involved
4. **Notable Threads & Follow-ups** - Any note threads with significant back-and-forth communication
5. **Resolution Rate** - How well issues got resolved, open vs resolved breakdown
6. **Match Event Analysis** - Summary of auto-detected match events (disconnects, brownouts, etc.) for Quals/Playoffs
7. **Observations & Recommendations** - Any patterns worth noting for future events or improvements

Write the report as flowing narrative paragraphs under section headings. Be concise but informative. Use FRC terminology naturally. Do not use markdown formatting—plain text with section headings only (using ALL CAPS for headings).

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
    const ctx = await collectEventData(eventCode, eventName, startDate, endDate, teamCount);

    const completion = await openai.chat.completions.create({
        model,
        messages: [
            {
                role: "system",
                content: "You are an FRC Field Technical Advisor writing a professional post-event summary report.",
            },
            {
                role: "user",
                content: buildPrompt(ctx),
            },
        ],
        max_tokens: 2000,
        temperature: 0.4,
    });

    const reportText = completion.choices[0]?.message?.content ?? "No report generated.";
    return renderNarrativePdf(reportText, eventName, eventCode);
}
