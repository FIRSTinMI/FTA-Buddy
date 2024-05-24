<script lang="ts">
    import { Button, Label, Select, Textarea, type SelectOptionType } from "flowbite-svelte";
    import { trpc } from "../main";
    import { eventStore } from "../stores/event";
    import { get } from "svelte/store";
    import { authStore } from "../stores/auth";
    import { toast } from "../util/toast";
    import { navigate } from "svelte-routing";

    export let team: number | undefined;

    let teamOptions: SelectOptionType<number>[] = get(eventStore).teams
        .map((team) => ({ value: parseInt(team.number), name: `${team.number} - ${team.name}` }))
        .sort((a, b) => a.value - b.value);

    let promise: ReturnType<typeof trpc.match.getMatchNumbers.query>;
    let matches: SelectOptionType<string>[] = [];
    export let match: string | undefined = undefined;

    async function getMatchesForTeam(team: number) {
        promise = trpc.match.getMatchNumbers.query({ team });
        matches = (await promise).map((match) => ({ 
            value: match.id, 
            name: `${match.level} ${match.match_number}/${match.play_number}`
        }));
    }

    let disableSubmit = false;
    let content: string = "";

    $: {
        disableSubmit = (team === undefined) || (content.length === 0);
    }

    async function createTicket(evt: Event) {
        evt.preventDefault();

        if (team === undefined || content.length === 0) return;

        try {
            const res = await trpc.messages.createTicket.query({ team: team, message: content, matchID: match, eventToken: get(authStore).eventToken });
            toast("Ticket created successfully", "success", "green-500");
            navigate("/app/ticket/" + res.id);
        } catch (err: any) {
            toast("An error occurred while creating the ticket", err.message);
            console.error(err);
            return;
        }
    }
</script>

<div class="container mx-auto px-2 pt-2 h-full flex flex-col gap-2">
    <form class="text-left flex flex-col gap-4" on:submit={createTicket}>
        <Label class="w-full text-left">
            Select Team
            <Select class="mt-2" items={teamOptions} bind:value={team} on:change={() => getMatchesForTeam(team)} />
        </Label>
        <Label for="textarea">Ticket Content</Label>
        <Textarea id="textarea" class="w-full" rows="5" bind:value={content} />
        {#await promise then}
            {#if matches.length > 0}
                <Label class="w-full text-left">
                    Attach Ticket to a Match <span class="text-xs text-gray-600">(optional)</span>
                    <Select class="mt-2" items={matches} bind:value={match} />
                </Label>
            {/if}
        {/await}
        <Button type="submit" disabled={disableSubmit}>Create Ticket</Button>
    </form>
</div>