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
        <TableHead class="text-center">
            <TableHeadCell class="hidden md:table-cell">Match</TableHeadCell>
            <TableHeadCell class="hidden md:table-cell">Play</TableHeadCell>
            <TableHeadCell class="md:hidden">M/P</TableHeadCell>
            <TableHeadCell class="hidden md:table-cell">Time</TableHeadCell>
            <TableHeadCell class="hidden md:table-cell">Blue 1</TableHeadCell>
            <TableHeadCell class="hidden md:table-cell">Blue 2</TableHeadCell>
            <TableHeadCell class="hidden md:table-cell">Blue 3</TableHeadCell>
            <TableHeadCell class="hidden md:table-cell">Red 1</TableHeadCell>
            <TableHeadCell class="hidden md:table-cell">Red 2</TableHeadCell>
            <TableHeadCell class="hidden md:table-cell">Red 3</TableHeadCell>
            <TableHeadCell class="px-1 md:hidden">B1</TableHeadCell>
            <TableHeadCell class="px-1 md:hidden">B2</TableHeadCell>
            <TableHeadCell class="px-1 md:hidden">B3</TableHeadCell>
            <TableHeadCell class="px-1 md:hidden">R1</TableHeadCell>
            <TableHeadCell class="px-1 md:hidden">R2</TableHeadCell>
            <TableHeadCell class="px-1 md:hidden">R3</TableHeadCell>
            <TableHeadCell>Logs</TableHeadCell>
        </TableHead>
        <TableBody>
            {#each filteredMatches as match}
                <TableBodyRow class="text-center cursor-pointer">
                    <TableBodyCell
                        class="bg-neutral-700 hidden md:table-cell"
                        on:click={() => navigate(`/app/logs/${match.id}`)}
                        >{match.match_number}</TableBodyCell
                    >
                    <TableBodyCell
                        class="bg-neutral-700 hidden md:table-cell"
                        on:click={() => navigate(`/app/logs/${match.id}`)}
                        >{match.play_number}</TableBodyCell
                    >
                    <TableBodyCell
                        class="bg-neutral-700 md:hidden"
                        on:click={() => navigate(`/app/logs/${match.id}`)}
                        >{match.match_number}/{match.play_number}</TableBodyCell
                    >
                    <TableBodyCell
                        class="bg-neutral-700 hidden md:table-cell"
                        on:click={() => navigate(`/app/logs/${match.id}`)}
                        >{formatTime(new Date(match.start_time))}</TableBodyCell
                    >
                    <TableBodyCell
                        class="px-1 bg-blue-500 hover:bg-opacity-50 hover:underline"
                        on:click={() => navigate(`/app/logs/${match.id}/blue1`)}
                        >{match.blue1 ?? "None"}</TableBodyCell
                    >
                    <TableBodyCell
                        class="px-1 bg-blue-500 hover:bg-opacity-50 hover:underline"
                        on:click={() => navigate(`/app/logs/${match.id}/blue2`)}
                        >{match.blue2 ?? "None"}</TableBodyCell
                    >
                    <TableBodyCell
                        class="px-1 bg-blue-500 hover:bg-opacity-50 hover:underline"
                        on:click={() => navigate(`/app/logs/${match.id}/blue3`)}
                        >{match.blue3 ?? "None"}</TableBodyCell
                    >
                    <TableBodyCell
                        class="px-1 bg-red-500 hover:bg-opacity-50 hover:underline"
                        on:click={() => navigate(`/app/logs/${match.id}/red1`)}
                        >{match.red1 ?? "None"}</TableBodyCell
                    >
                    <TableBodyCell
                        class="px-1 bg-red-500 hover:bg-opacity-50 hover:underline"
                        on:click={() => navigate(`/app/logs/${match.id}/red2`)}
                        >{match.red2 ?? "None"}</TableBodyCell
                    >
                    <TableBodyCell
                        class="px-1 bg-red-500 hover:bg-opacity-50 hover:underline"
                        on:click={() => navigate(`/app/logs/${match.id}/red3`)}
                        >{match.red3 ?? "None"}</TableBodyCell
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

