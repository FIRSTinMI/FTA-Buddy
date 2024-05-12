<script lang="ts">
    import {
        Button,
        Spinner,
        Table,
        TableBody,
        TableBodyCell,
        TableBodyRow,
        TableHead,
        TableHeadCell,
    } from "flowbite-svelte";
    import { trpc } from "../main";
    import { navigate } from "svelte-routing";
    import type { FMSLogFrame, ROBOT } from "../../../shared/types";
    import LogGraph from "../components/LogGraph.svelte";

    export let matchid: string;
    export let station: ROBOT;

    let log: FMSLogFrame[];
    let team: number;

    const match = trpc.match.getMatch.query({ id: matchid });

    match.then((m) => {
        // I don't want to talk about it
        log =
            (m?.[(station + "_log") as keyof typeof m] as FMSLogFrame[]) ?? [];
        team = m?.[station] ?? 0;
    });

    function back() {
        if (window.history.state === null) {
            navigate("/app/logs");
        } else {
            window.history.back();
        }
    }

    let view: "graph" | "table" = "graph";
</script>

<div class="container mx-auto p-0 py-2 md:p-2 lg:max-w-7xl w-full flex flex-col gap-2 md:gap-4">
    <div class="flex">
        <Button on:click={back} class="w-fit mx-1.5">Back</Button>
    </div>
    {#await match}
        <Spinner />
    {:then match}
        <h1 class="text-xl">{match?.level === 'None' ? 'Test' : match?.level} Match {match?.match_number}/{match?.play_number}</h1>
        <h2 class="text-lg">{(station.startsWith('blue') ? 'Blue ' : 'Red ') + station.charAt(station.length - 1)} Team {team}</h2>

        <LogGraph {log} />
        <Table class="log-table">
            <TableHead>
                <TableHeadCell class="px-6 py-4">Time</TableHeadCell>
                <TableHeadCell class="px-6 py-4">DS</TableHeadCell>
                <TableHeadCell class="px-6 py-4">Radio</TableHeadCell>
                <TableHeadCell class="px-6 py-4">RIO</TableHeadCell>
                <TableHeadCell class="px-6 py-4">Code</TableHeadCell>
                <TableHeadCell class="px-6 py-4">Status</TableHeadCell>
                <TableHeadCell class="px-6 py-4">Bat</TableHeadCell>
                <TableHeadCell class="px-6 py-4">Ping</TableHeadCell>
                <TableHeadCell class="px-6 py-4">BWU</TableHeadCell>
                <TableHeadCell class="px-6 py-4">Lost Pkts</TableHeadCell>
            </TableHead>
            <TableBody>
                {#if match}
                    {#each log as frame}
                        <TableBodyRow>
                            <TableBodyCell>{frame.matchTime}</TableBodyCell>
                            <TableBodyCell
                                class={frame.dsLinkActive ? "" : "bg-red-500"}
                                >{frame.dsLinkActive ? "Y" : "N"}</TableBodyCell
                            >
                            <TableBodyCell
                                class={frame.radioLink ? "" : "bg-red-500"}
                                >{frame.radioLink ? "Y" : "N"}</TableBodyCell
                            >
                            <TableBodyCell
                                class={frame.rioLink ? "" : "bg-red-500"}
                                >{frame.rioLink ? "Y" : "N"}</TableBodyCell
                            >
                            <TableBodyCell
                                class={frame.linkActive ? "" : "bg-red-500"}
                                >{frame.linkActive ? "Y" : "N"}</TableBodyCell
                            >
                            {#if frame.eStopPressed}
                                <TableBodyCell
                                    class="bg-red-500"
                                    >E</TableBodyCell
                                >
                            {:else if frame.aStopPressed}
                                <TableBodyCell
                                    class="bg-orange-500"
                                    >A</TableBodyCell
                                >
                            {:else}
                                {#if !frame.enabled}
                                    <TableBodyCell
                                        class="bg-red-500"
                                        >N</TableBodyCell
                                    >
                                {:else}
                                    {#if frame.auto}
                                        <TableBodyCell
                                            >A</TableBodyCell
                                        >
                                    {:else}
                                        <TableBodyCell
                                            >T</TableBodyCell
                                        >
                                    {/if}
                                {/if}
                            {/if}
                            <TableBodyCell
                                style="background-color: rgba(255,0,0,{frame.battery <
                                    11 && frame.battery > 0
                                    ? (-1.5 * frame.battery ** 2 - 6.6 * frame.battery + 255) / 255
                                    : 0})"
                                >{frame.battery.toFixed(2)}</TableBodyCell
                            >
                            <TableBodyCell
                                >{frame.averageTripTime.toFixed(
                                    0,
                                )}</TableBodyCell
                            >
                            <TableBodyCell
                                >{frame.dataRateTotal.toFixed(2)}</TableBodyCell
                            >
                            <TableBodyCell>{frame.lostPackets}</TableBodyCell>
                        </TableBodyRow>
                    {/each}
                {/if}
            </TableBody>
        </Table>
    {/await}
</div>
