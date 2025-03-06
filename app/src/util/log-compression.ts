import { decompressSync } from "fflate";
import type { FMSLogFrame } from "../../../shared/types";

export function decompressStationLog(compressed: string) {
    const dec = new TextDecoder();
    const buf = Uint8Array.from(atob(compressed), c => c.charCodeAt(0));
    const decompressed = decompressSync(buf);
    return JSON.parse(dec.decode(decompressed)) as FMSLogFrame[];
}
