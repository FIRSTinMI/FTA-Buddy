<script lang="ts">
	import { Button, Input, Label, Select, Modal, type SelectOptionType } from "flowbite-svelte";
	import { trpc } from "../../main";
	import { userStore } from "../../stores/user";
	import { eventStore } from "../../stores/event";
	import { navigate } from "svelte-routing";
	import Spinner from "../../components/Spinner.svelte";
	import type { Profile, TeamList } from "../../../../shared/types";
	import { settingsStore } from "../../stores/settings";
	import { subscribeToPush } from "../../util/notifications";

	export let toast: (title: string, text: string, color?: string) => void;

	let event = $eventStore;
	let user = $userStore;
	let settings = $settingsStore;

	// If event token is missing, reset the event
	// This prevents the admin event selector from showing that an event is selected when it's not
	if (!user.eventToken) {
		event.code = "";
		event.pin = "";
		event.teams = [];
	}

	let email = "";
	let username = "";
	let password = "";
	let verifyPassword = "";
	let role: "FTA" | "FTAA" | "CSA" | "RI";

	let loading = false;
	let view: null | "login" | "create" | "googleCreate" = null;

	let desktop =
		(navigator.userAgent.includes("Windows") || navigator.userAgent.includes("Macintosh") || navigator.userAgent.includes("Linux")) &&
		!navigator.userAgent.includes("Android");

	async function createUser(evt: Event) {
		loading = true;

		if (password !== verifyPassword) {
			toast("Error", "Passwords do not match");
			return;
		}

		try {
			const res = await trpc.user.createAccount.query({
				email,
				username,
				password,
				role,
			});

			userStore.set({
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
			console.error(err);
			if (err.message.startsWith("[")) {
				const obj = JSON.parse(err.message);
				for (const key in obj) {
					toast("Error Creating Account", obj[key].message);
				}
			} else {
				toast("Error Creating Account", err.message);
			}
		}

		loading = false;
	}

	async function login(evt: Event) {
		loading = true;

		try {
			console.log({ email, password });
			const res = await trpc.user.login.query({ email, password });

			console.log(res);

			userStore.set({
				token: res.token,
				eventToken: "",
				username: res.username,
				email: res.email,
				role: res.role,
				id: res.id,
				admin: res.admin,
			});

			console.log({
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
			console.error(err);
		}

		console.log(settings.notificationsDoNotAsk);

		if (!settings.notificationsDoNotAsk) {
			notificationModalOpen = true;
		}

		console.log(notificationModalOpen);

		loading = false;
	}

	function logout() {
		userStore.set({
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

	userStore.subscribe((value) => {
		//console.log(value);
		user = value;
		updateEventList();
	});

	let eventCode = "";
	let eventPin = "";

	let eventList: SelectOptionType<string>[] = [];

	function updateEventList() {
		trpc.event.getAll.query().then((res) => {
			eventList = res.map((e) => ({ value: e.code, name: e.code }));
			eventList.unshift({ value: "none", name: "None" });
			eventList = eventList;
			console.log(eventList);
		});
	}

	if (user.admin === true) updateEventList();

	async function adminSelectEvent() {
		if (event.code === "none") {
			userStore.set({ ...user, eventToken: "" });
			eventStore.set({ code: "", pin: "", teams: [], users: [] });
			return;
		}
		try {
			const res = await trpc.event.get.query({ code: event.code });
			//console.log(res);
			if (res.subEvents) {
				userStore.set({ ...user, eventToken: res.token, meshedEventToken: res.token });
				eventStore.set({
					code: event.code,
					pin: res.pin,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					subEvents: res.subEvents,
					meshedEventCode: res.code,
				});
			} else {
				userStore.set({ ...user, eventToken: res.token });
				eventStore.set({
					code: event.code,
					pin: res.pin,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
				});
			}
			eventCode = event.code;
			eventPin = res.pin;
		} catch (err: any) {
			toast("Error", err.message);
			console.error(err);
		}
	}

	async function joinEvent(evt: Event) {
		loading = true;

		try {
			const res = await trpc.event.join.query({
				code: eventCode,
				pin: eventPin,
			});
			userStore.set({ ...user, eventToken: res.token });
			eventStore.set({
				code: eventCode,
				pin: eventPin,
				teams: (res.teams as any) || [],
				users: res.users as Profile[],
			});
			toast("Success", "Event joined successfully", "green-500");
			setTimeout(() => navigate("/app"), 700);
		} catch (err: any) {
			toast("Error Joining Event", err.message);
			console.error(err);
		}

		loading = false;
	}

	// @ts-ignore
	window.googleLogin = async (googleUser: any) => {
		console.log(googleUser);
		try {
			const res = await trpc.user.googleLogin.query({
				token: googleUser.credential,
			});

			console.log(res);

			userStore.set({
				token: res.token,
				eventToken: "",
				username: res.username,
				email: res.email,
				role: res.role,
				id: res.id,
				admin: res.admin,
				googleToken: googleUser.credential,
			});

			console.log($userStore);

			toast("Success", "Logged in successfully", "green-500");
		} catch (err: any) {
			if (err.code === 404 || err.message.startsWith("User not found")) {
				userStore.set({
					token: "",
					eventToken: "",
					username: "",
					email: "",
					role: "FTA",
					id: -1,
					admin: false,
					googleToken: googleUser.credential,
				});
				navigate("/app/manage/google-signup");
			} else {
				toast("Error Logging In", err.message);
				console.error(err);
			}
		}
	};

	let notificationModalOpen = false;

	$: {
		try {
			if (user.token) {
				//console.log("I have a token");
				//console.log(user);
				//console.log(Notification.permission);
				if (!(Notification.permission === "granted") && !settings.notificationsDoNotAsk) {
					//console.log("here 1")
					notificationModalOpen = true;
				} else if ((!(Notification.permission === "granted") && settings.notificationsDoNotAsk) || Notification.permission === "granted") {
					//console.log("here 2")
					notificationModalOpen = false;
				}
			} else {
				//console.log("here 3")
				notificationModalOpen = false;
			}
		} catch (e) {
			console.error(e);
		}
	}

	const ios = () => {
		if (typeof window === `undefined` || typeof navigator === `undefined`) return false;

		return /iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.vendor);
	};
	export let installPrompt: Event | null;
</script>

<svelte:head>
	<script src="https://accounts.google.com/gsi/client" async></script>
</svelte:head>

<Modal bind:open={notificationModalOpen} outsideclose size="sm" dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex">
	<h1 class="font-bold text-xl">Enable Notifications</h1>
	<h2>Enable to get notifications for Tickets, and/or when a robot loses connection during a match</h2>
	{#if installPrompt}
		<h2 class="font-bold">Install this App to get push notifications</h2>
		<p class="py-1">Recommended for the best experience.</p>
		<Button
			color="primary"
			class="w-fit"
			size="sm"
			on:click={() => {
				// @ts-ignore
				if (installPrompt) installPrompt.prompt();
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
		on:click={() => {
			try {
				Notification.requestPermission().then((result) => {
					if (result === "granted") {
						$settingsStore.notifications = true;
						subscribeToPush();
						settingsStore.set(settings);
					}
				});
				notificationModalOpen = false;
			} catch (e) {
				console.error(e);
				toast("Error", "Error requesting notification permissions");
			}
		}}>Grant Notification Permissions</Button
	>
	<Button
		color="primary"
		class="w-fit"
		size="sm"
		on:click={() => {
			notificationModalOpen = false;
		}}>No, Thank You</Button
	>
	<Button
		color="primary"
		class="w-fit"
		size="sm"
		on:click={() => {
			settings.notificationsDoNotAsk = true;
			settingsStore.set(settings);
			notificationModalOpen = false;
		}}>Do Not Ask Again</Button
	>
	<p class="text-sm">You can change which types of notifications you are subscribed to from the Settings screen</p>
</Modal>

{#if loading}
	<Spinner />
{/if}

<div class="container mx-auto max-w-xl md:max-w-3xl flex flex-col justify-center min-h-svh gap-4">
	{#if !user || !user.token}
		<!-- Create Account -->
		{#if view === "create"}
			<h2 class="text-2xl" style="font-weight: bold;">Create Account</h2>
			<form class="flex flex-col space-y-2 mt-2 text-left" on:submit|preventDefault={createUser}>
				<div>
					<Label for="username">Username</Label>
					<Input id="username" bind:value={username} placeholder="John" bind:disabled={loading} />
				</div>

				<div>
					<Label for="email">Email</Label>
					<Input id="email" bind:value={email} placeholder="me@example.com" bind:disabled={loading} type="email" />
				</div>

				<div>
					<Label for="password">Password</Label>
					<Input id="password" bind:value={password} type="password" bind:disabled={loading} />
				</div>

				<div>
					<Label for="verify-password">Verify Password</Label>
					<Input id="verify-password" bind:value={verifyPassword} type="password" bind:disabled={loading} />
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
						bind:disabled={loading}
					/>
				</div>

				<Button type="submit" bind:disabled={loading}>Create Account</Button>
			</form>
			<Button on:click={() => (view = "login")} bind:disabled={loading} outline>Log In</Button>

			<!-- Login -->
		{:else if view === "login"}
			<h2 class="text-2xl" style="font-weight: bold;">Log In</h2>
			<form class="flex flex-col space-y-2 mt-2 text-left" on:submit|preventDefault={login}>
				<div>
					<Label for="email">Email</Label>
					<Input id="email" bind:value={email} placeholder="me@example.com" bind:disabled={loading} type="email" />
				</div>

				<div>
					<Label for="password">Password</Label>
					<Input id="password" bind:value={password} type="password" bind:disabled={loading} />
				</div>
				<Button type="submit" bind:disabled={loading}>Log In</Button>
			</form>
			<Button on:click={() => (view = "create")} bind:disabled={loading} outline>Create Account</Button>

			<p>Or</p>
			<div>
				<Label for="event-token">Event Token</Label>
				<Input id="event-token" bind:value={user.eventToken} placeholder="Event Token" bind:disabled={loading} />
			</div>
			<Button
				on:click={() => {
					userStore.set({ ...user, eventToken: user.eventToken });
					setTimeout(() => navigate("/app"), 500);
				}}
				bind:disabled={loading}>Join Event</Button
			>

			<!-- Login Prompt -->
		{:else}
			<div class="grid grid-cols-2 gap-4">
				{#if desktop}
					<div class="flex h-full">
						<div class="my-auto w-full">
							<h2 class="text-xl">Run FTA Buddy from this computer</h2>
							{#if user.eventToken}
								<Button on:click={() => navigate("/app")} class="w-full mt-4">Open Field Monitor</Button>
								<Button on:click={() => navigate("/app/manage/event-created")} class="w-full mt-4">See Event Pin</Button>
								<Button on:click={() => navigate("/app/manage/host")} class="w-full mt-4">Host New Event</Button>
							{:else}
								<Button on:click={() => navigate("/app/manage/host")} class="w-full mt-4">Host</Button>
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
					<Button on:click={() => (view = "login")} bind:disabled={loading}>Log In</Button>

					<Button on:click={() => (view = "create")} bind:disabled={loading}>Create Account</Button>
				</div>
			</div>
		{/if}

		<!-- Logged In -->
	{:else}
		<div class="flex pt-4">
			<div class="my-auto w-full">
				<h2 class="text-4xl" style="font-weight: bold;">Welcome to FTA Buddy!</h2>
				<h2 class="text-xl" style="font-weight: bold;">You are logged in as {user.username}</h2>
				<h1 class="text-xl" style="font-style: italic;">Your role is set to {user.role}.</h1>
			</div>
		</div>
		<div class="flex pt-4">
			<div class="my-auto w-full">
				<Button class="w-full" on:click={logout}>Log Out</Button>
			</div>
		</div>

		<!-- Event selector for admins -->
		{#if user.admin === true}
			{#if desktop}
				<div class="flex border-t border-neutral-500 pt-4">
					<div class="my-auto w-full">
						<h2 class="text-2xl" style="font-weight: bold;">Run FTA Buddy from this computer</h2>
						<Button on:click={() => navigate("/app/manage/host")} class="w-full mt-4">Host</Button>
						<p class="text-gray-700 mt-2">Requires this computer to be on the field network</p>
					</div>
				</div>
			{/if}
			<div class="flex pt-4">
				<div class="my-auto w-full">
					<h1 class="text-xl" style="font-weight:bold;">The Event Currently Selected Is: {event.code}</h1>
				</div>
			</div>
			<div class="flex flex-col pt-10 space-y-4">
				<Label for="event-selector">Admin Event Selector</Label>
				<Select id="event-selector" bind:value={event.code} items={eventList} placeholder="Select Event" on:change={adminSelectEvent} />
				<Button href="/" on:click={() => navigate("/")}>Go to App</Button>
				<Button outline on:click={() => navigate("/app/manage/event-created")}>See Event Pin</Button>
				<Button outline href="/app/manage/meshed-event">Create Meshed Event</Button>
				<Button outline href="/app/manage/manage">App Management</Button>
			</div>

			<!-- Currently have an event selected -->
		{:else if user.eventToken}
			<div class="flex flex-col border-t border-neutral-500 pt-10 space-y-2">
				<h1 class="text-xl" style="font-weight:bold;">The Event Currently Selected Is: {event.code}</h1>
				<Button href="/" on:click={() => navigate("/")}>Go to App</Button>
				<Button outline on:click={() => (eventStore.set({ code: "", pin: "", teams: [], users: [] }), userStore.set({ ...user, eventToken: "" }))}
					>Leave Event</Button
				>
				<Button outline on:click={() => navigate("/app/manage/event-created")}>See Event Pin</Button>
			</div>

			<!-- No event selected -->
		{:else}
			<div class="flex flex-col border-t border-neutral-500 pt-4">
				<h3 class="text-lg">Join Event</h3>
				{#if !desktop}<p class="text-gray-600 text-sm">To create a new event, open ftabuddy.com on a computer connected to the field network.</p>{/if}
				<form class="flex flex-col gap-2 text-left mt-2" on:submit|preventDefault={joinEvent}>
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
						<Button on:click={() => navigate("/app/manage/host")} class="w-full mt-4">Host</Button>
						<p class="text-gray-700 mt-2">Requires this computer to be on the field network</p>
					</div>
				</div>
			{/if}
		{/if}
	{/if}
	<p class="text-sm text-neutral-500">
		<a href="/app/privacy.html" class="underline">Privacy Policy</a>
	</p>
</div>

<style>
</style>
