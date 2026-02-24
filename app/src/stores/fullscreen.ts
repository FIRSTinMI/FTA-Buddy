import { writable } from "svelte/store";

export const fullscreen = writable(window.outerWidth > 1900 ? window.innerHeight === 1080 : false);
setInterval(() => {
	if (window.outerWidth > 1900) fullscreenStore.set(window.innerHeight === 1080);
}, 200);
