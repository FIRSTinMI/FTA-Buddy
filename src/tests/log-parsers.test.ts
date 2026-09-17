import { describe, expect, test } from "bun:test";
import { classifyZip, detectKind } from "../../shared/logs/detect";
import { readDsEvents, readDsLog, summarizeDsLog } from "../../shared/logs/dslog";
import { parseDsLogFileName, parseWpilogFileName, wpilogNameFromDsEvents } from "../../shared/logs/filenames";
import {
	linkByFileName,
	linkByMatchInfo,
	linkByTimestamp,
	pickTeam,
	stationFrom,
	type CandidateMatch,
} from "../../shared/logs/match-link";
import { readRobotCode, stripCommonPrefix, teamFromSupportBundle } from "../../shared/logs/robot-code";
import { isWpilog, readWpilog, readWpilogEntry } from "../../shared/logs/wpilog";

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
		expect(summary.durationSecs).toBeCloseTo(8, 3);
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
