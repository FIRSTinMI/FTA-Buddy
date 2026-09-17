import { describe, expect, test } from "bun:test";
import { classifyZip, detectKind } from "../../shared/logs/detect";
import {
	matchInfoFromDsEvents,
	readDsEvents,
	readDsLog,
	summarizeDsLog,
	summarizeDsLogWindow,
	type DsLogResult,
} from "../../shared/logs/dslog";
import { readCsvTelemetry, splitCsvLine } from "../../shared/logs/csv-telemetry";
import {
	defaultSeriesKeys,
	downsample,
	DSLOG_SERIES,
	FMS_SERIES,
	sampleRateHz,
	SUPERSEDED_BY,
} from "../../shared/logs/series";
import { covers, distanceDays, MAX_NEAREST_EVENT_DAYS, normalizeEventName } from "../util/uploads/event-inference";
import { hootBusName, hootCompliancy, hootPhoenixVersion, isHoot } from "../util/uploads/hoot";
import {
	parseDsLogFileName,
	parseHootFileName,
	parseWpilogFileName,
	wpilogNameFromDsEvents,
} from "../../shared/logs/filenames";
import {
	linkByFileName,
	linkByMatchInfo,
	linkByTimestamp,
	fillStations,
	pickTeam,
	stationFrom,
	stationOfTeam,
	type CandidateMatch,
} from "../../shared/logs/match-link";
import { readRobotCode, stripCommonPrefix, teamFromSupportBundle } from "../../shared/logs/robot-code";
import { isWpilog, readWpilog, readWpilogEntry, stationFromAllianceStationId } from "../../shared/logs/wpilog";

// #region wpilog fixture writer
/**
 * A minimal data log writer, so the reader is tested against bytes built from
 * the spec rather than against itself. Uses the widest header lengths, which a
 * reader has to handle anyway.
 */
class LogWriter {
	private chunks: number[] = [];
	private nextEntry = 1;

	constructor(extraHeader = '{"systemTime":"1970-01-01T00:00:00Z"}') {
		for (const c of "WPILOG") this.chunks.push(c.charCodeAt(0));
		this.chunks.push(0x00, 0x01); // version 1.0, little endian
		const extra = new TextEncoder().encode(extraHeader);
		this.pushU32(extra.length);
		this.chunks.push(...extra);
	}

	private pushU32(value: number) {
		this.chunks.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff);
	}

	private pushU64(value: number) {
		let v = BigInt(value);
		for (let i = 0; i < 8; i++) {
			this.chunks.push(Number(v & 0xffn));
			v >>= 8n;
		}
	}

	private pushString(value: string) {
		const bytes = new TextEncoder().encode(value);
		this.pushU32(bytes.length);
		this.chunks.push(...bytes);
	}

	private pushRecord(entry: number, timestamp: number, payload: number[]) {
		// 4 byte entry id, 4 byte size, 8 byte timestamp.
		this.chunks.push(0x03 | (0x03 << 2) | (0x07 << 4));
		this.pushU32(entry);
		this.pushU32(payload.length);
		this.pushU64(timestamp);
		this.chunks.push(...payload);
	}

	start(name: string, type: string, metadata = ""): number {
		const id = this.nextEntry++;
		const body = new LogWriter.Payload();
		body.u8(0); // start control record
		body.u32(id);
		body.string(name);
		body.string(type);
		body.string(metadata);
		this.pushRecord(0, 0, body.bytes);
		return id;
	}

	finish(id: number, timestamp = 0) {
		const body = new LogWriter.Payload();
		body.u8(1);
		body.u32(id);
		this.pushRecord(0, timestamp, body.bytes);
	}

	int(id: number, timestamp: number, value: number) {
		const body = new LogWriter.Payload();
		body.i64(value);
		this.pushRecord(id, timestamp, body.bytes);
	}

	bool(id: number, timestamp: number, value: boolean) {
		this.pushRecord(id, timestamp, [value ? 1 : 0]);
	}

	string(id: number, timestamp: number, value: string) {
		this.pushRecord(id, timestamp, [...new TextEncoder().encode(value)]);
	}

	stringArray(id: number, timestamp: number, values: string[]) {
		const body = new LogWriter.Payload();
		body.u32(values.length);
		for (const v of values) body.string(v);
		this.pushRecord(id, timestamp, body.bytes);
	}

	double(id: number, timestamp: number, value: number) {
		const buf = new ArrayBuffer(8);
		new DataView(buf).setFloat64(0, value, true);
		this.pushRecord(id, timestamp, [...new Uint8Array(buf)]);
	}

	bytes(): Uint8Array {
		return new Uint8Array(this.chunks);
	}

	static Payload = class {
		bytes: number[] = [];
		u8(v: number) {
			this.bytes.push(v & 0xff);
		}
		u32(v: number) {
			this.bytes.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
		}
		i64(v: number) {
			let big = BigInt(v);
			if (big < 0n) big += 1n << 64n;
			for (let i = 0; i < 8; i++) {
				this.bytes.push(Number(big & 0xffn));
				big >>= 8n;
			}
		}
		string(v: string) {
			const b = new TextEncoder().encode(v);
			this.u32(b.length);
			this.bytes.push(...b);
		}
	};
}

