<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, Indicator, Modal } from "flowbite-svelte";
	import { gestureEvents } from "../util/gestureDetection";
	import { onMount } from "svelte";
	import { settingsStore } from "../stores/settings";
	import { toast } from "../../../shared/toast";
	import { subscribeToPush } from "../util/notifications";
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
		<h1 class="text-xl text-black dark:text-white font-bold">Welcome to FTA Buddy</h1>
	</div>
	<div class="flex flex-col justify-left text-left gap-1 text-black dark:text-white h-full">
		{#if step === 0}
			<div class="grow">
				<p class="py-1">
					FTA Buddy is a mobile optimized field monitor that has feature creeped into alot more. <br />
				</p>
				<ul class="list-disc ml-10 py-1">
					<li>References</li>
					<li>Match Log Viewer</li>
					<li>CSA Tickets and Messages</li>
					<li>Team Notes</li>
					<li>Radio/Inspection Checklist</li>
					<li>Cycle Time Tracking</li>
					<li>Etc.</li>
				</ul>
				<p class="py-1">
					This guide will explain how to use the app, and what everything means. <br />
					You can return to this guide by clicking the help button in the menu.
				</p>
				<h1 class="font-bold mt-2 text-xl py-1">Setup</h1>
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
			</div>
			{#if matchCount}<span class="font-bold py-1">{matchCount.events} events have used FTA Buddy, playing {matchCount.matches} matches!</span>{/if}
		{:else if step === 1}
			<h2 class="font-bold">Monitor</h2>
			<p class="py-1">
				Click on the status to see more details including: how long since the last status change and troubleshooting suggestions. <br />
			</p>
			<div>
				<img src="/app/tutorial/monitor.png" alt="Monitor" class="sm:max-w-xl w-fit mx-auto py-1" />
			</div>
			<h2 class="font-bold py-1">Emojis</h2>
			<ul class="list-disc ml-10 py-1">
				<li><span class="text-2xl">👀</span>Something is taking longer than expected to connect.</li>
				<li><span class="text-2xl">🕑</span>This team frequently takes a long time to get connected.</li>
				<li><span class="text-2xl">🔍</span>Team has not passed inspection.</li>
				<li><span class="text-2xl">🛜</span>Team has not flashed radio.</li>
			</ul>
			<p class="py-1">The inspection and radio warnings are dependent on using the inspection and radio checklist features.</p>
			<h2 class="font-bold py-1">RIO Status</h2>
			<p class="py-1">
				Green: RIO connected and code running. <br />
				Yellow: RIO connected no code. <br />
				Red: No RIO.
			</p>
			<h2 class="font-bold py-1">Cycle Times</h2>
			<div>
				<img src="/app/tutorial/cycles.png" alt="Cycle Times" class="sm:max-w-xl w-fit mx-aut py-1" />
			</div>
			<p class="py-1">Cycle time information is displayed at the bottom of the monitor screen.</p>
			<p class="py-1">C: the last cycle time, if green that means it was your best cycle time yet.</p>
			<p class="py-1">T: the time since the last match started, or your current cycle time.</p>
		{:else if step === 2}
			<h2 class="font-bold">Radio/Inspection Checklist</h2>
			<p class="py-1">The button to access the checklist is in the hamburger menu</p>
			<p class="py-1">
				The checklist is synced between all devices connected to the same event. So you can have someone checking off teams as they get their radio
				programmed, and someone else in the pits will know who to remind to get it done.
			</p>
			<p class="py-1">The checklist will also automatically track when a robot connects to the field successfully.</p>
			<div>
				<img src="/app/tutorial/checklist.png" alt="Checklist" class="sm:max-w-xl w-fit mx-auto py-1" />
			</div>
		{:else if step === 3}
			<h2 class="font-bold">Match Logs</h2>
			<p class="py-1">Click the share button to generate a temporary public link to that specific log.</p>
			<p class="py-1">
				The legend can toggle the visibility of data on the graph. <br />
				There is a select box to choose which columns to display in the table.
			</p>
			<div>
				<img src="/app/tutorial/logs.png" alt="Navigation" class="sm:max-w-xl w-fit mx-auto py-1" />
			</div>
		{:else if step === 4}
			<h2 class="font-bold py-1">CSA Tickets and Messages</h2>
			<p class="py-1">FTAs, FTAAs, CSAs and Teams can create tickets for any team at the event that has issues requiring the help of a CSA.</p>
			<p class="py-1">Messages can be added to individual tickets to detail what the CSA has done with that ticket. Tickets cannot be closed without at least 1 message.</p>
			<p class="py-1">All tickets can be reopened if closed prematurely.</p>
			<p class="italic font-bold py-1">Process Steps:</p>
			<ul class="list-decimal ml-5">
				<li class="py-1">Create a ticket for a team. The ticket will then appear on the Tickets Page. Whoever created the ticket will be automatically added to that ticket's followers list.</li>
				<li class="py-1">Any user can assign themselves to said ticket, and any followers of that ticket will be notified via push notification. Any user can follow any ticket.</li>
				<li class="py-1">All followers of the ticket will be notified when a message has been added to a ticket. Use messages to add details to the ticket, or to request more information from the ticket author.</li>
				<li class="py-1 pb-2">Once a ticket has been resolved, post a message on the ticket detailing what was done to resolve the ticket, then close the ticket. All ticket followers will be notified that the ticket has been closed.</li>
			</ul>
		{:else if step === 5}
			<h2 class="font-bold py-1">Tickets Page</h2>
			<p class="py-1">Refresh the Tickets Page using the refresh button to see new tickets.</p>
			<p class="py-1">Tickets will be ordered by time of their last update.</p>
			<p class="py-1">Filter the ticket list using the search bar and drop-down</p>
			<ul class="py-1 list-disc ml-5">
				<li>The search bar will filter by team number, team name, subject, or assigned user.</li>
				<li>The drop-down will filter by assignation status</li>
			</ul>
			<div>
				<img src="/app/tutorial/ticket_list.png" alt="Ticket_List" class="sm:max-w-xl w-fit mx-auto" />
			</div>
			<p class="py-1">Click a Ticket Card to navigate to the page for that ticket.</p>
			<p class="py-1">Ticket Cards for individual tickets will display the following:</p>
			<ul class="py-1 list-disc ml-5">
				<li>Ticket Number</li>
				<li>Associated Team Number</li>
				<li>Open/Closed Status</li>
				<li>Assignation Status/Assigned User</li>
				<li>Time and Date Created</li>
				<li>Ticket Subject</li>
				<li>Either the Ticket Description or the Most Recent Message on the Ticket</li>
			</ul>
			<div>
				<img src="/app/tutorial/ticket_card.png" alt="Ticket_Card" class="sm:max-w-xl w-fit mx-auto" />
			</div>
		{:else if step === 6}
			<h2 class="font-bold">Creating Tickets</h2>
			<p class="py-1">Any user can create tickets for teams experiencing problems that require the help of a CSA.</p>
			<div>
				<img src="/app/tutorial/ticket_create_button.png" alt="Ticket_Create" class="sm:max-w-xl w-fit mx-auto pb-2" />
			</div>
			<p class="py-1">You can attach a specific match to a ticket when creating it, and then the log for that match will be linked in the ticket.</p>
			<p class="py-1">You will not be able to create a ticket if you are missing required data. Only the Match field is optional</p>
			<div>
				<img src="/app/tutorial/ticket_create.png" alt="Ticket_Create" class="sm:max-w-xl w-fit mx-auto" />
			</div>
		{:else if step === 7}
			<h2 class="font-bold">Enable/Disable Public Ticket Creation</h2>
			<p class="py-1">By default, there is a Public Ticket Creation page enabled to allow teams to create their own tickets.</p>
			<p class="py-1">Click the settings button on the Event Tickets page to view options related to this.</p>
			<div>
				<img src="/app/tutorial/public_ticket_button.png" alt="Public_Ticket_Button" class="sm:max-w-xl w-fit mx-auto pb-2" />
			</div>
			<p class="py-1">To print a QR code page to place at Pit Admin or within Teams' pits at the event, click the "Print QR Code" button.</p>
			<p class="py-1">If this feature is being abused at the event in any way (spam, unneeded/invalid tickets, etc.), any user can disable it using the labeled toggle.</p>
			<div>
				<img src="/app/tutorial/public_ticket_modal.png" alt="Public_Ticket_Window" class="sm:max-w-xl w-fit mx-auto pb-2" />
			</div>
			<p class="py-1 pb-2 font-bold italic">If you do disable this feature, be sure to notify your event FTA so that they can make an announcement at the event regarding this.</p>
		{:else if step === 8}
			<h2 class="font-bold">Ticket Detail Page</h2>
			<p class="py-1">If you are not the author of the ticket being viewed, the page will look like this:</p>
			<div>
				<img src="/app/tutorial/ticket_view_notauthor.png" alt="Ticket_View_Not_Author" class="sm:max-w-xl w-fit mx-auto pb-2" />
			</div>
			<p class="py-1">Ticket Button Descriptions:</p>
			<ul class="py-1 list-disc ml-5">
				<li>Arrow - Navigates to the previous page</li>
				<li>Follow - Adds you to the list of followers for that ticket. If you have ticket follow notifications enabled, you will recieve notifications about this ticket</li>
				<li>Arrow Circle - Refresh page. It should update automatically, but if there is missing info please refresh.</li>
				<li>👀 Claim Ticket - Assigns your user profile to this ticket</li>
				<li>Close Ticket - Sets the status of this ticket to "Closed"</li>
			</ul>
			<p class="py-1">If you are the author of the ticket being viewed, the page will include extra buttons for editing and deleting the ticket.
			<p class="py-1 italic">Please note: Tickets that do not have messages or are closed cannot be deleted.</p>
			<p class="py-1">If you post a message on a ticket, you can edit or delete it with the buttons on the corresponding message card.</p>
		{:else if step === 9}
			<h2 class="font-bold">Team Notes</h2>
			<p class="py-1">You can create notes for any team. These notes will be visible at any event the team attends afterwards.</p>
			<div>
				<img src="/app/tutorial/notes.png" alt="Notes_List" class="sm:max-w-xl w-fit mx-auto" />
			</div>
			<p class="py-1">Please keep this in mind and only make notes about things future volunteers need to know about that team, such as making note of an issue they were having that you were unable to solve.</p>
			<div>
				<img src="/app/tutorial/note_create.png" alt="Note_Create" class="sm:max-w-xl w-fit mx-auto pb-2" />
			</div>
		{:else if step === 10}
			<h2 class="font-bold">Notifications</h2>
			<p class="py-1">You will be asked to enable notifications when you log in and register for an event, if you have not already enabled them.</p>
			<p class="py-1">You can change which types of notifications you recieve on the Settings Page. All are set to ON by default. See Below:</p>
			<div>
				<img src="/app/tutorial/notifications_settings.png" alt="Notification_Settings" class="sm:max-w-xl w-fit mx-auto" />
			</div>
			<ul class="py-1 list-disc ml-5">
				<li>Enable Notifications - toggles overall notifications settings for the app</li>
				<li>New Tickets - toggles push notifications for when any new ticket is created</li>
				<li>Followed Ticket Updates - toggles push notifications for when the tickets you follow are updated</li>
				<li>Assigned Ticket Updates - toggles push notifications for when you are assigned a ticket</li>
				<li>Robot Status Updates - toggles push notifications for Robot statuses from the field</li>
			</ul>
			<p class="py-1">The bottom menu bar will display an indicator showing how many unread notifications you have.</p>
			<div>
				<img src="/app/tutorial/bottom_bar.png" alt="Bottom_Bar_Notifications_Indicator" class="sm:max-w-xl w-fit mx-auto" />
			</div>
			<p class="py-1">The Notifications page displays all notifications sent to your user EXCEPT Robot Status Notifications.</p>
			<p class="py-1">You can get here from the hamburger menu or from the bottom menu bar.</p>
			<p class="py-1">Click individual notifications to clear them, or press the "Clear All Notifications" button</p>
			<div>
				<img src="/app/tutorial/notifications_list.png" alt="Notifications_List" class="sm:max-w-xl w-fit mx-auto" />
			</div>
			<p class="py-1"><b>FTAs and FTAAs PLEASE NOTE: </b>All of your notifications will automatically be cleared when you visit the Tickets page.</p>
		{:else if step === 11}
			<h2 class="font-bold">Documentation</h2>
			<p class="py-1">
				More information about the app and the API can be found on the <a
					href="https://ftabuddy.com/docs/"
					target="_blank"
					class="underline text-blue-500">docs</a
				> site.
			</p>
			<h2 class="font-bold py-1">Setup</h2>
			<p class="py-1">To set up the app for your event, visit FTABuddy.com on a computer connected to the field network, and follow the instructions for hosting.</p>
			<h2 class="font-bold py-1">Feedback</h2>
			<p class="py-1">
				If you have any feedback or feature requests, please let us know on our <a
					href="https://github.com/FIRSTinMI/FTA-Buddy/issues"
					class="underline text-blue-500">GitHub</a
				> page.
			</p>
			<Button color="primary" class="w-full py-1" on:click={openChangelog}>Changelog</Button>
			<Button color="primary" class="w-full py-1" on:click={closeModal}>Close</Button>
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
		<Indicator color={step >= 6 ? "purple" : $settingsStore.darkMode ? "dark" : "gray"} class="my-auto" />
		<Indicator color={step >= 7 ? "purple" : $settingsStore.darkMode ? "dark" : "gray"} class="my-auto" />
		<Indicator color={step >= 8 ? "purple" : $settingsStore.darkMode ? "dark" : "gray"} class="my-auto" />
		<Indicator color={step >= 9 ? "purple" : $settingsStore.darkMode ? "dark" : "gray"} class="my-auto" />
		<Indicator color={step >= 10 ? "purple" : $settingsStore.darkMode ? "dark" : "gray"} class="my-auto" />
		<Indicator color={step >= 11 ? "purple" : $settingsStore.darkMode ? "dark" : "gray"} class="my-auto" />
		<Button color="dark" class="p-1" on:click={() => step++} disabled={step >= 11}><Icon icon="mdi:arrow-right" class="w-6 h-6" /></Button>
	</div>
</Modal>
