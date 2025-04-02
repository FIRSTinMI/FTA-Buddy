<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, CloseButton, Drawer, Indicator, Label, Modal, Select, Sidebar, SidebarGroup, SidebarItem, SidebarWrapper, Toast } from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import { Link, Route, Router, navigate } from "svelte-routing";
	import { sineIn } from "svelte/easing";
	import { get } from "svelte/store";
	import { formatTime } from "../../shared/formatTime";
	import SettingsModal from "./components/SettingsModal.svelte";
	import UpdateToast from "./components/UpdateToast.svelte";
	import WelcomeModal from "./components/WelcomeModal.svelte";
	import { trpc } from "./main";
	import Checklist from "./pages/Checklist.svelte";
	import EventDashboard from "./pages/EventDashboard.svelte";
	import EventReport from "./pages/EventReport.svelte";
	import Flashcard from "./pages/Flashcards.svelte";
	import MonitorRouter from "./pages/MonitorRouter.svelte";
	import FtcRouter from "./pages/ftc/FTCRouter.svelte";
	import ManagementRouter from "./pages/management/ManagementRouter.svelte";
	import MatchLogRouter from "./pages/match-logs/MatchLogRouter.svelte";
	import ReferencesRouter from "./pages/references/ReferencesRouter.svelte";
	import NotesRouter from "./pages/tickets-notes/NotesRouter.svelte";
	import NotificationList from "./pages/tickets-notes/NotificationList.svelte";
	import TicketRouter from "./pages/tickets-notes/TicketRouter.svelte";
	import { eventStore } from "./stores/event";
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
		"/app",
		"/app/",
		"/app/manage/login",
		"/app/manage/google-signup",
		"/app/manage/host",
		"/app/manage/event-created",
		"/app/manage/meshed-event",
		"/app/ftc",
		"/app/references",
		"/app/references/statuslights",
		"/app/references/fieldmanuals",
		"/app/references/componentmanuals",
		"/app/references/wiringdiagrams",
		"/app/references/softwaredocs",
		"/app/dashboard",
		"/app/manage/kiosk",
	];

	const eventTokenPaths = ["/app/monitor", "/app/checklist", "/app/logs"];

	const pageIsPublicLog = window.location.pathname.startsWith("/app/logs/") && window.location.pathname.split("/")[3].length == 36;
	const pageIsPublicTicketCreate = window.location.pathname.startsWith("/app/tickets/submit/");

	function redirectForAuth(a: typeof user) {
		// if user has event token and is trying to access a page that requires an event token
		if (user.eventToken && (eventTokenPaths.includes(window.location.pathname) || window.location.pathname.startsWith("/app/logs"))) {
			return;
		}

		if (!publicPaths.includes(window.location.pathname)) {
			//user trying to acces protected page
			if (!pageIsPublicLog && !pageIsPublicTicketCreate) {
				//page is not public log or public ticket creation page
				if (!a.token || !a.eventToken) {
					navigate("/app/manage/login"); //user is either not logged in or does not have event token
				}
				//user is logged in and has event token -- no redirect
			}
			//page is public log/public ticket creation page -- no tokens needed
		} else if (window.location.pathname == "/app" || window.location.pathname == "/app/") {
			//user is accessing public path that is /app or /app/
			if (!a.eventToken) {
				navigate("/app/manage/login"); //user is missing event token
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

	(window as any).toast = toast;

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

	let installPrompt: Event | null = null;

	window.addEventListener("beforeinstallprompt", (event) => {
		event.preventDefault();
		installPrompt = event;
	});

	window.addEventListener("appinstalled", () => {
		installPrompt = null;
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

	// Check if we're in fullscreen
	let fullscreen = window.outerWidth > 1900 ? window.innerHeight === 1080 : false;

	setInterval(() => {
		if (window.outerWidth > 1900) fullscreen = window.innerHeight === 1080;
	}, 200);

	let multiEventSelection = "combined";
	if (user.meshedEventToken === user.eventToken) {
		multiEventSelection = "combined";
	} else {
		multiEventSelection = event.code;
	}

	if (user.token && window.location.pathname === "/app/") {
		if (user.role === "FTA" || user.role === "FTAA") {
			if (user.meshedEventToken && event && event.subEvents && user.eventToken === user.meshedEventToken) {
				navigate("/app/dashboard");
			} else {
				navigate("/app/monitor");
			}
		} else if (user.role === "CSA" || user.role === "RI") {
			navigate("/app/tickets");
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
			bind:open={showToast}
			class="dark:bg-{toastColor}"
			divClass="w-lg p-4 text-black dark:text-gray-500 bg-white shadow dark:text-gray-400 dark:bg-gray-800 gap-3"
		>
			<h3 class="text-lg font-bold text-left">{toastTitle}</h3>
			<p class="text-left">{toastText}</p>
		</Toast>
	</div>
{/if}

<UpdateToast show={showUpdateToast} newVersion={updateNewVersion} />

<WelcomeModal
	bind:welcomeOpen
	bind:installPrompt
	openChangelog={() => {
		welcomeOpen = false;
		openFullChangelog();
	}}
	closeModal={() => {
		welcomeOpen = false;
	}}
/>

<Modal bind:open={changelogOpen} dismissable autoclose outsideclose>
	<div slot="header">
		<h1 class="text-2xl font-bold">Changelog</h1>
	</div>
	<div bind:innerHTML={changelog} contenteditable class="text-left text-black dark:text-white" />
	<div slot="footer">
		<Button color="primary">Close</Button>
	</div>
</Modal>

<SettingsModal bind:settingsOpen bind:installPrompt />

<Drawer transitionType="fly" {transitionParams} bind:hidden={hideMenu} id="sidebar" class="bg-neutral-200">
	<div class="flex items-center">
		<h5 id="drawer-navigation-label-3" class="text-base font-semibold text-black uppercase dark:text-gray-400">Menu</h5>
		<CloseButton on:click={() => (hideMenu = true)} class="mb-4 text-black dark:text-white" />
	</div>
	{#if user.meshedEventToken && event.subEvents}
		<Label class="text-left">
			Event Selection
			<Select
				label="Event"
				bind:value={multiEventSelection}
				items={[{ value: "combined", name: "Combined" }, ...event.subEvents.map((e) => ({ value: e.code, name: e.label }))]}
				class="w-full"
				on:change={() => {
					if (multiEventSelection === "combined") {
						userStore.set({
							...user,
							eventToken: user.meshedEventToken ?? "",
						});
						eventStore.set({ ...event, code: event.meshedEventCode ?? "", label: "Combined" });
						if (window.location.pathname.startsWith("/app/monitor")) {
							navigate("/app/dashboard");
						}
					} else {
						userStore.set({
							...user,
							eventToken: event.subEvents?.find((e) => e.code === multiEventSelection)?.token ?? "",
						});
						eventStore.set({ ...event, ...event.subEvents?.find((e) => e.code === multiEventSelection) });
						if (window.location.pathname.startsWith("/app/dashboard")) {
							navigate("/app/monitor");
						} else if (window.location.pathname.startsWith("/app/monitor")) {
							window.location.reload();
						}
					}
				}}
			/>
		</Label>
	{/if}
	<Sidebar>
		<SidebarWrapper divClass="overflow-y-auto py-4 px-3 rounded dark:bg-gray-800">
			{#if user.token && user.eventToken}
				<SidebarGroup>
					{#if user?.role === "FTA" || user?.role === "FTAA"}
						<SidebarItem
							label="Monitor"
							on:click={() => {
								hideMenu = true;
								navigate("/app/");
							}}
						>
							<svelte:fragment slot="icon">
								<Icon icon="mdi:television" class="w-8 h-8" />
							</svelte:fragment>
						</SidebarItem>
					{:else if user?.role === "CSA" || user?.role === "RI"}
						<SidebarItem
							label="Tickets"
							on:click={() => {
								hideMenu = true;
								navigate("/app/");
							}}
						>
							<svelte:fragment slot="icon">
								<Icon icon="mdi:message-text" class="w-8 h-8" />
							</svelte:fragment>
						</SidebarItem>
					{/if}
					<SidebarItem
						label="Flashcards"
						on:click={() => {
							hideMenu = true;
							navigate("/app/flashcards");
						}}
					>
						<svelte:fragment slot="icon">
							<Icon icon="mdi:message-alert" class="w-8 h-8" />
						</svelte:fragment>
					</SidebarItem>
					{#if user?.role === "FTA" || user?.role === "FTAA"}
						<SidebarItem
							label="Tickets"
							on:click={() => {
								hideMenu = true;
								navigate("/app/tickets");
							}}
						>
							<svelte:fragment slot="icon">
								<Icon icon="mdi:message-text" class="w-8 h-8" />
							</svelte:fragment>
						</SidebarItem>
					{:else if user?.role === "CSA" || user?.role === "RI"}
						<SidebarItem
							label="Monitor"
							on:click={() => {
								hideMenu = true;
								navigate("/app/monitor");
							}}
						>
							<svelte:fragment slot="icon">
								<Icon icon="mdi:television" class="w-8 h-8" />
							</svelte:fragment>
						</SidebarItem>
					{/if}
					<SidebarItem
						label="Match Logs"
						on:click={() => {
							hideMenu = true;
							navigate("/app/logs");
						}}
					>
						<svelte:fragment slot="icon">
							<Icon icon="uil:file-graph" class="w-8 h-8" />
						</svelte:fragment>
					</SidebarItem>
					<SidebarItem
						label="Checklist"
						on:click={() => {
							hideMenu = true;
							navigate("/app/checklist");
						}}
					>
						<svelte:fragment slot="icon">
							<Icon icon="mdi:clipboard-outline" class="w-8 h-8" />
						</svelte:fragment>
					</SidebarItem>
					<SidebarItem
						label="Team Notes"
						on:click={() => {
							hideMenu = true;
							navigate("/app/notes");
						}}
					>
						<svelte:fragment slot="icon">
							<Icon icon="clarity:note-solid" class="w-8 h-8" />
						</svelte:fragment>
					</SidebarItem>
					<SidebarItem
						label="Event Reports"
						on:click={() => {
							hideMenu = true;
							navigate("/app/event-reports");
						}}
					>
						<svelte:fragment slot="icon">
							<Icon icon="mdi:file-document-outline" class="w-8 h-8" />
						</svelte:fragment>
					</SidebarItem>
					<SidebarItem
						label="My Notifications"
						on:click={() => {
							hideMenu = true;
							navigate("/app/notifications");
						}}
					>
						<svelte:fragment slot="icon">
							<Icon icon="fluent:alert-on-16-filled" class="w-8 h-8" />
						</svelte:fragment>
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
						on:click={() => {
							hideMenu = true;
							navigate("/app/");
						}}
					>
						<svelte:fragment slot="icon">
							<Icon icon="mdi:television" class="w-8 h-8" />
						</svelte:fragment>
					</SidebarItem>
					<SidebarItem
						label="Match Logs"
						on:click={() => {
							hideMenu = true;
							navigate("/app/logs");
						}}
					>
						<svelte:fragment slot="icon">
							<Icon icon="uil:file-graph" class="w-8 h-8" />
						</svelte:fragment>
					</SidebarItem>
					<SidebarItem
						label="Checklist"
						on:click={() => {
							hideMenu = true;
							navigate("/app/checklist");
						}}
					>
						<svelte:fragment slot="icon">
							<Icon icon="mdi:clipboard-outline" class="w-8 h-8" />
						</svelte:fragment>
					</SidebarItem>
				</SidebarGroup>
			{/if}
			<SidebarGroup class="border-t-2 mt-2 pt-2 border-neutral-400">
				<SidebarItem
					label="Change Event/Account"
					class="text-sm"
					on:click={() => {
						hideMenu = true;
						navigate("/app/manage/login");
					}}
				>
					<svelte:fragment slot="icon">
						<Icon icon="mdi:account-switch" class="w-8 h-8" />
					</svelte:fragment>
				</SidebarItem>
				<SidebarItem
					label="References"
					on:click={() => {
						hideMenu = true;
						navigate("/app/references");
					}}
				>
					<svelte:fragment slot="icon">
						<Icon icon="mdi:file-document" class="w-8 h-8" />
					</svelte:fragment>
				</SidebarItem>
				<SidebarItem
					label="Status Lights"
					on:click={() => {
						hideMenu = true;
						navigate("/app/references/statuslights");
					}}
					class="text-xs ml-8 pt-1 pb-1"
				>
					<svelte:fragment slot="icon">
						<Icon icon="heroicons:sun-16-solid" class="size-6" />
					</svelte:fragment>
				</SidebarItem>
				<SidebarItem
					label="Component Manuals"
					on:click={() => {
						hideMenu = true;
						navigate("/app/references/componentmanuals");
					}}
					class="text-xs ml-8 pt-1 pb-1"
				>
					<svelte:fragment slot="icon">
						<Icon icon="streamline:manual-book-solid" class="size-6" />
					</svelte:fragment>
				</SidebarItem>
				<SidebarItem
					label="Wiring Diagrams"
					on:click={() => {
						hideMenu = true;
						navigate("/app/references/wiringdiagrams");
					}}
					class="text-xs ml-8 pt-1 pb-1"
				>
					<svelte:fragment slot="icon">
						<Icon icon="fa6-solid:chart-diagram" class="size-6" />
					</svelte:fragment>
				</SidebarItem>
				<SidebarItem
					label="Software Docs"
					on:click={() => {
						hideMenu = true;
						navigate("/app/references/softwaredocs");
					}}
					class="text-xs ml-8 pt-1 pb-1"
				>
					<svelte:fragment slot="icon">
						<Icon icon="ion:library" class="size-6" />
					</svelte:fragment>
				</SidebarItem>
				<SidebarItem
					label="Field Manuals"
					on:click={() => {
						hideMenu = true;
						navigate("/app/references/fieldmanuals");
					}}
					class="text-xs ml-8 pt-1 pb-1"
				>
					<svelte:fragment slot="icon">
						<Icon icon="tabler:soccer-field" class="size-6" />
					</svelte:fragment>
				</SidebarItem>
				<SidebarItem
					label="Event Dashboard"
					class="text-sm"
					on:click={() => {
						hideMenu = true;
						navigate("/app/dashboard");
					}}
				>
					<svelte:fragment slot="icon">
						<Icon icon="mdi:television-guide" class="w-8 h-8" />
					</svelte:fragment>
				</SidebarItem>
				<SidebarItem
					label="FTC Event Dashboard"
					class="text-sm"
					on:click={() => {
						hideMenu = true;
						navigate("/app/ftc");
					}}
				>
					<svelte:fragment slot="icon">
						<Icon icon="mdi:television-guide" class="w-8 h-8" />
					</svelte:fragment>
				</SidebarItem>
				<SidebarItem
					label="Settings"
					class="text-sm"
					on:click={(evt) => {
						evt.preventDefault();
						hideMenu = true;
						openSettings();
					}}
				>
					<svelte:fragment slot="icon">
						<Icon icon="mdi:cog" class="w-8 h-8" />
					</svelte:fragment>
				</SidebarItem>
				<SidebarItem
					label="Help"
					class="text-sm"
					on:click={(evt) => {
						evt.preventDefault();
						hideMenu = true;
						openWelcome();
					}}
				>
					<svelte:fragment slot="icon">
						<Icon icon="mdi:information" class="w-8 h-8" />
					</svelte:fragment>
				</SidebarItem>
			</SidebarGroup>
		</SidebarWrapper>
	</Sidebar>
</Drawer>
<Router basepath="/app/">
	<main class="bg-white dark:bg-neutral-800 w-screen h-dvh flex flex-col">
		<div class="bg-primary-700 dark:bg-primary-500 flex w-full justify-between px-2 {fullscreen && 'hidden collapse'}">
			<Button class="!py-0 !px-0 text-white" color="none" on:click={openMenu}>
				<Icon icon="mdi:menu" class="w-8 h-10" />
			</Button>
			<div class="flex-grow mr-12">
				{#if user.token && user.eventToken}
					<h1 class="text-white text-lg place-content-center pt-1 font-bold">{event.label ?? event.code}</h1>
				{/if}
			</div>
		</div>
		<div class="flex-1 overflow-y-auto">
			<Route path="/manage/*">
				<ManagementRouter {toast} {installPrompt} />
			</Route>
			<Route path="/monitor">
				<MonitorRouter bind:fullscreen />
			</Route>
			<Route path="/tickets/*" component={TicketRouter} />
			<Route path="/notifications" component={NotificationList} />
			<Route path="/flashcards" component={Flashcard} />
			<Route path="/notes/*" component={NotesRouter} />
			<Route path="/references/*" component={ReferencesRouter} />
			<Route path="/logs/*" component={MatchLogRouter} />
			<Route path="/checklist" component={Checklist} />
			<Route path="/dashboard" component={EventDashboard} />
			<Route path="/event-reports" component={EventReport} />
			<Route path="/ftc" component={FtcRouter} />
		</div>

		<div class="flex justify-around py-2 bg-neutral-900 dark:bg-neutral-700 text-white {fullscreen && 'bg-white dark:bg-neutral-800'}">
			{#if user.token && user.eventToken && !fullscreen}
				{#if user?.role === "FTA" || user?.role === "FTAA"}
					<Link to="/app/">
						<Button class="!p-2" color="none">
							<Icon icon="mdi:television" class="w-8 h-8" />
						</Button>
					</Link>
					<Link to="/app/flashcards">
						<Button class="!p-2" color="none">
							<Icon icon="mdi:message-alert" class="w-8 h-8" />
						</Button>
					</Link>
					<Link to="/app/references">
						<Button class="!p-2" color="none">
							<Icon icon="mdi:file-document-outline" class="w-8 h-8" />
						</Button>
					</Link>
					<Link to="/app/notifications">
						<Button class="!p-2 relative" color="none">
							<Icon icon="fluent:alert-on-16-filled" class="w-8 h-8" />
							{#if $notificationsStore.length > 0}
								<Indicator color="red" border size="xl" placement="top-left">
									<span class="text-white text-xs">{$notificationsStore.length}</span>
								</Indicator>
							{/if}
						</Button>
					</Link>
				{:else if user?.role === "CSA" || user?.role === "RI"}
					<Link to="/app/">
						<Button class="!p-2" color="none">
							<Icon icon="mdi:message-alert" class="w-8 h-8" />
						</Button>
					</Link>
					<Link to="/app/references/statuslights">
						<Button class="!p-2" color="none">
							<Icon icon="heroicons:sun-16-solid" class="w-8 h-8" />
						</Button>
					</Link>
					<Link to="/app/references/softwaredocs">
						<Button class="!p-2" color="none">
							<Icon icon="mdi:file-document-outline" class="w-8 h-8" />
						</Button>
					</Link>
					<Link to="/app/notifications">
						<Button class="!p-2 relative" color="none">
							<Icon icon="fluent:alert-on-16-filled" class="w-8 h-8" />
							{#if $notificationsStore.length > 0}
								<Indicator color="red" border size="xl" placement="top-left">
									<span class="text-white text-xs">{$notificationsStore.length}</span>
								</Indicator>
							{/if}
						</Button>
					</Link>
				{/if}
			{/if}
		</div>
	</main>
</Router>
