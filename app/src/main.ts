import "./app.pcss";
import App from "./App.svelte";

const app = new App({
    target: document.getElementById("app"),
});

export default app;

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register("/app/serviceworker.js");
}
