<script lang="ts">
	import { Button, Input, Label, Modal, Range, Select, Toggle, type SelectOptionType } from "flowbite-svelte";
	import { audioQueuer } from "../field-monitor";
	import { trpc } from "../main";
	import { installPrompt } from "../stores/install-prompt";
	import { settingsStore } from "../stores/settings";
	import { userStore } from "../stores/user";
	import {
		startNotificationSubscription,
		stopNotificationSubscription,
		subscribeToPush,
	} from "../util/notifications";
	import { toast } from "../util/toast";
	import Spinner from "./Spinner.svelte";

	let { settingsOpen = $bindable(false) } = $props();

	let loading = $state(false);

	const roleOptions: SelectOptionType<string>[] = [
		{ value: "FTA", name: "FTA" },
		{ value: "FTAA", name: "FTAA" },
		{ value: "CSA", name: "CSA" },
		{ value: "RI", name: "RI" },
	];

	async function updateUser() {
		try {
			await trpc.user.changeRole.mutate({
				newRole: $userStore.role,
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
			if ($settingsStore.notifications) {
				if (Notification.permission !== "granted") {
					Notification.requestPermission().then(async (permission) => {
						if (permission === "granted") {
							await subscribeToPush();
						}
					});
				} else {
					await subscribeToPush();
				}
				startNotificationSubscription();
			} else {
				stopNotificationSubscription();
			}
		} catch (e) {
			console.error(e);
			toast("Error", "Error requesting notification permissions");
		}
	}

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

	let slackUserIdInput = $state($userStore.slack_user_id ?? "");
	let slackLinkLoading = $state(false);

	async function linkSlack() {
		slackLinkLoading = true;
		try {
			await trpc.user.linkSlackAccount.mutate({ slackUserId: slackUserIdInput.trim() });
			userStore.update((u) => ({ ...u, slack_user_id: slackUserIdInput.trim() }));
			toast("Success", "Slack account linked", "green-500");
		} catch (err: any) {
			toast("Error", err.message);
		} finally {
			slackLinkLoading = false;
		}
	}

	async function unlinkSlack() {
		slackLinkLoading = true;
		try {
			await trpc.user.unlinkSlackAccount.mutate();
			slackUserIdInput = "";
			userStore.update((u) => ({ ...u, slack_user_id: null }));
			toast("Success", "Slack account unlinked", "green-500");
		} catch (err: any) {
			toast("Error", err.message);
		} finally {
			slackLinkLoading = false;
		}
	}
</script>

{#if loading}
	<Spinner />
{/if}

<Modal
	bind:open={settingsOpen}
	size="lg"
	outsideclose
	class="fixed top-0 inset-s-0 inset-e-0 h-modal md:inset-0 z-40 w-full p-4 flex"
>
	{#snippet header()}
		<h1 class="text-2xl text-black dark:text-white">Settings</h1>
	{/snippet}
	<form class="justify-start text-left">
		<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
			<div class="grid grid-cols-subgrid gap-2 row-span-5">
				<p class="text-gray-700 dark:text-gray-400">General</p>
				<Toggle class="toggle" bind:checked={$settingsStore.vibrations}>Vibrations</Toggle>
				<Toggle class="toggle" bind:checked={$settingsStore.fimSpecifics}>FIM Specific Field Manuals</Toggle>
				<Toggle class="toggle" bind:checked={$settingsStore.notificationsDoNotAsk}
					>Do Not Ask About Notifications</Toggle
				>
				<Toggle
					class="toggle"
					bind:checked={$settingsStore.notifications}
					onchange={requestNotificationPermissions}>Enable Notifications</Toggle
				>
				<div class="pl-4 grid grid-cols-subgrid gap-2 row-span-5">
					<Toggle class="toggle" bind:checked={$settingsStore.notificationCategories.create}
						>New Tickets</Toggle
					>
					<Toggle class="toggle" bind:checked={$settingsStore.notificationCategories.follow}
						>Followed Ticket Updates</Toggle
					>
					<Toggle class="toggle" bind:checked={$settingsStore.notificationCategories.assign}
						>Assigned Ticket Updates</Toggle
					>
					<Toggle class="toggle" bind:checked={$settingsStore.notificationCategories.robot}
						>Robot Status Updates</Toggle
					>
				</div>
			</div>
			<div class="grid grid-cols-subgrid gap-2 row-span-3">
				<p class="text-gray-700 dark:text-gray-400">Change My Role</p>
				<Select items={roleOptions} bind:value={$userStore.role} onchange={updateUser} />
				<p class="text-gray-700 dark:text-gray-400">Audio Alerts</p>
				<Toggle class="toggle" bind:checked={$settingsStore.soundAlerts}>Robot Connection</Toggle>
				<Toggle class="toggle" bind:checked={$settingsStore.fieldGreen}>Field Green</Toggle>
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
					bind:value={$settingsStore.musicType}
				/>
				<Label>Volume</Label>
				<div class="flex">
					<Range
						bind:value={$settingsStore.musicVolume}
						min="0"
						max="100"
						step="1"
						class="range mt-2 bg-gray-400"
						disabled={$settingsStore.musicType === "none"}
					/>
					<div class="w-12 text-right text-gray-700 dark:text-gray-400">{$settingsStore.musicVolume}%</div>
				</div>
				<Button
					onclick={() => (testingMusic ? stopMusic : testMusic)()}
					size="xs"
					color={testingMusic ? "dark" : "primary"}>{testingMusic ? "Stop" : "Test"} Music</Button
				>
			</div>
			<div class="grid grid-cols-subgrid gap-2 row-span-4">
				<p class="text-gray-700 dark:text-gray-400">Appearance</p>
				<Toggle class="toggle" bind:checked={$settingsStore.darkMode}>Dark Theme</Toggle>
				<Toggle class="toggle" bind:checked={$settingsStore.roundGreen}>Round Green Indicators</Toggle>
				<Toggle class="toggle" bind:checked={$settingsStore.inspectionAlerts}
					>🔍 Missing inspection icon on field monitor</Toggle
				>
			</div>
			<div class="grid grid-cols-subgrid gap-2 row-span-4">
				<p class="text-gray-700 dark:text-gray-400">Developer</p>
				<Toggle class="toggle" bind:checked={$settingsStore.developerMode}>Developer Mode</Toggle>
				<Toggle
					class="toggle {!$settingsStore.developerMode ? 'hidden' : ''}"
					bind:checked={$settingsStore.forceCloud}>Force cloud server</Toggle
				>
				<Button
					class={!$settingsStore.developerMode || !$userStore.admin ? "hidden" : ""}
					onclick={async () => {
						try {
							const res = await trpc.event.notification.query({ eventToken: $userStore.eventToken });
							toast("Notification Test", `Sent to ${res.sent} user(s)`, "green-500");
						} catch (err: any) {
							toast("Notification Test Failed", err.message);
						}
					}}
					size="xs">Notification Test</Button
				>
			</div>
			<div class="grid gap-2 md:col-span-2">
				{#if $userStore.token}
					<p class="text-gray-700 dark:text-gray-400">Slack Account</p>
					{#if $userStore.slack_user_id}
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Linked: <span class="font-mono">{$userStore.slack_user_id}</span>
						</p>
						<Button onclick={unlinkSlack} size="xs" color="red" disabled={slackLinkLoading}
							>Unlink Slack</Button
						>
					{:else}
						<Label>
							Slack Member ID
							<Input
								bind:value={slackUserIdInput}
								placeholder="e.g. U012AB3CD"
								size="sm"
								class="mt-1 font-mono"
							/>
						</Label>
						<p class="text-xs text-gray-500 dark:text-gray-400">
							Find yours in Slack: click your name → View full profile → ··· → Copy member ID
						</p>
						<Button
							onclick={linkSlack}
							size="xs"
							color="primary"
							disabled={slackLinkLoading || !slackUserIdInput.trim()}>Link Slack</Button
						>
					{/if}
				{/if}
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
	{#snippet footer()}
		<div class="flex flex-col w-full">
			<h1 class="text-lg">About</h1>
			<p>Author: Filip Kin</p>
			<p>Contributors: Kelly Malone, Cole H, Brandon McDonald</p>
			<p>Version: {$settingsStore.version}</p>
			<a href="https://github.com/FIRSTinMI/FTA-Buddy" class="underline text-blue-400">GitHub</a>
		</div>
	{/snippet}
</Modal>
