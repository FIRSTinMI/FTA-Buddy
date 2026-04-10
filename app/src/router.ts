// src/app/router.ts
import { createRouter } from "sv-router";

function lazy<T>(importFn: () => Promise<T>): () => Promise<T> {
	return () =>
		importFn()
			.then((mod) => {
				sessionStorage.removeItem("chunk-reload");
				return mod;
			})
			.catch((err: unknown) => {
				const msg = (err as Error)?.message ?? "";
				if (msg.includes("Failed to fetch dynamically imported module") || msg.includes("error loading dynamically imported module")) {
					if (!sessionStorage.getItem("chunk-reload")) {
						sessionStorage.setItem("chunk-reload", "true");
						window.location.reload();
					}
				}
				throw err;
			});
}

export const { p, navigate, isActive, preload, route } = createRouter({
	"/": lazy(() => import("./pages/Monitor.svelte")),

	// Main pages
	"/monitor": lazy(() => import("./pages/Monitor.svelte")),
	"/dashboard": lazy(() => import("./pages/EventDashboard.svelte")),
	"/event-reports": lazy(() => import("./pages/EventReport.svelte")),
	"/flashcards": lazy(() => import("./pages/Flashcards.svelte")),
	"/checklist": lazy(() => import("./pages/Checklist.svelte")),
	"/notifications": lazy(() => import("./pages/tickets-notes/NotificationList.svelte")),
	"/ftc": lazy(() => import("./pages/ftc/FTCStatus.svelte")),

	"/manage": lazy(() => import("./pages/management/Management.svelte")),
	"/manage/login": lazy(() => import("./pages/management/Login.svelte")),
	"/manage/host": lazy(() => import("./pages/management/Host.svelte")),
	"/manage/host/create": lazy(() => import("./pages/management/Host.svelte")),
	"/manage/event-settings": lazy(() => import("./pages/management/Host.svelte")),
	"/manage/kiosk": lazy(() => import("./pages/management/RadioKiosk.svelte")),
	"/manage/google-signup": lazy(() => import("./pages/management/CompleteGoogleSignup.svelte")),
	"/manage/meshed-event": lazy(() => import("./pages/management/MeshedEvent.svelte")),
	"/join/:token": lazy(() => import("./pages/management/JoinByLink.svelte")),

	"/logs": lazy(() => import("./pages/match-logs/MatchLogsList.svelte")),
	"/logs/event/:eventCode/:matchid/:station": lazy(() => import("./pages/EventSwitchRedirect.svelte")),
	"/logs/event/:eventCode/:matchid": lazy(() => import("./pages/EventSwitchRedirect.svelte")),
	"/logs/:matchid": lazy(() => import("./pages/match-logs/MatchLog.svelte")),
	"/logs/:matchid/:station": lazy(() => import("./pages/match-logs/StationLog.svelte")),

	"/notepad": lazy(() => import("./pages/SupportBoard.svelte")),
	"/notepad/team/:team": lazy(() => import("./pages/tickets-notes/TeamHistory.svelte")),
	"/notepad/view/:eventCode/:id": lazy(() => import("./pages/EventSwitchRedirect.svelte")),
	"/notepad/view/:id": lazy(() => import("./pages/tickets-notes/ViewNote.svelte")),
	"/notepad/submit/:eventCode": lazy(() => import("./pages/tickets-notes/PublicNoteCreate.svelte")),

	"/references": lazy(() => import("./pages/references/Reference.svelte")),
	"/references/statuslights": lazy(() => import("./pages/references/StatusLights.svelte")),
	"/references/softwaredocs": lazy(() => import("./pages/references/SoftwareDocs.svelte")),
	"/references/wiringdiagrams": lazy(() => import("./pages/references/WiringDiagrams.svelte")),
	"/references/componentmanuals": lazy(() => import("./pages/references/ComponentManuals.svelte")),
	"/references/fieldmanuals": lazy(() => import("./pages/references/FieldManuals.svelte")),
});
