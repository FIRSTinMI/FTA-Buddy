/**
 * fieldmonitor.ts - FTA Buddy FieldMonitor Tampermonkey userscript entry point.
 *
 * Standalone: reads live data from the FMS FieldMonitor Angular component
 * (ng.getComponent) and renders an FTA Buddy-style 9-column grid.
 * No external server connections required.
 *
 * A small toggle button (FTA Buddy logo) is always injected into the page.
 * The overlay is only activated when sessionStorage has the 'ftabuddy' key.
 * The ?ftabuddy=1 query param is set cosmetically (address bar visibility),
 * but sessionStorage is the reliable source because Angular strips unknown
 * query params during its router initialization before our script runs.
 */

import { CSS } from "./styles";
import { buildFrame, isAppReady } from "./angular";
import { makeFrameHistory, updateHistory } from "./history";
import { buildRoot, updateAll, makeFullscreenBtn } from "./ui";
import logoDataUrl from "./logo-192.png";

const STORAGE_KEY = "ftabuddy";
const FTA_MODE = localStorage.getItem(STORAGE_KEY) === "1";

function injectStyles(): void {
	const style = document.createElement("style");
	style.id = "fta-buddy-styles";
	style.textContent = CSS;
	document.head.appendChild(style);
}

function setPageMeta(): void {
	document.title = "FMS - FTA Buddy";

	document.querySelectorAll("link[rel~='icon']").forEach(el => el.remove());

	const link = document.createElement("link");
	link.rel = "icon";
	link.type = "image/png";
	link.href = logoDataUrl;
	document.head.appendChild(link);
}

function makeToggleBtn(): HTMLButtonElement {
	const btn = document.createElement("button");
	btn.id = "fb-toggle-btn";

	if (FTA_MODE) {
		btn.classList.add("fta-active");
		btn.title = "Switch to FMS native view";
		btn.textContent = "← FMS";
	} else {
		btn.title = "Switch to FTA Buddy view";
		const img = document.createElement("img");
		img.src = logoDataUrl;
		img.alt = "FTA Buddy";
		btn.appendChild(img);
	}

	btn.addEventListener("click", () => {
		if (FTA_MODE) {
			localStorage.removeItem(STORAGE_KEY);
		} else {
			localStorage.setItem(STORAGE_KEY, "1");
		}
		location.reload();
	});

	return btn;
}

function hideAngularUI(): void {
	// Hide Angular app but don't remove it - Angular keeps running so
	// ng.getComponent() continues to return live data.
	for (const child of Array.from(document.body.children)) {
		const el = child as HTMLElement;
		if (el.id !== "fta-buddy-root" && el.id !== "fb-controls") el.style.display = "none";
	}
}

function waitForApp(callback: () => void, attempts = 0): void {
	if (attempts === 0) console.log("[FTA Buddy] Waiting for Angular app...", { readyState: document.readyState, body: !!document.body });
	if (isAppReady()) {
		console.log("[FTA Buddy] App ready after", attempts, "attempts");
		callback();
	} else if (attempts < 60) {
		if (attempts % 5 === 0) console.log("[FTA Buddy] Still waiting... attempt", attempts, "| field-monitor-simple:", !!document.querySelector("field-monitor-simple"), "| .content-container-small:", !!document.querySelector(".content-container-small"));
		setTimeout(() => waitForApp(callback, attempts + 1), 500);
	} else {
		console.warn("[FTA Buddy] FieldMonitor did not load after 30s - giving up");
	}
}

function boot(): void {
	console.log("[FTA Buddy] boot() called, readyState:", document.readyState, "FTA_MODE:", FTA_MODE);
	injectStyles();

	// Always inject the controls column (toggle + fullscreen) so users can switch between views
	const controls = document.createElement("div");
	controls.id = "fb-controls";
	controls.appendChild(makeToggleBtn());
	controls.appendChild(makeFullscreenBtn());
	document.body.appendChild(controls);

	if (!FTA_MODE) {
		console.log("[FTA Buddy] Not in FTA mode - toggle button injected, waiting for user action");
		return;
	}

	// FTA_MODE active - reflect state in URL (cosmetic only, not used for detection)
	if (!new URLSearchParams(location.search).has("ftabuddy")) {
		const url = new URL(location.href);
		url.searchParams.set("ftabuddy", "1");
		history.replaceState({}, "", url.toString());
	}

	// FTA_MODE active - build the full overlay
	setPageMeta();

	waitForApp(() => {
		console.log("[FTA Buddy] Building overlay...");

		const els = buildRoot();
		document.body.appendChild(els.root);
		hideAngularUI();
		console.log("[FTA Buddy] Overlay injected into DOM");

		const history = makeFrameHistory();

		// Render immediately
		const firstFrame = buildFrame();
		console.log("[FTA Buddy] First frame:", firstFrame ? "OK" : "null");
		if (firstFrame) {
			updateHistory(history, firstFrame);
			updateAll(els, firstFrame, history);
		}

		// MutationObserver with setTimeout(0) debounce - coalesces Angular's
		// multiple DOM changes per change-detection cycle into one render.
		let debounceTimer: ReturnType<typeof setTimeout> | null = null;
		let frameCount = 0;
		const observer = new MutationObserver(() => {
			if (debounceTimer !== null) clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				debounceTimer = null;
				const frame = buildFrame();
				if (!frame) return;
				frameCount++;
				if (frameCount <= 5 || frameCount % 50 === 0) console.log("[FTA Buddy] Frame #" + frameCount, "field:", frame.field, "blue1:", frame.blue1?.number);
				updateHistory(history, frame);
				updateAll(els, frame, history);
			}, 0);
		});

		const target = document.querySelector("field-monitor-simple") ?? document.body;
		console.log("[FTA Buddy] Observing:", target.tagName);
		observer.observe(target, {
			subtree: true,
			childList: true,
			characterData: true,
			attributes: true,
		});

		// Tick every second to keep lastChange relative times current
		setInterval(() => {
			const frame = buildFrame();
			if (!frame) return;
			updateHistory(history, frame);
			updateAll(els, frame, history);
		}, 1_000);
	});
}

console.log("[FTA Buddy] Script loaded, readyState:", document.readyState);
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", boot);
} else {
	boot();
}
