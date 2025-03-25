<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, Indicator, Modal } from "flowbite-svelte";
	import { onMount } from "svelte";
	import { trpc } from "../main";
	import { settingsStore } from "../stores/settings";
	import { gestureEvents } from "../util/gestureDetection";

	export let welcomeOpen = false;
	export let installPrompt: Event | null;
	export let closeModal: () => void;
	export let openChangelog: () => void;

	onMount(() => {
		step = 0;
		gestureEvents.addEventListener("swipeLeft", () => {
			if (step < 6) step++;
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
		<h1 class="text-xl text-black dark:text-white font-bold">Welcome to FTA Buddy</h1>
	</div>
	<div class="flex flex-col justify-left text-left gap-1 text-black dark:text-white h-full">
		{#if step === 0}
			<p class="py-1">
				FTA Buddy is your all-in-one tool for managing field operations. Designed for FTAs, CSAs, and other volunteers, it brings everything into one
				place.
			</p>
			<ul class="list-disc ml-10 py-1">
				<li>Live match monitoring and cycle times</li>
				<li>Match logs with detailed data graphs</li>
				<li>CSA ticketing with messaging and team notes</li>
				<li>Shared radio/inspection checklist</li>
				<li>Reference materials and diagrams</li>
				<li>Optional public ticket submission</li>
			</ul>
			<p class="py-1">You can access all features through the sidebar or bottom navigation.</p>
			{#if installPrompt}
				<h2 class="font-bold py-1">Install this App</h2>
				<p class="py-1">Recommended for the best experience.</p>
				<Button
					color="primary"
					class="w-fit py-1"
					size="sm"
					on:click={() => {
						// @ts-ignore
						if (installPrompt) installPrompt.prompt();
					}}>Install</Button
				>
			{:else if navigator.userAgent.includes("iPhone")}
				<h2 class="font-bold py-1">Install this App</h2>
				<p class="py-1">Recommended for the best experience.</p>
				<p class="py-1">On iOS you can do this by clicking the share button and then "Add to Home Screen".</p>
			{:else}
				<p class="py-1">App installed ✅</p>
			{/if}
			{#if matchCount}<span class="font-bold py-1">{matchCount.events} events have used FTA Buddy, playing {matchCount.matches} matches!</span>{/if}
		{:else if step === 1}
			<h2 class="font-bold">Monitor & Cycle Times</h2>
			<p class="py-1">Track real-time team connections, RIO status, and radio status. Icons help highlight common problems.</p>
			<p class="py-1">Cycle time data shows how quickly the field is turning matches. "C" is last cycle time, "T" is current cycle length.</p>

			<h2 class="font-bold py-1">Emojis</h2>
			<ul class="list-disc ml-10 py-1">
				<li><span class="text-2xl">👀</span>Something is taking longer than expected to connect.</li>
				<li><span class="text-2xl">🕑</span>This team frequently takes a long time to get connected.</li>
				<li><span class="text-2xl">🔍</span>Team has not passed inspection.</li>
				<li><span class="text-2xl">🛜</span>Team has not flashed radio.</li>
			</ul>

			<img src="/app/tutorial/monitor.png" alt="Monitor" class="sm:max-w-xl w-fit mx-auto py-1" />
			<img src="/app/tutorial/cycles.png" alt="Cycles" class="sm:max-w-xl w-fit mx-auto py-1" />
		{:else if step === 2}
			<h2 class="font-bold">CSA Tickets & Team Notes</h2>
			<p class="py-1">Create and assign tickets to track team issues. Collaborate with CSAs through ticket messages.</p>
			<p class="py-1">Use notes to record helpful team info that carries across events, such as unresolved issues or key behavior.</p>
			<img src="/app/tutorial/ticket_list.png" alt="Tickets" class="sm:max-w-xl w-fit mx-auto py-1" />
			<img src="/app/tutorial/notes.png" alt="Notes" class="sm:max-w-xl w-fit mx-auto py-1" />
		{:else if step === 3}
			<h2 class="font-bold">Checklist & Logs</h2>
			<p class="py-1">Track which teams have flashed radios and passed inspection. The checklist syncs across all users in the event.</p>
			<p class="py-1">Match logs include detailed connection and radio data per alliance and team. View graphs, share links, and export data.</p>
			<img src="/app/tutorial/checklist.png" alt="Checklist" class="sm:max-w-xl w-fit mx-auto py-1" />
			<img src="/app/tutorial/logs.png" alt="Logs" class="sm:max-w-xl w-fit mx-auto py-1" />
		{:else if step === 4}
			<h2 class="font-bold">Public Ticket Creation</h2>
			<p class="py-1">Allow teams to submit their own tickets via QR code or kiosk link. This reduces the need for paper and speeds up support.</p>
			<p class="py-1">Public ticketing can be turned off at any time if abused.</p>
			<img src="/app/tutorial/public_ticket_modal.png" alt="Public Ticketing" class="sm:max-w-xl w-fit mx-auto py-1" />
		{:else if step === 5}
			<h2 class="font-bold">Notifications</h2>
			<p class="py-1">Receive push notifications for new tickets, updates to tickets you're following or assigned to, and robot status changes.</p>
			<p class="py-1">You can customize which notifications you receive in the settings page.</p>
			<img src="/app/tutorial/notifications_list.png" alt="Notifications" class="sm:max-w-xl w-fit mx-auto py-1" />
		{:else if step === 6}
			<h2 class="font-bold">Learn More</h2>
			<p class="py-1">
				Read full documentation at <a href="https://ftabuddy.com/docs/" class="text-blue-500 underline" target="_blank">ftabuddy.com/docs</a>
			</p>
			<p class="py-1">
				Have feedback or found a bug? Submit it on <a
					href="https://github.com/FIRSTinMI/FTA-Buddy/issues"
					class="text-blue-500 underline"
					target="_blank">GitHub</a
				>.
			</p>
			<Button color="primary" class="w-full py-1" on:click={openChangelog}>Changelog</Button>
			<Button color="primary" class="w-full py-1" on:click={closeModal}>Close</Button>
		{/if}
	</div>
	<div class="flex justify-center gap-2 w-full" slot="footer">
		<Button color="dark" class="p-1" on:click={() => step--} disabled={step <= 0}><Icon icon="mdi:arrow-left" class="w-6 h-6" /></Button>
		{#each Array(7) as _, i}
			<Indicator color={step >= i ? "purple" : $settingsStore.darkMode ? "dark" : "gray"} class="my-auto" />
		{/each}
		<Button color="dark" class="p-1" on:click={() => step++} disabled={step >= 6}><Icon icon="mdi:arrow-right" class="w-6 h-6" /></Button>
	</div>
</Modal>
