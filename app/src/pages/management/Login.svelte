<script lang="ts">
	import { Button, Input, Label, Modal, Select, type SelectOptionType } from "flowbite-svelte";
	import { tick } from "svelte";
	import type { Profile, TeamList } from "../../../../shared/types";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { navigate } from "../../router";
	import { eventStore } from "../../stores/event";
	import { installPrompt } from "../../stores/install-prompt";
	import { settingsStore } from "../../stores/settings";
	import { userStore as user } from "../../stores/user";
	import { subscribeToPush } from "../../util/notifications";
	import { toast } from "../../util/toast";

	// If event token is missing, reset the event
	// This prevents the admin event selector from showing that an event is selected when it's not
	if (!$user.eventToken) {
		$eventStore.code = "";
		$eventStore.pin = "";
		$eventStore.teams = [];
	}

	let email = $state("");
	let username = $state("");
	let password = $state("");
	let verifyPassword = $state("");
	let role: "FTA" | "FTAA" | "CSA" | "RI" = $state("FTA");

	let loading = $state(false);
	// Single-flight guard: prevents double-submission when button is tapped quickly
	let isSubmitting = false;
	let view: null | "login" | "create" | "googleCreate" = $state(null);

	let desktop =
		(navigator.userAgent.includes("Windows") ||
			navigator.userAgent.includes("Macintosh") ||
			navigator.userAgent.includes("Linux")) &&
		!navigator.userAgent.includes("Android");

	async function createUser(evt: Event) {
		evt.preventDefault();
		if (isSubmitting) return;
		isSubmitting = true;
		loading = true;

		// Validate before hitting the network — reset loading in the guard branch
		if (password !== verifyPassword) {
			toast("Error", "Passwords do not match");
			loading = false;
			isSubmitting = false;
			return;
		}

		try {
			const res = await trpc.user.createAccount.mutate({
				email,
				username,
				password,
				role,
			});

			console.info(`[AUTH] createUser succeeded — id: ${res.id}, token length: ${res.token?.length ?? 0}`);

			user.set({
				token: res.token,
				eventToken: "",
				username,
				email,
				role,
				id: res.id,
				admin: false,
			});

			toast("Success", "Account created successfully", "green-500");
		} catch (err: any) {
			console.error("[AUTH] createUser error:", err);
			if (err.message.startsWith("[")) {
				const obj = JSON.parse(err.message);
				for (const key in obj) {
					toast("Error Creating Account", obj[key].message);
				}
			} else {
				toast("Error Creating Account", err.message);
			}
		} finally {
			loading = false;
			isSubmitting = false;
		}
	}

	async function login(evt: Event) {
		evt.preventDefault();
		if (isSubmitting) return;
		isSubmitting = true;
		loading = true;

		try {
			console.info(`[AUTH] login attempt — email: ${email}`);
			const res = await trpc.user.login.mutate({ email, password });

			console.info(`[AUTH] login succeeded — id: ${res.id}, token length: ${res.token?.length ?? 0}`);

			user.set({
				token: res.token,
				eventToken: "",
				username: res.username,
				email: res.email,
				role: res.role,
				id: res.id,
				admin: res.admin,
			});

			toast("Success", "Logged in successfully", "green-500");
		} catch (err: any) {
			toast("Error Logging In", err.message);
			console.error("[AUTH] login error:", err);
		} finally {
			loading = false;
			isSubmitting = false;
		}
	}

	function logout() {
		user.set({
			token: "",
			eventToken: "",
			username: "",
			email: "",
			role: "FTA",
			id: -1,
			admin: false,
		});
		window.location.reload();
	}

	user.subscribe((value) => {
		updateEventList();
	});

	let eventCode = $state("");
	let eventPin = $state("");

	let eventList: SelectOptionType<string>[] = $state([]);

	function updateEventList() {
		trpc.event.getAll.query().then((res) => {
			eventList = res.map((e) => ({ value: e.code, name: e.code }));
			eventList.unshift({ value: "none", name: "None" });
			eventList = eventList;
			console.log(eventList);
		});
	}

	if ($user.admin === true) updateEventList();

	async function adminSelectEvent() {
		if ($eventStore.code === "none") {
			user.set({ ...$user, eventToken: "" });
			eventStore.set({ code: "", pin: "", teams: [], users: [] });
			return;
		}
		try {
			const res = await trpc.event.get.mutate({ code: $eventStore.code });
			//console.log(res);
			if (res.subEvents) {
				user.set({ ...$user, eventToken: res.token, meshedEventToken: res.token });
				eventStore.set({
					code: $eventStore.code,
					pin: res.pin,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					subEvents: res.subEvents,
					meshedEventCode: res.code,
				});
			} else {
				user.set({ ...$user, eventToken: res.token });
				eventStore.set({
					code: $eventStore.code,
					pin: res.pin,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
				});
			}
			eventCode = $eventStore.code;
			eventPin = res.pin;
			// Show notification prompt right after joining — closing the modal stays on this page.
			if (!$settingsStore.notificationsDoNotAsk && Notification.permission !== "granted") {
				pendingNavigateDest = null;
				notificationModalOpen = true;
			}
		} catch (err: any) {
			toast("Error", err.message);
			console.error(err);
		}
	}

	async function joinEvent(evt: Event) {
		evt.preventDefault();
		if (isSubmitting) return;
		isSubmitting = true;
		loading = true;

		try {
			console.info(`[AUTH] joinEvent — code: ${eventCode}`);
			const res = await trpc.event.join.mutate({
				code: eventCode,
				pin: eventPin,
			});
			if (res.subEvents) {
				user.set({ ...$user, eventToken: res.token, meshedEventToken: res.token });
				eventStore.set({
					code: eventCode,
					pin: res.pin,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					subEvents: res.subEvents,
					meshedEventCode: res.code,
				});

				// Flush store updates before navigating to avoid route guards seeing stale state
				await tick();
				console.info("[ROUTER] navigate → /dashboard");
				goToApp("/dashboard");
			} else {
				user.set({ ...$user, eventToken: res.token });
				eventStore.set({
					code: eventCode,
					pin: eventPin,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
				});

				await tick();
				const dest = $user.role === "FTA" || $user.role === "FTAA" ? "/monitor" : "/notepad";
				console.info(`[ROUTER] navigate → ${dest}`);
				goToApp(dest);
			}
			toast("Success", "Event joined successfully", "green-500");
		} catch (err: any) {
			toast("Error Joining Event", err.message);
			console.error("[AUTH] joinEvent error:", err);
		} finally {
			loading = false;
			isSubmitting = false;
		}
	}

	// @ts-ignore
	window.googleLogin = async (googleUser: any) => {
		console.info("[AUTH] googleLogin callback fired");
		try {
			const res = await trpc.user.googleLogin.mutate({
				token: googleUser.credential,
			});

			console.info(`[AUTH] googleLogin succeeded — id: ${res.id}, token length: ${res.token?.length ?? 0}`);

			user.set({
				token: res.token,
				eventToken: "",
				username: res.username,
				email: res.email,
				role: res.role,
				id: res.id,
				admin: res.admin,
				googleToken: googleUser.credential,
			});

			toast("Success", "Logged in successfully", "green-500");
		} catch (err: any) {
			if (err.code === 404 || err.message.startsWith("User not found")) {
				console.info("[AUTH] googleLogin: user not found, redirecting to google-signup");
				user.set({
					token: "",
					eventToken: "",
					username: "",
					email: "",
					role: "FTA",
					id: -1,
					admin: false,
					googleToken: googleUser.credential,
				});
				navigate("/manage/google-signup");
			} else {
				toast("Error Logging In", err.message);
				console.error("[AUTH] googleLogin error:", err);
			}
		}
	};

	let notificationModalOpen = $state(false);
	// Destination to navigate to after the notification modal is dismissed.
	let pendingNavigateDest = $state<string | null>(null);
	function doNavigateAfterModal() {
		notificationModalOpen = false;
		if (pendingNavigateDest) {
			const dest = pendingNavigateDest;
			pendingNavigateDest = null;
			navigate(dest);
		}
	}

	function goToApp(dest: string) {
		if (!$settingsStore.notificationsDoNotAsk && Notification.permission !== "granted") {
			pendingNavigateDest = dest;
			notificationModalOpen = true;
		} else {
			navigate(dest);
		}
	}

	const ios = () => {
		if (typeof window === `undefined` || typeof navigator === `undefined`) return false;

		return /iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.vendor);
	};