/** A log the way WPILib 2026 writes it: match info under the FMSInfo table. */
function fmsInfoLog(): Uint8Array {
	const w = new LogWriter();
	const event = w.start("NT:/FMSInfo/EventName", "string");
	const type = w.start("NT:/FMSInfo/MatchType", "int64");
	const number = w.start("NT:/FMSInfo/MatchNumber", "int64");
	const replay = w.start("NT:/FMSInfo/ReplayNumber", "int64");
	const station = w.start("NT:/FMSInfo/StationNumber", "int64");
	const red = w.start("NT:/FMSInfo/IsRedAlliance", "boolean");
	const messages = w.start("messages", "string");
	const voltage = w.start("NT:/SmartDashboard/Voltage", "double");
	// FMS sends zeroes before the real match info arrives.
	w.int(type, 1_000, 0);
	w.int(number, 1_000, 0);
	w.string(event, 5_000_000, "MIKET");
	w.int(type, 5_000_000, 2);
	w.int(number, 5_000_000, 41);
	w.int(replay, 5_000_000, 1);
	w.int(station, 5_000_000, 2);
	w.bool(red, 5_000_000, false);
	w.string(messages, 6_000_000, "Robot program starting");
	w.double(voltage, 6_500_000, 12.4);
	w.string(messages, 7_000_000, "CAN frame not received/too-stale");
	w.finish(voltage, 8_000_000);
	return w.bytes();
}

/** The same log the way the 2027 rewrite writes it: table renamed to DriverStation. */
function driverStationLog(): Uint8Array {
	const w = new LogWriter();
	const event = w.start("NT:/DriverStation/EventName", "string");
	const type = w.start("NT:/DriverStation/MatchType", "int64");
	const number = w.start("NT:/DriverStation/MatchNumber", "int64");
	const station = w.start("NT:/DriverStation/StationNumber", "int64");
	const red = w.start("NT:/DriverStation/IsRedAlliance", "boolean");
	const alerts = w.start("NT:/SmartDashboard/Alerts/errors", "string[]");
	w.string(event, 1_000_000, "Kettering University #1");
	w.int(type, 1_000_000, 3);
	w.int(number, 1_000_000, 7);
	w.int(station, 1_000_000, 3);
	w.bool(red, 1_000_000, true);
	w.stringArray(alerts, 2_000_000, ["Elevator encoder not responding", "CAN 21 unreachable"]);
	return w.bytes();
}
// #endregion

describe("wpilog reader", () => {
	test("rejects bytes that are not a data log", () => {
		expect(isWpilog(new Uint8Array([1, 2, 3]))).toBe(false);
		expect(isWpilog(new TextEncoder().encode("WPILOG"))).toBe(false);
		expect(readWpilog(new Uint8Array([1, 2, 3])).valid).toBe(false);
	});

	test("reads the header, entries and messages", () => {
		const summary = readWpilog(fmsInfoLog());
		expect(summary.valid).toBe(true);
		expect(summary.version).toBe("1.0");
		expect(summary.extraHeader).toContain("systemTime");
		expect(summary.stoppedEarly).toBe(false);
		expect(summary.entries.map((e) => e.name)).toContain("NT:/SmartDashboard/Voltage");
		expect(summary.messages.map((m) => m.text)).toEqual([
			"Robot program starting",
			"CAN frame not received/too-stale",
		]);
		// From the first data record to the last. The control record that closes the
		// log sits at 8 s but carries the writer's clock, not log time.
		expect(summary.durationSecs).toBeCloseTo(6.999, 3);
	});

	test("takes match info from the FMSInfo table and ignores the pre-match zeroes", () => {
		const match = readWpilog(fmsInfoLog()).match;
		expect(match).toEqual({
			eventName: "MIKET",
			matchType: 2,
			matchNumber: 41,
			replayNumber: 1,
			stationNumber: 2,
			isRedAlliance: false,
			source: "FMSInfo",
		});
	});

	test("takes match info from the 2027 DriverStation table", () => {
		const match = readWpilog(driverStationLog()).match;
		expect(match.source).toBe("DriverStation");
		expect(match.matchType).toBe(3);
		expect(match.matchNumber).toBe(7);
		expect(match.eventName).toBe("Kettering University #1");
		expect(stationFrom(match.stationNumber, match.isRedAlliance)).toBe("red3");
	});

	test("collects alert string arrays as messages", () => {
		const messages = readWpilog(driverStationLog()).messages;
		expect(messages.map((m) => m.text)).toEqual(["Elevator encoder not responding", "CAN 21 unreachable"]);
	});

	test("reads one entry's samples by name", () => {
		const samples = readWpilogEntry(fmsInfoLog(), "NT:/SmartDashboard/Voltage");
		expect(samples).toEqual([{ timestamp: 6_500_000, value: "12.4" }]);
		expect(readWpilogEntry(fmsInfoLog(), "NT:/Nope")).toEqual([]);
	});

	test("a truncated log still returns what parsed", () => {
		const full = fmsInfoLog();
		const cut = full.subarray(0, full.length - 40);
		const summary = readWpilog(cut);
		expect(summary.valid).toBe(true);
		expect(summary.stoppedEarly).toBe(true);
		expect(summary.match.matchNumber).toBe(41);
	});
});

