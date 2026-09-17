import type { ChatQuestion } from "../../../../shared/troubleshooting/question";
import type { TroubleshootChunk } from "../../../db/schema";

export type TroubleshootSource = TroubleshootChunk["source"];

// Corpus sources plus live documents that are not in the corpus table.
export type CitationSource = TroubleshootSource | "event_ticket";

/** A document handed to the model for one turn: a corpus chunk or a live current-event ticket. */
export interface RetrievedDoc {
	id: string;
	source: CitationSource;
	url: string | null;
	title: string;
	heading?: string | null;
	body: string;
}

/** A cited corpus chunk as shown to the user. */
export interface ChatCitation {
	chunkId: string;
	url: string | null;
	title: string;
	source: CitationSource;
}

/** Events streamed from the `troubleshoot.chat` subscription. */
export type ChatEvent =
	| { type: "delta"; text: string }
	| { type: "citation"; chunkId: string; url: string | null; title: string; source: CitationSource }
	// Progress while the assistant reads a repo or an upload, e.g. "Reading Robot.java".
	| { type: "tool"; label: string }
	// The assistant ended its turn by asking a multiple-choice question. The app
	// renders the options as buttons plus a free-text box, and the answer arrives
	// as the next user message.
	| { type: "question"; question: ChatQuestion }
	// A team's upload was attached to this conversation, so the app can show it.
	| { type: "upload"; uploadId: string; code: string; team: number | null }
	| { type: "done"; conversationId: string; messageId: string }
	| { type: "error"; message: string };

/** Human label for a corpus source, used in the UI chips. */
export const SOURCE_LABELS: Record<CitationSource, string> = {
	wpilib: "WPILib docs",
	rev: "REV docs",
	ctre: "CTRE docs",
	ni: "NI docs",
	vivid: "Vivid-Hosting docs",
	ticket: "CSA ticket",
	slack: "CSA Slack",
	note: "Event note",
	event_ticket: "This event's ticket",
};
