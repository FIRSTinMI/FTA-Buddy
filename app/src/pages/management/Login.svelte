<script lang="ts">
	import { Button, Input, Label, Modal, Select, type SelectOptionType } from "flowbite-svelte";
	import {
		createUserWithEmailAndPassword,
		sendEmailVerification,
		sendPasswordResetEmail,
		signInWithEmailAndPassword,
		signInWithPopup,
		signOut,
	} from "firebase/auth";
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
	import { auth, currentIdToken, googleProvider } from "../../util/firebase";
	import { firebaseAuthErrorMessage } from "../../util/firebaseErrors";
	import { subscribeToPush } from "../../util/notifications";
	import { toast } from "../../util/toast";

	/**
	 * After a successful Firebase sign-in, ensure a profile exists server-side and
	 * load it into the user store. Returns true if fully logged in, false if the
	 * account still needs a username/role (redirects to the finish-signup screen).
	 */
	async function applyProfile(profileInput: { username?: string; role?: typeof role } = {}): Promise<boolean> {
		const res = await trpc.user.syncProfile.mutate(profileInput);
		if ("needsProfile" in res && res.needsProfile) {
			navigate("/manage/google-signup");
			return false;
		}
		const p = res.user!;
		user.set({
			token: await currentIdToken(),
			eventToken: "",
			username: p.username,
			email: p.email,
			role: p.role,
			id: p.id,
			admin: p.admin,
		});
		return true;
	}

	function consumeRedirect() {
		const redirect = sessionStorage.getItem("redirectAfterLogin");
		if (redirect) {
			sessionStorage.removeItem("redirectAfterLogin");
			navigate(redirect as any);
		}
	}

	// If event token is missing, reset the event
	// This prevents the admin event selector from showing that an event is selected when it's not
	if (!$user.eventToken) {
		$eventStore.code = "";
		$eventStore.pin = "";
		$eventStore.teams = [];
	}

	// If already logged in and there's a pending join redirect, consume it immediately
	{
		const pendingRedirect = sessionStorage.getItem("redirectAfterLogin");
		if ($user.token && pendingRedirect) {
			sessionStorage.removeItem("redirectAfterLogin");
			navigate(pendingRedirect as any);
		}
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
			const cred = await createUserWithEmailAndPassword(auth, email, password);
			// Best-effort verification email; don't block account creation on it.
			sendEmailVerification(cred.user).catch((e) => console.warn("[AUTH] verification email failed", e));

			const loggedIn = await applyProfile({ username, role });
			if (loggedIn) {
				toast("Success", "Account created successfully", "green-500");
				consumeRedirect();
			}
		} catch (err: any) {
			console.error("[AUTH] createUser error:", err);
			toast("Error Creating Account", firebaseAuthErrorMessage(err));
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
			await signInWithEmailAndPassword(auth, email, password);
			const loggedIn = await applyProfile();
			if (loggedIn) {
				toast("Success", "Logged in successfully", "green-500");
				consumeRedirect();
			}
		} catch (err: any) {
			toast("Error Logging In", firebaseAuthErrorMessage(err));
			console.error("[AUTH] login error:", err);
		} finally {
			loading = false;
			isSubmitting = false;
		}
	}

	async function forgotPassword() {
		if (!email) {
			toast("Reset Password", "Enter your email above first, then tap Forgot Password.");
			return;
		}
		try {
			await sendPasswordResetEmail(auth, email);
			toast("Reset Password", "If an account exists for that email, a reset link is on its way.", "green-500");
		} catch (err: any) {
			console.error("[AUTH] forgotPassword error:", err);
			toast("Reset Password", firebaseAuthErrorMessage(err));
		}
	}

	async function googleSignIn() {
		if (isSubmitting) return;
		isSubmitting = true;
		loading = true;
		try {
			await signInWithPopup(auth, googleProvider);
			const loggedIn = await applyProfile();
			if (loggedIn) {
				toast("Success", "Logged in successfully", "green-500");
				consumeRedirect();
			}
		} catch (err: any) {
			// Popup closed/cancelled by the user is not an error worth surfacing.
			if (err?.code !== "auth/popup-closed-by-user" && err?.code !== "auth/cancelled-popup-request") {
				toast("Error Logging In", firebaseAuthErrorMessage(err));
				console.error("[AUTH] googleSignIn error:", err);
			}
		} finally {
			loading = false;
			isSubmitting = false;
		}
	}

	async function logout() {
		try {
			await signOut(auth);
		} catch (e) {
			console.error("[AUTH] signOut error:", e);
		}
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
	let serverEventMap: Map<string, { name: string; isMeshed: boolean }> = $state(new Map());

	function getMeshedPrefix(code: string): string {
		if (code.includes("micmp")) return "MSC - ";
		if (code.includes("cmp")) return "CMP - ";
		return "DCMP - ";
	}

	function updateEventList() {
		trpc.event.getAll.query().then((res) => {
			serverEventMap = new Map(res.map((e) => [e.code, { name: e.name, isMeshed: e.isMeshed }]));
			if ($user.admin) {
				eventList = res.map((e) => {
					const prefix = e.isMeshed ? getMeshedPrefix(e.code) : "";
					let displayName = e.name ?? "";
					if (e.isMeshed && displayName.startsWith("Meshed Event: ")) {
						displayName = displayName.slice("Meshed Event: ".length);
					}
					return {
						value: e.code,
						name: displayName ? `${prefix}${e.code} - ${displayName}` : `${prefix}${e.code}`,
					};
				});
				eventList.unshift({ value: "none", name: "None" });
				eventList = eventList;
			}
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
					playoffMode: res.playoffMode,
					startDate: res.startDate ?? undefined,
					endDate: res.endDate ?? undefined,
					joinedAt: new Date().toISOString().split("T")[0],
				});
				saveEvent({
					code: $eventStore.code,
					token: res.token,
					pin: res.pin,
					label: res.label,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					subEvents: res.subEvents,
					meshedEventCode: res.code,
					startDate: res.startDate ?? undefined,
					endDate: res.endDate ?? undefined,
				});
			} else {
				user.set({ ...$user, eventToken: res.token });
				eventStore.set({
					code: $eventStore.code,
					pin: res.pin,
					label: res.label,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					startDate: res.startDate ?? undefined,
					endDate: res.endDate ?? undefined,
					joinedAt: new Date().toISOString().split("T")[0],
				});
				saveEvent({
					code: $eventStore.code,
					token: res.token,
					pin: res.pin,
					label: res.label,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					startDate: res.startDate ?? undefined,
					endDate: res.endDate ?? undefined,
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
					label: res.label,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					subEvents: res.subEvents,
					meshedEventCode: res.code,
					playoffMode: res.playoffMode,
					startDate: res.startDate ?? undefined,
					endDate: res.endDate ?? undefined,
					joinedAt: new Date().toISOString().split("T")[0],
				});
				saveEvent({
					code: res.code,
					token: res.token,
					pin: res.pin,
					label: res.label,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					subEvents: res.subEvents,
					meshedEventCode: res.code,
					startDate: res.startDate ?? undefined,
					endDate: res.endDate ?? undefined,
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
					label: res.label,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					startDate: res.startDate ?? undefined,
					endDate: res.endDate ?? undefined,
					joinedAt: new Date().toISOString().split("T")[0],
				});
				saveEvent({
					code: res.code,
					token: res.token,
					pin: res.pin,
					label: res.label,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					startDate: res.startDate ?? undefined,
					endDate: res.endDate ?? undefined,
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

	let notificationModalOpen = $state(false);

	let eventTokenInput = $state("");

	async function joinEventByToken() {
		const tokenValue = eventTokenInput.trim();
		if (!tokenValue) {
			toast("Error", "Please enter an event token");
			return;
		}
		if (isSubmitting) return;
		isSubmitting = true;
		loading = true;

		try {
			// Set the event token first so the tRPC client is rebuilt with it before calling getDetails
			user.set({ ...$user, eventToken: tokenValue });

			const res = await trpc.event.getDetails.query();

			if (res.subEvents && Array.isArray(res.subEvents) && res.subEvents.length > 0) {
				user.set({ ...$user, eventToken: tokenValue, meshedEventToken: tokenValue });
				eventStore.set({
					code: res.code,
					pin: res.pin,
					label: res.label,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					subEvents: res.subEvents,
					meshedEventCode: res.code,
					playoffMode: res.playoffMode,
					startDate: res.startDate ?? undefined,
					endDate: res.endDate ?? undefined,
					joinedAt: new Date().toISOString().split("T")[0],
				});
				saveEvent({
					code: res.code,
					token: tokenValue,
					pin: res.pin,
					label: res.label,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					subEvents: res.subEvents,
					meshedEventCode: res.code,
					startDate: res.startDate ?? undefined,
					endDate: res.endDate ?? undefined,
				});
			} else {
				user.set({ ...$user, eventToken: tokenValue });
				eventStore.set({
					code: res.code,
					pin: res.pin,
					label: res.label,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					startDate: res.startDate ?? undefined,
					endDate: res.endDate ?? undefined,
					joinedAt: new Date().toISOString().split("T")[0],
				});
				saveEvent({
					code: res.code,
					token: tokenValue,
					pin: res.pin,
					label: res.label,
					teams: res.teams as TeamList,
					users: res.users as Profile[],
					startDate: res.startDate ?? undefined,
					endDate: res.endDate ?? undefined,
				});
			}

			toast("Success", "Event joined successfully", "green-500");
			await tick();
			const redirect = sessionStorage.getItem("redirectAfterLogin");
			if (redirect) {
				sessionStorage.removeItem("redirectAfterLogin");
				navigate(redirect as any);
			} else navigate($user.role === "FTA" || $user.role === "FTAA" ? "/monitor" : "/notepad");
		} catch (err: any) {
			// Revert the event token since the fetch failed
			user.set({ ...$user, eventToken: "" });
			toast("Error Joining Event", err.message);
			console.error("[AUTH] joinEventByToken error:", err);
		} finally {
			loading = false;
			isSubmitting = false;
		}
	}

	// Build a list of previously-joined events for the quick-switch selector
	let previousEventList = $derived(
		Object.values($savedEventsStore).map((e) => {
			const isMeshed = !!(e.subEvents && e.subEvents.length > 0) || !!serverEventMap.get(e.code)?.isMeshed;
			const prefix = isMeshed ? getMeshedPrefix(e.code) : "";
			let displayName: string;
			if (isMeshed && e.subEvents?.length) {
				displayName = e.subEvents.map((se) => se.label).join(", ");
			} else {
				const serverInfo = serverEventMap.get(e.code);
				displayName = serverInfo?.name ?? e.label ?? "";
			}
			return {
				value: e.code,
				name: displayName ? `${prefix}${e.code} - ${displayName}` : `${prefix}${e.code}`,
			};
		}),
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
				joinedAt: new Date().toISOString().split("T")[0],
			});
		} else {
			user.set({ ...$user, eventToken: saved.token, meshedEventToken: undefined });
			eventStore.set({
				code: saved.code,
				pin: saved.pin,
				teams: saved.teams,
				users: saved.users,
				label: saved.label,
				joinedAt: new Date().toISOString().split("T")[0],
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

<div class="h-full overflow-y-auto">
	<div class="container mx-auto max-w-xl md:max-w-3xl flex flex-col justify-center gap-4">
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
						<Input
							id="email"
							bind:value={email}
							placeholder="me@example.com"
							disabled={loading}
							type="email"
						/>
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
						<Input
							id="email"
							bind:value={email}
							placeholder="me@example.com"
							disabled={loading}
							type="email"
						/>
					</div>

					<div>
						<Label for="password">Password</Label>
						<Input id="password" bind:value={password} type="password" disabled={loading} />
					</div>
					<Button type="submit" disabled={loading}>Log In</Button>
				</form>
				<button
					type="button"
					class="text-sm text-blue-500 hover:underline w-fit"
					onclick={forgotPassword}
					disabled={loading}>Forgot password?</button
				>
				<Button onclick={() => (view = "create")} disabled={loading} outline>Create Account</Button>

				<p>Or</p>
				<div>
					<Label for="event-token">Event Token</Label>
					<Input id="event-token" bind:value={eventTokenInput} placeholder="Event Token" disabled={loading} />
				</div>
				<Button onclick={joinEventByToken} disabled={loading}>Join Event</Button>

				<!-- Login Prompt -->
			{:else}
				<div class="grid grid-cols-2 gap-4">
					{#if desktop}
						<div class="flex h-full">
							<div class="my-auto w-full">
								<h2 class="text-xl">Run FTA Buddy from this computer</h2>
								{#if $user.eventToken}
									<Button onclick={() => navigate("/")} class="w-full mt-4">Open Field Monitor</Button
									>
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
						<div class="w-full mx-auto">
							<Button color="light" class="w-full" onclick={googleSignIn} disabled={loading}>
								<svg class="w-5 h-5 me-2" viewBox="0 0 48 48" aria-hidden="true">
									<path
										fill="#EA4335"
										d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
									/>
									<path
										fill="#4285F4"
										d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
									/>
									<path
										fill="#FBBC05"
										d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
									/>
									<path
										fill="#34A853"
										d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
									/>
								</svg>
								Continue with Google
							</Button>
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
					<h1 class="text-xl" style="font-weight:bold;">
						The Event Currently Selected Is: {$eventStore.code}
					</h1>
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
			&middot;
			<a href="https://discord.gg/Kpnj55seHr" class="underline" target="_blank">Discord</a>
		</p>
	</div>
</div>