describe("wpilog file names", () => {
	test("a log renamed after FMS attached", () => {
		const parsed = parseWpilogFileName("FRC_20260314_143355_MIKET_Q41.wpilog");
		expect(parsed?.prefix).toBe("FRC");
		expect(parsed?.eventName).toBe("MIKET");
		expect(parsed?.matchLevel).toBe("Qualification");
		expect(parsed?.matchNumber).toBe(41);
		expect(parsed?.startedAt?.toISOString()).toBe("2026-03-14T14:33:55.000Z");
	});

	test("the 2027 prefix and an event name with underscores", () => {
		const parsed = parseWpilogFileName("WPILIB_20270314_143355_Kettering_University_1_E7.wpilog");
		expect(parsed?.prefix).toBe("WPILIB");
		expect(parsed?.eventName).toBe("Kettering_University_1");
		expect(parsed?.matchLevel).toBe("Playoff");
		expect(parsed?.matchNumber).toBe(7);
	});

	test("a log the driver station never attached to", () => {
		expect(parseWpilogFileName("FRC_TBD_082a0321f025ae5b.wpilog")?.tbd).toBe(true);
		expect(parseWpilogFileName("FRC_20260314_143355.wpilog")?.matchNumber).toBeUndefined();
		expect(parseWpilogFileName("robot-log.wpilog")).toBeNull();
	});

	test("driver station log names", () => {
		expect(parseDsLogFileName("2024_10_15 19_27_31 Tue.dslog")).toEqual({
			startedAtLocal: "2024-10-15T19:27:31",
			kind: "dslog",
		});
		expect(parseDsLogFileName("2024_10_15 19_27_31.dsevents")?.kind).toBe("dsevents");
		expect(parseDsLogFileName("something.dslog")).toBeNull();
	});

	test("finds the data log a dsevents file names", () => {
		expect(
			wpilogNameFromDsEvents([
				"NT: Listening on NT3 port 1735",
				"DataLog: Logging to '/home/lvuser/logs/FRC_TBD_082a0321f025ae5b.wpilog' (26.1 GiB free space)",
			]),
		).toBe("FRC_TBD_082a0321f025ae5b.wpilog");
		expect(wpilogNameFromDsEvents(["nothing here"])).toBeNull();
	});
});

