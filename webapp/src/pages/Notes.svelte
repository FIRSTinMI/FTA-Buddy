<script lang="ts">
    import { Label, Select, type SelectOptionType } from "flowbite-svelte";
    import { eventStore } from "../stores/event";
    import { get } from "svelte/store";
    import type { SelectEvents } from "flowbite-svelte/Select.svelte";
    export let team: string;
    let event = get(eventStore);
    
    console.log(team, event);

    async function updateTeams() {
        const teamsData = await fetch("https://ftahelper.filipkin.com/teams/"+encodeURIComponent(event))
            .then((res) => res.json());
        console.log(teamsData);
        teams = teamsData.map((team: string) => ({ name: team.toString(), value: team.toString() }));
        console.log(teams);
        return teams;
    }

    let teams: SelectOptionType<string>[] = [];

    function selectTeam(evt: Event) {
        console.log(evt);
        
    }
</script>

<div class="container mx-auto p-2">
    <form class="flex w-full">
        <Label class="w-full text-left">
            Select Team
            {#await updateTeams()}
                Loading teams...
            {:then teams} 
                <Select class="mt-2" items={teams} bind:value={team} on:change={selectTeam}/>
            {/await}
        </Label>
    </form>
</div>