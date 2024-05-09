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

    export let matchid: string;
    export let station: ROBOT;

    let log: FMSLogFrame[];

    const match = trpc.match.getMatch.query({ id: matchid });

    match.then((m) => {
        // I don't want to talk about it
        log =
            (m?.[(station + "_log") as keyof typeof m] as FMSLogFrame[]) ?? [];
    });

    function back() {
        if (window.history.state === null) {
            navigate("/app/logs");
        } else {
            window.history.back();
        }
    }
</script>

<div class="container mx-auto p-2 w-full flex flex-col gap-4">
    <Button on:click={back} class="w-fit">Back</Button>
    {#await match}
        <Spinner />
    {:then match}
        <Table>
            <TableHead>
                <TableHeadCell>Time</TableHeadCell>
                <TableHeadCell>DS</TableHeadCell>
                <TableHeadCell>Radio</TableHeadCell>
                <TableHeadCell>RIO</TableHeadCell>
                <TableHeadCell>Code</TableHeadCell>
                <TableHeadCell>Enabled</TableHeadCell>
                <TableHeadCell>A Stop</TableHeadCell>
                <TableHeadCell>E Stop</TableHeadCell>
                <TableHeadCell>Battery</TableHeadCell>
                <TableHeadCell>Ping</TableHeadCell>
                <TableHeadCell>BWU</TableHeadCell>
                <TableHeadCell>Dropped Packets</TableHeadCell>
            </TableHead>
            <TableBody>
                {#if match}
                    {#each log as frame}
                        <TableBodyRow>
                            <TableBodyCell>{frame.matchTimeBase}</TableBodyCell>
                            <TableBodyCell
                                class={frame.dsLinkActive ? "" : "bg-red-500"}
                                >{frame.dsLinkActive}</TableBodyCell
                            >
                            <TableBodyCell
                                class={frame.radioLink ? "" : "bg-red-500"}
                                >{frame.radioLink}</TableBodyCell
                            >
                            <TableBodyCell
                                class={frame.rioLink ? "" : "bg-red-500"}
                                >{frame.rioLink}</TableBodyCell
                            >
                            <TableBodyCell
                                class={frame.linkActive ? "" : "bg-red-500"}
                                >{frame.linkActive}</TableBodyCell
                            >
                            <TableBodyCell
                                class={frame.enabled ? "" : "bg-red-500"}
                                >{frame.enabled}</TableBodyCell
                            >
                            <TableBodyCell
                                class={frame.aStopPressed ? "" : "bg-red-500"}
                                >{frame.aStopPressed}</TableBodyCell
                            >
                            <TableBodyCell
                                class={frame.eStopPressed ? "" : "bg-red-500"}
                                >{frame.eStopPressed}</TableBodyCell
                            >
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
