<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, Label, Modal, Select, Textarea } from "flowbite-svelte";
	import { onDestroy, onMount } from "svelte";
	import type { Note, NoteUpdateEventData, TournamentLevel } from "../../../../shared/types";
	import { trpc } from "../../main";
	import { eventStore } from "../../stores/event";
	import { settingsStore } from "../../stores/settings";
	import { userStore } from "../../stores/user";
	import { toast } from "../../util/toast";
	import NoteCard from "../NoteCard.svelte";
	import NotesPolicy from "../NotesPolicy.svelte";
	import Spinner from "../Spinner.svelte";

	interface Props {
		teamParam?: string | undefined;
	}

	let { teamParam }: Props = $props();

	const teamNames = Object.fromEntries($eventStore.teams.map((team) => [team.number, team.name]));

	let search: string = $state("");

	$effect(() => {
		if (teamParam) search = teamParam;
	});
	let typeFilter: string = $state("all");
	let statusFilter: string = $state("all");

	let notes: Note[] = $state([]);
	let filteredNotes: Note[] = $state([]);

	let loading = $state(true);

	function buildFeed() {
		let feed: Note[] = [...notes];

		// Type filter
		if (typeFilter !== "all") {
			feed = feed.filter((n) => n.note_type === typeFilter);
		}

		// Status filter
		if (statusFilter === "Open") {
			feed = feed.filter((n) => n.resolution_status === "Open");
		} else if (statusFilter === "Resolved") {
			feed = feed.filter((n) => n.resolution_status === "Resolved");
		}

		// Search filter
		if (search.length > 0) {
			const tokenized = search.toLowerCase().split(" ");
			feed = feed.filter((n) => {
				const teamStr = n.team?.toString() ?? "";
				const teamName = n.team !== null ? (teamNames[n.team]?.toLowerCase() ?? "") : "";
				const assignedName = n.assigned_to?.username?.toLowerCase() ?? "";
				return tokenized.every(
					(tok) =>
						teamStr.includes(tok) ||
						teamName.includes(tok) ||
						n.text.toLowerCase().includes(tok) ||
						assignedName.includes(tok),
				);
			});
		}

		filteredNotes = feed.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
	}

	$effect(() => {
		buildFeed();
	});

	async function fetchAll() {
		loading = true;
		try {
			notes = await trpc.notes.getAllWithMessages.query();
		} catch (err) {
			console.error("Failed to fetch support data:", err);
		} finally {
			loading = false;
		}
	}

	// Live updates subscription
	type Subscription = ReturnType<typeof trpc.notes.updateSubscription.subscribe>;
	let subscription: Subscription | undefined;

	function startSubscription() {
		subscription?.unsubscribe();
		subscription = trpc.notes.updateSubscription.subscribe(
			{ eventToken: $userStore.eventToken },
			{
				onError: console.error,
				onData: (data: NoteUpdateEventData) => {
					switch (data.kind) {
						case "create":
							notes = [...notes, data.note];
							break;
						case "edit": {
							const idx = notes.findIndex((n) => n.id === data.note.id);
							if (idx !== -1) notes[idx] = data.note;
							notes = [...notes];
							break;
						}
						case "delete":
							notes = notes.filter((n) => n.id !== data.note.id);
							break;
						case "status": {
							const note = notes.find((n) => n.id === data.note_id);
							if (note) {
								note.resolution_status = data.resolution_status;
								note.updated_at = new Date();
							}
							notes = [...notes];
							break;
						}
						case "assign": {
							const note = notes.find((n) => n.id === data.note_id);
							if (note) {
								note.assigned_to = data.assigned_to;
								note.assigned_to_id = data.assigned_to_id;
								note.updated_at = new Date();
							}
							notes = [...notes];
							break;
						}
						case "follow": {
							const note = notes.find((n) => n.id === data.note_id);
							if (note) {
								note.followers = data.followers;
								note.updated_at = new Date();
							}
							notes = [...notes];
							break;
						}
						case "add_message": {
							const note = notes.find((n) => n.id === data.note_id);
							if (note) {
								if (!note.messages) note.messages = [];
								note.messages.push(data.message);
								note.updated_at = new Date();
							}
							notes = [...notes];
							break;
						}
						case "edit_message": {
							const note = notes.find((n) => n.id === data.note_id);
							if (note?.messages) {
								const msg = note.messages.find((m) => m.id === data.message.id);
								if (msg) {
									msg.text = data.message.text;
									msg.updated_at = data.message.updated_at;
								}
								note.updated_at = new Date();
							}
							notes = [...notes];
							break;
						}
						case "delete_message": {
							const note = notes.find((n) => n.id === data.note_id);
							if (note?.messages) {
								note.messages = note.messages.filter((m) => m.id !== data.message_id);
								note.updated_at = new Date();
							}
							notes = [...notes];
							break;
						}
					}
				},
			},
		);
	}

	// Re-subscribe on eventToken change
	let eventToken = $userStore.eventToken;
	userStore.subscribe((value) => {
		if (value.eventToken !== eventToken) {
			eventToken = value.eventToken;
			fetchAll();
			startSubscription();
		}
	});

	onMount(() => {
		fetchAll();
		startSubscription();
	});

	onDestroy(() => subscription?.unsubscribe());

	// ── Create note modal ──
	let createModalOpen = $state(false);

	const teamOptions = $eventStore.teams
		.sort((a, b) => parseInt(a.number) - parseInt(b.number))
		.map((v) => ({ value: parseInt(v.number), name: `${v.number} – ${v.name}` }));

	let newNoteType: "TeamIssue" | "EventNote" | "MatchNote" = $state("TeamIssue");
	let newTeam: number | undefined = $state();
	let matchId: string | undefined = $state();
	let allMatchOptions: { value: string; name: string; match_number: number; play_number: number; level: string }[] =
		$state([]);
	let matchOptions: { value: string; name: string }[] = $state([]);
	let issueType: string | undefined = $state();
	let newNoteText: string = $state("");

	const ISSUE_TYPE_OPTIONS = [
		{ value: "RoboRioIssue", name: "RoboRIO Issue" },
		{ value: "DSIssue", name: "Driver Station Issue" },
		{ value: "NoRobot", name: "No Robot" },
		{ value: "RadioIssue", name: "Radio Issue" },
		{ value: "RobotPwrIssue", name: "Robot Power Issue" },
		{ value: "OtherRobotIssue", name: "Other Robot Issue" },
		{ value: "VenueIssue", name: "Venue Issue" },
		{ value: "ElectricalIssue", name: "Electrical Issue" },
		{ value: "MechanicalIssue", name: "Mechanical Issue" },
		{ value: "VolunteerIssue", name: "Volunteer Issue" },
		{ value: "Other", name: "Other" },
	];

	const QUICK_LABELS: { label: string; issueType: string }[] = [
		{ label: "Radio reboot", issueType: "RadioIssue" },
		{ label: "RIO reboot", issueType: "RoboRioIssue" },
		{ label: "Lost comms", issueType: "RadioIssue" },
		{ label: "Lost power", issueType: "RobotPwrIssue" },
		{ label: "Driver station issues", issueType: "DSIssue" },
		{ label: "Controller issues", issueType: "DSIssue" },
		{ label: "Code issues", issueType: "RoboRioIssue" },
		{ label: "CAN issues", issueType: "RoboRioIssue" },
		{ label: "Unable to drive", issueType: "OtherRobotIssue" },
		{ label: "BYPASSED - no connection", issueType: "RadioIssue" },
		{ label: "BYPASSED - no code", issueType: "RoboRioIssue" },
		{ label: "BYPASSED - no robot", issueType: "NoRobot" },
	];

	let disableSubmit = $derived.by(() => {
		if (newNoteText.length < 1) return true;
		if (newNoteType === "TeamIssue") return newTeam === undefined || newTeam === -1;
		if (newNoteType === "MatchNote") return matchId === undefined;
		return false;
	});

	async function loadAllMatches() {
		try {
			const matches = await trpc.match.getMatches.query({});
			allMatchOptions = matches.map((m: any) => {
				const levelLabel = m.level === "Qualification" ? "Qual" : m.level === "Playoff" ? "Playoff" : m.level;
				return {
					value: m.id,
					name: `${levelLabel} M${m.match_number}/${m.play_number}`,
					match_number: m.match_number,
					play_number: m.play_number,
					level: m.level,
				};
			});
		} catch {
			allMatchOptions = [];
		}
	}

	async function loadMatchesForTeam(t: number) {
		try {
			const matches = await trpc.match.getMatchNumbers.query({ team: t });
			matchOptions = matches.map((m: any) => ({
				value: m.id,
				name: `${m.level} ${m.match_number}/${m.play_number}`,
			}));
		} catch {
			matchOptions = [];
		}
	}

	$effect(() => {
		if (newNoteType === "MatchNote" && newTeam !== undefined && newTeam !== -1) {
			loadMatchesForTeam(newTeam);
		} else if (newNoteType === "TeamIssue" && newTeam !== undefined && newTeam !== -1) {
			loadMatchesForTeam(newTeam);
		} else if (newNoteType !== "MatchNote" && newNoteType !== "TeamIssue") {
			matchOptions = [];
			matchId = undefined;
		}
	});

	let notesPolicyElm: NotesPolicy | undefined = $state();

	function openCreateModal() {
		loadAllMatches();
		createModalOpen = true;
	}

	async function createNote(evt: SubmitEvent) {
		evt.preventDefault();
		try {
			if (!$settingsStore.acknowledgedNotesPolicy) {
				await notesPolicyElm?.confirmPolicy();
			}

			let matchDetails: { match_number?: number; play_number?: number; tournament_level?: TournamentLevel } = {};
			if (newNoteType === "MatchNote" && matchId) {
				const match = allMatchOptions.find((m) => m.value === matchId);
				if (match) {
					matchDetails = {
						match_number: match.match_number,
						play_number: match.play_number,
						tournament_level: match.level as TournamentLevel,
					};
				}
			} else if (newNoteType === "TeamIssue" && matchId) {
				const match = matchOptions.find((m) => m.value === matchId);
				if (match) {
					const parts = match.name.split(" ");
					const level = parts[0] as TournamentLevel;
					const nums = parts[1]?.split("/");
					matchDetails = {
						match_number: nums ? parseInt(nums[0]) : undefined,
						play_number: nums ? parseInt(nums[1]) : undefined,
						tournament_level: level,
					};
				}
			}

			await trpc.notes.create.mutate({
				team: newNoteType === "TeamIssue" ? (newTeam ?? null) : null,
				text: newNoteText,
				note_type: newNoteType,
				issue_type: newNoteType === "TeamIssue" ? (issueType ?? null) : null,
				...matchDetails,
			});
			// live subscription will push the new note into the feed automatically
			createModalOpen = false;
			newNoteText = "";
			issueType = undefined;
			matchId = undefined;
		} catch (err: any) {
			toast("Error creating note", err.message);
			console.error(err);
		}
	}
