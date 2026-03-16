import { writable } from "svelte/store";

function getBrowserFullscreenStatus(): boolean {
	return !!(
		document.fullscreenElement ||
		(document as any).webkitFullscreenElement ||
		(document as any).mozFullScreenElement ||
		(document as any).webkitIsFullScreen ||
		window.innerHeight === screen.height
	);
}

export const fullscreen = writable(getBrowserFullscreenStatus());

const updateFullscreen = () => {
	fullscreen.set(getBrowserFullscreenStatus());
};

// Standard + vendor-prefixed fullscreen change events (Chrome, Edge, Firefox, Safari)
document.addEventListener("fullscreenchange", updateFullscreen);
document.addEventListener("webkitfullscreenchange", updateFullscreen);
document.addEventListener("mozfullscreenchange", updateFullscreen);
document.addEventListener("MSFullscreenChange", updateFullscreen);

// Fallback for F11 fullscreen where the Fullscreen API is not used
window.addEventListener("resize", updateFullscreen);