describe("match linking", () => {
	const matches: CandidateMatch[] = [
		{
			id: "m-q41-p1",
			level: "Qualification",
			match_number: 41,
			play_number: 1,
			start_time: new Date("2026-03-14T14:34:10Z"),
			red1: 1111,
			red2: 2222,
			red3: 3333,
			blue1: 4444,
			blue2: 5555,
			blue3: 6666,
		},
		{
			id: "m-q41-p2",
			level: "Qualification",
			match_number: 41,
			play_number: 2,
			start_time: new Date("2026-03-14T14:44:10Z"),
			red1: 1111,
			red2: 2222,
			red3: 3333,
			blue1: 4444,
			blue2: 5555,
			blue3: 6666,
		},
		{
			id: "m-q42",
			level: "Qualification",
			match_number: 42,
			play_number: 1,
			start_time: new Date("2026-03-14T14:54:10Z"),
			red1: 7777,
			red2: 8888,
			red3: 9999,
			blue1: 1212,
			blue2: 1313,
			blue3: 1414,
		},
	];

	test("match info gives the exact match, station and team", () => {
		const link = linkByMatchInfo(readWpilog(fmsInfoLog()).match, matches);
		expect(link?.matchId).toBe("m-q41-p1");
		expect(link?.station).toBe("blue2");
		expect(link?.team).toBe(5555);
		expect(link?.how).toBe("match-info");
	});

	test("no replay number falls back to the latest play", () => {
		const link = linkByMatchInfo({ matchType: 2, matchNumber: 41, stationNumber: 1, isRedAlliance: true }, matches);
		expect(link?.matchId).toBe("m-q41-p2");
		expect(link?.team).toBe(1111);
	});

	test("a match we have no log for does not link", () => {
		expect(linkByMatchInfo({ matchType: 2, matchNumber: 99 }, matches)).toBeNull();
		expect(linkByMatchInfo({ matchNumber: 41 }, matches)).toBeNull();
	});

	test("file name links the match but never a team", () => {
		const link = linkByFileName({ matchLevel: "Qualification", matchNumber: 42 }, matches);
		expect(link?.matchId).toBe("m-q42");
		expect(link?.team).toBeUndefined();
		expect(link?.how).toBe("file-name");
	});

	test("a driver station log links every match it was recording for", () => {
		const start = new Date("2026-03-14T14:30:00Z").getTime() / 1000;
		const links = linkByTimestamp(start, 20 * 60, matches);
		expect(links.map((l) => l.matchId)).toEqual(["m-q41-p1", "m-q41-p2"]);
		expect(links[0].how).toBe("timestamp");
	});

	test("a match starting just before the log still counts, one starting well before does not", () => {
		const justAfter = new Date("2026-03-14T14:34:30Z").getTime() / 1000;
		expect(linkByTimestamp(justAfter, 60, matches).map((l) => l.matchId)).toEqual(["m-q41-p1"]);
		const wellAfter = new Date("2026-03-14T14:36:00Z").getTime() / 1000;
		expect(linkByTimestamp(wellAfter, 60, matches)).toEqual([]);
	});

	test("an unset clock links nothing", () => {
		expect(linkByTimestamp(0, 600, matches)).toEqual([]);
	});

	test("the strongest team evidence wins", () => {
		expect(
			pickTeam([
				{ team: 1234, source: "entered" },
				{ team: 5555, source: "log-station" },
			]),
		).toEqual({
			team: 5555,
			source: "log-station",
		});
		expect(
			pickTeam([
				{ team: 0, source: "log-station" },
				{ team: 1234, source: "entered" },
			])?.team,
		).toBe(1234);
		expect(pickTeam([])).toBeNull();
	});
});

