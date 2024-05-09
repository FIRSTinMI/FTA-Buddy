<script lang="ts">
    import {
        TabItem,
        TableBody,
        TableBodyCell,
        TableBodyRow,
        TableHead,
        TableHeadCell,
        TableSearch,
    } from "flowbite-svelte";
    import type { MatchRouterOutputs } from "../../../src/router/match";
    import { formatTime } from "../util/formatTime";
    import { navigate } from "svelte-routing";

    export let matches: MatchRouterOutputs["getMatches"] = [];
    export let label: string = "Matches";
    export let open: boolean = false;

    let searchTerm = "";

    $: filteredMatches = matches.filter((match) => {
        return (
            match.blue1?.toString().includes(searchTerm) ||
            match.blue2?.toString().includes(searchTerm) ||
            match.blue3?.toString().includes(searchTerm) ||
            match.red1?.toString().includes(searchTerm) ||
            match.red2?.toString().includes(searchTerm) ||
            match.red3?.toString().includes(searchTerm)
        );
    });

    function tabClick() {
        navigate(`/app/logs/#${label.toLowerCase()}`);
    }
</script>

<TabItem class="w-full" disabled={matches.length <= 0} open={open} on:click={tabClick}>
    <span slot="title">{label}</span>

    <TableSearch
        placeholder="Search by team number"
        hoverable={true}
        bind:inputValue={searchTerm}
        divClass="relative overflow-x-auto rounded-lg bg-neutral-700"
    >
        <TableHead>
            <TableHeadCell>Match</TableHeadCell>
            <TableHeadCell>Play</TableHeadCell>
            <TableHeadCell>Time</TableHeadCell>
            <TableHeadCell>Blue 1</TableHeadCell>
            <TableHeadCell>Blue 2</TableHeadCell>
            <TableHeadCell>Blue 3</TableHeadCell>
            <TableHeadCell>Red 1</TableHeadCell>
            <TableHeadCell>Red 2</TableHeadCell>
            <TableHeadCell>Red 3</TableHeadCell>
            <TableHeadCell>Logs</TableHeadCell>
        </TableHead>
        <TableBody>
            {#each filteredMatches as match}
                <TableBodyRow class="text-center cursor-pointer">
                    <TableBodyCell
                        class="bg-neutral-700"
                        on:click={() => navigate(`/app/logs/${match.id}`)}
                        >{match.match_number}</TableBodyCell
                    >
                    <TableBodyCell
                        class="bg-neutral-700"
                        on:click={() => navigate(`/app/logs/${match.id}`)}
                        >{match.play_number}</TableBodyCell
                    >
                    <TableBodyCell
                        class="bg-neutral-700"
                        on:click={() => navigate(`/app/logs/${match.id}`)}
                        >{formatTime(new Date(match.start_time))}</TableBodyCell
                    >
                    <TableBodyCell
                        class="bg-blue-500 hover:bg-opacity-50 hover:underline"
                        on:click={() => navigate(`/app/logs/${match.id}/blue1`)}
                        >{match.blue1 ?? "Test 1"}</TableBodyCell
                    >
                    <TableBodyCell
                        class="bg-blue-500 hover:bg-opacity-50 hover:underline"
                        on:click={() => navigate(`/app/logs/${match.id}/blue2`)}
                        >{match.blue2 ?? "Test 2"}</TableBodyCell
                    >
                    <TableBodyCell
                        class="bg-blue-500 hover:bg-opacity-50 hover:underline"
                        on:click={() => navigate(`/app/logs/${match.id}/blue3`)}
                        >{match.blue3 ?? "Test 3"}</TableBodyCell
                    >
                    <TableBodyCell
                        class="bg-red-500 hover:bg-opacity-50 hover:underline"
                        on:click={() => navigate(`/app/logs/${match.id}/red1`)}
                        >{match.red1 ?? "Test 1"}</TableBodyCell
                    >
                    <TableBodyCell
                        class="bg-red-500 hover:bg-opacity-50 hover:underline"
                        on:click={() => navigate(`/app/logs/${match.id}/red2`)}
                        >{match.red2 ?? "Test 2"}</TableBodyCell
                    >
                    <TableBodyCell
                        class="bg-red-500 hover:bg-opacity-50 hover:underline"
                        on:click={() => navigate(`/app/logs/${match.id}/red3`)}
                        >{match.red3 ?? "Test 3"}</TableBodyCell
                    >
                    <TableBodyCell
                        class="bg-neutral-700 hover:bg-opacity-50 hover:underline"
                        on:click={() => navigate(`/app/logs/${match.id}`)}
                        >View</TableBodyCell
                    >
                </TableBodyRow>
            {/each}
        </TableBody>
    </TableSearch>
</TabItem>

