<script lang="ts">
	import { Alert, Button, Label, Select, Textarea, ToolbarButton } from "flowbite-svelte";
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

	let teamSelected = -1; 

	let teams: Event["teams"] = get(eventStore).teams || [];

	let teamOptions = teams
		.sort((a, b) => parseInt(a.number) - parseInt(b.number))
		.map((v) => ({ value: parseInt(v.number), name: `${v.number} - ${v.name}` }));

	let filteredNotes: Note[] | null;

	let notes: Awaited<ReturnType<typeof trpc.notes.getAll.query>> = [] as Note[];

	let notesPromise: Promise<any> | undefined;

	async function getNotes() {
		notesPromise = trpc.notes.getAll.query();
		notes = await notesPromise;
	}

	onMount(() => {
		getNotes();
	});

	let notesPolicyElm: NotesPolicy;
</script>

<NotesPolicy bind:this={notesPolicyElm} />

<div class="container max-w-6xl mx-auto px-2 pt-2 h-full flex flex-col gap-2">
	<div class="flex flex-col overflow-y-auto h-dvh">
		<div class="flex flex-col grow gap-2">
			<h1 class="text-3xl" style="font-weight: bold">Event Team Notes</h1>
			<Label>
                Select a Team
                <Select class="mt-2" items={teamOptions} bind:value={teamSelected} />
            </Label>
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
