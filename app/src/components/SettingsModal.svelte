<script lang="ts">
	import { Button, Label, Modal, Range, Select, Toggle, type SelectOptionType } from "flowbite-svelte";
	import { get } from "svelte/store";
	import { toast } from "../../../shared/toast";
	import { audioQueuer } from "../field-monitor";
	import { trpc } from "../main";
	import { installPrompt } from "../stores/install-prompt";
	import { settingsStore } from "../stores/settings";
	import { userStore } from "../stores/user";
	import { startNotificationSubscription, stopNotificationSubscription, subscribeToPush } from "../util/notifications";
	import Spinner from "./Spinner.svelte";

    let { settingsOpen = $bindable(false) } = $props();

	let settings = get(settingsStore);
	let user = get(userStore);
	let loading = false;

	const roleOptions: SelectOptionType<string>[] = [
		{ value: "FTA", name: "FTA" },
		{ value: "FTAA", name: "FTAA" },
		{ value: "CSA", name: "CSA" },
		{ value: "RI", name: "RI" },
	];

	function updateSettings() {
		settingsStore.set(settings);
	}

	async function updateUser() {
		try {
			await trpc.user.changeRole.mutate({
				newRole: user.role,
			});

			userStore.update((u) => {
				return { ...u, role: user.role }; // Update the role in userStore
			});

			toast("Success", "Role changed successfully", "green-500");
		} catch (err: any) {
			console.error(err);
			if (err.message.startsWith("[")) {
				const obj = JSON.parse(err.message);
				for (const key in obj) {
					toast("Error Changing Role", obj[key].message);
				}
			} else {
				toast("Error Changing Role", err.message);
			}
		}
	}

	function clearStorage() {
		localStorage.clear();
		window.location.reload();
	}

	async function requestNotificationPermissions() {
		try {
			if (settings.notifications) {
				if (Notification.permission !== "granted") {
					Notification.requestPermission().then(async (permission) => {
						if (permission === "granted") {
							updateSettings();
							await subscribeToPush();
						}
					});
				} else {
					updateSettings();
					await subscribeToPush();
				}
				startNotificationSubscription();
			} else {
				stopNotificationSubscription();
				updateSettings();
			}
		} catch (e) {
			console.error(e);
			toast("Error", "Error requesting notification permissions");
		}
	}

	let rangeSlider: HTMLInputElement | undefined;

	function setupRangeSlider(settingsOpen: boolean) {
		if (!settingsOpen || rangeSlider) return;
		setTimeout(() => {
			rangeSlider = document.querySelector(".range") as HTMLInputElement;
			console.log("range slider", rangeSlider);
			if (rangeSlider) {
				rangeSlider.addEventListener("mousemove", (evt) => {
					if (!rangeSlider) return;
					updateSettings();
				});
			}
		}, 100);
	}

    $effect(() => {
        setupRangeSlider(settingsOpen);
    });

	let testingMusic = $state(false);
	let musicTestTimeout: NodeJS.Timeout | undefined;
	function testMusic() {
		testingMusic = true;
		audioQueuer.playMusic([0]);
		clearTimeout(musicTestTimeout);
		musicTestTimeout = globalThis.setTimeout(() => {
			testingMusic = false;
			audioQueuer.stopMusic();
		}, 10e3) as unknown as NodeJS.Timeout;
	}

	function stopMusic() {
		testingMusic = false;
		audioQueuer.stopMusic();
		clearTimeout(musicTestTimeout);
	}
</script>

