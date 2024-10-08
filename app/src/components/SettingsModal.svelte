<script lang="ts">
	import { Button, Label, Modal, Select, Toggle, Range } from "flowbite-svelte";
	import { get } from "svelte/store";
	import { settingsStore } from "../stores/settings";
	import Spinner from "./Spinner.svelte";
	import { toast } from "../util/toast";
	import { subscribeToPush } from "../util/notifications";
	import { audioQueuer } from "../field-monitor";
	import { trpc } from "../main";
	import { authStore } from "../stores/auth";

	export let settingsOpen = false;

	let settings = get(settingsStore);
	export let installPrompt: Event | null;

	let loading = false;

	function updateSettings() {
		settingsStore.set(settings);
	}

	function clearStorage() {
		localStorage.clear();
		window.location.reload();
	}

	async function requestNotificationPermissions() {
		try {
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
		} catch (e) {
			console.error(e);
			toast("Error", "Error requesting notification permissions");
		}
	}

	let rangeSlider: HTMLInputElement | undefined;
	$: ((open: boolean) => {
		if (!open || rangeSlider) return;
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
	})(settingsOpen);

	let testingMusic = false;
	let musicTestTimeout: NodeJS.Timeout | undefined;
	function testMusic() {
		testingMusic = true;
		audioQueuer.playMusic([0]);
		clearTimeout(musicTestTimeout);
		musicTestTimeout = setTimeout(() => {
			testingMusic = false;
			audioQueuer.stopMusic();
		}, 10e3);
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

<Modal bind:open={settingsOpen} size="lg" outsideclose dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex">
	<div slot="header"><h1 class="text-2xl text-black dark:text-white">Settings</h1></div>
	<form class="justify-start text-left">
		<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
			<div class="grid grid-cols-subgrid gap-2 row-span-5">
				<p class="text-gray-700 dark:text-gray-400">General</p>
				<Toggle class="toggle" bind:checked={settings.vibrations} on:change={updateSettings}>Vibrations</Toggle>
				<Toggle class="toggle" bind:checked={settings.notifications} on:change={requestNotificationPermissions}>Ticket Notifications</Toggle>
				<Toggle class="toggle" bind:checked={settings.robotNotifications} on:change={requestNotificationPermissions}
					>Robot Connection Notifications</Toggle
				>
				<Toggle class="toggle" bind:checked={settings.fimSpecifics} on:change={updateSettings}>FIM Specific Field Manuals</Toggle>
			</div>
			<div class="grid grid-cols-subgrid gap-2 row-span-3">
				<p class="text-gray-700 dark:text-gray-400">Audio Alerts</p>
				<Toggle class="toggle" bind:checked={settings.soundAlerts} on:change={updateSettings}>Robot Connection</Toggle>
				<Toggle class="toggle" bind:checked={settings.fieldGreen} on:change={updateSettings}>Field Green</Toggle>
			</div>
			<div class="grid grid-cols-subgrid gap-2 row-span-6">
				<p class="text-gray-700 dark:text-gray-400">Music</p>
				<Select bind:value={settings.musicType} on:change={updateSettings}>
					<option value="none">None</option>
					<option value="jazz">Jazz</option>
					<option value="lofi">Lofi</option>
				</Select>
				<Label>Volume</Label>
				<div class="flex">
					<Range
						bind:value={settings.musicVolume}
						min="0"
						max="100"
						on:change={updateSettings}
						step="1"
						class="range mt-2 bg-gray-400"
						disabled={settings.musicType === "none"}
					/>
					<div class="w-12 text-right text-gray-700 dark:text-gray-400">{settings.musicVolume}%</div>
				</div>
				<Button on:click={() => (testingMusic ? stopMusic : testMusic)()} size="xs" color={testingMusic ? "dark" : "primary"}
					>{testingMusic ? "Stop" : "Test"} Music</Button
				>
			</div>
			<div class="grid grid-cols-subgrid gap-2 row-span-4">
				<p class="text-gray-700 dark:text-gray-400">Appearance</p>
				<Toggle class="toggle" bind:checked={settings.darkMode} on:change={updateSettings}>Dark Theme</Toggle>
				<Toggle class="toggle" bind:checked={settings.roundGreen} on:change={updateSettings}>Round Green Indicators</Toggle>
				<Toggle class="toggle" bind:checked={settings.inspectionAlerts} on:change={updateSettings}>🔍 Missing inspection icon on field monitor</Toggle>
			</div>
			<div class="grid grid-cols-subgrid gap-2 row-span-4">
				<p class="text-gray-700 dark:text-gray-400">Developer</p>
				<Toggle class="toggle" bind:checked={settings.developerMode} on:change={updateSettings}>Developer Mode</Toggle>
				<Toggle class="toggle {!settings.developerMode && "hidden"}" bind:checked={settings.forceCloud} on:change={updateSettings}>Force cloud server</Toggle>
                <Button class="{!settings.developerMode && 'hidden'}" on:click={() => {
                    trpc.event.notification.query({ eventToken: $authStore.eventToken})
                }} size="xs">Notification Test</Button>
			</div>
			<div class="grid gap-2 md:col-span-2">
				{#if installPrompt}
					<Button
						color="primary"
						size="xs"
						on:click={() => {
							// @ts-ignore
							if (installPrompt) installPrompt.prompt();
						}}>Install</Button
					>
				{/if}
				<Button on:click={clearStorage} size="xs" color="red">Clear All Data</Button>
			</div>
		</div>
	</form>
	<div class="border-t border-neutral-500 pt-2 mt-0 flex flex-col text-black dark:text-white">
		<h1 class="text-lg">About</h1>
		<p>Author: Filip Kin</p>
		<p>Version: {settings.version}</p>
		<a href="https://github.com/Filip-Kin/FTA-Buddy/" class="underline text-blue-400">GitHub</a>
	</div>
</Modal>
