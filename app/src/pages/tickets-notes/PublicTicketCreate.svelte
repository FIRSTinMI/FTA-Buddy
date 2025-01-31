<script lang="ts">
	import { Button, Input, Label, Modal, Textarea } from "flowbite-svelte";
	import { onMount } from "svelte";
	import { toast } from "../../../../shared/toast";
	import { trpc } from "../../main";

	export let eventCode: string;

	let ticketCreated = false;

	let agreeTerms = false;

	let termsPopupOpen = true;

	let event_code = eventCode;

	onMount(() => {});

	let team: string | undefined;

	let disableSubmit = false;

	let ticketSubject: string = "";
	let ticketText: string = "";

	$: {
		disableSubmit = agreeTerms === false || team === undefined || ticketText.length === 0 || ticketSubject.length === 0;
	}

	async function createTicket(evt: SubmitEvent) {
		if (agreeTerms === false || team === undefined || ticketText.length === 0 || ticketSubject.length === 0) return;

		try {
			const res = await trpc.tickets.publicCreate.query({
				event_code: event_code,
				team: parseInt(team),
				subject: ticketSubject,
				text: ticketText,
			});
			ticketCreated = true;
			//toast("Ticket created successfully", "success", "green-500");
		} catch (err: any) {
			toast("An error occurred while creating the ticket", err.message);
			console.error(err);
			return;
		}
	}
</script>

<Modal bind:open={termsPopupOpen} size="sm" dismissable={false} dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex">
	<h1 class="font-bold text-2xl">Terms and Conditions</h1>
	<p class="text-center">All Tickets are saved after the end of the event and can be viewed by volunteers at other events the team attends in the future.</p>
	<p class="text-center">
		Keep this in mind when writing your Ticket, keep it GP and don't include any personal information like names, phone numbers, or emails.
	</p>
	<p class="text-center">Ticket creation will be disabled if abused.</p>
	<Button
		on:click={() => {
			agreeTerms = true;
			termsPopupOpen = false;
			console.log(`agreeTerms = ${agreeTerms}`);
		}}>Agree</Button
	>
	<Button
		on:click={() => {
			window.open("", "_self");
			window.close();
			// If closing the window doesn't work, redirect to google.com
			window.location.href = "https://www.google.com";
		}}>Do Not Agree</Button
	>
</Modal>

<div class="container max-w-6xl mx-auto px-2 pt-2 h-full flex flex-col gap-2">
	{#if ticketCreated === false}
		<h1 class="text-3xl font-bold text-black dark:text-white">Create a Ticket</h1>
		<form class="text-left flex flex-col gap-4" on:submit|preventDefault={createTicket}>
			<div>
				<Label class="w-full text-left">Team Number</Label>
				<Input type="number" id="team" required bind:value={team}></Input>
			</div>
			<div>
				<Label for="subject">Ticket Subject:</Label>
				<Textarea id="subject" class="w-full" required bind:value={ticketSubject} />
			</div>
			<div>
				<Label for="text">Ticket Text:</Label>
				<Textarea id="text" class="w-full" rows="5" required bind:value={ticketText} />
			</div>

			<Button type="submit" disabled={disableSubmit}>Create Ticket</Button>
		</form>
	{:else}
		<h1 class="text-3xl font-bold text-black dark:text-white">Ticket Has Been Created Successfully!</h1>
		<p class="font-bold text-black dark:text-white">Please refresh the page if you wish to create another Ticket.</p>
	{/if}
</div>