</script>

<NotesPolicy bind:this={notesPolicyElm} />

<Modal bind:open={createModalOpen} size="lg" outsideclose>
	{#snippet header()}
		<h2 class="text-xl font-bold text-black dark:text-white">Create Note</h2>
	{/snippet}
	<form class="text-left flex flex-col gap-4" onsubmit={createNote}>
		<Label class="w-full text-left">
			Note Type:
			<Select
				class="mt-2"
				items={[
					{ value: "TeamIssue", name: "Team Note" },
					{ value: "EventNote", name: "Event Note" },
					{ value: "MatchNote", name: "Match Note" },
				]}
				bind:value={newNoteType}
			/>
		</Label>

		{#if newNoteType === "TeamIssue"}
			<Label class="w-full text-left">
				Select Team:
				<Select class="mt-2" items={teamOptions} bind:value={newTeam} />
			</Label>
			{#if newTeam !== undefined && newTeam !== -1 && matchOptions.length > 0}
				<Label class="w-full text-left">
					Match (optional):
					<Select
						class="mt-2"
						items={[{ value: undefined, name: "— None —" }, ...matchOptions]}
						bind:value={matchId}
					/>
				</Label>
			{/if}
		{/if}

		{#if newNoteType === "MatchNote"}
			<Label class="w-full text-left">
				Select Match:
				{#if allMatchOptions.length > 0}
					<Select class="mt-2" items={allMatchOptions} bind:value={matchId} />
				{:else}
					<p class="mt-2 text-sm text-gray-500">No matches have been played yet.</p>
				{/if}
			</Label>
		{/if}

		{#if newNoteType === "TeamIssue"}
			<Label class="w-full text-left">
				Issue Type (optional):
				<Select
					class="mt-2"
					items={[{ value: undefined, name: "— None —" }, ...ISSUE_TYPE_OPTIONS]}
					bind:value={issueType}
				/>
			</Label>
		{/if}

		<Label for="new-note-text">Text:</Label>
		{#if newNoteType === "TeamIssue"}
			<div class="flex flex-wrap gap-1.5">
				{#each QUICK_LABELS as { label, issueType: itemType }}
					<button
						type="button"
						class="text-xs px-2 py-1 rounded border transition-colors
							{issueType === itemType && newNoteText.includes(label)
							? 'border-blue-500 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
							: 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-700 dark:text-gray-300'}"
						onclick={() => {
							issueType = itemType;
							const current = newNoteText.trim();
							if (!current) newNoteText = label;
							else if (!current.endsWith(label)) newNoteText = current + "\n" + label;
						}}
					>
						{label}
					</button>
				{/each}
			</div>
		{/if}
		<Textarea id="new-note-text" class="w-full" rows={5} bind:value={newNoteText} autofocus />

		<Button type="submit" disabled={disableSubmit}>Create Note</Button>
	</form>
</Modal>

<div class="flex flex-col gap-2 h-full">
	<div class="flex items-center gap-2 max-w-4xl w-full mx-auto">
		<Button size="sm" color="primary" class="shrink-0" onclick={openCreateModal}>
			<Icon icon="mdi:plus" class="size-4 mr-1" />New Note
		</Button>
		<div class="relative grow">
			<Icon
				icon="mdi:magnify"
				class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 dark:text-gray-500 pointer-events-none"
			/>
			<input
				class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-neutral-800 text-sm text-black dark:text-white pl-9 pr-3 h-8.5 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
				placeholder="Team #, Name, Text"
				bind:value={search}
			/>
		</div>
		<select
			class="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-neutral-800 text-sm text-black dark:text-white px-2 h-8.5 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
			bind:value={typeFilter}
		>
			<option value="all">All types</option>
			<option value="TeamIssue">Team Issues</option>
			<option value="EventNote">Event Notes</option>
			<option value="MatchNote">Match Notes</option>
		</select>
		<select
			class="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-neutral-800 text-sm text-black dark:text-white px-2 h-8.5 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
			bind:value={statusFilter}
		>
			<option value="all">All statuses</option>
			<option value="Open">Open</option>
			<option value="Resolved">Resolved</option>
		</select>
	</div>

	<div class="flex flex-col grow gap-2 overflow-y-auto mt-2 pb-2">
		{#if loading}
			<Spinner />
		{:else if filteredNotes.length === 0}
			<div class="text-center text-gray-500 dark:text-gray-400 mt-8">No items found</div>
		{:else}
			{#each filteredNotes as note}
				<NoteCard {note} />
			{/each}
		{/if}
	</div>
</div>
