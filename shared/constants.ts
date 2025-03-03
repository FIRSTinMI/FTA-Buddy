import { EnableState, MonitorFrame, RobotCycleTracking } from "./types";

export const DEFAULT_MONITOR: MonitorFrame = {
    field: 0,
    match: 0,
    play: 0,
    level: 'None',
    version: '0.0.0',
    frameTime: 0,
    time: 'unk',
    lastCycleTime: 'unk',
    blue1: {
        number: 9999,
        ds: 0,
        radio: false,
        rio: false,
        code: false,
        bwu: 0,
        battery: 0,
        ping: 0,
        packets: 0,
        MAC: '00:00:00:00:00:00',
        RX: 0,
        RXMCS: 0,
        TX: 0,
        TXMCS: 0,
        SNR: 0,
        noise: 0,
        signal: 0,
        versionmm: false,
        enabled: EnableState.RED,
        lastChange: null,
        improved: false,
        warnings: [],
        radioConnected: false,
        radioConnectionQuality: "Good",
    },
    blue2: {
        number: 9998,
        ds: 2,
        radio: false,
        rio: false,
        code: false,
        bwu: 0,
        battery: 0,
        ping: 0,
        packets: 0,
        MAC: '00:00:00:00:00:00',
        RX: 0,
        RXMCS: 0,
        TX: 0,
        TXMCS: 0,
        SNR: 0,
        noise: 0,
        signal: 0,
        versionmm: false,
        enabled: EnableState.RED,
        lastChange: null,
        improved: false,
        warnings: [],
        radioConnected: false,
        radioConnectionQuality: "Good",
    },
    blue3: {
        number: 9997,
        ds: 0,
        radio: false,
        rio: false,
        code: false,
        bwu: 0,
        battery: 0,
        ping: 0,
        packets: 0,
        MAC: '00:00:00:00:00:00',
        RX: 0,
        RXMCS: 0,
        TX: 0,
        TXMCS: 0,
        SNR: 0,
        noise: 0,
        signal: 0,
        versionmm: false,
        enabled: EnableState.RED,
        lastChange: null,
        improved: false,
        warnings: [],
        radioConnected: true,
        radioConnectionQuality: "Good",
    },
    red1: {
        number: 9996,
        ds: 1,
        radio: true,
        rio: false,
        code: false,
        bwu: 0,
        battery: 0,
        ping: 0,
        packets: 0,
        MAC: '00:00:00:00:00:00',
        RX: 0,
        RXMCS: 0,
        TX: 0,
        TXMCS: 0,
        SNR: 0,
        noise: 0,
        signal: 0,
        versionmm: false,
        enabled: EnableState.RED,
        lastChange: null,
        improved: false,
        warnings: [],
        radioConnected: true,
        radioConnectionQuality: "Good",
    },
    red2: {
        number: 9995,
        ds: 1,
        radio: true,
        rio: true,
        code: false,
        bwu: 0,
        battery: 0,
        ping: 0,
        packets: 0,
        MAC: '00:00:00:00:00:00',
        RX: 0,
        RXMCS: 0,
        TX: 0,
        TXMCS: 0,
        SNR: 0,
        noise: 0,
        signal: 0,
        versionmm: false,
        enabled: EnableState.RED,
        lastChange: null,
        improved: false,
        warnings: [],
        radioConnected: false,
        radioConnectionQuality: "Good",
    },
    red3: {
        number: 9994,
        ds: 1,
        radio: true,
        rio: true,
        code: true,
        bwu: 0.5,
        battery: 12.5,
        ping: 10,
        packets: 12,
        MAC: '00:00:00:00:00:00',
        RX: 0,
        RXMCS: 0,
        TX: 0,
        TXMCS: 0,
        SNR: 0,
        noise: 0,
        signal: 0,
        versionmm: false,
        enabled: EnableState.RED,
        lastChange: null,
        improved: false,
        warnings: [],
        radioConnected: false,
        radioConnectionQuality: "Good",
    }
};
export const MCS_LOOKUP_TABLE: { [k: number]: number; } = {
    68.8: 0,
    137.6: 1,
    206.5: 2,
    275.3: 3,
    412.9: 4,
    550.6: 5,
    619.4: 6,
    688.2: 7,
    825.9: 8,
    917.6: 9,
    1032.4: 10,
    1147.1: 11
};
