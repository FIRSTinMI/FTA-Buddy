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
	import { onDestroy, onMount, tick } from "svelte";
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
	import {
		ensurePushRegistration,
		setupSwMessageHandler,
		startNotificationSubscription,
		stopNotificationSubscription,
	} from "./util/notifications";
	import { registerToast } from "./util/toast";
	import { track } from "./util/telemetry";
	import { update, VERSIONS } from "./util/updater";

	window.addEventListener("error", function (event) {
		if (
			event?.message?.includes("Failed to fetch dynamically imported module") &&
			!sessionStorage.getItem("reloaded")
		) {
			console.warn("Detected missing JS chunk. Reloading...");
			sessionStorage.setItem("reloaded", "true");
			window.location.reload();
		}
	});

	// On mount check if the user's permissions have changed
	onMount(async () => {
		try {
			const checkAuth = await trpc.user.checkAuth.query({
				token: $user.token,
				eventToken: $user.eventToken,
			});

			if (checkAuth.user) {
				user.set({
					...checkAuth.user,
					token: $user.token,
					eventToken: $user.eventToken,
					meshedEventToken: $user.meshedEventToken,
				});
				// Reconcile push subscription in case it was rotated while the app was closed.
				// Non-blocking: run in background, errors are logged but don't affect startup.
				ensurePushRegistration().catch(() => {});
			} else {
				// Server returned no user: token is invalid/expired - clear it.
				console.warn("[AUTH] Session invalid - clearing token.");
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
			// Network / server error - do NOT clear the token to avoid false logouts on flaky connections
			console.warn("[AUTH] checkAuth request failed (not clearing token):", err.message);
		}
	});

	const publicPaths = [
		"/",
		"/manage",
		"/manage/login",
		"/manage/google-signup",
		"/manage/host",
		"/manage/host/create",
		"/manage/event-settings",
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
	const pageIsPublicNoteCreate = route.pathname.startsWith("/notepad/submit/");

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

	$effect(() => {
		const page = route.pathname;
		const eventCode = $eventStore.code || undefined;
		track("page_view", eventCode, { page });
	});

	let approvalWarningDismissed = $state(localStorage.getItem("approvalWarningDismissed") === "true");
	function dismissApprovalWarning() {
		approvalWarningDismissed = true;
		localStorage.setItem("approvalWarningDismissed", "true");
	}

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
			updateNewVersion = data;
			showUpdateToast = true;
		}
	}
	onMount(() => {
		checkVersion();
		versionPollInterval = setInterval(checkVersion, 60_000);
		setupSwMessageHandler();
		// Subscription is now driven by the $effect below - no need to start it here.
	});
	onDestroy(() => {
		clearInterval(versionPollInterval);
	});

	// Reactively start/stop the notification SSE subscription when the auth token changes
	// or when the notifications setting is toggled from anywhere (modal, settings screen, etc.).
	// IMPORTANT: must read $settingsStore (reactive store ref) NOT the plain `settings` variable -
	// plain variable reassignment is invisible to $effect's dependency tracker.
	$effect(() => {
		const token = $user.token;
		const wantsNotifications = $settingsStore.notifications;

		if (token && wantsNotifications) {
			startNotificationSubscription();
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
				navigate("/notepad");
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

	let keyboardOpen = $state(false);
	let initialWindowHeight = 0;

	function updateAppHeight() {
		const vv = window.visualViewport;
		if (!vv) {
			document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
			return;
		}

		keyboardOpen = vv.height < initialWindowHeight * 0.85;

		document.documentElement.style.setProperty("--app-height", `${vv.height}px`);
		document.documentElement.style.setProperty("--vv-offset-top", `${vv.offsetTop}px`);
	}

	let isMobile = $state(false);

	onMount(() => {
		isMobile = window.matchMedia("(pointer: coarse)").matches;
		updateAppHeight();
		window.addEventListener("resize", updateAppHeight);
		window.visualViewport?.addEventListener("resize", updateAppHeight);
		window.visualViewport?.addEventListener("scroll", updateAppHeight);
	});

	onDestroy(() => {
		window.removeEventListener("resize", updateAppHeight);
		window.visualViewport?.removeEventListener("resize", updateAppHeight);
		window.visualViewport?.removeEventListener("scroll", updateAppHeight);
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
						label="Notepad"
						onclick={() => {
							drawerOpen = false;
							navigate("/notepad");
						}}
					>
						{#snippet icon()}
							<Icon icon="fluent:notepad-16-regular" class="size-8" />
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
							<Icon icon="mdi:database-export-outline" class="size-8" />
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
					<SidebarItem
						label="Event Settings"
						onclick={() => {
							drawerOpen = false;
							navigate("/manage/event-settings");
						}}
					>
						{#snippet icon()}
							<Icon icon="mdi:cog-outline" class="size-8" />
						{/snippet}
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
				{#if $user.admin}
					<SidebarItem
						label="App Management"
						class="text-sm"
						onclick={() => {
							drawerOpen = false;
							navigate("/manage");
						}}
					>
						{#snippet icon()}
							<Icon icon="mdi:shield-crown-outline" class="size-8" />
						{/snippet}
					</SidebarItem>
				{/if}
			</SidebarGroup>
		</SidebarWrapper>
	</Sidebar>
</Drawer>

<!-- App.svelte -->
<main class="bg-white dark:bg-neutral-800 flex flex-col" style="height: 100dvh; max-height: 100dvh; overflow: hidden;">
	{#if !$fullscreen}
		<div
			class="shrink-0 bg-primary-700 dark:bg-primary-500 flex w-full justify-between px-2"
			style="padding-top: env(safe-area-inset-top, 0px)"
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
	{/if}

	<Modal open={!approvalWarningDismissed} dismissable={false}>
		{#snippet header()}
			<h2 class="text-xl font-bold">Unofficial Tool</h2>
		{/snippet}
		<p class="text-gray-700 dark:text-gray-300">
			FTA Buddy is <strong>not approved for use at official FIRST events.</strong> Only use this tool at offseason events.
		</p>
		{#snippet footer()}
			<Button onclick={dismissApprovalWarning}>I Understand</Button>
		{/snippet}
	</Modal>

	<div class="flex-1 min-h-0 overflow-auto pb-safe">
		<SvRouter />
	</div>

	{#if (!keyboardOpen || !isMobile) && !$fullscreen}
		<div
			class="shrink-0 flex justify-around pt-2 bg-neutral-900 dark:bg-neutral-700 text-white"
			style="padding-bottom: max(0.5rem, env(safe-area-inset-bottom));"
		>
			{#if $user.token && $user.eventToken}
				{#if $user?.role === "FTA" || $user?.role === "FTAA"}
					<button class="p-2" onclick={() => navigate("/monitor")}>
						<Icon icon="mdi:television" class="size-8" />
					</button>
					<button class="p-2" onclick={() => navigate("/flashcards")}>
						<Icon icon="mdi:message-alert" class="size-8" />
					</button>
					<button class="p-2" onclick={() => navigate("/references")}>
						<Icon icon="heroicons:sun-16-solid" class="size-8" />
					</button>
					<button class="p-2 relative" onclick={() => navigate("/notepad")}>
						<Icon icon="fluent:notepad-16-regular" class="size-8" />
					</button>
					<!-- Gonna trial having the notepad button here instead of notifications -->
					<!-- <button class="p-2 relative" onclick={() => navigate("/notifications")}>
                        <Icon icon="fluent:alert-on-16-filled" class="size-8" />
                        {#if $notificationsStore.length > 0}
                            <Indicator color="red" border size="xl" placement="top-left">
                                <span class="text-white text-xs">{$notificationsStore.length}</span>
                            </Indicator>
                        {/if}
                    </button> -->
				{:else if $user?.role === "CSA" || $user?.role === "RI"}
					<button class="p-2" onclick={() => navigate("/notepad")}>
						<Icon icon="fluent:notepad-16-regular" class="size-8" />
					</button>
					<button class="p-2" onclick={() => navigate("/references/statuslights")}>
						<Icon icon="heroicons:sun-16-solid" class="size-8" />
					</button>
					<button class="p-2" onclick={() => navigate("/references/softwaredocs")}>
						<Icon icon="ion:library" class="size-8" />
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
	{/if}
</main>

<style>
	:global(html, body) {
		overflow: hidden;
		overscroll-behavior: none;
		height: 100%;
		margin: 0;
		padding: 0;
	}

	:global(#app) {
		height: 100%;
		height: 100dvh;
		display: flex;
		flex-direction: column;
	}

	:global(:root) {
		--sab: env(safe-area-inset-bottom);
	}

	:global([data-sv-router]),
	:global(sv-router > div) {
		height: 100%;
	}

	@supports (-webkit-touch-callout: none) {
		:global(input, textarea, select) {
			font-size: max(16px, 1em) !important;
		}
	}
</style>
