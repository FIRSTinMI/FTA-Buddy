<script lang="ts">
    import { ROBOT, type MonitorFrame } from "./../../../shared/types";
    import { Table, TableBody, TableHead, TableHeadCell } from "flowbite-svelte";
    import MonitorRow from "../components/MonitorRow.svelte";
    import TeamModal from "../components/TeamModal.svelte";
    import { formatTimeShortNoAgo } from "../util/formatTime";
    import type { MonitorEvent, MonitorFrameHandler } from "../util/monitorFrameHandler";
    import { onMount } from "svelte";
    import { trpc } from "../main";
    import { cycleTimeToMS } from "./../../../shared/cycleTimeToMS";

    export let frameHandler: MonitorFrameHandler;
    let monitorFrame: MonitorFrame | undefined = frameHandler.getFrame();
    
    frameHandler.addEventListener("frame", (evt) => {
        monitorFrame = (evt as MonitorEvent).detail.frame;
    });

    let lastCycleTime = "";
    let lastCycleTimeMS = 0;
    let matchStartTime = new Date();
    let bestCycleTimeMS = 0;
    let currentCycleIsBest = false;
    let averageCycleTimeMS = 7*60*1000; // Default to 7 minutes
    let currentCycleTimeRedness = 0;
    let currentCycleTime = "";

    onMount(async () => {
        const lastPrestart = await trpc.cycles.getLastPrestart.query();
        if (lastPrestart) matchStartTime = lastPrestart;
        console.log(matchStartTime);

        const bestCycleTimeRes = await trpc.cycles.getBestCycleTime.query();
        if (bestCycleTimeRes && bestCycleTimeRes.calculated_cycle_time) {
            bestCycleTimeMS = cycleTimeToMS(bestCycleTimeRes.calculated_cycle_time);
        }
        console.log(bestCycleTimeMS);

        const lastCycleTimeRes = await trpc.cycles.getLastCycleTime.query();
        if (lastCycleTimeRes) {
            console.log(lastCycleTimeRes);
            lastCycleTimeMS = cycleTimeToMS(lastCycleTimeRes);
            lastCycleTime = formatTimeShortNoAgo(new Date(new Date().getTime() - lastCycleTimeMS));

            if (lastCycleTimeMS < bestCycleTimeMS) {
                bestCycleTimeMS = lastCycleTimeMS;
                currentCycleIsBest = true;
            }
        }
        console.log(lastCycleTimeMS);

        averageCycleTimeMS = await trpc.cycles.getAverageCycleTime.query() ?? 7*60*1000;
        console.log(averageCycleTimeMS);
    });

    frameHandler.addEventListener("match-start", (evt) => {
        currentCycleIsBest = false;
        lastCycleTime = formatTimeShortNoAgo(matchStartTime);
        lastCycleTimeMS = new Date().getTime() - matchStartTime.getTime();
        if (lastCycleTimeMS < bestCycleTimeMS) {
            bestCycleTimeMS = lastCycleTimeMS;
            currentCycleIsBest = true;
        }
        matchStartTime = new Date();
    });

    setInterval(() => {
        const currentTime = new Date().getTime() - matchStartTime.getTime();
        if (currentTime < averageCycleTimeMS) {
            currentCycleTimeRedness = 0;
        } else {
            currentCycleTimeRedness = Math.min(1, (currentTime - averageCycleTimeMS) / (averageCycleTimeMS));
        }

        currentCycleTime = formatTimeShortNoAgo(matchStartTime);
    }, 1000);

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
    let modalStation: ROBOT = ROBOT.blue1;

    function detailView(evt: Event) {
        let target = evt.target as HTMLElement;
        let station = target.parentElement?.id.replace("-row", "");
        modalStation = (station as ROBOT) || ROBOT.blue1;
        modalOpen = true;
    }

    const stations: ROBOT[] = Object.values(ROBOT);

    export let fullscreen = false;
</script>

{#if monitorFrame}
    <TeamModal bind:modalOpen {modalStation} {monitorFrame} {frameHandler} />
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
                <TableHeadCell class="w-fit">Ping</TableHeadCell>
                <TableHeadCell class="w-fit">BWU</TableHeadCell>
                <TableHeadCell class="w-38">Signal</TableHeadCell>
                {/if}
            </TableHead>
            <TableBody>
                {#if monitorFrame}
                    {#each stations as station}
                        <MonitorRow {station} {monitorFrame} {detailView} {fullscreen} {frameHandler} />
                    {/each}
                {/if}
            </TableBody>
        </Table>
        <div class="flex w-full mt-1">
            <div class="w-48 text-left {fullscreen ? "text-4xl" : "md:text-2xl"} {currentCycleIsBest && "text-green-500"}">C: {lastCycleTime}</div>
            <div class="grow {fullscreen ? "text-4xl" : "md:text-2xl"}"></div>
            <div 
                class="w-48 text-right {fullscreen ? "text-4xl" : "md:text-2xl"}"
                style="color: rgba({75*currentCycleTimeRedness + 180}, {180*(1 - currentCycleTimeRedness)}, {180*(1 - currentCycleTimeRedness)}, 1)"
                >
                T: {currentCycleTime}
            </div>
        </div>
    {/key}
    {#if !monitorFrame}
        <p>Requires Chrome Extension to be setup on field network</p>
    {/if}
</div>
