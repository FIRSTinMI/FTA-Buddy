/**
 * A synthetic Driver Station session for one robot in one match, written in the
 * real binary formats so it goes through the same readers as a team's own file.
 * Match start is 2026-08-15 19:11:09Z (MARC Qualification 14, red2, team 6615).
 */
const MATCH_START = new Date("2026-08-15T19:11:09Z").getTime() / 1000;
const LEAD = 42; // log starts before the match, like a real session
const LOG_START = MATCH_START - LEAD;
const PERIOD = 0.02; // 50 Hz
const DURATION = 235; // through the match and a little after

function lvTime(unixSecs: number): Buffer {
	const b = Buffer.alloc(16);
	const whole = Math.floor(unixSecs);
	b.writeBigInt64BE(BigInt(whole + 2082826800), 0);
	const frac = unixSecs - whole;
	b.writeBigUInt64BE(BigInt(Math.floor(frac * 2 ** 64 / 2) * 2), 8);
	return b;
}

// #region dslog
/** Pack 20 PD channels of 10 bits each into 27 bytes, REV layout. */
function packCurrents(amps: number[]): Buffer {
	const bits: boolean[] = new Array(27 * 8).fill(false);
	for (let ch = 0; ch < 20; ch++) {
		const raw = Math.max(0, Math.min(1023, Math.round((amps[ch] ?? 0) * 8)));
		const at = Math.floor(ch / 3) * 32 + (ch % 3) * 10;
		for (let b = 0; b < 10; b++) bits[at + b] = ((raw >> b) & 1) === 1;
	}
	const out = Buffer.alloc(27);
	for (let i = 0; i < bits.length; i++) if (bits[i]) out[Math.floor(i / 8)] |= 1 << i % 8;
	return out;
}

interface Sample {
	t: number; trip: number; loss: number; volts: number; cpu: number; can: number;
	brownout: boolean; watchdog: boolean; dsTeleop: boolean; dsDisabled: boolean;
	robotTeleop: boolean; robotAuto: boolean; robotDisabled: boolean;
	wifiDb: number; wifiMb: number; currents: number[];
}

/** The reader treats a CLEARED bit as true, so the mask is built inverted. */
function statusByte(s: Sample): number {
	let mask = 0xff;
	const clear = (bit: number) => (mask &= ~(1 << bit));
	if (s.brownout) clear(7);
	if (s.watchdog) clear(6);
	if (s.dsTeleop) clear(5);
	if (s.dsDisabled) clear(3);
	if (s.robotTeleop) clear(2);
	if (s.robotAuto) clear(1);
	if (s.robotDisabled) clear(0);
	return mask;
}

function dslogRecord(s: Sample): Buffer {
	const head = Buffer.alloc(10);
	head[0] = Math.max(0, Math.min(255, Math.round(s.trip / 0.5)));
	head.writeInt8(Math.max(-128, Math.min(127, Math.round((s.loss * 100) / 4))), 1);
	head.writeUInt16BE(Math.max(0, Math.min(65535, Math.round(s.volts * 256))), 2);
	head[4] = Math.max(0, Math.min(255, Math.round((s.cpu * 100) / 0.5)));
	head[5] = statusByte(s);
	head[6] = Math.max(0, Math.min(255, Math.round((s.can * 100) / 0.5)));
	head[7] = Math.max(0, Math.min(255, Math.round(s.wifiDb / 0.5)));
	head.writeUInt16BE(Math.max(0, Math.min(65535, Math.round(s.wifiMb * 256))), 8);
	// 4 bytes whose 4th is the PD type: 33 = REV PDH.
	const pdType = Buffer.from([0, 0, 0, 33]);
	const canId = Buffer.from([1]);
	const extra = Buffer.from([
		Math.round((s.currents[20] ?? 0) * 16), Math.round((s.currents[21] ?? 0) * 16),
		Math.round((s.currents[22] ?? 0) * 16), Math.round((s.currents[23] ?? 0) * 16),
	]);
	return Buffer.concat([head, pdType, canId, packCurrents(s.currents), extra, Buffer.from([0])]);
}
// #endregion

/**
 * The story: a healthy start, a hard push at 35 s that sags the battery, a real
 * brownout at 88 s that drops the robot for 1.4 s, and a recovery.
 */