{#if loading}
	<Spinner />
{/if}

<Modal bind:open={settingsOpen} size="lg" outsideclose class="fixed top-0 inset-s-0 inset-e-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex">
	{#snippet header()}
        <h1 class="text-2xl text-black dark:text-white">Settings</h1>
    {/snippet}
	<form class="justify-start text-left">
		<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
			<div class="grid grid-cols-subgrid gap-2 row-span-5">
				<p class="text-gray-700 dark:text-gray-400">General</p>
				<Toggle class="toggle" bind:checked={settings.vibrations} onchange={updateSettings}>Vibrations</Toggle>
				<Toggle class="toggle" bind:checked={settings.fimSpecifics} onchange={updateSettings}>FIM Specific Field Manuals</Toggle>
				<Toggle class="toggle" bind:checked={settings.notificationsDoNotAsk} onchange={updateSettings}>Do Not Ask About Notifications</Toggle>
				<Toggle class="toggle" bind:checked={settings.notifications} onchange={requestNotificationPermissions}>Enable Notifications</Toggle>
				<div class="pl-4 grid grid-cols-subgrid gap-2 row-span-5">
					<Toggle class="toggle" bind:checked={settings.notificationCategories.create} onchange={updateSettings}>New Tickets</Toggle>
					<Toggle class="toggle" bind:checked={settings.notificationCategories.follow} onchange={updateSettings}>Followed Ticket Updates</Toggle>
					<Toggle class="toggle" bind:checked={settings.notificationCategories.assign} onchange={updateSettings}>Assigned Ticket Updates</Toggle>
					<Toggle class="toggle" bind:checked={settings.notificationCategories.robot} onchange={updateSettings}>Robot Status Updates</Toggle>
				</div>
			</div>
			<div class="grid grid-cols-subgrid gap-2 row-span-3">
				<p class="text-gray-700 dark:text-gray-400">Change My Role</p>
				<Select items={roleOptions} bind:value={user.role} onchange={updateUser} />
				<p class="text-gray-700 dark:text-gray-400">Audio Alerts</p>
				<Toggle class="toggle" bind:checked={settings.soundAlerts} onchange={updateSettings}>Robot Connection</Toggle>
				<Toggle class="toggle" bind:checked={settings.fieldGreen} onchange={updateSettings}>Field Green</Toggle>
			</div>
			<div class="grid grid-cols-subgrid gap-2 row-span-6">
				<p class="text-gray-700 dark:text-gray-400">Music</p>
				<Select
					items={[
						{ value: "none", name: "None" },
						{ value: "jazz", name: "Jazz" },
						{ value: "lofi", name: "Lofi" },
						{ value: "minecraft", name: "C418 - Minecraft" },
						{ value: "pokemon", name: "Pokemon" },
					]}
					bind:value={settings.musicType}
					onchange={updateSettings}
				/>
				<Label>Volume</Label>
				<div class="flex">
					<Range
						bind:value={settings.musicVolume}
						min="0"
						max="100"
						onchange={updateSettings}
						step="1"
						class="range mt-2 bg-gray-400"
						disabled={settings.musicType === "none"}
					/>
					<div class="w-12 text-right text-gray-700 dark:text-gray-400">{settings.musicVolume}%</div>
				</div>
				<Button onclick={() => (testingMusic ? stopMusic : testMusic)()} size="xs" color={testingMusic ? "dark" : "primary"}
					>{testingMusic ? "Stop" : "Test"} Music</Button
				>
			</div>
			<div class="grid grid-cols-subgrid gap-2 row-span-4">
				<p class="text-gray-700 dark:text-gray-400">Appearance</p>
				<Toggle class="toggle" bind:checked={settings.darkMode} onchange={updateSettings}>Dark Theme</Toggle>
				<Toggle class="toggle" bind:checked={settings.roundGreen} onchange={updateSettings}>Round Green Indicators</Toggle>
				<Toggle class="toggle" bind:checked={settings.inspectionAlerts} onchange={updateSettings}>🔍 Missing inspection icon on field monitor</Toggle>
			</div>
			<div class="grid grid-cols-subgrid gap-2 row-span-4">
				<p class="text-gray-700 dark:text-gray-400">Developer</p>
				<Toggle class="toggle" bind:checked={settings.developerMode} onchange={updateSettings}>Developer Mode</Toggle>
				<Toggle class="toggle {!settings.developerMode ? 'hidden' : ''}" bind:checked={settings.forceCloud} onchange={updateSettings}
					>Force cloud server</Toggle
				>
				<Button
					class={!settings.developerMode ? "hidden" : ""}
					onclick={() => {
						//trpc.event.notification.query({ eventToken: user.eventToken });
					}}
					size="xs">Notification Test</Button
				>
			</div>
			<div class="grid gap-2 md:col-span-2">
				{#if $installPrompt}
					<Button
						color="primary"
						size="xs"
						onclick={() => {
							// @ts-ignore
							if ($installPrompt) $installPrompt.prompt();
						}}>Install</Button
					>
				{/if}
				<Button onclick={clearStorage} size="xs" color="red">Clear All Data</Button>
			</div>
		</div>
	</form>
	<div class="border-t border-neutral-500 pt-2 mt-0 flex flex-col text-black dark:text-white">
		<h1 class="text-lg">About</h1>
		<p>Author: Filip Kin</p>
		<p>Contributors: Kelly Malone, Cole H</p>
		<p>Version: {settings.version}</p>
		<a href="https://github.com/FIRSTinMI/FTA-Buddy" class="underline text-blue-400">GitHub</a>
	</div>
</Modal>
