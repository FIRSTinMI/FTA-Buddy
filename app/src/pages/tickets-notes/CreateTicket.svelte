<script lang="ts">
	import { Button, Label, Select, Textarea, type SelectOptionType } from "flowbite-svelte";
	import { trpc } from "../../main";
	import { eventStore } from "../../stores/event";
	import { get } from "svelte/store";
	import { userStore } from "../../stores/user";
	import { toast } from "../../../../shared/toast";
	import { navigate } from "svelte-routing";
	import NotesPolicy from "../../components/NotesPolicy.svelte";
	import { settingsStore } from "../../stores/settings";

	export let team: number | undefined;
	const event = get(eventStore);

	let teamOptions: SelectOptionType<number>[] = event
		.teams.map((team) => ({ value: parseInt(team.number), name: `${team.number} - ${team.name}` }))
		.sort((a, b) => a.value - b.value);

	let matchesPromise: ReturnType<typeof trpc.match.getMatchNumbers.query>;
	let matches: SelectOptionType<string>[] = [];

	export let matchId: string | undefined = undefined;

	async function getMatchesForTeam(team: number | undefined) {
		if (team) {
			matchesPromise = trpc.match.getMatchNumbers.query({ team });
			matches = (await matchesPromise).map((match) => ({
				value: match.id,
				name: `${match.level} ${match.match_number}/${match.play_number}`,
			}));
		}
	}

	let disableSubmit = false;

	let ticketSubject: string = "";
	let ticketText: string = "";

	$: {
		disableSubmit = team === undefined || ticketText.length === 0 || ticketSubject.length === 0;
	}

	async function createTicket(evt: Event) {
		if (team === undefined || ticketText.length === 0 || ticketSubject.length === 0) return;

		try {
			if (!$settingsStore.acknowledgedNotesPolicy) {
				await notesPolicyElm.confirmPolicy();
			}

			const res = await trpc.tickets.create.query({
				team: team,
				subject: ticketSubject,
				text: ticketText,
				match_id: matchId,
			});
			toast("Ticket created successfully", "success", "green-500");
			navigate("/app/ticket/" + res.id);
		} catch (err: any) {
			toast("An error occurred while creating the ticket", err.message);
			console.error(err);
			return;
		}
	}

	function back() {
		if (window.history.state === null) {
			navigate("/app/messages");
		} else {
			window.history.back();
		}
	}

	let notesPolicyElm: NotesPolicy;
</script>

<NotesPolicy bind:this={notesPolicyElm} />

<div class="container mx-auto px-2 pt-2 h-full flex flex-col gap-2">
	<Button on:click={back} class="w-fit">Back</Button>
	<form class="text-left flex flex-col gap-4" on:submit|preventDefault={createTicket}>
		<Label class="w-full text-left">
			Select Team
			<Select class="mt-2" items={teamOptions} bind:value={team} on:change={() => getMatchesForTeam(team)} />
		</Label>

		<Label for="subject">Ticket Subject:</Label>
		<Textarea id="subject" class="w-full" bind:value={ticketSubject} />

		<Label for="text">Ticket Text:</Label>
		<Textarea id="text" class="w-full" rows="5" bind:value={ticketText} />

		{#await matchesPromise then}
			{#if matches.length > 0}
				<Label class="w-full text-left">
					Attach Ticket to a Match <span class="text-xs text-gray-600">(optional)</span>
					<Select class="mt-2" items={matches} bind:value={matchId} />
				</Label>
			{/if}
		{/await}
		
		<Button type="submit" disabled={disableSubmit}>Create Ticket</Button>
	</form>
</div>
