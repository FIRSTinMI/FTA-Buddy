<script lang="ts">
	import {
		Button,
		Checkbox,
		Input,
		Label,
		Modal,
		Range,
		Select,
		Toggle,
		type SelectOptionType,
	} from "flowbite-svelte";
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
		{ value: "Scorekeeper", name: "Scorekeeper" },
	];

	async function updateUser() {
		// The System role is assigned server-side only, never self-selected.
		if ($userStore.role === "System") return;
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

	// Slack account connection (user-scope token) for the troubleshooting corpus poller
	type SlackWorkspace = Awaited<ReturnType<typeof trpc.slackUser.list.query>>[number];
	type SlackChannel = Awaited<ReturnType<typeof trpc.slackUser.listChannels.query>>[number];

	let slackWorkspaces = $state<SlackWorkspace[]>([]);
	let slackWorkspacesLoading = $state(false);
	let slackConnectLoading = $state(false);
	let slackChannelPicker = $state<{ tokenId: number; channels: SlackChannel[]; selected: Set<string> } | null>(null);
	let slackChannelsLoading = $state(false);

	async function loadSlackWorkspaces() {
		if (!$userStore.token) return;
		slackWorkspacesLoading = true;
		try {
			slackWorkspaces = await trpc.slackUser.list.query();
		} catch (err: any) {
			console.warn("[Slack] list failed", err?.message);
		} finally {
			slackWorkspacesLoading = false;
		}
	}

	$effect(() => {
		if (settingsOpen) loadSlackWorkspaces();
	});

	async function connectSlackWorkspace() {
		slackConnectLoading = true;
		try {
			const { url } = await trpc.slackUser.getInstallUrl.mutate();
			window.location.href = url;
		} catch (err: any) {
			toast("Error", err.message);
			slackConnectLoading = false;
		}
	}

	async function openSlackChannelPicker(tokenId: number, current: string[]) {
		slackChannelsLoading = true;
		try {
			const channels = await trpc.slackUser.listChannels.query({ tokenId });
			slackChannelPicker = { tokenId, channels, selected: new Set(current) };
		} catch (err: any) {
			toast("Error", err.message);
		} finally {
			slackChannelsLoading = false;
		}
	}

	function toggleSlackChannel(id: string, checked: boolean) {
		if (!slackChannelPicker) return;
		const selected = new Set(slackChannelPicker.selected);
		if (checked) selected.add(id);
		else selected.delete(id);
		slackChannelPicker = { ...slackChannelPicker, selected };
	}

	async function saveSlackChannels() {
		if (!slackChannelPicker) return;
		slackChannelsLoading = true;
		try {
			await trpc.slackUser.setChannels.mutate({
				tokenId: slackChannelPicker.tokenId,
				channelIds: [...slackChannelPicker.selected],
			});
			toast("Success", "Channels saved", "green-500");
			slackChannelPicker = null;
			await loadSlackWorkspaces();
		} catch (err: any) {
			toast("Error", err.message);
		} finally {
			slackChannelsLoading = false;
		}
	}

	async function disconnectSlackWorkspace(tokenId: number) {
		slackWorkspacesLoading = true;
		try {
			await trpc.slackUser.disconnect.mutate({ tokenId });
			if (slackChannelPicker?.tokenId === tokenId) slackChannelPicker = null;
			toast("Success", "Workspace disconnected", "green-500");
			await loadSlackWorkspaces();
		} catch (err: any) {
			toast("Error", err.message);
			slackWorkspacesLoading = false;
		}
	}

	function formatPolled(d: Date | null) {
		if (!d) return "not polled yet";
		return "last poll " + new Date(d).toLocaleString();
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
			<div class="grid grid-cols-subgrid gap-2 row-span-5">
				<p class="text-gray-700 dark:text-gray-400">Appearance</p>
				<div class="flex items-center justify-between gap-2">
					<span>Theme</span>
					<Select
						size="sm"
						class="w-32"
						bind:value={$settingsStore.themeMode}
						items={[
							{ value: "system", name: "System" },
							{ value: "light", name: "Light" },
							{ value: "dark", name: "Dark" },
						]}
					/>
				</div>
				<Toggle class="toggle" bind:checked={$settingsStore.roundGreen}>Round Green Indicators</Toggle>
				<Toggle class="toggle" bind:checked={$settingsStore.inspectionAlerts}
					>🔍 Missing inspection icon on field monitor</Toggle
				>
				<Toggle class="toggle" bind:checked={$settingsStore.confetti}>🎉 Confetti on fast cycles</Toggle>
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
				{#if $userStore.token}
					<p class="text-gray-700 dark:text-gray-400">Connect Slack Account</p>
					<p class="text-xs text-gray-500 dark:text-gray-400">
						Copies CSA channel threads you can read into the troubleshooting corpus so they do not age out.
						Team numbers and event codes are removed before storage.
					</p>
					{#each slackWorkspaces as ws (ws.id)}
						<div class="flex flex-wrap items-center gap-2 text-sm">
							<span class="font-semibold">{ws.team_name}</span>
							{#if ws.revoked}
								<span class="text-red-500">token revoked, reconnect</span>
							{:else}
								<span class="text-gray-500 dark:text-gray-400">{formatPolled(ws.last_polled_at)}</span>
								<span class="text-gray-500 dark:text-gray-400"
									>{ws.channels.length === 0
										? "all channels"
										: `${ws.channels.length} channel(s)`}</span
								>
								<Button
									size="xs"
									color="light"
									disabled={slackChannelsLoading}
									onclick={() => openSlackChannelPicker(ws.id, ws.channels)}>Choose Channels</Button
								>
							{/if}
							<Button
								size="xs"
								color="red"
								disabled={slackWorkspacesLoading}
								onclick={() => disconnectSlackWorkspace(ws.id)}>Disconnect</Button
							>
						</div>
						{#if slackChannelPicker?.tokenId === ws.id}
							<div class="pl-4 grid gap-1 max-h-64 overflow-y-auto">
								<p class="text-xs text-gray-500 dark:text-gray-400">
									Untick everything to copy all channels you can read.
								</p>
								{#each slackChannelPicker.channels as ch (ch.id)}
									<Checkbox
										checked={slackChannelPicker.selected.has(ch.id)}
										onchange={(e) =>
											toggleSlackChannel(ch.id, (e.currentTarget as HTMLInputElement).checked)}
										>{ch.is_private ? "🔒 " : "#"}{ch.name}</Checkbox
									>
								{/each}
								<div class="flex gap-2 mt-1">
									<Button
										size="xs"
										color="primary"
										disabled={slackChannelsLoading}
										onclick={saveSlackChannels}>Save Channels</Button
									>
									<Button size="xs" color="light" onclick={() => (slackChannelPicker = null)}
										>Cancel</Button
									>
								</div>
							</div>
						{/if}
					{/each}
					<div>
						<Button size="xs" color="primary" disabled={slackConnectLoading} onclick={connectSlackWorkspace}
							>{slackWorkspaces.length ? "Connect Another Workspace" : "Connect Slack Account"}</Button
						>
					</div>
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
			<a href="https://discord.gg/Kpnj55seHr" class="underline text-blue-400">Discord</a>
		</div>
	{/snippet}
</Modal>
