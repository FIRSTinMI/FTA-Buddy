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
			"Make sure the cable is plugged into the laptop",
			"Check if there are link lights on the port",
			"Try a dongle",
			"Try replacing the ethernet cable",
		],
	},
	"ds-green-x": {
		title: "Ethernet plugged in but no communication with DS",
		steps: [
			"Make sure DS is open, and only one instance is open.",
			"Check if there are link lights on the port.",
			"Make sure WIFI is off.",
			"Click on the diagnostics tabs of DS, make sure firewall is green. Turn off firewalls if it's not (Win + R, wf.msc).",
			"Try clicking the refresh button to release and renew DHCP address.",
			"Try a dongle.",
			"Try restarting DS software.",
			"Go to network adapters (Win + R, ncpa.cpl). Ensure ethernet adapter is enabled and auto IP config is set.",
			"If all else fails, use spare DS laptop and recommend lunch-time diagnostics.",
		],
	},
	"move-station": {
		title: "Team is in wrong station",
		steps: [
			"Their DS will tell them which station to move to.",
			"If this is during playoffs, double check with HR and Scorekeeper first.",
		],
	},
	"waiting-over": {
		title: "Team mismatch / wrong match",
		steps: ["DS is connected but the field hasn't been prestarted yet.", FMS_WAITING_BUG],
	},
	"waiting-prestart": {
		title: "Team mismatch / wrong match",
		steps: [
			"Double check the schedule",
			"If they're on the schedule, verify the DS team number is correct.",
			FMS_WAITING_BUG,
		],
	},
	"waiting-running": {
		title: "Team mismatch / wrong match",
		steps: [FMS_WAITING_BUG],
	},
	estop: {
		title: "Team is E-stopped",
		steps: ["RIO and DS must be restarted to clear E-stop.", "If HR triggered it, explain to team why."],
	},
	astop: {
		title: "Team is A-stopped",
		steps: ["Clears on teleop start. Reset the button after match."],
	},
	"no-radio": {
		title: "Radio not connected to field",
		steps: [
			"Make sure robot is on",
			"Check radio power (at least one green LED)",
			"6GHz light should be blue. off = reprogram",
		],
	},
	"no-rio": {
		title: "Radio connected but no communication with RIO",
		steps: [
			"Check RIO lights: Power (green), Status (off), Link (flashing)",
			"Reconnect ethernet; avoid switches for testing",
			"Try RIO power cycle",
			"Verify team number with team number setter",
			{
				kind: "check",
				text: "Status light flashing on a roboRIO 2?",
				yes: "Turn off, reseat the microSD card, power on. If it persists, reimage or replace the card and redeploy code.",
			},
			{
				kind: "check",
				text: "Status light flashing on a roboRIO 1?",
				yes: "Boot into safe mode and run the imaging tool. Replace it if still dead.",
			},
		],
	},
	"no-code": {
		title: "Radio and RIO connected, but code not running",
		steps: [
			"Restart RIO (can be done from DS if RIO 2)",
			"Check DS logs. Ask if code was recently changed or deployed.",
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
