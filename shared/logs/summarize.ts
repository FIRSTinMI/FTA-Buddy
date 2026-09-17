/**
 * Turning a parsed log into the few lines a person reads.
 *
 * The same text is used in three places: the file list in the app, the preview
 * stored on the row, and the document the assistant is given. Writing it once
 * means the CSA on the phone and the assistant in the chat are looking at the
 * same numbers.
 */

import type { DsEventsEntry, DsLogSummary } from "./dslog";
import type { RobotCodeInfo } from "./robot-code";
import type { WpilogSummary } from "./wpilog";
import { levelFromMatchType } from "./match-link";

function secs(value: number): string {
	if (value < 1) return `${(value * 1000).toFixed(0)} ms`;
	if (value < 60) return `${value.toFixed(1)} s`;
	// Round the whole thing first, or 179.6 s reads as "2m 60s".
	const whole = Math.round(value);
	return `${Math.floor(whole / 60)}m ${whole % 60}s`;
}

function pct(value: number): string {
	return `${Math.round(value * 100)}%`;
}

export function describeWpilog(summary: WpilogSummary): string {
	if (!summary.valid) return "Not a readable data log.";
	const lines: string[] = [];
	const m = summary.match;
	const level = levelFromMatchType(m.matchType);
	if (level && m.matchNumber) {
		const station = m.stationNumber ? ` ${m.isRedAlliance ? "red" : "blue"}${m.stationNumber}` : "";
		lines.push(
			`Match: ${level} ${m.matchNumber}${m.replayNumber && m.replayNumber > 1 ? ` replay ${m.replayNumber}` : ""}${station}`,
		);
	} else {
		lines.push("Match: not recorded in this log");
	}
	if (m.eventName) lines.push(`Event as the robot saw it: ${m.eventName}`);
	lines.push(
		`Duration: ${secs(summary.durationSecs)}, ${summary.recordCount.toLocaleString()} records, ${summary.entries.length} entries`,
	);
	if (summary.stoppedEarly) lines.push("The log is truncated: the robot lost power or the file was cut short.");
	if (summary.messages.length > 0) {
		lines.push("", "Messages:");
		for (const msg of summary.messages.slice(0, 60)) {
			lines.push(`  ${(msg.timestamp / 1e6).toFixed(2)}s  ${msg.text}`);
		}
		if (summary.messages.length > 60) lines.push(`  ... ${summary.messages.length - 60} more`);
	}
	return lines.join("\n");
}

/** The entries a reader is most likely to want, without dumping all of them. */
export function wpilogEntryList(summary: WpilogSummary, limit = 300): string {
	const rows = summary.entries
		.slice(0, limit)
		.map((e) => `${e.name}  (${e.type}, ${e.count} samples)`)
		.join("\n");
	const more = summary.entries.length > limit ? `\n... ${summary.entries.length - limit} more entries` : "";
	return rows + more + (summary.entriesTruncated ? "\n[entry list was capped while reading]" : "");
}

export function describeDsLog(summary: DsLogSummary | null, startTime: number | null): string {
	if (!summary) return "Not a readable Driver Station log.";
	const lines: string[] = [];
	if (startTime) lines.push(`Recording started ${new Date(startTime * 1000).toISOString()} (Driver Station clock)`);
	lines.push(`Length: ${secs(summary.durationSecs)}, enabled for ${secs(summary.enabledSecs)}`);
	if (summary.minEnabledBatteryVolts !== null) {
		lines.push(`Battery: ${summary.minEnabledBatteryVolts.toFixed(2)} V lowest while enabled`);
	} else if (summary.minBatteryVolts !== null) {
		lines.push(`Battery: ${summary.minBatteryVolts.toFixed(2)} V lowest`);
	}
	if (summary.brownoutSecs > 0) lines.push(`Brownout: ${secs(summary.brownoutSecs)} total`);
	if (summary.watchdogSecs > 0) lines.push(`Watchdog tripped: ${secs(summary.watchdogSecs)} total`);
	lines.push(
		`Round trip: ${summary.maxTripTimeMs.toFixed(1)} ms worst, packet loss ${pct(summary.maxPacketLoss)} worst`,
	);
	lines.push(`roboRIO CPU peak ${pct(summary.maxCpuUtilization)}, CAN bus peak ${pct(summary.maxCanUtilization)}`);
	if (summary.minWifiDb !== null) lines.push(`Radio signal: ${summary.minWifiDb.toFixed(1)} dB weakest`);
	if (summary.dropouts.length > 0) {
		lines.push(
			`Dropped out ${summary.dropouts.length} time${summary.dropouts.length === 1 ? "" : "s"} while enabled:`,
		);
		for (const d of summary.dropouts.slice(0, 12)) {
			lines.push(`  ${d.startSecs.toFixed(1)}s to ${d.endSecs.toFixed(1)}s (${secs(d.durationSecs)})`);
		}
		if (summary.dropouts.length > 12) lines.push(`  ... ${summary.dropouts.length - 12} more`);
	} else {
		lines.push("No dropouts while enabled.");
	}
	const peaks = summary.peakChannelCurrents;
	if (peaks.length > 0) {
		const hot = peaks
			.map((amps, channel) => ({ amps, channel }))
			.filter((c) => c.amps > 0)
			.sort((a, b) => b.amps - a.amps)
			.slice(0, 6)
			.map((c) => `ch${c.channel} ${c.amps.toFixed(0)} A`)
			.join(", ");
		if (hot) lines.push(`Highest power distribution channels: ${hot}`);
	}
	return lines.join("\n");
}

export function describeDsEvents(entries: DsEventsEntry[], limit = 200): string {
	if (entries.length === 0) return "No Driver Station events in this file.";
	const lines = entries.slice(0, limit).map((e) => `${e.timestamp.toFixed(2)}s  ${e.text}`);
	if (entries.length > limit) lines.push(`... ${entries.length - limit} more lines`);
	return lines.join("\n");
}

export function describeRobotCode(info: RobotCodeInfo): string {
	const lines = [
		`Language: ${info.language}`,
		info.teamNumber
			? `Team number in the project: ${info.teamNumber} (from ${info.teamNumberFrom})`
			: "No team number found in the project",
	];
	if (info.projectYear) lines.push(`WPILib project year: ${info.projectYear}`);
	if (info.vendorDeps.length > 0) lines.push(`Vendor libraries: ${info.vendorDeps.join(", ")}`);
	lines.push(`${info.fileCount} source files.`);
	if (info.keyFiles.length > 0) lines.push("", "Start from:", ...info.keyFiles.slice(0, 15).map((f) => `  ${f}`));
	return lines.join("\n");
}
