import { writable } from "svelte/store";

export const fullscreen = writable(window.outerWidth > 1900 ? window.innerHeight === 1080 : false);

const updateFullscreen = () => {
	if (window.outerWidth > 1900) {
		fullscreen.set(window.innerHeight === 1080);
	} else {
		fullscreen.set(false);
	}
};

window.addEventListener("resize", updateFullscreen);
window.addEventListener("fullscreenchange", updateFullscreen);

updateFullscreen();
