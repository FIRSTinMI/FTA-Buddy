<script lang="ts">
	import { Alert, Button, Label, Select, Textarea, ToolbarButton, Modal, Input } from "flowbite-svelte";
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
	import { SearchOutline } from "flowbite-svelte-icons";

	let createModalOpen = false;

	const teamNames = Object.fromEntries($eventStore.teams.map((team) => [team.number, team.name]));

	let teamOptions = $eventStore.teams
		.sort((a, b) => parseInt(a.number) - parseInt(b.number))
		.map((v) => ({ value: parseInt(v.number), name: `${v.number} - ${v.name}` }));

	let search: string = "";

	let filteredNotes: Note[] | null;

	let notes: Awaited<ReturnType<typeof trpc.notes.getAll.query>> = [] as Note[];

	let notesPromise: Promise<any> | undefined;

	async function getNotes() {
		notesPromise = trpc.notes.getAll.query();
		notes = await notesPromise;
	}

	// If the eventToken changes, we need to refetch the tickets and update the subscription
	let eventToken = $userStore.eventToken;
	userStore.subscribe((value) => {
		if (value.eventToken !== eventToken) {
			eventToken = value.eventToken;
			getNotes();
		}
	});

	function filterNotes(notes: Note[], search: string) {
		if (search.length > 0) {
			const tokenized = search.toLowerCase().split(" ");

			notes = notes.filter((note) => {
				return tokenized.every((token) => note.team.toString().includes(token) || teamNames[note.team].toLowerCase().includes(token));
			});
		}
		filteredNotes = notes.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
	}

	$: filterNotes(notes, search);

	onMount(() => {
		getNotes();
	});

	let notesPolicyElm: NotesPolicy;
	let open = false;

	let team: number | undefined;
	export let teamNumber: string | undefined;

	let disableSubmit = false;

	let noteText: string = "";

	$: {
		disableSubmit = team === undefined || team === -1 || noteText.length < 1;
	}

	async function createNote(evt: SubmitEvent) {
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
			location.reload();
		} catch (err: any) {
			toast("An error occurred while creating the note", err.message);
			console.error(err);
			return;
		}
	}

	onMount(() => {
		if (teamNumber) {
			try {
				team = parseInt(teamNumber);
				search = teamNumber;
			} catch (err) {
				console.error(err);
			}
		}
	});
</script>

<NotesPolicy bind:this={notesPolicyElm} />

<Modal bind:open={createModalOpen} size="lg" outsideclose dialogClass="fixed top-0 start-0 end-0 h-modal md:inset-0 md:h-full z-40 w-full p-4 flex">
	<div slot="header"><h1 class="text-2xl p-2 font-bold text-black dark:text-white">Create a Note</h1></div>
	<form class="text-left flex flex-col gap-4" on:submit={createNote}>
		<Label class="w-full text-left">
			Select Team:
			<Select class="mt-2" items={teamOptions} bind:value={team} />
		</Label>
		<Label for="text">Text:</Label>
		<Textarea id="text" class="w-full" rows="5" bind:value={noteText} />

		<Button type="submit" disabled={disableSubmit}>Create Note</Button>
	</form>
</Modal>

<div class="container max-w-6xl mx-auto px-2 pt-2 h-full flex flex-col gap-2">
	<div class="flex flex-col overflow-y-auto h-full gap-2">
		<h1 class="text-3xl mt-2 font-bold pt-2">Team Notes</h1>
		<Button class="max-w-3xl mx-auto w-full" on:click={() => (createModalOpen = true)}>Create New Note</Button>
		<div class="flex items-center gap-2 max-w-3xl w-full mx-auto">
			<Label class="w-full text-left">
				<span class="ml-2">Search</span>
				<Input class="w-full" placeholder="Search Team #, Team Name" bind:value={search}>
					<SearchOutline slot="left" class="size-5 text-gray-500 dark:text-gray-400" />
				</Input>
			</Label>
		</div>
		<div class="flex flex-col grow gap-2 overflow-y-auto mt-4 pb-2">
			{#await notesPromise}
				<Spinner />
			{:then}
				{#if !filteredNotes || filteredNotes.length < 1}
					<div class="text-center">No Notes Found</div>
				{:else}
					{#each filteredNotes as note}
						<NoteCard {note} />
					{/each}
				{/if}
			{/await}
		</div>
	</div>
</div>
