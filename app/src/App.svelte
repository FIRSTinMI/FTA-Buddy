<script lang="ts">
	import Icon from "@iconify/svelte";
	import {
		Button,
		CloseButton,
		Drawer,
		Indicator,
		Label,
		Modal,
		Select,
		Sidebar,
		SidebarGroup,
		SidebarItem,
		SidebarWrapper,
		Toast,
	} from "flowbite-svelte";
	import { Router as SvRouter } from "sv-router";
	import { onDestroy, onMount } from "svelte";
	import { get } from "svelte/store";
	import { formatTime } from "../../shared/formatTime";
	import SettingsModal from "./components/SettingsModal.svelte";
	import UpdateToast from "./components/UpdateToast.svelte";
	import WelcomeModal from "./components/WelcomeModal.svelte";
	import { trpc } from "./main";
	import { navigate, route } from "./router";
	import { eventStore } from "./stores/event";
	import { fullscreen } from "./stores/fullscreen";
	import { installPrompt } from "./stores/install-prompt";
	import { notificationsStore } from "./stores/notifications";
	import { settingsStore } from "./stores/settings";
	import { userStore as user } from "./stores/user";
	import { startNotificationSubscription, stopNotificationSubscription } from "./util/notifications";
	import { registerToast } from "./util/toast";
	import { update, VERSIONS } from "./util/updater";

	// On mount check if the user's permissions have changed
	onMount(async () => {
		console.info(
			`[AUTH] checkAuth on mount — token length: ${$user.token?.length ?? 0}, origin: ${window.location.origin}`,
		);

		try {
			const checkAuth = await trpc.user.checkAuth.query({
				token: $user.token,
				eventToken: $user.eventToken,
			});

			if (checkAuth.user) {
				console.info(`[AUTH] checkAuth OK — id: ${checkAuth.user.id}, username: ${checkAuth.user.username}`);
				user.set({
					...checkAuth.user,
					token: $user.token,
					eventToken: $user.eventToken,
					meshedEventToken: $user.meshedEventToken,
				});
			} else {
				// Server returned no user: token is invalid/expired — clear it.
				// Common causes: token from wrong environment (dev vs prod), session pruned, or
				// the v2.6.0 migration already cleared it on a previous boot.
				console.warn("[AUTH] checkAuth returned no user — clearing token. Origin:", window.location.origin);
				user.set({
					email: "",
					username: "",
					id: -1,
					token: "",
					eventToken: $user.eventToken,
					role: "FTA",
					admin: false,
				});
			}
		} catch (err: any) {
			// Network / server error — do NOT clear the token to avoid false logouts on flaky connections
			console.warn("[AUTH] checkAuth request failed (not clearing token):", err.message);
		}
	});

	const publicPaths = [
		"/",
		"/manage/login",
		"/manage/google-signup",
		"/manage/host",
		"/manage/event-created",
		"/manage/meshed-event",
		"/ftc",
		"/references",
		"/references/statuslights",
		"/references/componentmanuals",
		"/references/wiringdiagrams",
		"/references/softwaredocs",
		"/dashboard",
		"/manage/kiosk",
	];

	const eventTokenPaths = ["/monitor", "/checklist", "/logs"];

	const pageIsPublicLog = route.pathname.startsWith("/logs/") && route.pathname.split("/")[3].length == 36;
	const pageIsPublicNoteCreate = route.pathname.startsWith("/support/submit/");

	function redirectForAuth() {
		// if user has event token and is trying to access a page that requires an event token
		if ($user.eventToken && (eventTokenPaths.includes(route.pathname) || route.pathname.startsWith("/logs"))) {
			return;
		}

		if (!publicPaths.includes(route.pathname)) {
			//user trying to acces protected page
			if (!pageIsPublicLog && !pageIsPublicNoteCreate) {
				//page is not public log or public note creation page
				if (!$user.token || !$user.eventToken) {
					navigate("/manage/login"); //user is either not logged in or does not have event token
				}
				//user is logged in and has event token -- no redirect
			}
			//page is public log/public note creation page -- no tokens needed
		} else if (route.pathname == "/") {
			//user is accessing public path that is /
			if (!$user.eventToken) {
				navigate("/manage/login"); //user is missing event token
			}
			//user has event token -- no redirect
		}
	}

	onMount(() => {
		redirectForAuth();
		user.subscribe(() => {
			redirectForAuth();
		});
	});

	// Load settings

	let settings = get(settingsStore);
	settingsStore.subscribe((value) => {
		settings = value;
	});

	function updateTheme(darkMode: boolean) {
		if (darkMode) {
			document.documentElement.classList.add("dark");
		} else {
			document.documentElement.classList.remove("dark");
		}
	}

	$effect(() => {
		updateTheme(settings.darkMode);
	});

	// Settings modal

	let settingsOpen = $state(false);
	function openSettings() {
		settingsOpen = true;
	}

	// Version/changelog modal

	const version = Object.keys(VERSIONS).sort().pop() || "0";
	let changelogOpen = $state(false);
	let changelog = $state("");
	function openChangelog(text: string) {
		changelog = text;
		changelogOpen = true;
	}

	function openFullChangelog() {
		for (let version in VERSIONS) {
			changelog += VERSIONS[version as keyof typeof VERSIONS].changelog;
		}
		changelogOpen = true;
	}

	// Welcome modal

	let welcomeOpen = $state(false);
	function openWelcome() {
		welcomeOpen = true;
	}

	// Update checking

	update(settings.version, version, openWelcome, openChangelog, pageIsPublicLog || pageIsPublicNoteCreate);

	// Toast manager

	let showToast = $state(false);
	let toastTitle = $state("");
	let toastText = $state("");
	let toastColor = $state("red-500");
	function toast(title: string, text: string, color = "red-500", timeout = 5000) {
		toastTitle = title;
		toastText = text;
		toastColor = color;
		showToast = true;
		if (timeout < 0) return;
		setTimeout(() => {
			showToast = false;
		}, timeout);
	}

	registerToast(toast);

	const toastColorClasses: Record<string, string> = {
		"red-500": "bg-red-200 dark:bg-red-700 text-red-950 dark:text-red-100",
		"green-500": "bg-green-200 dark:bg-green-700 text-green-950 dark:text-green-100",
	};

	// Auto update

	let showUpdateToast = $state(false);
	let updateNewVersion = $state("");
	let versionPollInterval: ReturnType<typeof setInterval> | undefined;
	async function checkVersion() {
		const data = await trpc.app.version.query();
		if (data !== settings.version) {
			console.log("New version available");
			updateNewVersion = data;
			showUpdateToast = true;
		}
	}
	onMount(() => {
		checkVersion();
		versionPollInterval = setInterval(checkVersion, 60_000);
		// Subscription is now driven by the $effect below — no need to start it here.
	});
	onDestroy(() => {
		clearInterval(versionPollInterval);
	});

	// Reactively start/stop the notification SSE subscription when the auth token changes.
	// Using queueMicrotask so the store write fully settles before we open the connection.
	// This prevents "No token provided" / "User not found" errors that occur when the
	// subscription is opened against a stale (empty) token during a store transition.
	$effect(() => {
		const token = $user.token;
		const wantsNotifications = settings.notifications;

		if (token && wantsNotifications) {
			// Defer to next microtask so any in-flight store updates complete first
			queueMicrotask(() => {
				console.info(`[PUSH] App effect: starting subscription (token length: ${token.length})`);
				startNotificationSubscription();
			});
		} else {
			stopNotificationSubscription();
		}
	});

	// App install prompt

	window.addEventListener("beforeinstallprompt", (event) => {
		event.preventDefault();
		installPrompt.set(event);
	});

	window.addEventListener("appinstalled", () => {
		installPrompt.set(null);
	});

	let event = $state(get(eventStore));
	eventStore.subscribe((value) => {
		event = value;
	});

	let drawerOpen = $state(false);
	function openMenu() {
		drawerOpen = true;
	}

	let multiEventSelection = $state("combined");
	if ($user.meshedEventToken === $user.eventToken) {
		multiEventSelection = "combined";
	} else {
		multiEventSelection = $eventStore.code;
	}

	onMount(() => {
		if ($user.token && route.pathname === "/") {
			if ($user.role === "FTA" || $user.role === "FTAA") {
				if ($user.meshedEventToken && event && event.subEvents && $user.eventToken === $user.meshedEventToken) {
					navigate("/dashboard");
				} else {
					navigate("/monitor");
				}
			} else if ($user.role === "CSA" || $user.role === "RI") {
				navigate("/support");
			}
		}
	});

	let statusPollInterval: ReturnType<typeof setInterval> | undefined;
	let knownIssue = false;
	async function checkStatus() {
		const data = await trpc.app.status.query();
		if (
			data.current &&
			(!event.code || data.effectedEvents.includes(event.code) || data.effectedEvents.length < 1)
		) {
			if (!knownIssue) {
				toast("Issue", data.message + " Started " + formatTime(data.startTime || new Date()), "red-500", -1);
			}
			knownIssue = true;
		} else {
			if (knownIssue) {
				toast("Resolved", "The issue has been resolved", "green-500");
			}
			knownIssue = false;
		}
	}

	onMount(() => {
		checkStatus();
		statusPollInterval = setInterval(checkStatus, 60_000);
	});
	onDestroy(() => {
		clearInterval(statusPollInterval);
	});
