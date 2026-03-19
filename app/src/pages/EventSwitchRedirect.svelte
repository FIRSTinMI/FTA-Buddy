<script lang="ts">
	import { get } from "svelte/store";
	import { onMount } from "svelte";
	import EventJoinPrompt from "../components/EventJoinPrompt.svelte";
	import Spinner from "../components/Spinner.svelte";
	import { navigate, route } from "../router";
	import { eventStore } from "../stores/event";
	import { userStore } from "../stores/user";
	import { savedEventsStore } from "../stores/savedEvents";

	// Extract route params - this component serves 3 routes, try each pattern
	function getRouteParams() {
		try {
			const p = route.getParams("/notepad/view/:eventCode/:id");
			if (p.eventCode) return { eventCode: p.eventCode, id: p.id, matchid: undefined, station: undefined };
		} catch {}
		try {
			const p = route.getParams("/logs/event/:eventCode/:matchid/:station");
			if (p.eventCode) return { eventCode: p.eventCode, id: undefined, matchid: p.matchid, station: p.station };
		} catch {}
		try {
			const p = route.getParams("/logs/event/:eventCode/:matchid");
			if (p.eventCode) return { eventCode: p.eventCode, id: undefined, matchid: p.matchid, station: undefined };
		} catch {}
		return { eventCode: undefined, id: undefined, matchid: undefined, station: undefined };
	}

	const { eventCode, id, matchid, station } = getRouteParams();

	// Build the target path (event-code-less equivalent)
	const redirectPath: string = (() => {
		if (id) return `/notepad/view/${id}`;
		if (matchid && station) return `/logs/${matchid}/${station}`;
		if (matchid) return `/logs/${matchid}`;
		return "/";
	})();

	let showPrompt = $state(false);

	onMount(() => {
		const user = get(userStore);
		const event = get(eventStore);
		const saved = get(savedEventsStore);

		if (!eventCode) {
			console.warn("[EventSwitchRedirect] eventCode prop is undefined. Props:", {
				eventCode,
				id,
				matchid,
				station,
			});
			console.warn("[EventSwitchRedirect] Falling back to redirectPath:", redirectPath);
			navigate(redirectPath as any, { replace: true });
			return;
		}

		const normalizedCode = eventCode.toLowerCase();

		// Already on the right event - just redirect
		if (event.code?.toLowerCase() === normalizedCode) {
			navigate(redirectPath as any, { replace: true });
			return;
		}

		// Check if eventCode is a sub-event of the currently loaded meshed event
		if (event.subEvents) {
			const subEvent = event.subEvents.find((e) => e.code.toLowerCase() === normalizedCode);
			if (subEvent) {
				userStore.update((u) => ({ ...u, eventToken: subEvent.token }));
				eventStore.set({ ...event, ...subEvent });
				navigate(redirectPath as any, { replace: true });
				return;
			}
		}

		// We have a saved token for this event - restore silently and redirect
		const savedEntry =
			saved[normalizedCode] ?? Object.values(saved).find((e) => e.code.toLowerCase() === normalizedCode);
		if (savedEntry) {
			if (savedEntry.subEvents) {
				userStore.update((u) => ({
					...u,
					eventToken: savedEntry.token,
					meshedEventToken: savedEntry.token,
				}));
				eventStore.set({
					code: savedEntry.code,
					pin: savedEntry.pin,
					teams: savedEntry.teams,
					users: savedEntry.users,
					subEvents: savedEntry.subEvents,
					meshedEventCode: savedEntry.meshedEventCode,
					label: savedEntry.label,
				});
			} else {
				userStore.update((u) => ({ ...u, eventToken: savedEntry.token, meshedEventToken: undefined }));
				eventStore.set({
					code: savedEntry.code,
					pin: savedEntry.pin,
					teams: savedEntry.teams,
					users: savedEntry.users,
					label: savedEntry.label,
				});
			}
			navigate(redirectPath as any, { replace: true });
			return;
		}

		// Check if eventCode is a sub-event of any saved meshed event
		for (const savedEvent of Object.values(saved)) {
			if (!savedEvent.subEvents) continue;
			const subEvent = savedEvent.subEvents.find((e) => e.code.toLowerCase() === normalizedCode);
			if (subEvent) {
				// Restore the parent meshed event, then switch to the specific sub-event
				userStore.update((u) => ({
					...u,
					eventToken: subEvent.token,
					meshedEventToken: savedEvent.token,
				}));
				eventStore.set({
					code: subEvent.code,
					pin: subEvent.pin,
					teams: subEvent.teams,
					users: savedEvent.users,
					subEvents: savedEvent.subEvents,
					meshedEventCode: savedEvent.meshedEventCode,
					label: subEvent.label,
				});
				navigate(redirectPath as any, { replace: true });
				return;
			}
		}

		// No saved entry. If user has a personal account token, show the inline PIN prompt.
		if (user.token) {
			showPrompt = true;
			return;
		}

		// Not logged in at all - send them to login and come back after
		// Store the full event-scoped URL so after login we re-enter this redirect
		// component, which will then handle the event switch before forwarding on.
		sessionStorage.setItem("redirectAfterLogin", window.location.pathname);
		navigate("/manage/login");
	});
</script>

{#if showPrompt}
	<EventJoinPrompt eventCode={eventCode!} onSuccess={() => navigate(redirectPath as any, { replace: true })} />
{:else}
	<Spinner />
{/if}
