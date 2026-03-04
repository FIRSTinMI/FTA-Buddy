<script lang="ts">
	import { Button, Input, Label, Modal, Textarea } from "flowbite-svelte";
	import { onMount } from "svelte";
	import { trpc } from "../../main";
	import { toast } from "../../util/toast";

	interface Props {
		eventCode: string;
	}

	let { eventCode }: Props = $props();

	let noteCreated = $state(false);

	let agreeTerms = $state(false);

	let termsPopupOpen = $state(true);

	onMount(() => {});

	let team: string | undefined = $state();

	let noteText: string = $state("");

	let disableSubmit = $derived(agreeTerms === false || team === undefined || noteText.length === 0);

	async function createNote(evt: SubmitEvent) {
		evt.preventDefault();
		if (agreeTerms === false || team === undefined || noteText.length === 0) return;

		try {
			const res = await trpc.notes.publicCreate.mutate({
				event_code: eventCode,
				team: parseInt(team),
				text: noteText,
			});
			noteCreated = true;
		} catch (err: any) {
			toast("An error occurred while creating the note", err.message);
			console.error(err);
			return;
		}
	}
</script>

<Modal bind:open={termsPopupOpen} size="sm" dismissable={false}>
	<h1 class="font-bold text-2xl">Terms and Conditions</h1>
	<p class="text-center">
		All Notes are saved after the end of the event and can be viewed by volunteers at other events the team attends
		in the future.
	</p>
	<p class="text-center">
		Keep this in mind when writing your Note, keep it GP and don't include any personal information like names,
		phone numbers, or emails.
	</p>
	<p class="text-center">Note creation will be disabled if abused.</p>
	<Button
		onclick={() => {
			agreeTerms = true;
			termsPopupOpen = false;
			console.log(`agreeTerms = ${agreeTerms}`);
		}}>Agree</Button
	>
	<Button
		onclick={() => {
			window.open("", "_self");
			window.close();
			// If closing the window doesn't work, redirect to google.com
			window.location.href = "https://www.google.com";
		}}>Do Not Agree</Button
	>
</Modal>

<div class="container max-w-6xl mx-auto px-2 pt-2 h-full flex flex-col gap-2 overflow-y-auto">
	{#if noteCreated === false}
		<h1 class="text-3xl font-bold text-black dark:text-white">Submit a Note</h1>
		<form class="text-left flex flex-col gap-4" onsubmit={createNote}>
			<div>
				<Label class="w-full text-left">Team Number</Label>
				<Input type="number" id="team" required bind:value={team}></Input>
			</div>
			<div>
				<Label for="text">Describe your issue:</Label>
				<Textarea id="text" class="w-full" rows={5} required bind:value={noteText} />
			</div>

			<Button type="submit" disabled={disableSubmit}>Submit Note</Button>
		</form>
	{:else}
		<h1 class="text-3xl font-bold text-black dark:text-white">Note Has Been Created Successfully!</h1>
		<p class="font-bold text-black dark:text-white">Please refresh the page if you wish to submit another Note.</p>
	{/if}
</div>
