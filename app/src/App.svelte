<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, CloseButton, Drawer, Indicator, Label, Modal, Select, Sidebar, SidebarGroup, SidebarItem, SidebarWrapper, Toast } from "flowbite-svelte";
	import { Router as SvRouter } from "sv-router";
	import { onDestroy, onMount, setContext } from "svelte";
	import { sineIn } from "svelte/easing";
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
	import { userStore } from "./stores/user";
	import { startNotificationSubscription } from "./util/notifications";
	import { VERSIONS, update } from "./util/updater";

	// Checking userentication
	let user = get(userStore);

	// On mount check if the user's permissions have changed
	onMount(async () => {
		const checkAuth = await trpc.user.checkAuth.query({
			token: user.token,
			eventToken: user.eventToken,
		});

		if (checkAuth.user) {
			userStore.set({
				...checkAuth.user,
				token: user.token,
				eventToken: user.eventToken,
				meshedEventToken: user.meshedEventToken,
			});
		} else {
			// No user found then reset
			userStore.set({
				email: "",
				username: "",
				id: -1,
				token: "",
				eventToken: user.eventToken,
				role: "FTA",
				admin: false,
			});
		}

		//console.log(user);
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
	const pageIsPublicTicketCreate = route.pathname.startsWith("/tickets/submit/");

	function redirectForAuth(a: typeof user) {
		// if user has event token and is trying to access a page that requires an event token
		if (user.eventToken && (eventTokenPaths.includes(route.pathname) || route.pathname.startsWith("/logs"))) {
			return;
		}

		if (!publicPaths.includes(route.pathname)) {
			//user trying to acces protected page
			if (!pageIsPublicLog && !pageIsPublicTicketCreate) {
				//page is not public log or public ticket creation page
				if (!a.token || !a.eventToken) {
					navigate("/manage/login"); //user is either not logged in or does not have event token
				}
				//user is logged in and has event token -- no redirect
			}
			//page is public log/public ticket creation page -- no tokens needed
		} else if (route.pathname == "/") {
			//user is accessing public path that is /
			if (!a.eventToken) {
				navigate("/manage/login"); //user is missing event token
			}
			//user has event token -- no redirect
		}
	}

	redirectForAuth(user);

	userStore.subscribe((value) => {
		redirectForAuth(value);
		user = value;
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

	$: updateTheme(settings.darkMode);

	// Settings modal

	let settingsOpen = false;
	function openSettings() {
		settingsOpen = true;
	}

	// Version/changelog modal

	const version = Object.keys(VERSIONS).sort().pop() || "0";
	let changelogOpen = false;
	let changelog = "";
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

	let welcomeOpen = false;
	function openWelcome() {
		welcomeOpen = true;
	}

	// Update checking

	update(settings.version, version, openWelcome, openChangelog, pageIsPublicLog || pageIsPublicTicketCreate);

	// Toast manager

	let showToast = false;
	let toastTitle = "";
	let toastText = "";
	let toastColor = "red-500";
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

    setContext("toast", toast);

	// Auto update

	let showUpdateToast = false;
	let updateNewVersion = "";
	let appSubscription: ReturnType<typeof trpc.app.version.subscribe> | undefined;
	onMount(() => {
		appSubscription = trpc.app.version.subscribe(undefined, {
			onData: (data) => {
				if (data !== settings.version) {
					console.log("New version available");
					updateNewVersion = data;
					showUpdateToast = true;
				}
			},
		});
		if (settings.notifications) {
			startNotificationSubscription();
		}
	});
	onDestroy(() => {
		appSubscription?.unsubscribe();
	});

	// App install prompt

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        installPrompt.set(event);
    });

    window.addEventListener("appinstalled", () => {
        installPrompt.set(null);
    });

	let event = get(eventStore);
	eventStore.subscribe((value) => {
		event = value;
	});

	// Stuff for the side menu
	let transitionParams = {
		x: -320,
		duration: 100,
		easing: sineIn,
	};
	let hideMenu = true;
	function openMenu() {
		hideMenu = false;
	}

	let multiEventSelection = "combined";
	if (user.meshedEventToken === user.eventToken) {
		multiEventSelection = "combined";
	} else {
		multiEventSelection = event.code;
	}

	if (user.token && route.pathname === "/") {
		if (user.role === "FTA" || user.role === "FTAA") {
			if (user.meshedEventToken && event && event.subEvents && user.eventToken === user.meshedEventToken) {
				navigate("/dashboard");
			} else {
				navigate("/monitor");
			}
		} else if (user.role === "CSA" || user.role === "RI") {
			navigate("/tickets");
		}
	}

	let statusSubscription: ReturnType<typeof trpc.app.status.subscribe> | undefined;
	let knownIssue = false;
	async function subscribeToStatus() {
		if (statusSubscription) {
			statusSubscription.unsubscribe();
		}
		statusSubscription = await trpc.app.status.subscribe(undefined, {
			onData: (data) => {
				console.log(data);
				if (data.current && (!event.code || data.effectedEvents.includes(event.code) || data.effectedEvents.length < 1)) {
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
			},
		});
	}

	onMount(async () => {
		subscribeToStatus();
	});
</script>

{#if showToast}
	<div class="fixed bottom-0 left-0 p-4 z-100">
		<Toast
            class={`w-lg p-4 text-black bg-white shadow-sm gap-3
                    dark:text-gray-400 dark:bg-gray-800
                    ${toastColor === "red-500" ? "dark:bg-red-500" : ""}
                    `}
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

<Drawer {transitionParams} bind:hidden={hideMenu} id="sidebar" class="bg-neutral-200">
	<div class="flex items-center">
		<h5 id="drawer-navigation-label-3" class="text-base font-semibold text-black uppercase dark:text-gray-400">Menu</h5>
		<CloseButton onclick={() => (hideMenu = true)} class="mb-4 text-black dark:text-white" />
	</div>
	{#if user.meshedEventToken && event.subEvents}
		<Label class="text-left">
			Event Selection
			<Select
				bind:value={multiEventSelection}
				items={[{ value: "combined", name: "Combined" }, ...event.subEvents.map((e) => ({ value: e.code, name: e.label }))]}
				class="w-full"
				onchange={() => {
					if (multiEventSelection === "combined") {
						userStore.set({
							...user,
							eventToken: user.meshedEventToken ?? "",
						});
						eventStore.set({ ...event, code: event.meshedEventCode ?? "", label: "Combined" });
						if (route.pathname.startsWith("/monitor")) {
							navigate("/dashboard");
						}
					} else {
						userStore.set({
							...user,
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
	<Sidebar>
		<SidebarWrapper class="overflow-y-auto py-4 px-3 rounded-sm dark:bg-gray-800">
			{#if user.token && user.eventToken}
				<SidebarGroup>
					{#if user?.role === "FTA" || user?.role === "FTAA"}
						<SidebarItem
							label="Monitor"
							onclick={() => {
								hideMenu = true;
								navigate("/");
							}}
						>
                            {#snippet icon()}
								<Icon icon="mdi:television" class="w-8 h-8" />
							{/snippet}
						</SidebarItem>
					{:else if user?.role === "CSA" || user?.role === "RI"}
						<SidebarItem
							label="Tickets"
							onclick={() => {
								hideMenu = true;
								navigate("/");
							}}
						>
                            {#snippet icon()}
								<Icon icon="mdi:message-text" class="w-8 h-8" />
							{/snippet}
						</SidebarItem>
					{/if}
					<SidebarItem
						label="Flashcards"
						onclick={() => {
							hideMenu = true;
							navigate("/flashcards");
						}}
					>
						{#snippet icon()}
							<Icon icon="mdi:message-alert" class="w-8 h-8" />
						{/snippet}
					</SidebarItem>
					{#if user?.role === "FTA" || user?.role === "FTAA"}
						<SidebarItem
							label="Tickets"
							onclick={() => {
								hideMenu = true;
								navigate("/tickets");
							}}
						>
							{#snippet icon()}
								<Icon icon="mdi:message-text" class="w-8 h-8" />
							{/snippet}
						</SidebarItem>
					{:else if user?.role === "CSA" || user?.role === "RI"}
						<SidebarItem
							label="Monitor"
							onclick={() => {
								hideMenu = true;
								navigate("/monitor");
							}}
						>
							{#snippet icon()}
								<Icon icon="mdi:television" class="w-8 h-8" />
							{/snippet}
						</SidebarItem>
					{/if}
					<SidebarItem
						label="Match Logs"
						onclick={() => {
							hideMenu = true;
							navigate("/logs");
						}}
					>
						{#snippet icon()}
							<Icon icon="uil:file-graph" class="w-8 h-8" />
						{/snippet}
					</SidebarItem>
					<SidebarItem
						label="Checklist"
						onclick={() => {
							hideMenu = true;
							navigate("/checklist");
						}}
					>
						{#snippet icon()}
							<Icon icon="mdi:clipboard-outline" class="w-8 h-8" />
						{/snippet}
					</SidebarItem>
					<SidebarItem
						label="Team Notes"
						onclick={() => {
							hideMenu = true;
							navigate("/notes");
						}}
					>
						{#snippet icon()}
							<Icon icon="clarity:note-solid" class="w-8 h-8" />
						{/snippet}
					</SidebarItem>
					<SidebarItem
						label="Event Reports"
						onclick={() => {
							hideMenu = true;
							navigate("/event-reports");
						}}
					>
						{#snippet icon()}
							<Icon icon="mdi:file-document-outline" class="w-8 h-8" />
						{/snippet}
					</SidebarItem>
					<SidebarItem
						label="My Notifications"
						onclick={() => {
							hideMenu = true;
							navigate("/notifications");
						}}
					>
						{#snippet icon()}
							<Icon icon="fluent:alert-on-16-filled" class="w-8 h-8" />
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
			{:else if user.eventToken}
				<SidebarGroup>
					<SidebarItem
						label="Monitor"
						onclick={() => {
							hideMenu = true;
							navigate("/");
						}}
					>
						{#snippet icon()}
							<Icon icon="mdi:television" class="w-8 h-8" />
						{/snippet}
					</SidebarItem>
					<SidebarItem
						label="Match Logs"
						onclick={() => {
							hideMenu = true;
							navigate("/logs");
						}}
					>
                        {#snippet icon()}
							<Icon icon="uil:file-graph" class="w-8 h-8" />
						{/snippet}
					</SidebarItem>
					<SidebarItem
						label="Checklist"
						onclick={() => {
							hideMenu = true;
							navigate("/checklist");
						}}
					>
						{#snippet icon()}
							<Icon icon="mdi:clipboard-outline" class="w-8 h-8" />
                        {/snippet}
					</SidebarItem>
				</SidebarGroup>
			{/if}
			<SidebarGroup class="border-t-2 mt-2 pt-2 border-neutral-400">
				<SidebarItem
					label="Change Event/Account"
					class="text-sm"
					onclick={() => {
						hideMenu = true;
						navigate("/manage/login");
					}}
				>
					{#snippet icon()}
						<Icon icon="mdi:account-switch" class="w-8 h-8" />
					{/snippet}
				</SidebarItem>
				<SidebarItem
					label="References"
					onclick={() => {
						hideMenu = true;
						navigate("/references");
					}}
				>
					{#snippet icon()}
						<Icon icon="mdi:file-document" class="w-8 h-8" />
					{/snippet}
				</SidebarItem>
				<SidebarItem
					label="Status Lights"
					onclick={() => {
						hideMenu = true;
						navigate("/references/statuslights");
					}}
					class="text-xs ml-8 pt-1 pb-1"
				>
					{#snippet icon()}
						<Icon icon="heroicons:sun-16-solid" class="size-6" />
					{/snippet}
				</SidebarItem>
				<SidebarItem
					label="Component Manuals"
					onclick={() => {
						hideMenu = true;
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
						hideMenu = true;
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
						hideMenu = true;
						navigate("/references/softwaredocs");
					}}
					class="text-xs ml-8 pt-1 pb-1"
				>
					{#snippet icon()}
						<Icon icon="ion:library" class="size-6" />
					{/snippet}
				</SidebarItem>
				<SidebarItem
					label="Event Dashboard"
					class="text-sm"
					onclick={() => {
						hideMenu = true;
						navigate("/dashboard");
					}}
				>
					{#snippet icon()}
						<Icon icon="mdi:television-guide" class="w-8 h-8" />
					{/snippet}
				</SidebarItem>
				<SidebarItem
					label="FTC Event Dashboard"
					class="text-sm"
					onclick={() => {
						hideMenu = true;
						navigate("/ftc");
					}}
				>
					{#snippet icon()}
						<Icon icon="mdi:television-guide" class="w-8 h-8" />
					{/snippet}
				</SidebarItem>
				<SidebarItem
					label="Settings"
					class="text-sm"
					onclick={(evt) => {
						evt.preventDefault();
						hideMenu = true;
						openSettings();
					}}
				>
					{#snippet icon()}
						<Icon icon="mdi:cog" class="w-8 h-8" />
					{/snippet}
				</SidebarItem>
				<SidebarItem
					label="Help"
					class="text-sm"
					onclick={(evt) => {
						evt.preventDefault();
						hideMenu = true;
						openWelcome();
					}}
				>
					{#snippet icon()}
						<Icon icon="mdi:information" class="w-8 h-8" />
					{/snippet}
				</SidebarItem>
			</SidebarGroup>
		</SidebarWrapper>
	</Sidebar>
</Drawer>

<!-- App.svelte -->
<main class="bg-white dark:bg-neutral-800 w-screen h-dvh flex flex-col">
	<div class="bg-primary-700 dark:bg-primary-500 flex w-full justify-between px-2 {$fullscreen ? 'hidden collapse' : ''}">
		<button class="py-0 px-0 text-white" onclick={openMenu}>
			<Icon icon="mdi:menu" class="w-8 h-10" />
		</button>
		<div class="grow mr-12">
			{#if user.token && user.eventToken}
				<h1 class="text-white text-lg place-content-center pt-1 font-bold">{event.label ?? event.code}</h1>
			{/if}
		</div>
	</div>

	<div class="flex-1 overflow-y-auto">
		<SvRouter />
	</div>

	<div class="flex justify-around py-2 bg-neutral-900 dark:bg-neutral-700 text-white {fullscreen && 'bg-white dark:bg-neutral-800'}">
			{#if user.token && user.eventToken && !fullscreen}
				{#if user?.role === "FTA" || user?.role === "FTAA"}
					<button class="p-2" onclick={() => navigate("/monitor")}>
						<Icon icon="mdi:television" class="w-8 h-8" />
					</button>
					<button class="p-2" onclick={() => navigate("/flashcards")}>
						<Icon icon="mdi:message-alert" class="w-8 h-8" />
					</button>
					<button class="p-2" onclick={() => navigate("/references")}>
						<Icon icon="mdi:file-document-outline" class="w-8 h-8" />
					</button>
					<button class="p-2 relative" onclick={() => navigate("/notifications")}>
						<Icon icon="fluent:alert-on-16-filled" class="w-8 h-8" />
						{#if $notificationsStore.length > 0}
							<Indicator color="red" border size="xl" placement="top-left">
								<span class="text-white text-xs">{$notificationsStore.length}</span>
							</Indicator>
						{/if}
					</button>
				{:else if user?.role === "CSA" || user?.role === "RI"}
					<button class="p-2" onclick={() => navigate("/tickets")}>
						<Icon icon="mdi:message-alert" class="w-8 h-8" />
					</button>
					<button class="p-2" onclick={() => navigate("/references/statuslights")}>
						<Icon icon="heroicons:sun-16-solid" class="w-8 h-8" />
					</button>
					<button class="p-2" onclick={() => navigate("/references/softwaredocs")}>
						<Icon icon="mdi:file-document-outline" class="w-8 h-8" />
					</button>
					<button class="p-2 relative" onclick={() => navigate("/notifications")}>
						<Icon icon="fluent:alert-on-16-filled" class="w-8 h-8" />
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
