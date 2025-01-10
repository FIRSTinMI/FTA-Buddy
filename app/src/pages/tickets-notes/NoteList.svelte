<script lang="ts">
	import { Alert, Button, Label, Select, Textarea, ToolbarButton, Modal } from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import { get } from "svelte/store";
	import TicketCard from "../../components/TicketCard.svelte";
	import { trpc } from "../../main";
	import { eventStore, type Event } from "../../stores/event";
	import Icon from "@iconify/svelte";
	import { userStore } from "../../stores/user";
	import { toast } from "../../../../shared/toast";
	import NotesPolicy from "../../components/NotesPolicy.svelte";
	import { settingsStore } from "../../stores/settings";
	import Spinner from "../../components/Spinner.svelte";
    import type { Note, Ticket } from "../../../../shared/types";
    import NoteCard from "../../components/NoteCard.svelte";
	import { navigate } from "svelte-routing";

	let createModalOpen = false;

	let teamSelected = -1; 

	let teams: Event["teams"] = get(eventStore).teams || [];

	let teamOptions = teams
		.sort((a, b) => parseInt(a.number) - parseInt(b.number))
		.map((v) => ({ value: parseInt(v.number), name: `${v.number} - ${v.name}` }));

	teamOptions.unshift({value: -1, name: "No Selected Team"})

	let filteredNotes: Note[] | null;

	let notes: Awaited<ReturnType<typeof trpc.notes.getAll.query>> = [] as Note[];

	let notesPromise: Promise<any> | undefined;

	async function getNotes() {
		notesPromise = trpc.notes.getAll.query();
		notes = await notesPromise;
	}

	function filterNotes() {
		if (teamSelected !== -1) {
			filteredNotes = notes.filter(note => note.team === teamSelected)
		}
	}

	onMount(() => {
		getNotes();
	});

	let notesPolicyElm: NotesPolicy;
	let open = false;

	let team: number | undefined;
	const event = get(eventStore);


	let matchId: string | undefined = undefined;

	let disableSubmit = false;

	let noteText: string = "";

	$: {
		disableSubmit = team === undefined || team === -1 || noteText.length < 1;
	}

	async function createNote(evt: Event) {
		if (team === undefined || team === -1) return;

		try {
			if (!$settingsStore.acknowledgedNotesPolicy) {
				await notesPolicyElm.confirmPolicy();
			}

			const res = await trpc.notes.create.query({
				team: team,
				text: noteText,
			});
			toast("Note created successfully", "success", "green-500");
			navigate("/app/notes");
		} catch (err: any) {
			toast("An error occurred while creating the note", err.message);
			console.error(err);
			return;
		}
	}
</script>

<NotesPolicy bind:this={notesPolicyElm} /> 

<Modal bind:open={createModalOpen} size="lg" outsideclose dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex">
<div slot="header"><h1 class="text-2xl font-bold text-black dark:text-white">Create a Note</h1></div>
<form class="text-left flex flex-col gap-4" on:submit|preventDefault={createNote}>
	<Label class="w-full text-left">
		Select Team:
		<Select class="mt-2" items={teamOptions} bind:value={teamSelected}/>
	</Label>
</form>
</Modal>

<div class="container max-w-6xl mx-auto px-2 pt-2 h-full flex flex-col gap-2">
	<div class="flex flex-col overflow-y-auto h-dvh">
		<div class="flex flex-col grow gap-2">
			<h1 class="text-3xl" style="font-weight: bold">Event Team Notes</h1>
			<Button class="m-3" on:click={() => (createModalOpen = true)}>Create a New Note</Button>
			<Label>
                Select a Team (optional):
                <Select class="mt-2" items={teamOptions} bind:value={teamSelected} />
            </Label>
			<div class="flex flex-row space-x-2">
				<Button class="w-1/2" on:click={() => filterNotes()}>Apply Filters</Button>
				<Button class="w-1/2" on:click={() => (teamSelected = -1)}>Clear Filters</Button>
			</div>
		</div>
		<div class="flex flex-col grow gap-2">
			{#await notesPromise}
				<Spinner />
			{:then}
				{#if teamSelected !== -1}
                    {#if !filteredNotes || filteredNotes.length < 1}
                        <div class="text-center">No Notes Found for Selected Team</div>
                    {:else}
                        {#each filteredNotes as note}
                            <NoteCard {note} />
                        {/each}
                    {/if}
				{:else}
                    {#if !notes || notes.length < 1}
                        <div class="text-center">No Notes Yet</div>
                    {:else}
                        {#each notes as note}
                            <NoteCard {note} />
                        {/each}
                    {/if}
                        {/if}
			{/await}
		</div>
	</div>
</div>