</script>

<svelte:head>
	<script src="https://accounts.google.com/gsi/client" async></script>
</svelte:head>

<Modal bind:open={notificationModalOpen} outsideclose size="sm" onclose={doNavigateAfterModal}>
	<h1 class="font-bold text-xl">Enable Notifications</h1>
	<h2>Enable to get notifications for Tickets, and/or when a robot loses connection during a match</h2>
	{#if $installPrompt}
		<h2 class="font-bold">Install this App to get push notifications</h2>
		<p class="py-1">Recommended for the best experience.</p>
		<Button
			color="primary"
			class="w-fit"
			size="sm"
			onclick={() => {
				if ($installPrompt) $installPrompt.prompt();
			}}>Install</Button
		>
	{:else if ios()}
		<h2 class="font-bold">Install this App to get push notifications</h2>
		<p>Recommended for the best experience.</p>
		<p>On iOS you can do this by clicking the share button and then "Add to Home Screen".</p>
	{:else}
		<p>App installed ✅, push notifications available</p>
	{/if}
	<Button
		color="primary"
		class="w-fit"
		size="sm"
		onclick={async () => {
			console.info("[PUSH] Grant button clicked — requesting permission…");
			try {
				// If already granted (e.g. user allowed via the address-bar bell icon in Edge),
				// skip re-prompting and proceed directly.
				let result = Notification.permission;
				if (result !== "granted") {
					result = await Notification.requestPermission();
				}
				console.info(`[PUSH] Permission result: ${result}`);
				if (result === "granted") {
					// Setting notifications=true triggers the $effect in App.svelte which calls
					// startNotificationSubscription() — do NOT call it here too or we get two connections.
					$settingsStore.notifications = true;
					// Register this browser's push endpoint with the server (for background/FCM push)
					await subscribeToPush();
					doNavigateAfterModal();
				} else if (result === "denied") {
					toast(
						"Notifications blocked",
						"Open browser site settings and set Notifications to Allow, then try again.",
					);
					doNavigateAfterModal();
				} else {
					// "default" — browser suppressed the popup (Edge/Chrome quiet notifications).
					// The user needs to click the bell/lock icon in the address bar.
					toast(
						"Notifications",
						"No popup? Look for a bell or lock icon in your browser's address bar and click Allow there, then press this button again.",
					);
					// Keep modal open so user can try again after allowing via address bar
				}
			} catch (e: any) {
				console.error("[PUSH] Permission request error:", e);
				toast("Error", "Error requesting notification permissions");
			}
		}}>Grant Notification Permissions</Button
	>
	<Button
		color="primary"
		class="w-fit"
		size="sm"
		onclick={() => {
			doNavigateAfterModal();
		}}>No, Thank You</Button
	>
	<Button
		color="primary"
		class="w-fit"
		size="sm"
		onclick={() => {
			$settingsStore.notificationsDoNotAsk = true;
			doNavigateAfterModal();
		}}>Do Not Ask Again</Button
	>
	<p class="text-sm">You can change which types of notifications you are subscribed to from the Settings screen</p>
</Modal>

{#if loading}
	<Spinner />
{/if}

<div class="container mx-auto max-w-xl md:max-w-3xl flex flex-col justify-center min-h-full gap-4">
	{#if !user || !$user.token}
		<!-- Create Account -->
		{#if view === "create"}
			<h2 class="text-2xl" style="font-weight: bold;">Create Account</h2>
			<form class="flex flex-col space-y-2 mt-2 text-left" onsubmit={createUser}>
				<div>
					<Label for="username">Username</Label>
					<Input id="username" bind:value={username} placeholder="John" disabled={loading} />
				</div>

				<div>
					<Label for="email">Email</Label>
					<Input id="email" bind:value={email} placeholder="me@example.com" disabled={loading} type="email" />
				</div>

				<div>
					<Label for="password">Password</Label>
					<Input id="password" bind:value={password} type="password" disabled={loading} />
				</div>

				<div>
					<Label for="verify-password">Verify Password</Label>
					<Input id="verify-password" bind:value={verifyPassword} type="password" disabled={loading} />
				</div>

				<div>
					<Label for="role">Role</Label>
					<Select
						id="role"
						bind:value={role}
						items={["FTA", "FTAA", "CSA", "RI"].map((v) => ({
							name: v,
							value: v,
						}))}
						disabled={loading}
					/>
				</div>

				<Button type="submit" disabled={loading}>Create Account</Button>
			</form>
			<Button onclick={() => (view = "login")} disabled={loading} outline>Log In</Button>

			<!-- Login -->
		{:else if view === "login"}
			<h2 class="text-2xl" style="font-weight: bold;">Log In</h2>
			<form class="flex flex-col space-y-2 mt-2 text-left" onsubmit={login}>
				<div>
					<Label for="email">Email</Label>
					<Input id="email" bind:value={email} placeholder="me@example.com" disabled={loading} type="email" />
				</div>

				<div>
					<Label for="password">Password</Label>
					<Input id="password" bind:value={password} type="password" disabled={loading} />
				</div>
				<Button type="submit" disabled={loading}>Log In</Button>
			</form>
			<Button onclick={() => (view = "create")} disabled={loading} outline>Create Account</Button>

			<p>Or</p>
			<div>
				<Label for="event-token">Event Token</Label>
				<Input id="event-token" bind:value={$user.eventToken} placeholder="Event Token" disabled={loading} />
			</div>
			<Button
				onclick={() => {
					user.set({ ...$user, eventToken: $user.eventToken });
					if ($user.role === "FTA" || $user.role === "FTAA") setTimeout(() => navigate("/monitor"), 500);
					else setTimeout(() => navigate("/notepad"), 500);
				}}
				disabled={loading}>Join Event</Button
			>

			<!-- Login Prompt -->
		{:else}
			<div class="grid grid-cols-2 gap-4">
				{#if desktop}
					<div class="flex h-full">
						<div class="my-auto w-full">
							<h2 class="text-xl">Run FTA Buddy from this computer</h2>
							{#if $user.eventToken}
								<Button onclick={() => navigate("/")} class="w-full mt-4">Open Field Monitor</Button>
								<Button onclick={() => navigate("/manage/event-created")} class="w-full mt-4"
									>See Event Pin</Button
								>
								<Button onclick={() => navigate("/manage/host")} class="w-full mt-4"
									>Host New Event</Button
								>
							{:else}
								<Button onclick={() => navigate("/manage/host")} class="w-full mt-4">Host</Button>
							{/if}
							<p class="text-gray-700 mt-2">Requires this computer to be on the field network</p>
						</div>
					</div>
				{/if}
				<div class="flex flex-col gap-4 {desktop ? '' : 'col-span-2'}">
					<h2 class="text-xl">
						{#if desktop}Or log in{:else}Log in{/if} to use FTA Buddy
					</h2>
					<div class="w-fit mx-auto">
						<div
							id="g_id_onload"
							data-client_id="211223782093-ahalvkbdfdnjnv29svdvu3phsg40hlqi.apps.googleusercontent.com"
							data-context="signin"
							data-ux_mode="popup"
							data-callback="googleLogin"
							data-auto_prompt="false"
						></div>

						<div
							class="g_id_signin"
							data-type="standard"
							data-shape="pill"
							data-theme="filled_blue"
							data-text="continue_with"
							data-size="large"
							data-logo_alignment="left"
							style="color-scheme: light"
						></div>
					</div>
					<div class="border-t border-neutral-500"></div>
					<Button onclick={() => (view = "login")} disabled={loading}>Log In</Button>

					<Button onclick={() => (view = "create")} disabled={loading}>Create Account</Button>
				</div>
			</div>
		{/if}

		<!-- Logged In -->
	{:else}
		<div class="flex pt-4">
			<div class="my-auto w-full">
				<h2 class="text-4xl" style="font-weight: bold;">Welcome to FTA Buddy!</h2>
				<h2 class="text-xl" style="font-weight: bold;">You are logged in as {$user.username}</h2>
				<h1 class="text-xl" style="font-style: italic;">Your role is set to {$user.role}.</h1>
			</div>
		</div>
		<div class="flex pt-4">
			<div class="my-auto w-full">
				<Button class="w-full" onclick={logout}>Log Out</Button>
			</div>
		</div>

		<!-- Event selector for admins -->
		{#if $user.admin === true}
			{#if desktop}
				<div class="flex border-t border-neutral-500 pt-4">
					<div class="my-auto w-full">
						<h2 class="text-2xl" style="font-weight: bold;">Run FTA Buddy from this computer</h2>
						<Button onclick={() => navigate("/manage/host")} class="w-full mt-4">Host</Button>
						<p class="text-gray-700 mt-2">Requires this computer to be on the field network</p>
					</div>
				</div>
			{/if}
			<div class="flex pt-4">
				<div class="my-auto w-full">
					<h1 class="text-xl" style="font-weight:bold;">
						The Event Currently Selected Is: {$eventStore.code}
					</h1>
				</div>
			</div>
			<div class="flex flex-col pt-10 space-y-4">
				<Label for="event-selector">Admin Event Selector</Label>
				<Select
					id="event-selector"
					bind:value={$eventStore.code}
					items={eventList}
					placeholder="Select Event"
					onchange={adminSelectEvent}
				/>
				<Button onclick={() => navigate("/")}>Go to App</Button>
				<Button outline onclick={() => navigate("/manage/event-created")}>Event Management</Button>
				<Button outline href="/manage/meshed-event">Create Meshed Event</Button>
				<Button outline href="/manage/manage">App Management</Button>
			</div>

			<!-- Currently have an event selected -->
		{:else if $user.eventToken}
			<div class="flex flex-col border-t border-neutral-500 pt-10 space-y-2">
				<h1 class="text-xl" style="font-weight:bold;">The Event Currently Selected Is: {$eventStore.code}</h1>
				<Button onclick={() => navigate("/")}>Go to App</Button>
				<Button
					outline
					onclick={() => (
						eventStore.set({ code: "", pin: "", teams: [], users: [] }),
						user.set({ ...$user, eventToken: "" })
					)}>Leave Event</Button
				>
				<Button outline onclick={() => navigate("/manage/event-created")}>See Event Pin</Button>
			</div>

			<!-- No event selected -->
		{:else}
			<div class="flex flex-col border-t border-neutral-500 pt-4">
				<h3 class="text-lg">Join Event</h3>
				{#if !desktop}<p class="text-gray-600 text-sm">
						To create a new event, open ftabuddy.com on a computer connected to the field network.
					</p>{/if}
				<form class="flex flex-col gap-2 text-left mt-2" onsubmit={joinEvent}>
					<div>
						<Label for="event-code">Event Code</Label>
						<Input id="event-code" bind:value={eventCode} placeholder="2024mitry" />
					</div>
					<div>
						<Label for="event-pin">Event Pin</Label>
						<Input id="event-pin" bind:value={eventPin} placeholder="1234" />
					</div>
					<Button type="submit">Join Event</Button>
				</form>
			</div>
			{#if desktop}
				<div class="flex border-t border-neutral-500 pt-4">
					<div class="my-auto w-full">
						<h2 class="text-xl">Run FTA Buddy from this computer</h2>
						<Button onclick={() => navigate("/manage/host")} class="w-full mt-4">Host</Button>
						<p class="text-gray-700 mt-2">Requires this computer to be on the field network</p>
					</div>
				</div>
			{/if}
		{/if}
	{/if}
	<p class="text-sm text-neutral-500">
		<a href="/privacy.html" class="underline">Privacy Policy</a>
	</p>
</div>

<style>
</style>
