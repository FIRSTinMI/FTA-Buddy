// chezyUrls.ts
export const CHEZY_HOST = "10.0.100.5:8080";

export type ChezyParams = {
    displayId: number;
    ds: boolean;
    fta: boolean;
    reversed: boolean;
    key?: string; // if your field requires a key
};

export const defaultChezyParams: ChezyParams = {
    displayId: 105,
    ds: false,
    fta: true,
    reversed: false,
};

function qs(p: ChezyParams) {
    const usp = new URLSearchParams();
    usp.set("displayId", String(p.displayId));
    usp.set("ds", String(p.ds));
    usp.set("fta", String(p.fta));
    usp.set("reversed", String(p.reversed));
    if (p.key) usp.set("key", p.key);
    return usp.toString();
}

export function chezyPageURL(host = CHEZY_HOST, p: ChezyParams = defaultChezyParams) {
    return `http://${host}/displays/field_monitor?${qs(p)}`;
}

export function chezyWsURL(host = CHEZY_HOST, p: ChezyParams = defaultChezyParams) {
    return `ws://${host}/displays/field_monitor/websocket?${qs(p)}`;
}
