// chezyMonitor.ts
import { DEFAULT_MONITOR } from "../../shared/constants";
import { FieldState, PartialMonitorFrame, ROBOT, RobotInfo } from "../../shared/types";

export type ChezyParams = {
    displayId: number;
    ds: boolean;
    fta: boolean;
    reversed: boolean;
};

export class ChezyMonitor {
    private url: string;
    private ws: WebSocket | null = null;
    private reconnectMs = 3000;

    public status: 'connected' | 'disconnected' = 'disconnected';
    public frame: PartialMonitorFrame = { ...DEFAULT_MONITOR };

    constructor(
        wsUrl: string,
        private version: string,
        private onFrame: (frame: PartialMonitorFrame) => void,
        private onCycleTime: (type: 'lastCycleTime' | 'prestart' | 'start' | 'end' | 'refsDone' | 'scoresPosted', time: string) => void,
        private onSendSchedule: () => void
    ) {
        this.url = wsUrl;
        this.frame.version = version;
    }

    public start(): Promise<void> {
        return new Promise((resolve) => {
            const connect = () => {
                this.ws = new WebSocket(this.url);

                this.ws.onopen = () => {
                    console.log("Chezy WS connected:", this.url);
                    this.status = 'connected';
                    resolve();
                };

                this.ws.onclose = () => {
                    console.log("Chezy WS closed; reconnecting in", this.reconnectMs, "ms");
                    this.status = 'disconnected';
                    setTimeout(connect, this.reconnectMs);
                };

                this.ws.onerror = (e) => {
                    console.warn("Chezy WS error", e);
                };

                this.ws.onmessage = (evt) => {
                    try {
                        const msg = JSON.parse(evt.data);
                        this.handleMessage(msg);
                    } catch (e) {
                        console.warn("Bad Chezy message", evt.data);
                    }
                };
            };

            connect();
        });
    }

    private handleMessage(msg: any) {
        switch (msg?.type) {
            case "arenaStatus": {
                // station keys are like R1, R2, R3, B1, B2, B3
                const st = msg.data?.AllianceStations ?? {};
                const mapKey = (k: string): ROBOT => {
                    // R1 -> red1, B3 -> blue3
                    const side = k[0] === "R" ? "red" : "blue";
                    const idx = k[1];
                    return `${side}${idx}` as ROBOT;
                };

                for (const k of Object.keys(st)) {
                    const station = st[k];
                    const key = mapKey(k);

                    const prev = this.frame[key] ?? ({} as RobotInfo);
                    const ds = station.DsConn;
                    const wifi = station.WifiStatus ?? {};

                    this.frame[key] = {
                        number: station.Team?.Id ?? prev.number ?? 0,

                        ds: this.deriveDsState(ds),
                        enabled: this.deriveEnableState(ds),

                        // Links / health
                        radio: (ds?.RadioLinked ?? wifi.RadioLinked ?? prev.radio ?? false) as boolean,
                        rio: (ds?.RioLinked ?? prev.rio ?? false) as boolean,
                        code: (ds?.RobotLinked ?? prev.code ?? false) as boolean,

                        // Throughput + telemetry
                        bwu: (wifi.MBits ?? prev.bwu ?? 0) as number,
                        battery: (ds?.BatteryVoltage ?? prev.battery ?? 0) as number,
                        ping: (ds?.DsRobotTripTimeMs ?? prev.ping ?? 0) as number,
                        packets: (ds?.MissedPacketCount ?? prev.packets ?? 0) as number,

                        // Mandatory keys in your RobotInfo
                        MAC: prev.MAC ?? "",                 // Chezy doesn't expose MAC; keep or empty
                        RX: (wifi.RxRate ?? prev.RX ?? 0) as number,
                        TX: (wifi.TxRate ?? prev.TX ?? 0) as number,
                        SNR: (wifi.SignalNoiseRatio ?? prev.SNR ?? 0) as number,
                        RXMCS: prev.RXMCS ?? 0,              // Not provided by Chezy; keep / default
                        TXMCS: prev.TXMCS ?? 0,              // Not provided by Chezy; keep / default
                        noise: prev.noise ?? 0,              // Not provided by Chezy; keep / default
                        signal: prev.signal ?? 0,            // Not provided by Chezy; keep / default

                        // Extras you already used
                        radioConnected: (wifi.RadioLinked ?? prev.radioConnected ?? null) as boolean | null,
                        radioConnectionQuality: mapQuality(station.WifiStatus?.ConnectionQuality as ChezyQuality)
                            ?? (prev.radioConnectionQuality as ("Warning" | "Caution" | "Good" | "Excellent" | null))
                            ?? null,

                        // Leave your existing flags/data intact if present
                        versionmm: prev.versionmm ?? false,
                        versionData: prev.versionData,       // keep whatever your SignalR fills in
                    };
                }

                // You can also map Plc/AccessPoint statuses if you like.
                this.onFrame(this.bumpTime());
                break;
            }

            case "eventStatus": {
                const ct = msg.data?.CycleTime ?? "";
                if (ct) {
                    this.frame.lastCycleTime = ct;
                    this.onCycleTime("lastCycleTime", ct);
                }
                // EarlyLateMessage available as msg.data?.EarlyLateMessage
                break;
            }

            case "matchTime": {
                // You can reflect into FieldState if desired.
                this.onFrame(this.bumpTime());
                break;
            }

            case "matchLoad": {
                // New match loaded: call send schedule?
                this.onSendSchedule();
                this.onFrame(this.bumpTime());
                break;
            }

            default:
                // ignore
                break;
        }
    }

    private bumpTime(): PartialMonitorFrame {
        this.frame.frameTime = Date.now();
        return this.frame;
    }

    private deriveDsState(ds?: any) {
        // Map Chezy ds fields to your DSState enum if you want parity
        // For now do a minimal mirror:
        if (!ds) return 0; // DSState.RED
        if (ds.EStop) return 4; // DSState.ESTOP
        if (ds.AStop) return 3; // DSState.ASTOP
        if (ds.DsLinked && ds.RobotLinked) return 2; // DSState.GREEN
        if (ds.DsLinked) return 5; // DSState.GREEN_X
        return 0; // RED
    }

    private deriveEnableState(ds?: any) {
        // Map to EnableState
        if (!ds) return 0; // RED
        if (ds.EStop) return 4; // ESTOP
        if (ds.AStop) return 3; // ASTOP
        if (ds.Enabled) return ds.Auto ? 1 /* GREEN_A */ : 2 /* GREEN_T */;
        return 0; // RED
    }
}

type ChezyQuality = 0 | 1 | 2 | 3 | 4;

/** Map Chezy numeric quality to your union type. */
function mapQuality(q?: ChezyQuality | null):
    "Warning" | "Caution" | "Good" | "Excellent" | null {
    switch (q) {
        case 4: return "Excellent";
        case 3: return "Good";
        case 2: return "Caution";
        case 1: return "Warning";
        default: return null; // 0 or undefined -> unknown / not reported
    }
}