function sampleAt(i: number): Sample {
	const t = i * PERIOD;            // seconds into the log
	const m = t - LEAD;              // seconds into the match
	const enabled = m >= 0 && m <= 150;
	const auto = enabled && m < 15;
	const pushing = m > 33 && m < 42;
	const brownoutWindow = m > 87.6 && m < 89.0;
	const droppedOut = m > 88.0 && m < 89.4;

	let volts = 12.6;
	if (enabled) volts = 12.1 - 0.4 * Math.abs(Math.sin(m / 7));
	if (pushing) volts = 9.6 - 0.5 * Math.sin(m * 3);
	if (brownoutWindow) volts = 6.4;
	if (droppedOut) volts = 7.2;

	const currents = new Array(24).fill(0);
	if (enabled) {
		for (let ch = 0; ch < 4; ch++) currents[ch] = (pushing ? 88 : 24) + 6 * Math.sin(m * 2 + ch);
		currents[8] = pushing ? 62 : 11;      // intake
		currents[12] = m > 100 && m < 118 ? 74 : 5; // elevator run
		currents[20] = 1.2;
		currents[21] = 0.8;
	}

	return {
		t, trip: droppedOut ? 92 : 7 + (pushing ? 4 : 0), loss: droppedOut ? 0.34 : 0,
		volts, cpu: enabled ? (pushing ? 0.72 : 0.41) : 0.18,
		can: enabled ? (pushing ? 0.58 : 0.29) : 0.12,
		brownout: brownoutWindow, watchdog: droppedOut,
		dsTeleop: enabled && !auto, dsDisabled: !enabled,
		robotTeleop: enabled && !auto && !droppedOut, robotAuto: auto && !droppedOut,
		robotDisabled: !enabled || droppedOut,
		wifiDb: 58, wifiMb: droppedOut ? 0.2 : 1.7, currents,
	};
}

const count = Math.round(DURATION / PERIOD);
const dslog = Buffer.concat([
	(() => { const b = Buffer.alloc(4); b.writeInt32BE(4, 0); return b; })(),
	lvTime(LOG_START),
	...Array.from({ length: count }, (_, i) => dslogRecord(sampleAt(i))),
]);
await Bun.write("/tmp/demo/2026_08_15 15_11_09 Sat.dslog", dslog);

// #region dsevents
const lines: [number, string][] = [
	[0.4, "Info  FMS Connected:   Qualification - 14: 2 minutes 30 seconds"],
	[0.6, "Info  FMS Event Name: 2026 Michigan Advanced Robotics Competition"],
	[1.1, "********** Robot program starting **********"],
	[1.4, "NT: Listening on NT3 port 1735, NT4 port 5810"],
	[2.2, "[phoenix] CANbus Connected: Drivetrain (can0)"],
	[3.9, "********** Robot program startup complete **********"],
	[LEAD + 0.1, "Info  FMS: Auto enabled"],
	[LEAD + 15.2, "Info  FMS: Teleop enabled"],
	[LEAD + 35.4, "Warning at frc.robot.Drive: drive current limit reached on module 2"],
	[LEAD + 87.7, "Warning  Input Voltage Brownout: 1"],
	[LEAD + 88.1, "Radio disconnected"],
	[LEAD + 88.3, "Watchdog timeout in daemon after 125045 us"],
	[LEAD + 89.5, "Radio reconnected"],
	[LEAD + 89.8, "Info  Communications restored"],
	[LEAD + 104.0, "Warning at frc.robot.Elevator: setpoint not reached within tolerance"],
	[LEAD + 150.3, "Info  FMS: Match over, robot disabled"],
];
const events = Buffer.concat([
	(() => { const b = Buffer.alloc(4); b.writeInt32BE(4, 0); return b; })(),
	lvTime(LOG_START),
	...lines.map(([t, text]) => {
		const body = Buffer.from(text, "utf8");
		const len = Buffer.alloc(4);
		len.writeInt32BE(body.length, 0);
		return Buffer.concat([lvTime(LOG_START + t), len, body]);
	}),
]);
await Bun.write("/tmp/demo/2026_08_15 15_11_09 Sat.dsevents", events);
// #endregion

console.log("dslog", (dslog.length / 1e6).toFixed(2), "MB,", count, "records");
console.log("dsevents", events.length, "bytes,", lines.length, "lines");