</script>

{#if showToast}
	<div class="fixed bottom-0 left-0 p-4 z-100">
		<Toast
			class={`w-lg p-4 shadow-sm gap-3 ${toastColorClasses[toastColor] ?? "bg-white dark:bg-gray-800 text-black dark:text-gray-400"}`}
		>
			<h3 class="text-lg font-bold text-left">{toastTitle}</h3>
			<p class="text-left">{toastText}</p>
		</Toast>
	</div>
{/if}

<UpdateToast show={showUpdateToast} newVersion={updateNewVersion} />

<WelcomeModal
	bind:welcomeOpen
	openChangelog={() => {
		welcomeOpen = false;
		openFullChangelog();
	}}
	closeModal={() => {
		welcomeOpen = false;
	}}
/>

<Modal bind:open={changelogOpen} dismissable autoclose outsideclose>
	{#snippet header()}
		<h1 class="text-2xl font-bold">Changelog</h1>
	{/snippet}
	<div bind:innerHTML={changelog} contenteditable class="text-left text-black dark:text-white"></div>
	{#snippet footer()}
		<Button color="primary">Close</Button>
	{/snippet}
</Modal>

<SettingsModal bind:settingsOpen />

<Drawer bind:open={drawerOpen} id="sidebar" class="bg-neutral-200 p-0" dismissable={false}>
	<div class="flex items-center justify-between px-4 pt-3 pb-1">
		<h5 id="drawer-navigation-label-3" class="text-base font-semibold text-black uppercase dark:text-gray-400">
			Menu
		</h5>
		<CloseButton onclick={() => (drawerOpen = false)} class="text-black dark:text-white" />
	</div>
	{#if $user.meshedEventToken && event.subEvents}
		<Label class="text-left px-4 pb-2 block">
			Event Selection
			<Select
				bind:value={multiEventSelection}
				items={[
					{ value: "combined", name: "Combined" },
					...event.subEvents.map((e) => ({ value: e.code, name: e.label })),
				]}
				class="w-full"
				onchange={() => {
					if (multiEventSelection === "combined") {
						user.set({
							...$user,
							eventToken: $user.meshedEventToken ?? "",
						});
						eventStore.set({ ...event, code: event.meshedEventCode ?? "", label: "Combined" });
						if (route.pathname.startsWith("/monitor")) {
							navigate("/dashboard");
						}
					} else {
						user.set({
							...$user,
							eventToken: event.subEvents?.find((e) => e.code === multiEventSelection)?.token ?? "",
						});
						eventStore.set({ ...event, ...event.subEvents?.find((e) => e.code === multiEventSelection) });
						if (route.pathname.startsWith("/dashboard")) {
							navigate("/monitor");
						} else if (route.pathname.startsWith("/monitor")) {
							window.location.reload();
						}
					}
				}}
			/>
		</Label>
	{/if}
	<Sidebar alwaysOpen={true} position="static" class="w-full" classes={{ div: "overflow-y-auto" }}>
		<SidebarWrapper class="rounded-sm py-4 dark:bg-gray-800">
			{#if $user.token && $user.eventToken}
				<SidebarGroup>
					<SidebarItem
						label="Monitor"
						onclick={() => {
							drawerOpen = false;
							navigate("/");
						}}
					>
						{#snippet icon()}
							<Icon icon="mdi:television" class="size-8" />
						{/snippet}
					</SidebarItem>
					<SidebarItem
						label="Support Board"
						onclick={() => {
							drawerOpen = false;
							navigate("/support");
						}}
					>
						{#snippet icon()}
							<Icon icon="mdi:view-dashboard" class="size-8" />
						{/snippet}
					</SidebarItem>
					<SidebarItem
						label="Match Logs"
						onclick={() => {
							drawerOpen = false;
							navigate("/logs");
						}}
					>
						{#snippet icon()}
							<Icon icon="uil:file-graph" class="size-8" />
						{/snippet}
					</SidebarItem>
					<SidebarItem
						label="Flashcards"
						onclick={() => {
							drawerOpen = false;
							navigate("/flashcards");
						}}
					>
						{#snippet icon()}
							<Icon icon="mdi:message-alert" class="size-8" />
						{/snippet}
					</SidebarItem>
					<SidebarItem
						label="Checklist"
						onclick={() => {
							drawerOpen = false;
							navigate("/checklist");
						}}
					>
						{#snippet icon()}
							<Icon icon="mdi:clipboard-outline" class="size-8" />
						{/snippet}
					</SidebarItem>
					<SidebarItem
						label="Event Reports"
						onclick={() => {
							drawerOpen = false;
							navigate("/event-reports");
						}}
					>
						{#snippet icon()}
							<Icon icon="mdi:file-document-outline" class="size-8" />
						{/snippet}
					</SidebarItem>
					<SidebarItem
						label="My Notifications"
						onclick={() => {
							drawerOpen = false;
							navigate("/notifications");
						}}
					>
						{#snippet icon()}
							<Icon icon="fluent:alert-on-16-filled" class="size-8" />
						{/snippet}
						{#if $notificationsStore.length > 0}
							<Indicator color="red" border size="xl" placement="top-left">
								<span
									class="text-white
								text-xs">{$notificationsStore.length}</span
								>
							</Indicator>
						{/if}
					</SidebarItem>
				</SidebarGroup>
			{:else if $user.eventToken}
				<SidebarGroup>
					<SidebarItem
						label="Monitor"
						onclick={() => {
							drawerOpen = false;
							navigate("/");
						}}
					>
						{#snippet icon()}
							<Icon icon="mdi:television" class="size-8" />
						{/snippet}
					</SidebarItem>
					<SidebarItem
						label="Match Logs"
						onclick={() => {
							drawerOpen = false;
							navigate("/logs");
						}}
					>
						{#snippet icon()}
							<Icon icon="uil:file-graph" class="size-8" />
						{/snippet}
					</SidebarItem>
					<SidebarItem
						label="Checklist"
						onclick={() => {
							drawerOpen = false;
							navigate("/checklist");
						}}
					>
						{#snippet icon()}
							<Icon icon="mdi:clipboard-outline" class="size-8" />
						{/snippet}
					</SidebarItem>
				</SidebarGroup>
			{/if}
			<SidebarGroup class="border-t-2 mt-2 pt-2 border-neutral-400">
				<SidebarItem
					label="Change Event/Account"
					class="text-sm"
					onclick={() => {
						drawerOpen = false;
						navigate("/manage/login");
					}}
				>
					{#snippet icon()}
						<Icon icon="mdi:account-switch" class="size-8" />
					{/snippet}
				</SidebarItem>
				<SidebarItem
					label="References"
					onclick={() => {
						drawerOpen = false;
						navigate("/references");
					}}
				>
					{#snippet icon()}
						<Icon icon="mdi:file-document" class="size-8" />
					{/snippet}
				</SidebarItem>
				<SidebarItem
					label="Status Lights"
					onclick={() => {
						drawerOpen = false;
						navigate("/references/statuslights");
					}}
					class="text-xs ml-8 pt-1 pb-1"
				>
					{#snippet icon()}
						<Icon icon="heroicons:sun-16-solid" class="size-6" />
					{/snippet}
				</SidebarItem>
				<SidebarItem
					label="Part Manuals"
					onclick={() => {
						drawerOpen = false;
						navigate("/references/componentmanuals");
					}}
					class="text-xs ml-8 pt-1 pb-1"
				>
					{#snippet icon()}
						<Icon icon="streamline:manual-book-solid" class="size-6" />
					{/snippet}
				</SidebarItem>
				<SidebarItem
					label="Wiring Diagrams"
					onclick={() => {
						drawerOpen = false;
						navigate("/references/wiringdiagrams");
					}}
					class="text-xs ml-8 pt-1 pb-1"
				>
					{#snippet icon()}
						<Icon icon="fa6-solid:chart-diagram" class="size-6" />
					{/snippet}
				</SidebarItem>
				<SidebarItem
					label="Software Docs"
					onclick={() => {
						drawerOpen = false;
						navigate("/references/softwaredocs");
					}}
					class="text-xs ml-8 pt-1 pb-1"
				>
					{#snippet icon()}
						<Icon icon="ion:library" class="size-6" />
					{/snippet}
				</SidebarItem>
				<SidebarItem
					label="Field Manuals"
					onclick={() => {
						drawerOpen = false;
						navigate("/references/fieldmanuals");
					}}
					class="text-xs ml-8 pt-1 pb-1"
				>
					{#snippet icon()}
						<Icon icon="mdi:package" class="size-6" />
					{/snippet}
				</SidebarItem>
				<SidebarItem
					label="Event Dashboard"
					class="text-sm"
					onclick={() => {
						drawerOpen = false;
						navigate("/dashboard");
					}}
				>
					{#snippet icon()}
						<Icon icon="mdi:television-guide" class="size-8" />
					{/snippet}
				</SidebarItem>
				<SidebarItem
					label="FTC Event Dashboard"
					class="text-sm"
					onclick={() => {
						drawerOpen = false;
						navigate("/ftc");
					}}
				>
					{#snippet icon()}
						<Icon icon="mdi:television-guide" class="size-8" />
					{/snippet}
				</SidebarItem>
				<SidebarItem
					label="Settings"
					class="text-sm"
					onclick={(evt) => {
						evt.preventDefault();
						drawerOpen = false;
						openSettings();
					}}
				>
					{#snippet icon()}
						<Icon icon="mdi:cog" class="size-8" />
					{/snippet}
				</SidebarItem>
				<SidebarItem
					label="Help"
					class="text-sm"
					onclick={(evt) => {
						evt.preventDefault();
						drawerOpen = false;
						openWelcome();
					}}
				>
					{#snippet icon()}
						<Icon icon="mdi:information" class="size-8" />
					{/snippet}
				</SidebarItem>
			</SidebarGroup>
		</SidebarWrapper>
	</Sidebar>
</Drawer>

<!-- App.svelte -->
<main class="bg-white dark:bg-neutral-800 w-screen h-dvh flex flex-col overflow-hidden">
	<div
		class="bg-primary-700 dark:bg-primary-500 flex w-full justify-between px-2 {$fullscreen
			? 'hidden collapse'
			: ''}"
	>
		<button class="py-0 px-0 text-white" onclick={openMenu}>
			<Icon icon="mdi:menu" class="w-8 h-10" />
		</button>
		<div class="grow mr-12">
			{#if $user.token && $user.eventToken}
				<h1 class="text-white text-lg place-content-center pt-1 font-bold">{event.label ?? event.code}</h1>
			{/if}
		</div>
	</div>

	<div class="flex-1 min-h-0 overflow-y-auto">
		<SvRouter />
	</div>

	<div
		class="shrink-0 flex justify-around py-2 bg-neutral-900 dark:bg-neutral-700 text-white {$fullscreen &&
			'bg-white dark:bg-neutral-800'}"
	>
		{#if $user.token && $user.eventToken && !$fullscreen}
			{#if $user?.role === "FTA" || $user?.role === "FTAA"}
				<button class="p-2" onclick={() => navigate("/monitor")}>
					<Icon icon="mdi:television" class="size-8" />
				</button>
				<button class="p-2" onclick={() => navigate("/flashcards")}>
					<Icon icon="mdi:message-alert" class="size-8" />
				</button>
				<button class="p-2" onclick={() => navigate("/references")}>
					<Icon icon="mdi:file-document-outline" class="size-8" />
				</button>
				<button class="p-2 relative" onclick={() => navigate("/notifications")}>
					<Icon icon="fluent:alert-on-16-filled" class="size-8" />
					{#if $notificationsStore.length > 0}
						<Indicator color="red" border size="xl" placement="top-left">
							<span class="text-white text-xs">{$notificationsStore.length}</span>
						</Indicator>
					{/if}
				</button>
			{:else if $user?.role === "CSA" || $user?.role === "RI"}
				<button class="p-2" onclick={() => navigate("/support")}>
					<Icon icon="mdi:view-dashboard" class="size-8" />
				</button>
				<button class="p-2" onclick={() => navigate("/references/statuslights")}>
					<Icon icon="heroicons:sun-16-solid" class="size-8" />
				</button>
				<button class="p-2" onclick={() => navigate("/references/softwaredocs")}>
					<Icon icon="mdi:file-document-outline" class="size-8" />
				</button>
				<button class="p-2 relative" onclick={() => navigate("/notifications")}>
					<Icon icon="fluent:alert-on-16-filled" class="size-8" />
					{#if $notificationsStore.length > 0}
						<Indicator color="red" border size="xl" placement="top-left">
							<span class="text-white text-xs">{$notificationsStore.length}</span>
						</Indicator>
					{/if}
				</button>
			{/if}
		{/if}
	</div>
</main>
