// Troubleshooting steps shown in the field-monitor team modal, one entry per DS/robot condition.
// Wording matches what the modal showed as <li> items before this file existed. Plain strings are
// parsed by parseSteps (an "If X, Y." sentence becomes a check). Conditionals that a sentence
// parser cannot express cleanly are authored as check objects.

import { MatchState } from "../types";
import { guideHref, stepsForRef, type GuideRef } from "./index";
import type { FlowStep } from "./steps";

export type MonitorIssueKey =
	| "ds-red"
	| "ds-green-x"
	| "move-station"
	| "waiting-over"
	| "waiting-prestart"
	| "waiting-running"
	| "estop"
	| "astop"
	| "no-radio"
	| "no-rio"
	| "no-code";

export interface MonitorIssue {
	readonly title: string;
	/** The guide leaf that owns this procedure. Preferred: the steps live there, not here. */
	readonly ref?: GuideRef;
	/** Only for states no guide covers, like the FMS waiting states. */
	readonly steps?: readonly (string | FlowStep)[];
}

const FMS_WAITING_BUG =
	"Known FMS bug may show this state incorrectly. Match will run as normal or re-prestart if needed.";

export const monitorSteps: Record<MonitorIssueKey, MonitorIssue> = {
	"ds-red": {
		title: "Ethernet not plugged in",
		ref: { tree: "field-connection", node: "ds-no-ethernet" },
	},
	"ds-green-x": {
		title: "Ethernet plugged in but no communication with DS",
		ref: { tree: "field-connection", node: "ds-no-fms" },
	},
	"move-station": {
		title: "Team is in wrong station",
		steps: [
			"Their DS will tell them which station to move to.",
			"During playoffs, double check with HR and the Scorekeeper first.",
		],
	},
	"waiting-over": {
		title: "Team mismatch / wrong match",
		steps: ["The DS is connected but the field has not been prestarted yet.", FMS_WAITING_BUG],
	},
	"waiting-prestart": {
		title: "Team mismatch / wrong match",
		steps: [
			"Double check the schedule.",
			"Verify the DS team number is correct if they are on the schedule.",
			FMS_WAITING_BUG,
		],
	},
	"waiting-running": {
		title: "Team mismatch / wrong match",
		steps: [FMS_WAITING_BUG],
	},
	estop: {
		title: "Team is E-stopped",
		ref: { tree: "roborio", node: "estop" },
	},
	astop: {
		title: "Team is A-stopped",
		steps: ["Clears on teleop start. Reset the button after the match."],
	},
	"no-radio": {
		title: "Radio not connected to field",
		ref: { tree: "field-connection", node: "radio-not-linked" },
	},
	"no-rio": {
		title: "Radio connected but no communication with the roboRIO",
		ref: { tree: "radio", node: "rio-link" },
	},
	"no-code": {
		title: "Radio and RIO connected, but code not running",
		ref: { tree: "code-deploy", node: "no-code-other" },
	},
};

/** The "waiting" list depends on where the match is. */
export function waitingKey(state: MatchState): MonitorIssueKey {
	switch (state) {
		case MatchState.OVER:
			return "waiting-over";
		case MatchState.PRESTART:
			return "waiting-prestart";
		default:
			return "waiting-running";
	}
}

/** What the field monitor shows for a state: the title, the steps, and where the full guide is. */
export function monitorIssue(key: MonitorIssueKey): {
	title: string;
	steps: readonly (string | FlowStep)[];
	href: string | null;
} {
	const issue = monitorSteps[key];
	if (issue.ref) return { title: issue.title, steps: stepsForRef(issue.ref), href: guideHref(issue.ref) };
	return { title: issue.title, steps: issue.steps ?? [], href: null };
}
