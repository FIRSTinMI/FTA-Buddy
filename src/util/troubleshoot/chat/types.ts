import type { TroubleshootChunk } from "../../../db/schema";

export type TroubleshootSource = TroubleshootChunk["source"];

/** A cited corpus chunk as shown to the user. */
export interface ChatCitation {
	chunkId: string;
	url: string | null;
	title: string;
	source: TroubleshootSource;
}

/** Events streamed from the `troubleshoot.chat` subscription. */
export type ChatEvent =
	| { type: "delta"; text: string }
	| { type: "citation"; chunkId: string; url: string | null; title: string; source: TroubleshootSource }
	| { type: "done"; conversationId: string; messageId: string }
	| { type: "error"; message: string };

/** Human label for a corpus source, used in the UI chips. */
export const SOURCE_LABELS: Record<TroubleshootSource, string> = {
	wpilib: "WPILib docs",
	rev: "REV docs",
	ctre: "CTRE docs",
	ni: "NI docs",
	vivid: "Vivid-Hosting docs",
	ticket: "CSA ticket",
	slack: "CSA Slack",
	note: "Event note",
};
