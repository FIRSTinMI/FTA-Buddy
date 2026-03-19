// src/app/router.ts
import { createRouter } from "sv-router";

export const { p, navigate, isActive, preload, route } = createRouter({
	"/": () => import("./pages/Monitor.svelte"),

	// Main pages
	"/monitor": () => import("./pages/Monitor.svelte"),
	"/dashboard": () => import("./pages/EventDashboard.svelte"),
	"/event-reports": () => import("./pages/EventReport.svelte"),
	"/flashcards": () => import("./pages/Flashcards.svelte"),
	"/checklist": () => import("./pages/Checklist.svelte"),
	"/notifications": () => import("./pages/tickets-notes/NotificationList.svelte"),
	"/ftc": () => import("./pages/ftc/FTCStatus.svelte"),

	"/manage": () => import("./pages/management/Management.svelte"),
	"/manage/login": () => import("./pages/management/Login.svelte"),
	"/manage/host": () => import("./pages/management/Host.svelte"),
	"/manage/host/create": () => import("./pages/management/Host.svelte"),
	"/manage/event-settings": () => import("./pages/management/Host.svelte"),
	"/manage/kiosk": () => import("./pages/management/RadioKiosk.svelte"),
	"/manage/google-signup": () => import("./pages/management/CompleteGoogleSignup.svelte"),
	"/manage/meshed-event": () => import("./pages/management/MeshedEvent.svelte"),

	"/logs": () => import("./pages/match-logs/MatchLogsList.svelte"),
	"/logs/event/:eventCode/:matchid/:station": () => import("./pages/EventSwitchRedirect.svelte"),
	"/logs/event/:eventCode/:matchid": () => import("./pages/EventSwitchRedirect.svelte"),
	"/logs/:matchid": () => import("./pages/match-logs/MatchLog.svelte"),
	"/logs/:matchid/:station": () => import("./pages/match-logs/StationLog.svelte"),

	"/notepad": () => import("./pages/SupportBoard.svelte"),
	"/notepad/team/:team": () => import("./pages/tickets-notes/TeamHistory.svelte"),
	"/notepad/view/:eventCode/:id": () => import("./pages/EventSwitchRedirect.svelte"),
	"/notepad/view/:id": () => import("./pages/tickets-notes/ViewNote.svelte"),
	"/notepad/submit/:eventCode": () => import("./pages/tickets-notes/PublicNoteCreate.svelte"),

	"/references": () => import("./pages/references/Reference.svelte"),
	"/references/statuslights": () => import("./pages/references/StatusLights.svelte"),
	"/references/softwaredocs": () => import("./pages/references/SoftwareDocs.svelte"),
	"/references/wiringdiagrams": () => import("./pages/references/WiringDiagrams.svelte"),
	"/references/componentmanuals": () => import("./pages/references/ComponentManuals.svelte"),
	"/references/fieldmanuals": () => import("./pages/references/FieldManuals.svelte"),
});