describe("file classification", () => {
	test("bytes beat the extension", () => {
		expect(detectKind("whatever.txt", fmsInfoLog())).toBe("wpilog");
		expect(detectKind("notes.txt", new TextEncoder().encode("radio lights were off"))).toBe("text");
		expect(detectKind("robot.bin", new Uint8Array([0, 1, 2, 3, 0, 0]))).toBe("other");
	});

	test("an empty file named like a log is still treated as that log", () => {
		expect(detectKind("2026_03_14 09_33_10 Sat.dslog", new Uint8Array(0))).toBe("dslog");
		expect(detectKind("FRC_TBD_1.wpilog", new Uint8Array(0))).toBe("wpilog");
	});

	test("a support bundle is told apart from robot code by its contents", () => {
		expect(classifyZip(["manifest.json", "sys/hw_ports.json", "logs/boot-0/all.log"])).toBe("support-bundle");
		expect(
			classifyZip(["MyRobot/.wpilib/wpilib_preferences.json", "MyRobot/src/main/java/frc/robot/Robot.java"]),
		).toBe("code-zip");
		expect(classifyZip(["photos/img.jpg"])).toBe("zip");
		expect(detectKind("bundle.llsupport", new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe("support-bundle");
	});
});

describe("robot code", () => {
	test("strips a single wrapper directory", () => {
		expect(stripCommonPrefix(["MyRobot/build.gradle", "MyRobot/src/Robot.java"])).toBe("MyRobot/");
		expect(stripCommonPrefix(["build.gradle", "src/Robot.java"])).toBe("");
	});

	test("team number comes from the file the deploy tool reads", () => {
		const info = readRobotCode([
			{ path: ".wpilib/wpilib_preferences.json", size: 90, text: '{"teamNumber": 2337, "projectYear": "2026"}' },
			{ path: "build.gradle", size: 200, text: "plugins { id 'java' }\nteam = 9999\n" },
			{ path: "src/main/java/frc/robot/Robot.java", size: 400 },
			{ path: "src/main/java/frc/robot/subsystems/Drive.java", size: 900 },
			{ path: "vendordeps/Phoenix6.json", size: 100, text: '{"name":"Phoenix6"}' },
			{ path: "vendordeps/REVLib.json", size: 100, text: "not json" },
		]);
		expect(info.teamNumber).toBe(2337);
		expect(info.teamNumberFrom).toBe(".wpilib/wpilib_preferences.json");
		expect(info.projectYear).toBe("2026");
		expect(info.language).toBe("java");
		expect(info.vendorDeps).toEqual(["Phoenix6", "REVLib"]);
		expect(info.keyFiles[0]).toBe("src/main/java/frc/robot/Robot.java");
	});

	test("falls back to a hand-edited build file", () => {
		const info = readRobotCode([{ path: "build.gradle", size: 100, text: "frc {\n  team = 1503\n}\n" }]);
		expect(info.teamNumber).toBe(1503);
		expect(info.teamNumberFrom).toBe("build.gradle");
	});

	test("python projects are recognised", () => {
		expect(readRobotCode([{ path: "robot.py", size: 100 }]).language).toBe("python");
	});

	test("a support bundle names its own team", () => {
		expect(
			teamFromSupportBundle([
				{ path: "logs/boot-0/services/mrccomm.service.log", size: 10, text: "09:58:30 Team changed to 3015\n" },
			]),
		).toEqual({ team: 3015, from: "logs/boot-0/services/mrccomm.service.log" });
		expect(teamFromSupportBundle([{ path: "sys/config.json", size: 10, text: '{"teamNumber":254}' }])?.team).toBe(
			254,
		);
		expect(teamFromSupportBundle([{ path: "logs/x.log", size: 2, text: "nothing" }])).toBeNull();
	});
});

describe("driver station logs", () => {
	test("an unknown version is reported, not guessed", () => {
		const bytes = new Uint8Array(24);
		new DataView(bytes.buffer).setInt32(0, 9);
		expect(readDsLog(bytes).parsed).toBe(false);
		expect(readDsLog(bytes).version).toBe(9);
		expect(readDsEvents(bytes).parsed).toBe(false);
		expect(summarizeDsLog(readDsLog(bytes))).toBeNull();
	});

	test("a file too short to hold a header is not parsed", () => {
		expect(readDsLog(new Uint8Array([0, 0, 0, 4])).parsed).toBe(false);
	});
});

describe("dsevents match info", () => {
	/** Build a .dsevents file with the given message lines. */
	function eventsFile(texts: string[]): Uint8Array {
		const chunks: number[] = [];
		const pushI32 = (v: number) => chunks.push((v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
		const pushLvTime = (seconds: number) => {
			// LabVIEW time: i64 seconds since 1904, then u64 fraction.
			const lv = BigInt(seconds + 2082826800);
			for (let i = 7; i >= 0; i--) chunks.push(Number((lv >> BigInt(i * 8)) & 0xffn));
			for (let i = 0; i < 8; i++) chunks.push(0);
		};
		pushI32(4);
		pushLvTime(1_700_000_000);
		for (const [index, text] of texts.entries()) {
			pushLvTime(1_700_000_000 + index);
			const bytes = new TextEncoder().encode(text);
			pushI32(bytes.length);
			chunks.push(...bytes);
		}
		return new Uint8Array(chunks);
	}

	test("reads the match type, number and event name FMS writes", () => {
		const file = eventsFile([
			"Info  FMS Connected:   Qualification - 41: 2 minutes 30 seconds",
			"Info  FMS Event Name: Kettering University #1",
			"********** Robot program starting **********",
		]);
		const info = matchInfoFromDsEvents(readDsEvents(file).entries);
		expect(info).toEqual({
			fmsAttached: true,
			matchType: "Qualification",
			matchNumber: 41,
			eventName: "Kettering University #1",
		});
	});

	test("tolerates different spacing and reads eliminations", () => {
		const info = matchInfoFromDsEvents(readDsEvents(eventsFile(["FMS Connected: Elimination - 7:"])).entries);
		expect(info.matchType).toBe("Elimination");
		expect(info.matchNumber).toBe(7);
	});

	test("a pit session has no match info and says FMS was never attached", () => {
		const info = matchInfoFromDsEvents(
			readDsEvents(eventsFile(["********** Robot program starting **********", "NT: Listening on NT3 port 1735"]))
				.entries,
		);
		expect(info).toEqual({ fmsAttached: false });
	});

	test("FMS attached with no match line is still reported as attached", () => {
		expect(matchInfoFromDsEvents(readDsEvents(eventsFile(["FMS Disconnect"])).entries).fmsAttached).toBe(true);
	});
});

describe("telemetry CSV", () => {
	test("wide layout, one column per signal", () => {
		const csv = readCsvTelemetry(
			["timestamp,Motor1 Velocity,Motor1 Current", "1741712345.2,1200,14.5", "1741712345.4,1180,16.25"].join(
				"\n",
			),
		);
		expect(csv.parsed).toBe(true);
		expect(csv.shape).toBe("wide");
		expect(csv.absoluteTime).toBe(true);
		expect(csv.series.map((s) => s.label)).toEqual(["Motor1 Velocity", "Motor1 Current"]);
		expect(csv.series[1].points).toEqual([
			{ t: 1741712345.2, v: 14.5 },
			{ t: 1741712345.4, v: 16.25 },
		]);
	});

	test("long layout, the REV Hardware Client shape", () => {
		const csv = readCsvTelemetry(
			[
				"timestamp,device,signal,value",
				"1741712345.2,SPARK MAX 3,Applied Output,0.42",
				"1741712345.2,SPARK MAX 3,Motor Temperature,31",
				"1741712345.4,SPARK MAX 3,Applied Output,0.55",
			].join("\n"),
		);
		expect(csv.shape).toBe("long");
		expect(csv.series.map((s) => s.label)).toEqual([
			"SPARK MAX 3 / Applied Output",
			"SPARK MAX 3 / Motor Temperature",
		]);
		expect(csv.series[0].points.length).toBe(2);
	});

	test("milliseconds and ISO timestamps are both wall clocks", () => {
		expect(readCsvTelemetry("time,v\n1741712345200,1\n1741712345400,2").absoluteTime).toBe(true);
		expect(readCsvTelemetry("time,v\n2026-03-14T14:34:10Z,1\n2026-03-14T14:34:11Z,2").absoluteTime).toBe(true);
	});

	test("a relative time column is read but marked as unplaceable", () => {
		const csv = readCsvTelemetry("time (s),battery\n0.0,12.6\n0.2,12.4");
		expect(csv.parsed).toBe(true);
		expect(csv.absoluteTime).toBe(false);
	});

	test("quoted headers with commas survive", () => {
		expect(splitCsvLine('timestamp,"Motor 1, Applied Output",b')).toEqual([
			"timestamp",
			"Motor 1, Applied Output",
			"b",
		]);
	});

	test("a CSV with no time column is refused with a reason", () => {
		const csv = readCsvTelemetry("a,b\n1,2");
		expect(csv.parsed).toBe(false);
		expect(csv.problem).toContain("No time column");
	});

	test("detection picks a telemetry CSV out of plain text", () => {
		const bytes = new TextEncoder().encode("timestamp,battery\n1741712345.2,12.6\n");
		expect(detectKind("export.csv", bytes)).toBe("csv");
		expect(detectKind("notes.txt", new TextEncoder().encode("radio lights were off"))).toBe("text");
	});
});

describe("hoot detection", () => {
	/**
	 * A real Hoot header, taken from an actual file: the CAN bus name in a 64 byte
	 * NUL-padded field, then the Phoenix version as text, then the compliancy at
	 * byte 70. There is no magic tag.
	 */
	function hootHeader(bus = "Drivetrain", version = "25.3.0", compliancy = 13): Uint8Array {
		const data = new Uint8Array(96);
		data.set(new TextEncoder().encode(bus), 0);
		data.set(new TextEncoder().encode(version), 64);
		data[70] = compliancy;
		return data;
	}

	test("recognised by its header shape, with no extension to go on", () => {
		const data = hootHeader();
		expect(isHoot(data, "signals.bin")).toBe(true);
		expect(hootCompliancy(data)).toBe(13);
		expect(hootBusName(data)).toBe("Drivetrain");
		expect(hootPhoenixVersion(data)).toBe("25.3.0");
	});

	test("the extension alone is enough, since the shape can change", () => {
		expect(detectKind("signals.hoot", new Uint8Array([1, 2, 3]))).toBe("hoot");
		expect(detectKind("INKOK_Q13_rio_2025-03-15_12-50-36.hoot", hootHeader())).toBe("hoot");
	});

	test("things that are not a hoot are not mistaken for one", () => {
		expect(hootCompliancy(new Uint8Array(10))).toBeNull();
		expect(isHoot(new Uint8Array(96), "x.bin")).toBe(false);
		expect(isHoot(new TextEncoder().encode("timestamp,battery\n1,2\n"), "x.csv")).toBe(false);
	});
});

describe("windowed driver station summary", () => {
	/** Ten minutes of bench time with a sag, then a match with a deeper sag. */
	function session(): DsLogResult {
		const entries = [];
		// 30,000 samples at 50 Hz is ten minutes of bench time.
		for (let i = 0; i < 30_000; i++) {
			const t = i * 0.02;
			// Pit brownout at 60 s, match at 300 s with its own dip at 340 s.
			const inMatch = t >= 300 && t <= 450;
			const volts = t > 59 && t < 61 ? 6.2 : t > 339 && t < 341 ? 9.4 : 12.4;
			entries.push({
				timestamp: t,
				tripTimeMs: 3,
				packetLoss: 0,
				batteryVolts: volts,
				cpuUtilization: 0.3,
				brownout: volts < 7,
				watchdog: false,
				dsTeleop: inMatch,
				dsDisabled: !inMatch,
				robotTeleop: inMatch,
				robotAuto: false,
				robotDisabled: !inMatch,
				canUtilization: 0.2,
				wifiDb: 0,
				wifiMb: 0,
				powerDistributionCurrents: [],
			});
		}
		return { parsed: true, version: 4, startTime: 1_700_000_000, entries, stoppedEarly: false };
	}

	test("the whole file reports the pit brownout", () => {
		const summary = summarizeDsLog(session());
		expect(summary?.minBatteryVolts).toBeCloseTo(6.2, 2);
		expect(summary?.brownoutSecs).toBeGreaterThan(0);
	});

	test("the match window reports the match, not the pit", () => {
		// Match started 300 s into the log.
		const summary = summarizeDsLogWindow(session(), 300);
		expect(summary?.minBatteryVolts).toBeCloseTo(9.4, 2);
		expect(summary?.brownoutSecs).toBe(0);
		// Timestamps are re-zeroed on match start, so the dip reads at 40 s in.
		expect(summary?.durationSecs).toBeCloseTo(180, 0);
	});

	test("a match the log does not cover has no window", () => {
		expect(summarizeDsLogWindow(session(), 9000)).toBeNull();
	});
});

describe("series rates and defaults", () => {
	test("the measured rate is the median interval, not an assumption", () => {
		const fiftyHz = Array.from({ length: 100 }, (_, i) => ({ t: i * 0.02, v: 12 }));
		expect(sampleRateHz(fiftyHz)).toBeCloseTo(50, 6);
		const twoHz = Array.from({ length: 20 }, (_, i) => ({ t: i * 0.5, v: 12 }));
		expect(sampleRateHz(twoHz)).toBeCloseTo(2, 6);
		// One long gap must not drag the rate down; the median ignores it.
		const withGap = [...fiftyHz, { t: 60, v: 12 }];
		expect(sampleRateHz(withGap)).toBeCloseTo(50, 6);
		expect(sampleRateHz([{ t: 0, v: 1 }])).toBeNull();
	});

	test("with a driver station log, its series replace the slower ones", () => {
		const keys = defaultSeriesKeys({ hasDsLog: true });
		expect(keys).toContain("ds.batteryVolts");
		expect(keys).not.toContain("fms.battery");
		expect(keys).not.toContain("fms.averageTripTime");
		// Packet loss is superseded too, as a rate rather than a count.
		expect(keys).not.toContain("fms.lostPackets");
		// The field's view of the link has no counterpart, so it stays on: it is
		// what the team's battery trace gets compared against.
		expect(keys).toContain("fms.radioLink");
		expect(keys).toContain("fms.rioLink");
	});

	test("without one, the field's series are all there is", () => {
		const keys = defaultSeriesKeys({ hasDsLog: false });
		expect(keys).toContain("fms.battery");
		expect(keys).toContain("fms.rioLink");
		expect(keys).not.toContain("ds.batteryVolts");
	});

	test("every superseded key names a series that exists", () => {
		for (const [slow, faster] of Object.entries(SUPERSEDED_BY)) {
			expect(FMS_SERIES.some((d) => d.key === slow)).toBe(true);
			expect(DSLOG_SERIES.some((d) => d.key === faster.key)).toBe(true);
		}
	});

	test("thinning keeps real samples, never invented ones", () => {
		const points = Array.from({ length: 1000 }, (_, i) => ({ t: i * 0.02, v: i === 500 ? 6.2 : 12.4 }));
		const thinned = downsample(points, 100);
		expect(thinned.length).toBeLessThanOrEqual(100);
		// The one dip survives, and every kept point is one that was in the input.
		expect(thinned.some((p) => p.v === 6.2)).toBe(true);
		for (const p of thinned) expect(points.some((q) => q.t === p.t && q.v === p.v)).toBe(true);
	});
});

describe("hoot file names", () => {
	test("Phoenix names a hoot after its match", () => {
		expect(parseHootFileName("INKOK_Q13_rio_2025-03-15_12-50-36.hoot")).toEqual({
			eventName: "INKOK",
			matchLevel: "Qualification",
			matchNumber: 13,
			bus: "rio",
			startedAtLocal: "2025-03-15T12:50:36",
		});
	});

	test("a CANivore serial in place of the bus name", () => {
		const parsed = parseHootFileName("INKOK_E11_9ED441DC50374E5320202047041B10FF_2025-03-16_16-02-53.hoot");
		expect(parsed?.matchLevel).toBe("Playoff");
		expect(parsed?.matchNumber).toBe(11);
		expect(parsed?.bus).toBe("9ED441DC50374E5320202047041B10FF");
	});

	test("practice matches, and names that are not a match", () => {
		expect(parseHootFileName("INKOK_P1_rio_2025-03-15_09-34-52.hoot")?.matchLevel).toBe("Practice");
		expect(parseHootFileName("signals.hoot")).toBeNull();
		expect(parseHootFileName("2025-03-15_12-50-36.hoot")).toBeNull();
	});
});

describe("alliance station ids", () => {
	test("AdvantageKit logs one enum where FMSInfo logs two fields", () => {
		// AllianceStationID: Unknown, Red1, Red2, Red3, Blue1, Blue2, Blue3.
		expect(stationFromAllianceStationId(1)).toEqual({ stationNumber: 1, isRedAlliance: true });
		expect(stationFromAllianceStationId(3)).toEqual({ stationNumber: 3, isRedAlliance: true });
		expect(stationFromAllianceStationId(4)).toEqual({ stationNumber: 1, isRedAlliance: false });
		expect(stationFromAllianceStationId(6)).toEqual({ stationNumber: 3, isRedAlliance: false });
		// Unknown, and anything off the end, is not a station.
		expect(stationFromAllianceStationId(0)).toBeNull();
		expect(stationFromAllianceStationId(7)).toBeNull();
	});
});

describe("event inference dates", () => {
	const event = { startDate: "2026-04-10", endDate: "2026-04-12" };
	const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

	test("an event covers every day in its range, including the last", () => {
		expect(covers(event, day("2026-04-10"))).toBe(true);
		expect(covers(event, day("2026-04-11"))).toBe(true);
		// The last day counts in full: a log written that evening still belongs.
		expect(covers(event, new Date("2026-04-12T23:30:00Z"))).toBe(true);
		expect(covers(event, day("2026-04-09"))).toBe(false);
		expect(covers(event, day("2026-04-13"))).toBe(false);
	});

	test("an event with no dates covers nothing", () => {
		expect(covers({ startDate: null, endDate: null }, day("2026-04-11"))).toBe(false);
		expect(distanceDays({ startDate: "", endDate: "" }, day("2026-04-11"))).toBe(Number.POSITIVE_INFINITY);
	});

	test("distance is zero inside the range and grows either side", () => {
		expect(distanceDays(event, day("2026-04-11"))).toBe(0);
		expect(distanceDays(event, day("2026-04-14"))).toBeCloseTo(1.5, 1);
		expect(distanceDays(event, day("2026-04-07"))).toBeCloseTo(2.5, 1);
	});

	test("a log from a different season is too far to count", () => {
		expect(distanceDays(event, day("2025-04-11"))).toBeGreaterThan(MAX_NEAREST_EVENT_DAYS);
	});

	test("event names reduce so a code and a name can be compared", () => {
		expect(normalizeEventName("MIFLI")).toBe("mifli");
		expect(normalizeEventName("2026mifli")).toBe("2026mifli");
		expect(normalizeEventName("Kettering University #1")).toBe("ketteringuniversity1");
		// Which is what lets a code ending in the FMS name match it.
		expect(normalizeEventName("2026mifli").endsWith(normalizeEventName("MIFLI"))).toBe(true);
	});
});

describe("filling in the station", () => {
	const match: CandidateMatch = {
		id: "m1",
		level: "Practice",
		match_number: 1,
		play_number: 1,
		start_time: new Date("2026-04-11T14:00:00Z"),
		red1: 240,
		red2: 6615,
		red3: 503,
		blue1: 6081,
		blue2: 1502,
		blue3: 2834,
	};
	const link = {
		matchId: "m1",
		level: "Practice" as const,
		matchNumber: 1,
		playNumber: 1,
		startTime: match.start_time,
		how: "timestamp" as const,
		reason: "It was recording then.",
	};

	test("a team maps to the station they were standing in", () => {
		expect(stationOfTeam(match, 240)).toBe("red1");
		expect(stationOfTeam(match, 1502)).toBe("blue2");
		expect(stationOfTeam(match, 9999)).toBeNull();
	});

	test("a link made by the clock gets its station from the team", () => {
		const [filled] = fillStations([link], [match], 240);
		expect(filled.station).toBe("red1");
		expect(filled.team).toBe(240);
		expect(filled.reason).toContain("red1");
	});

	test("nothing is invented without a team, or for a team not in that match", () => {
		expect(fillStations([link], [match], null)[0].station).toBeUndefined();
		expect(fillStations([link], [match], 9999)[0].station).toBeUndefined();
	});

	test("a station the log already named is left alone", () => {
		const named = { ...link, station: "blue3" as const, how: "match-info" as const };
		expect(fillStations([named], [match], 240)[0].station).toBe("blue3");
	});
});
