// Troubleshooting steps shown in the field-monitor team modal, one entry per DS/robot condition.
// Wording matches what the modal showed as <li> items before this file existed. Plain strings are
// parsed by parseSteps (an "If X, Y." sentence becomes a check). Conditionals that a sentence
// parser cannot express cleanly are authored as check objects.

import { MatchState } from "../types";
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
	readonly steps: readonly (string | FlowStep)[];
}

const FMS_WAITING_BUG =
	"Known FMS bug may show this state incorrectly. Match will run as normal or re-prestart if needed.";

export const monitorSteps: Record<MonitorIssueKey, MonitorIssue> = {
	"ds-red": {
		title: "Ethernet not plugged in",
		steps: [
			"Make sure the cable is plugged into the laptop.",
			"Check for link lights on the port.",
			{
				kind: "check",
				text: "Are there still no link lights?",
				yes: "Try a dongle or a new cable.",
				no: "Problem solved.",
			},
		],
	},
	"ds-green-x": {
		title: "Ethernet plugged in but no communication with DS",
		steps: [
			"Make sure DS is open, and only one instance is open.",
			"Check for link lights on the port.",
			"Turn Wi-Fi off.",
			"Open the DS Diagnostics tab. Make sure the firewall is green. Turn firewalls off if not (Win + R, wf.msc).",
			"Click refresh to release and renew the DHCP address.",
			"Try a dongle.",
			"Restart the DS software.",
			"Open network adapters (Win + R, ncpa.cpl). Enable the Ethernet adapter and set auto IP config.",
			{
				kind: "check",
				text: "Is the DS still not communicating?",
				yes: "Use a spare DS laptop and recommend lunchtime diagnostics.",
				no: "Problem solved.",
			},
		],
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
		steps: ["RIO and DS must be restarted to clear the E-stop.", "Explain to the team why if HR triggered it."],
	},
	astop: {
		title: "Team is A-stopped",
		steps: ["Clears on teleop start. Reset the button after the match."],
	},
	"no-radio": {
		title: "Radio not connected to field",
		steps: [
			"Make sure the robot is on.",
			"Check radio power. At least one green LED.",
			{
				kind: "check",
				text: "Is the 6 GHz light off instead of blue?",
				yes: "Reprogram the radio at the kiosk.",
				no: "Problem solved.",
			},
		],
	},
	"no-rio": {
		title: "Radio connected but no communication with RIO",
		steps: [
			"Check the RIO lights: Power green, Status off, Link flashing.",
			"Reconnect Ethernet. Avoid switches for testing.",
			"Power cycle the RIO.",
			"Verify the team number with the team number setter.",
			{
				kind: "check",
				text: "Status light flashing on a roboRIO 2?",
				yes: "Reseat the card. Reimage or swap it if it persists.",
				no: "Problem solved.",
			},
			{
				kind: "check",
				text: "Status light flashing on a roboRIO 1?",
				yes: "Boot Safe Mode and reimage. Swap it if still dead.",
				no: "Problem solved.",
			},
		],
	},
	"no-code": {
		title: "Radio and RIO connected, but code not running",
		steps: [
			"Restart the RIO. This can be done from the DS on a RIO 2.",
			{
				kind: "check",
				text: "Is the code still not running?",
				yes: "Check the DS logs. Ask if code was recently changed.",
				no: "Problem solved.",
			},
		],
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
