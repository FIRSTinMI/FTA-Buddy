<script lang="ts">
	import FTCStatus from "./pages/FTCStatus.svelte";
	import Icon from "@iconify/svelte";
	import { Button, CloseButton, DarkMode, Drawer, Indicator, Modal, Sidebar, SidebarGroup, SidebarItem, SidebarWrapper, Toast } from "flowbite-svelte";
	import { Link, Route, Router, navigate } from "svelte-routing";
	import { get } from "svelte/store";
	import { frameHandler, subscribeToFieldMonitor } from "./field-monitor";
	import SettingsModal from "./components/SettingsModal.svelte";
	import WelcomeModal from "./components/WelcomeModal.svelte";
	import Flashcard from "./pages/Flashcards.svelte";
	import Monitor from "./pages/Monitor.svelte";
	import Login from "./pages/Login.svelte";
	import Messages from "./pages/Messages.svelte";
	import Reference from "./pages/Reference.svelte";
	import { authStore } from "./stores/auth";
	import { messagesStore } from "./stores/messages";
	import { settingsStore } from "./stores/settings";
	import { VERSIONS, update } from "./util/updater";
	import { sineIn } from "svelte/easing";
	import CompleteGoogleSignup from "./pages/CompleteGoogleSignup.svelte";
	import { eventStore } from "./stores/event";
	import Host from "./pages/Host.svelte";
	import PostEventCreation from "./pages/PostEventCreation.svelte";
	import MatchLog from "./pages/MatchLog.svelte";
	import StationLog from "./pages/StationLog.svelte";
	import MatchLogsList from "./pages/MatchLogsList.svelte";
	import Checklist from "./pages/Checklist.svelte";
	import { onDestroy, onMount } from "svelte";
	import CreateTicket from "./pages/CreateTicket.svelte";
	import ViewTicket from "./pages/ViewTicket.svelte";
	import { startBackgroundSubscription } from "./util/notifications";
	import { trpc } from "./main";
	import UpdateToast from "./components/UpdateToast.svelte";
	import EventDashboard from "./pages/EventDashboard.svelte";
	import EventReport from "./pages/EventReport.svelte";
	import StatusLights from "./pages/StatusLights.svelte";
	import FieldManuals from "./pages/FieldManuals.svelte";
	import ComponentManuals from "./pages/ComponentManuals.svelte";
	import WiringDiagrams from "./pages/WiringDiagrams.svelte";
	import SoftwareDocs from "./pages/SoftwareDocs.svelte";

	// Checking authentication

	let auth = get(authStore);
	const publicPaths = [
		"/app",
		"/app/",
		"/app/login",
		"/app/google-signup",
		"/app/host",
		"/app/event-created",
		"/app/ftc-status",
		"/app/references",
		"/app/statuslights",
		"/app/fieldmanuals",
		"/app/componentmanuals",
		"/app/wiringdiagrams",
	];
	const pageIsPublicLog = window.location.pathname.startsWith("/app/logs/") && window.location.pathname.split("/")[3].length == 36;

	function redirectForAuth(a: typeof auth) {
		console.log(!a.token, !a.eventToken, window.location.pathname, pageIsPublicLog);

		if (!publicPaths.includes(window.location.pathname)) {
			//user trying to acces protected page
			if (!pageIsPublicLog) {
				//page is not public log
				if (!a.token || !a.eventToken) {
					navigate("/app/login"); //user is either not logged in or does not have event token
				}
				//user is logged in and has event token -- no redirect
			}
			//page is public log -- no tokens needed
		} else if (window.location.pathname == "/app" || window.location.pathname == "/app/") {
			//user is accessing public path that is /app or /app/
			if (!a.token || !a.eventToken) {
				navigate("/app/login"); //user is missing user token or event token
			}
			//user has user and event token -- no redirect
		}
	}

	redirectForAuth(auth);

	authStore.subscribe((value) => {
		redirectForAuth(value);

		if (auth.eventToken !== value.eventToken) {
			auth = value;
			// If the event has changed we want to reconnect with the new event token
			subscribeToFieldMonitor();
		} else {
			auth = value;
		}
	});

	// Subscribe to field monitor
	onMount(() => {
		subscribeToFieldMonitor();
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

	update(settings.version, version, openWelcome, openChangelog, pageIsPublicLog);

	// Toast manager

	let showToast = false;
	let toastTitle = "";
	let toastText = "";
	let toastColor = "red-500";
	function toast(title: string, text: string, color = "red-500") {
		toastTitle = title;
		toastText = text;
		toastColor = color;
		showToast = true;
		setTimeout(() => {
			showToast = false;
		}, 5000);
	}

	(window as any).toast = toast;

	// Auto update

	let showUpdateToast = false;
	let updateNewVersion = "";
	let appSubscription: ReturnType<typeof trpc.app.version.subscribe> | undefined;
	onMount(() => {
		appSubscription = trpc.app.version.subscribe(undefined, {
			onData: (data) => {
				console.log(data, settings.version);
				if (data !== settings.version) {
					console.log("New version available");
					updateNewVersion = data;
					showUpdateToast = true;
				}
			},
		});
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

	// Update notification count
	startBackgroundSubscription();

	let notifications = get(messagesStore).unread || 0;
	messagesStore.subscribe((value) => {
		notifications = value.unread;
	});

	let messagesChild: Messages;

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
</script>

{#if showToast}
	<div class="fixed bottom-0 left-0 p-4">
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
	<Sidebar>
		<SidebarWrapper divClass="overflow-y-auto py-4 px-3 rounded dark:bg-gray-800">
			{#if auth.token && auth.eventToken}
				<SidebarGroup>
					{#if auth.user?.role === "FTA" || auth.user?.role === "ADMIN"}
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
					{:else if auth.user?.role === "CSA" || auth.user?.role === "RI"}
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
					{#if auth.user?.role === "FTA" || auth.user?.role === "ADMIN"}
						<SidebarItem
							label="Tickets"
							on:click={() => {
								hideMenu = true;
								navigate("/app/messages");
							}}
						>
							<svelte:fragment slot="icon">
								<Icon icon="mdi:message-text" class="w-8 h-8" />
							</svelte:fragment>
							{#if notifications > 0}
								<Indicator color="red" border size="xl" placement="top-left">
									<span
										class="text-white
                                	text-xs">{notifications}</span
									>
								</Indicator>
							{/if}
						</SidebarItem>
					{:else if auth.user?.role === "CSA" || auth.user?.role === "RI"}
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
							{#if notifications > 0}
								<Indicator color="red" border size="xl" placement="top-left">
									<span
										class="text-white
                                	text-xs">{notifications}</span
									>
								</Indicator>
							{/if}
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
						label="Event Report"
						on:click={() => {
							hideMenu = true;
							navigate("/app/event-report");
						}}
					>
						<svelte:fragment slot="icon">
							<Icon icon="mdi:file-document-outline" class="w-8 h-8" />
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
						navigate("/app/login");
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
						navigate("/app/statuslights");
					}}
					class="text-xs ml-8 p-0"
				>
					<svelte:fragment slot="icon">
						<Icon icon="entypo:light-up" class="size-6" />
					</svelte:fragment>
				</SidebarItem>
				<SidebarItem
					label="Field Manuals"
					on:click={() => {
						hideMenu = true;
						navigate("/app/fieldmanuals");
					}}
					class="text-xs ml-8 p-0"
				>
					<svelte:fragment slot="icon">
						<Icon icon="tabler:soccer-field" class="size-6" />
					</svelte:fragment>
				</SidebarItem>
				<SidebarItem
					label="Part Manuals"
					on:click={() => {
						hideMenu = true;
						navigate("/app/componentmanuals");
					}}
					class="text-xs ml-8 p-0"
				>
					<svelte:fragment slot="icon">
						<Icon icon="streamline:manual-book-solid" class="size-6" />
					</svelte:fragment>
				</SidebarItem>
				<SidebarItem
					label="Wiring Diagrams"
					on:click={() => {
						hideMenu = true;
						navigate("/app/wiringdiagrams");
					}}
					class="text-xs ml-8 p-0"
				>
					<svelte:fragment slot="icon">
						<Icon icon="fa6-solid:chart-diagram" class="size-6" />
					</svelte:fragment>
				</SidebarItem>
				<SidebarItem
					label="Software Docs"
					on:click={() => {
						hideMenu = true;
						navigate("/app/softwaredocs");
					}}
					class="text-xs ml-8 p-0"
				>
					<svelte:fragment slot="icon">
						<Icon icon="ion:library" class="size-6" />
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
						navigate("/app/ftc-status");
					}}
				>
					<svelte:fragment slot="icon">
						<Icon icon="mdi:television-guide" class="w-8 h-8" />
					</svelte:fragment>
				</SidebarItem>
				<SidebarItem
					label="Fullscreen"
					class="hidden md:flex text-sm"
					on:click={(evt) => {
						evt.preventDefault();
						fullscreen = !fullscreen;
						if (fullscreen) {
							document.documentElement.requestFullscreen();
						} else {
							document.exitFullscreen();
						}
					}}
				>
					<svelte:fragment slot="icon">
						<Icon icon="mdi:fullscreen" class="w-8 h-8" />
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

<main>
	<div class="bg-white dark:bg-neutral-800 w-screen h-screen flex flex-col">
		{#if !fullscreen}
			<div class="bg-primary-700 dark:bg-primary-500 flex w-full justify-between px-2">
				<Button class="!py-0 !px-0 text-white" color="none" on:click={openMenu}>
					<Icon icon="mdi:menu" class="w-8 h-10" />
				</Button>
				<div class="flex-grow">
					{#if auth.token && auth.eventToken}
						<h1 class="text-white text-lg">{event.code}</h1>
					{/if}
				</div>
			</div>
		{/if}
		<Router basepath="/app/">
			<div class="overflow-y-auto flex-grow pb-2">
				{#if auth.user?.role === "FTA" || auth.user?.role === "ADMIN"}
					<Route path="/">
						<Monitor {fullscreen} {frameHandler} />
					</Route>
					<Route path="/messages">
						<Messages bind:this={messagesChild} team={undefined} />
					</Route>
				{:else if auth.user?.role === "CSA" || auth.user?.role === "RI"}
					<Route path="/">
						<Messages bind:this={messagesChild} team={undefined} />
					</Route>
					<Route path="/monitor">
						<Monitor {fullscreen} {frameHandler} />
					</Route>
				{:else}
					<Route path="/">
						<Messages bind:this={messagesChild} team={undefined} />
					</Route>
					<Route path="/monitor">
						<Monitor {fullscreen} {frameHandler} />
					</Route>
				{/if}

				<Route path="/flashcards" component={Flashcard} />
				<Route path="/references" component={Reference} />
				<Route path="/statuslights" component={StatusLights} />
				<Route path="/fieldmanuals" component={FieldManuals} />
				<Route path="/componentmanuals" component={ComponentManuals} />
				<Route path="/softwaredocs" component={SoftwareDocs} />
				<Route path="/wiringdiagrams" component={WiringDiagrams} />
				<Route path="/messages/:team" component={Messages} />
				<Route path="/ticket" component={CreateTicket} />
				<Route path="/ticket/:id" component={ViewTicket} />
				<Route path="/logs">
					<MatchLogsList {toast} />
				</Route>
				<Route path="/logs/:matchid" component={MatchLog} />
				<Route path="/logs/:matchid/:station" component={StationLog} />
				<Route path="/checklist" component={Checklist} />
				<Route path="/dashboard" component={EventDashboard} />
				<Route path="/event-report" component={EventReport} />
				<Route path="/ftc-status" component={FTCStatus} />
			</div>
			<Route path="/login">
				<Login {toast} />
			</Route>
			<Route path="/host">
				<Host {toast} />
			</Route>
			<Route path="/event-created">
				<PostEventCreation {toast} />
			</Route>
			<Route path="/google-signup">
				<CompleteGoogleSignup {toast} />
			</Route>

			{#if auth.token && auth.eventToken && !fullscreen}
				<div class="flex justify-around py-2 bg-neutral-900 dark:bg-neutral-700 text-white">
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
					<Link to="/app/messages">
						<Button class="!p-2 relative" color="none">
							<Icon icon="mdi:message-text" class="w-8 h-8" />
							{#if notifications > 0}
								<Indicator color="red" border size="xl" placement="top-left">
									<span class="text-white text-xs">{notifications}</span>
								</Indicator>
							{/if}
						</Button>
					</Link>
				</div>
			{/if}
		</Router>
	</div>
</main>
