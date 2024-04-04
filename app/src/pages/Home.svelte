<script lang="ts">
    import { type MonitorFrame, type Station } from "./../../../shared/types";
    import { Table, TableBody, TableHead, TableHeadCell } from "flowbite-svelte";
    import MonitorRow from "../components/MonitorRow.svelte";
    import TeamModal from "../components/TeamModal.svelte";
    import type { StatusChanges } from "../../../shared/types";
    import { formatTimeShort } from "../util/formatTime";
    import type { MonitorFrameHandler } from "../util/monitorFrameHandler";

    export let monitorFrame: MonitorFrame;
    export let batteryData: { [key: string]: number[] } = {};
    export let statusChanges: StatusChanges;
    export let frameHandler: MonitorFrameHandler;

    let lastMatchStartTime = new Date();
    let matchStartTime = new Date();

    frameHandler.addEventListener("match-start", (evt) => {
        lastMatchStartTime = matchStartTime;
        matchStartTime = new Date();
    });

    const FieldStates = {
        0: "Unknown",
        1: "Match Running Teleop",
        2: "Match Transistioning",
        3: "Match Running Auto",
        4: "Match Ready",
        5: "Prestart Completed",
        6: "Prestart Initiated",
        7: "Ready to Prestart",
        8: "Match Aborted",
        9: "Match Over",
        10: "Ready for Post Result",
        11: "Match Not Ready",
    };

    let modalOpen = false;
    let modalStation: Station = "blue1";

    function detailView(evt: Event) {
        let target = evt.target as HTMLElement;
        let station = target.parentElement?.id.replace("-row", "");
        modalStation = (station as Station) || "blue1";
        modalOpen = true;
    }

    const stations: Station[] = ["blue1", "blue2", "blue3", "red1", "red2", "red3"];

    export let fullscreen = false;
</script>

{#if monitorFrame}
    <TeamModal bind:modalOpen bind:modalStation bind:monitorFrame bind:batteryData bind:statusChanges />
{/if}

<div class="w-full mx-auto {fullscreen ? "" : "container md:max-w-2xl"} md:p-2 space-y-2">
    {#key monitorFrame}
        <div class="flex w-full mb-1">
            {#if monitorFrame}
                <div class="w-42 {fullscreen ? "text-6xl" : "md:text-2xl"}">M: {monitorFrame.match}</div>
                <div class="grow {fullscreen ? "text-6xl" : "md:text-2xl"}">{FieldStates[monitorFrame.field]}</div>
                <div class="w-42 {fullscreen ? "text-6xl" : "md:text-2xl"}">{monitorFrame.time}</div>
            {/if}
        </div>
        <Table class="w-full mx-auto !overflow-none monitor max-h-screen">
            <TableHead class="dark:bg-neutral-500 dark:text-white text-center">
                {#if !fullscreen}
                <TableHeadCell class="w-20">Team</TableHeadCell>
                <TableHeadCell class="w-20">DS</TableHeadCell>
                <TableHeadCell class="w-10 lg:w-20">Radio</TableHeadCell>
                <TableHeadCell class="w-10 lg:w-20">Rio</TableHeadCell>
                <TableHeadCell class="w-15 lg:w-20 max-w-20 lg:max-w-24">Bat</TableHeadCell>
                <TableHeadCell>Net</TableHeadCell>
                {:else}
                <TableHeadCell class="w-38">Team</TableHeadCell>
                <TableHeadCell class="w-38">DS</TableHeadCell>
                <TableHeadCell class="w-38">Radio</TableHeadCell>
                <TableHeadCell class="w-38">Rio</TableHeadCell>
                <TableHeadCell class="w-38">Bat</TableHeadCell>
                <TableHeadCell>Ping</TableHeadCell>
                <TableHeadCell>BWU</TableHeadCell>
                <TableHeadCell>Signal</TableHeadCell>
                {/if}
            </TableHead>
            <TableBody>
                {#if monitorFrame}
                    {#each stations as station}
                        <MonitorRow {station} {monitorFrame} {detailView} battery={batteryData[station]} statusChange={statusChanges[station]} {fullscreen} />
                    {/each}
                {/if}
            </TableBody>
        </Table>
        <div class="flex w-full mt-1">
            <div class="w-48 {fullscreen ? "text-4xl" : "md:text-2xl"}">C: {formatTimeShort(lastMatchStartTime, matchStartTime)}</div>
        </div>
    {/key}
    {#if !monitorFrame}
        <p>Requires Chrome Extension to be setup on field network</p>
    {/if}
</div>
