import { readDsLog, readDsEvents, summarizeDsLog, summarizeDsLogWindow, matchInfoFromDsEvents } from "./shared/logs/dslog";
import { describeDsLog } from "./shared/logs/summarize";
const base = "/tmp/demo/2026_08_15 15_11_09 Sat";
const log = readDsLog(new Uint8Array(await Bun.file(base + ".dslog").arrayBuffer()));
console.log("parsed", log.parsed, "v", log.version, "records", log.entries.length,
  "start", new Date((log.startTime ?? 0) * 1000).toISOString(), "stoppedEarly", log.stoppedEarly);
const s = summarizeDsLog(log)!;
console.log("rate check: records/duration =", (log.entries.length / s.durationSecs).toFixed(1), "Hz");
console.log("\n--- whole session ---\n" + describeDsLog(s, log.startTime));
const matchStart = new Date("2026-08-15T19:11:09Z").getTime() / 1000;
const w = summarizeDsLogWindow(log, matchStart - log.startTime!)!;
console.log("\n--- Qualification 14 only ---\n" + describeDsLog(w, null));
const ev = readDsEvents(new Uint8Array(await Bun.file(base + ".dsevents").arrayBuffer()));
console.log("\nevents parsed", ev.parsed, "lines", ev.entries.length);
console.log("match info:", JSON.stringify(matchInfoFromDsEvents(ev.entries)));
