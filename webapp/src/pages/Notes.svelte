<script lang="ts">
    import { notesStore } from "./../stores/notes";
    import { Label, Select, type SelectOptionType } from "flowbite-svelte";
    import { eventStore } from "../stores/event";
    import { get } from "svelte/store";
    import Messaging from "../components/Messaging.svelte";

    let event = get(eventStore);
    let notesStoreData = get(notesStore);

    export let team: string;
    if (team === undefined) {
        team = notesStoreData.team;
    }

    let teams: SelectOptionType<string>[] = notesStoreData.teams;
    updateTeams();

    async function updateTeams() {
        const teamsData = await fetch(
            "https://ftabuddy.com/teams/" + encodeURIComponent(event),
        ).then((res) => res.json());
        teams = teamsData.map((team: string) => ({
            name: team.toString(),
            value: team.toString(),
        }));
        notesStoreData.teams = teams;
        notesStore.set(notesStoreData);
        console.log(teams);
    }

    function selectTeam(evt: Event) {
        team = (evt.target as HTMLSelectElement).selectedOptions[0].value;
        notesStoreData.team = team;
        notesStore.set(notesStoreData);
    }
</script>

<div class="container mx-auto p-2 h-full flex flex-col">
    <form class="flex w-full">
        <Label class="w-full text-left">
            Select Team
            <Select
                class="mt-2"
                items={teams}
                bind:value={team}
                on:change={selectTeam}
            />
        </Label>
    </form>
    {#key team}
        {#if team}
            <Messaging {team} />
        {/if}
    {/key}
</div>
