<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, Indicator, Modal } from "flowbite-svelte";
	import { gestureEvents } from "../util/gestureDetection";
	import { onMount } from "svelte";
	import { settingsStore } from "../stores/settings";
	import { toast } from "../../../shared/toast";
	import { subscribeToPush } from "../util/push-notifications";
	import { trpc } from "../main";

	export let welcomeOpen = false;
	export let installPrompt: Event | null;
	export let closeModal: () => void;
	export let openChangelog: () => void;

	onMount(() => {
		step = 0;
		gestureEvents.addEventListener("swipeLeft", () => {
			if (step < 5) step++;
		});
		gestureEvents.addEventListener("swipeRight", () => {
			if (step > 0) step--;
		});
	});

	let notificationsGranted = "Notification" in window && Notification.permission === "granted";

	let step = 0;

	let matchCount: Awaited<ReturnType<typeof trpc.match.getNumberOfMatches.query>> | undefined;

	async function getMatchCount() {
		if (!matchCount) matchCount = await trpc.match.getNumberOfMatches.query();
	}
</script>

<Modal bind:open={welcomeOpen} dismissable outsideclose size="lg" style="height: calc(100vh - 8rem)" on:open={() => getMatchCount()}>
	<div slot="header">
		<h1 class="text-xl text-black dark:text-white">Welcome to FTA Buddy</h1>
	</div>
	<div class="flex flex-col justify-left text-left gap-1 text-black dark:text-white h-full">
		{#if step === 0}
			<div class="grow">
				<p>
					FTA Buddy is a mobile optimized field monitor that has feature creeped into alot more. <br />
				</p>
				<ul class="list-disc ml-10">
					<li>References</li>
					<li>Match Log Viewer</li>
					<li>CSA Tickets</li>
					<li>Radio/Inspection Checklist</li>
					<li>Cycle Time Tracking</li>
					<li>Etc.</li>
				</ul>
				<p>
					This guide will explain how to use the app, and what everything means. <br />
					You can return to this guide by clicking the help button in the menu.
				</p>
				<h1 class="font-bolt mt-2 text-xl">Setup</h1>
				{#if installPrompt}
					<h2 class="font-bold">Install this App</h2>
					<p>Recommened for the best experience.</p>
					<Button
						color="primary"
						class="w-fit"
						size="sm"
						on:click={() => {
							// @ts-ignore
							if (installPrompt) installPrompt.prompt();
						}}>Install</Button
					>
				{:else if navigator.userAgent.includes("iPhone")}
					<h2 class="font-bold">Install this App</h2>
					<p>Recommened for the best experience.</p>
					<p>On iOS you can do this by clicking the share button and then "Add to Home Screen".</p>
				{:else}
					<p>App installed ✅</p>
				{/if}
				{#if !notificationsGranted}
					<h2 class="font-bold">Enable Notifications</h2>
					<p>Enable to get notifications for new ticket/notes, and/or when a robot loses connection during a match.</p>
					<Button
						color="primary"
						class="w-fit"
						size="sm"
						on:click={() => {
							try {
								Notification.requestPermission().then((result) => {
									if (result === "granted") {
										$settingsStore.notifications = true;
										notificationsGranted = true;
										subscribeToPush();
									}
								});
							} catch (e) {
								console.error(e);
								toast("Error", "Error requesting notification permissions");
							}
						}}>Grant Notification Permissions</Button
					>
				{:else}
					<p>Notifications enabled ✅</p>
				{/if}
			</div>
			{#if matchCount}<span class="font-bold">{matchCount.events} events have used FTA Buddy, playing {matchCount.matches} matches!</span>{/if}
		{:else if step === 1}
			<h2 class="font-bold">Monitor</h2>
			<p>
				Click on a team number to go to their notes and tickets. <br />
				Click on the status to see more details including: how long since the last status change and troubleshooting suggestions. <br />
			</p>
			<div>
				<img src="/app/tutorial/monitor.png" alt="Monitor" class="sm:max-w-xl w-fit mx-auto" />
			</div>
			<h2 class="font-bold">Emojis</h2>
			<ul>
				<li><span class="text-2xl">👀</span>Something is taking longer than expected to connect.</li>
				<li><span class="text-2xl">🕑</span>This team frequently takes a long time to get connected.</li>
				<li><span class="text-2xl">🔍</span>Team has not passed inspection.</li>
				<li><span class="text-2xl">🛜</span>Team has not flashed radio.</li>
				<li><span class="text-2xl">📝</span>Open or recently closed ticket</li>
			</ul>
			<p>The inspection and radio warnings are dependent on using the inspection and radio checklist features.</p>
			<h2 class="font-bold">RIO Status</h2>
			<p>
				Green: RIO connected and code running. <br />
				Yellow: RIO connected no code. <br />
				Red: No RIO.
			</p>
			<h2 class="font-bold">Cycle Times</h2>
			<div>
				<img src="/app/tutorial/cycles.png" alt="Cycle Times" class="sm:max-w-xl w-fit mx-auto" />
			</div>
			<p>
				Cycle time information is displayed at the bottom of the monitor screen. <br />
				The C: time is the last cycle time, if green that means it was your best cycle time yet. <br />
				The T: time is the time since the last match started, or your current cycle time.
			</p>
		{:else if step === 2}
			<h2 class="font-bold">Radio/Inspection Checklist</h2>
			<p>The button to access the checklist is in the hamburger menu</p>
			<p>
				The checklist is synced between all devices connected to the same event. So you can have someone checking off teams as they get their radio
				programmed, and someone else in the pits will know who to remind to get it done.
			</p>
			<p>The checklist will also automatically track when a robot connects to the field successfully.</p>
			<div>
				<img src="/app/tutorial/checklist.png" alt="Checklist" class="sm:max-w-xl w-fit mx-auto" />
			</div>
		{:else if step === 3}
			<h2 class="font-bold">Match Logs</h2>
			<p>Click the share button to generate a temporary public link to that specific log.</p>
			<p>
				The ledgend can toggle the visibility of data on the graph. <br />
				There is a select box to choose which columns to display in the table.
			</p>
			<div>
				<img src="/app/tutorial/logs.png" alt="Navigation" class="sm:max-w-xl w-fit mx-auto" />
			</div>
		{:else if step === 4}
			<h2 class="font-bold">CSA Tickets</h2>
			<p>You can attach a specific match to a ticket when creating it, and then the log for that match will be linked in the ticket.</p>
			<p>When you're going to help a team, you can click the assign button to assign the ticket to yourself.</p>
			<p>The homepage for the tickets will show all the tickets in order of most recently updated.</p>
			<div>
				<img src="/app/tutorial/ticket.png" alt="Tickets" class="sm:max-w-xl w-fit mx-auto" />
			</div>
		{:else if step === 5}
			<h2 class="font-bold">Documentation</h2>
			<p>
				More information about the app and the API can be found on the <a
					href="https://ftabuddy.com/docs/"
					target="_blank"
					class="underline text-blue-500">docs</a
				> site.
			</p>
			<h2 class="font-bold">Setup</h2>
			<p>To setup the app for your event, visit FTABuddy.com on a computer connected to the field network, and follow the instructions for hosting.</p>
			<h2 class="font-bold">Feedback</h2>
			<p>
				If you have any feedback or feature requests, please let me know on the <a
					href="https://github.com/Filip-Kin/FTA-Buddy/issues"
					class="underline text-blue-500">GitHub</a
				> page.
			</p>
			<Button color="primary" class="w-full" on:click={openChangelog}>Changelog</Button>
			<Button color="primary" class="w-full" on:click={closeModal}>Close</Button>
		{/if}
	</div>
	<div class="flex justify-center gap-2 w-full" slot="footer">
		<Button color="dark" class="p-1" on:click={() => step--} disabled={step <= 0}><Icon icon="mdi:arrow-left" class="w-6 h-6" /></Button>
		<Indicator color={step >= 0 ? "purple" : $settingsStore.darkMode ? "dark" : "gray"} class="my-auto" />
		<Indicator color={step >= 1 ? "purple" : $settingsStore.darkMode ? "dark" : "gray"} class="my-auto" />
		<Indicator color={step >= 2 ? "purple" : $settingsStore.darkMode ? "dark" : "gray"} class="my-auto" />
		<Indicator color={step >= 3 ? "purple" : $settingsStore.darkMode ? "dark" : "gray"} class="my-auto" />
		<Indicator color={step >= 4 ? "purple" : $settingsStore.darkMode ? "dark" : "gray"} class="my-auto" />
		<Indicator color={step >= 5 ? "purple" : $settingsStore.darkMode ? "dark" : "gray"} class="my-auto" />
		<Button color="dark" class="p-1" on:click={() => step++} disabled={step >= 5}><Icon icon="mdi:arrow-right" class="w-6 h-6" /></Button>
	</div>
</Modal>
