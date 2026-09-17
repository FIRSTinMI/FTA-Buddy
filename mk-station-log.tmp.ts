/**
 * A synthesised station log for the demo practice match, so the viewer has the
 * field's side to draw the team's own logs against. Deliberately slower than a
 * Driver Station log, which is the whole point being demonstrated.
 */
import type { FMSLogFrame } from "./shared/types";
import { compressStationLog } from "./src/util/station-log-codec";

const start = new Date("2024-10-16T04:30:00Z").getTime();
const frames: FMSLogFrame[] = Array.from({ length: 340 }, (_, i) => {
	const t = i * 0.5;
	const dropped = t >= 76 && t <= 78;
	return {
		timeStamp: new Date(start + t * 1000).toISOString(),
		matchTimeBase: 150,
		matchTime: Math.max(0, 150 - t),
		auto: t < 15,
		dsLinkActive: true,
		enabled: t > 3,
		aStopPressed: false,
		eStopPressed: false,
		linkActive: !dropped,
		radioLink: !dropped,
		rioLink: !dropped,
		averageTripTime: 8 + (dropped ? 40 : 0),
		lostPackets: dropped ? 12 : 0,
		sentPackets: 300,
		battery: t >= 74 && t <= 80 ? 8.2 : 12.3,
		brownout: false,
		signal: -52,
		noise: -95,
		snr: 43,
		txRate: 60,
		txMCS: 7,
		rxRate: 60,
		rxMCS: 7,
		dataRateTotal: 1.8,
	};
});
await Bun.write("/tmp/station-log.b64", compressStationLog(frames));
console.log("frames", frames.length, "base64 bytes", (await Bun.file("/tmp/station-log.b64").text()).length);
