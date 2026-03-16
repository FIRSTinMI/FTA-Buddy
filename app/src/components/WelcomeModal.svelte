<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, Indicator, Modal } from "flowbite-svelte";
	import { onMount } from "svelte";
	import { trpc } from "../main";
	import { installPrompt } from "../stores/install-prompt";
	import { gestureEvents } from "../util/gestureDetection";

	const LAST_STEP = 6;

	let { welcomeOpen = $bindable(false), closeModal = () => {}, openChangelog = () => {} } = $props();

	onMount(() => {
		step = 0;
		gestureEvents.addEventListener("swipeLeft", () => {
			if (step < LAST_STEP) step++;
		});
		gestureEvents.addEventListener("swipeRight", () => {
			if (step > 0) step--;
		});
	});

	let step = $state(0);
	let matchCount: Awaited<ReturnType<typeof trpc.match.getNumberOfMatches.query>> | undefined = $state();

	async function getMatchCount() {
		if (!matchCount) matchCount = await trpc.match.getNumberOfMatches.query();
	}

	$effect(() => {
		if (welcomeOpen) getMatchCount();
	});
</script>

<Modal bind:open={welcomeOpen} dismissable outsideclose size="lg">
	{#snippet header()}
		<h1 class="text-xl text-black dark:text-white font-bold">Welcome to FTA Buddy</h1>
	{/snippet}
	<div
		class="flex flex-col justify-left text-left gap-1 text-black dark:text-white h-full"
		style="height: calc(100vh - 24rem)"
	>
		{#if step === 0}
			<p class="py-1">
				FTA Buddy is your all-in-one tool for managing field operations. Designed for FTAs, CSAs, and other
				volunteers, it brings everything into one place.
			</p>
			<ul class="list-disc ml-10 py-1">
				<li>Live match monitoring and cycle times</li>
				<li>Match logs with graphs and auto-detected events</li>
				<li>Notepad with notes, auto-detected events, and field view</li>
				<li>Shared checklist with Nexus and radio kiosk sync</li>
				<li>Reference materials and diagrams</li>
			</ul>
			<p class="py-1">You can access all features through the sidebar or bottom navigation.</p>
			{#if $installPrompt}
				<h2 class="font-bold py-1">Install this App</h2>
				<p class="py-1">Recommended for the best experience.</p>
				<Button
					color="primary"
					class="w-fit py-1"
					size="sm"
					onclick={() => {
						if ($installPrompt) $installPrompt.prompt();
					}}>Install</Button
				>
			{:else if navigator.userAgent.includes("iPhone")}
				<h2 class="font-bold py-1">Install this App</h2>
				<p class="py-1">Recommended for the best experience.</p>
				<p class="py-1">On iOS you can do this by clicking the share button and then "Add to Home Screen".</p>
			{:else}
				<p class="py-1">App installed ✅</p>
			{/if}
			{#if matchCount}<span class="font-bold py-1"
					>{matchCount.events} events have used FTA Buddy, playing {matchCount.matches} matches!</span
				>{/if}
		{:else if step === 1}
			<h2 class="font-bold">Monitor & Cycle Times</h2>
			<p class="py-1">
				Track real-time team connections, RIO status, and radio status. Warning icons highlight common problems
				at a glance.
			</p>
			<p class="py-1">
				Cycle time data shows how quickly the field is turning matches. "C" is last cycle time, "T" is current
				cycle length.
			</p>

			<h2 class="font-bold py-1">Warning Icons</h2>
			<ul class="list-disc ml-10 py-1">
				<li><span class="text-2xl">👀</span> Something is taking longer than expected to connect.</li>
				<li><span class="text-2xl">🕑</span> This team frequently takes a long time to get connected.</li>
				<li><span class="text-2xl">🔍</span> Team has not passed inspection.</li>
				<li><span class="text-2xl">🛜</span> Team has not had their radio programmed.</li>
				<li><span class="text-2xl">📝</span> Team has an open or recently resolved note.</li>
				<li><span class="text-2xl">⚙️</span> Team had an auto-detected issue in a previous match.</li>
			</ul>

			<img src="/tutorial/monitor.png" alt="Monitor" class="sm:max-w-xl w-fit mx-auto py-1" />
			<img src="/tutorial/cycles.png" alt="Cycles" class="sm:max-w-xl w-fit mx-auto py-1" />
		{:else if step === 2}
			<h2 class="font-bold">Notepad Feed View</h2>
			<p class="py-1">
				The Notepad is your hub for tracking team issues. The <strong>Feed</strong> view shows all notes and auto-detected
				match events in a scrollable list. Use the filter tabs to show All, Notes only, or Events only.
			</p>
			<p class="py-1">
				Create notes to track team issues, they can be assigned to volunteers, followed for update
				notifications, and include threaded messages for collaboration. Note types include <strong
					>Team Notes</strong
				>,
				<strong>Event Notes</strong>, and <strong>Match Notes</strong>. Team notes can be marked as Open or
				Resolved and carry across events.
			</p>
			<h2 class="font-bold py-1">Public Note Submission</h2>
			<p class="py-1">
				Teams can submit their own notes via QR code or kiosk link, reducing the need for paper and speeding up
				support. Public submission can be toggled on or off at any time from event settings.
			</p>
			<img src="/tutorial/notepad_feed.png" alt="Notepad Feed" class="sm:max-w-xl w-fit mx-auto py-1" />
		{:else if step === 3}
			<h2 class="font-bold">Notepad Field View</h2>
			<p class="py-1">
				The <strong>Field</strong> view shows a card for each of the six teams on the field, organized by alliance.
				Each card displays the team's notes and active match events, with live DS, radio, RIO, and code status indicators
				when connected to the field monitor.
			</p>
			<p class="py-1">
				You can quickly create notes, view station logs, and dismiss or convert match events directly from each
				team card. Navigate between matches with the arrow buttons, or enable auto-advance to automatically
				follow the current match on prestart.
			</p>
			<p class="py-1">Click a team number to jump to their full note history in the Feed view.</p>
			<img src="/tutorial/notepad_field.png" alt="Notepad Field View" class="sm:max-w-xl w-fit mx-auto py-1" />
		{:else if step === 4}
			<h2 class="font-bold">Match Logs & Auto-Detected Events</h2>
			<p class="py-1">
				Match logs show detailed per-team connection data including DS, radio, RIO, code status, battery
				voltage, ping, bandwidth utilization, signal strength, and more. View interactive graphs, share links
				with QR codes, and export to CSV.
			</p>
			<h2 class="font-bold py-1">Auto-Detected Events</h2>
			<p class="py-1">
				After each match, logs are automatically analyzed for issues such as code disconnects, RIO disconnects,
				radio disconnects, DS disconnects, brownouts, ping spikes, sustained high ping, low signal, and high
				bandwidth usage.
			</p>
			<p class="py-1">
				Detected events appear in the Notepad feed alongside notes. You can <strong>dismiss</strong> events that
				don't need follow-up or <strong>convert</strong> them into full notes for tracking. Each issue type can be
				toggled on or off per event from the event management page.
			</p>
			<img src="/tutorial/logs.png" alt="Logs" class="sm:max-w-xl w-fit mx-auto py-1" />
		{:else if step === 5}
			<h2 class="font-bold">Checklist & Sync</h2>
			<p class="py-1">
				Track which teams are present, have passed inspection, programmed their radio, and completed connection
				testing. The checklist syncs in real-time across all users in the event.
			</p>
			<h2 class="font-bold py-1">Nexus Inspection Sync</h2>
			<p class="py-1">
				Connect a Nexus API key in event settings to automatically sync inspection status from frc.nexus. The
				server polls Nexus and updates the checklist automatically. The browser extension can also provide
				bi-directional sync when installed on a computer with Nexus open.
			</p>
			<h2 class="font-bold py-1">Radio Kiosk Sync</h2>
			<p class="py-1">
				Install the FTA Buddy browser extension on the WPA Kiosk computer to automatically mark teams as
				radio-programmed when their radio is successfully flashed. Visit the Kiosk page in event management to
				set it up.
			</p>
			<img src="/tutorial/checklist.png" alt="Checklist" class="sm:max-w-xl w-fit mx-auto py-1" />
		{:else if step === 6}
			<h2 class="font-bold">Learn More</h2>
			<p class="py-1">
				Read full documentation at <a
					href="https://ftabuddy.com/docs/"
					class="text-blue-500 underline"
					target="_blank">ftabuddy.com/docs</a
				>
			</p>
			<p class="py-1">
				Have feedback or found a bug? Submit it on <a
					href="https://github.com/FIRSTinMI/FTA-Buddy/issues"
					class="text-blue-500 underline"
					target="_blank">GitHub</a
				>.
			</p>
			<Button color="primary" class="w-full py-1" onclick={() => openChangelog()}>Changelog</Button>
			<Button color="primary" class="w-full py-1" onclick={() => closeModal()}>Close</Button>
		{/if}
	</div>
	{#snippet footer()}
		<div class="flex justify-center gap-2 w-full">
			<Button color="dark" class="p-1" onclick={() => step--} disabled={step <= 0}
				><Icon icon="mdi:arrow-left" class="w-6 h-6" /></Button
			>
			{#each Array(LAST_STEP + 1) as _, i}
				<Indicator color={step >= i ? "purple" : "gray"} class="my-auto" />
			{/each}
			<Button color="dark" class="p-1" onclick={() => step++} disabled={step >= LAST_STEP}
				><Icon icon="mdi:arrow-right" class="w-6 h-6" /></Button
			>
		</div>
	{/snippet}
</Modal>
