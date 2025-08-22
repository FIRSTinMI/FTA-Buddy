// chezyHandshake.ts
import { CHEZY_HOST, chezyPageURL } from "./chezyUrls";

export async function ensureChezySession(pageUrl = chezyPageURL(CHEZY_HOST)) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 1500);
    try {
        await fetch(pageUrl, {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
        });
    } catch (e) {
        console.warn("ensureChezySession:", e);
    } finally {
        clearTimeout(t);
    }
}

export function installChezyOriginHeaderHack(host = CHEZY_HOST, refererUrl = chezyPageURL(CHEZY_HOST)) {
    const urls = [`http://${host}/*`, `ws://${host}/*`];

    const listener = (details: chrome.webRequest.WebRequestHeadersDetails) => {
        const headers = details.requestHeaders || [];
        const lo = (s: string) => s.toLowerCase();

        const originValue = `http://${host}`;
        const refererValue = refererUrl;

        let origin = headers.find(h => lo(h.name) === "origin");
        if (origin) origin.value = originValue; else headers.push({ name: "Origin", value: originValue });

        let referer = headers.find(h => lo(h.name) === "referer");
        if (referer) referer.value = refererValue; else headers.push({ name: "Referer", value: refererValue });

        return { requestHeaders: headers };
    };

    // Safe re-register
    try { chrome.webRequest.onBeforeSendHeaders.removeListener(listener as any); } catch { }

    chrome.webRequest.onBeforeSendHeaders.addListener(
        listener,
        { urls, types: ["other", "xmlhttprequest"] },
        ["blocking", "requestHeaders", "extraHeaders"]
    );
}
