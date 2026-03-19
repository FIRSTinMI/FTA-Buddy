<script lang="ts">
	import { Button, Input, Label, Modal, Select, type SelectOptionType } from "flowbite-svelte";
	import { tick } from "svelte";
	import type { Profile, TeamList } from "../../../../shared/types";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { navigate } from "../../router";
	import { eventStore } from "../../stores/event";
	import { installPrompt } from "../../stores/install-prompt";
	import { savedEventsStore, saveEvent } from "../../stores/savedEvents";
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

		// Validate before hitting the network - reset loading in the guard branch
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
			const res = await trpc.user.login.mutate({ email, password });

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

			const redirect = sessionStorage.getItem("redirectAfterLogin");
			if (redirect) {
				sessionStorage.removeItem("redirectAfterLogin");
				navigate(redirect as any);
			}
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

	function hostNavigate() {
		if ($user.eventToken) {
			eventStore.set({ code: "", pin: "", teams: [], users: [] });
			user.set({ ...$user, eventToken: "" });
		}
		navigate("/manage/host");
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
				saveEvent({
					code: $eventStore.code,
					token: res.token,
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
				saveEvent({
					code: $eventStore.code,
					token: res.token,
					pin: res.pin,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
				});
			}
			eventCode = $eventStore.code;
			eventPin = res.pin;
			if (!$settingsStore.notificationsDoNotAsk && Notification.permission !== "granted") {
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
			const res = await trpc.event.join.mutate({
				code: eventCode,
				pin: eventPin,
			});
			if (res.subEvents) {
				user.set({ ...$user, eventToken: res.token, meshedEventToken: res.token });
				eventStore.set({
					code: res.code,
					pin: res.pin,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					subEvents: res.subEvents,
					meshedEventCode: res.code,
				});
				saveEvent({
					code: res.code,
					token: res.token,
					pin: res.pin,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					subEvents: res.subEvents,
					meshedEventCode: res.code,
				});

				await tick();
				const redirect = sessionStorage.getItem("redirectAfterLogin");
				if (redirect) {
					sessionStorage.removeItem("redirectAfterLogin");
					navigate(redirect as any);
				} else navigate("/dashboard");
			} else {
				user.set({ ...$user, eventToken: res.token });
				eventStore.set({
					code: res.code,
					pin: res.pin,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
				});
				saveEvent({
					code: res.code,
					token: res.token,
					pin: res.pin,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
				});

				await tick();
				const redirect = sessionStorage.getItem("redirectAfterLogin");
				if (redirect) {
					sessionStorage.removeItem("redirectAfterLogin");
					navigate(redirect as any);
				} else navigate($user.role === "FTA" || $user.role === "FTAA" ? "/monitor" : "/notepad");
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
		try {
			const res = await trpc.user.googleLogin.mutate({
				token: googleUser.credential,
			});

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

	// Build a list of previously-joined events for the quick-switch selector
	let previousEventList = $derived(
		Object.values($savedEventsStore).map((e) => ({
			value: e.code,
			name: e.label ? `${e.code} - ${e.label}` : e.code,
		})),
	);

	let previousEventSelection = $state("");

	function switchToPreviousEvent() {
		if (!previousEventSelection) return;
		const saved = $savedEventsStore[previousEventSelection];
		if (!saved) return;

		if (saved.subEvents) {
			user.set({ ...$user, eventToken: saved.token, meshedEventToken: saved.token });
			eventStore.set({
				code: saved.code,
				pin: saved.pin,
				teams: saved.teams,
				users: saved.users,
				subEvents: saved.subEvents,
				meshedEventCode: saved.meshedEventCode,
				label: saved.label,
			});
		} else {
			user.set({ ...$user, eventToken: saved.token, meshedEventToken: undefined });
			eventStore.set({
				code: saved.code,
				pin: saved.pin,
				teams: saved.teams,
				users: saved.users,
				label: saved.label,
			});
		}

		const redirect = sessionStorage.getItem("redirectAfterLogin");
		if (redirect) {
			sessionStorage.removeItem("redirectAfterLogin");
			navigate(redirect as any);
			return;
		}
		navigate($user.role === "FTA" || $user.role === "FTAA" ? "/monitor" : "/notepad");
	}

	const ios = () => {
		if (typeof window === `undefined` || typeof navigator === `undefined`) return false;

		return /iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.vendor);
	};
</script>

<svelte:head>
	<script src="https://accounts.google.com/gsi/client" async></script>
</svelte:head>

<Modal bind:open={notificationModalOpen} outsideclose size="sm" onclose={() => (notificationModalOpen = false)}>
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
			try {
				let result = Notification.permission;
				if (result !== "granted") {
					result = await Notification.requestPermission();
				}
				if (result === "granted") {
					$settingsStore.notifications = true;
					await subscribeToPush();
					notificationModalOpen = false;
				} else if (result === "denied") {
					toast(
						"Notifications blocked",
						"Open browser site settings and set Notifications to Allow, then try again.",
					);
					notificationModalOpen = false;
				} else {
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
	<Button color="primary" class="w-fit" size="sm" onclick={() => (notificationModalOpen = false)}
		>No, Thank You</Button
	>
	<Button
		color="primary"
		class="w-fit"
		size="sm"
		onclick={() => {
			$settingsStore.notificationsDoNotAsk = true;
			notificationModalOpen = false;
		}}>Do Not Ask Again</Button
	>
	<p class="text-sm">You can change which types of notifications you are subscribed to from the Settings screen</p>
</Modal>

{#if loading}
	<Spinner />
{/if}

<div class="container mx-auto max-w-xl md:max-w-3xl flex flex-col justify-center h-full overflow-y-auto gap-4">
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
								<Button onclick={() => navigate("/manage/event-settings")} class="w-full mt-4"
									>Event Management</Button
								>
								<Button onclick={hostNavigate} class="w-full mt-4">Host New Event</Button>
							{:else}
								<Button onclick={hostNavigate} class="w-full mt-4">Host</Button>
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
						<Button onclick={hostNavigate} class="w-full mt-4">Host</Button>
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
				<Button outline onclick={() => navigate("/manage/event-settings")}>Event Management</Button>
				<Button outline href="/manage/meshed-event">Create Meshed Event</Button>
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
				<Button outline onclick={() => navigate("/manage/event-settings")}>Event Management</Button>
			</div>

			<!-- No event selected -->
		{:else}
			{#if previousEventList.length > 0}
				<div class="flex flex-col border-t border-neutral-500 pt-4 gap-2">
					<h3 class="text-lg font-semibold">Previous Events</h3>
					<div class="flex gap-2">
						<Select
							class="flex-1"
							items={previousEventList}
							bind:value={previousEventSelection}
							placeholder="Select a previous event"
						/>
						<Button onclick={switchToPreviousEvent} disabled={!previousEventSelection}>Switch</Button>
					</div>
				</div>
			{/if}
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
						<Label for="event-pin">Event Password</Label>
						<Input id="event-pin" bind:value={eventPin} placeholder="robot-field-42" />
					</div>
					<Button type="submit">Join Event</Button>
				</form>
			</div>
			{#if desktop}
				<div class="flex border-t border-neutral-500 pt-4">
					<div class="my-auto w-full">
						<h2 class="text-xl">Run FTA Buddy from this computer</h2>
						<Button onclick={hostNavigate} class="w-full mt-4">Host</Button>
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
