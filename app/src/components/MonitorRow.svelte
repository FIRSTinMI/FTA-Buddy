<script lang="ts">
    import { TableBodyCell, TableBodyRow } from "flowbite-svelte";
    import {
        BYPASS,
        ESTOP,
        GREEN_X,
        MOVE_STATION,
        WRONG_MATCH,
        type MonitorFrame,
        type TeamInfo,
        type Station,
        ASTOP,
        NO_CODE,
        RED,
        MATCH_OVER,
        MATCH_ABORTED,
        READY_FOR_POST_RESULT,
        READY_TO_PRESTART,
    } from "../../../shared/types";
    import { navigate } from "svelte-routing";
    import BatteryGraph from "./BatteryGraph.svelte";

    export let station: Station;
    export let monitorFrame: MonitorFrame;
    export let statusChange: { lastChange: Date; improved: boolean };
    let team: TeamInfo;
    $: {
        team = monitorFrame[station];
        parsedData = battery.map((d, i) => ({ time: i, voltage: d }));
    }

    export let detailView: (evt: Event) => void;

    function getKey(value: any) {
        return Object.keys(monitorFrame).find((key) => (monitorFrame as any)[key] === value);
    }

    const DS_Colors: { [key: number]: string } = {
        0: "bg-red-600",
        1: "bg-green-500",
        2: "bg-green-500",
        3: "bg-yellow-500",
        4: "bg-yellow-500",
        5: "bg-red-700",
        6: "bg-neutral-900",
        7: "bg-neutral-900",
    };

    const RIO_Colors: { [key: number]: string } = {
        0: "bg-red-600",
        1: "bg-yellow-500",
        2: "bg-green-500",
    };

    export let battery: number[];
    let parsedData = battery.map((d, i) => ({ time: i, voltage: d }));
</script>

{#key team}
    <TableBodyRow class="h-20 lg:h-24 border-y border-gray-800 cursor-pointer" id="{station}-row">
        <TableBodyCell class="text-center {getKey(team)?.startsWith('blue') ? 'bg-blue-600' : 'bg-red-600'} font-mono" on:click={() => navigate("/notes/" + team.number)}>
            <p>{team.number}</p>
            {#if ![MATCH_OVER, MATCH_ABORTED, READY_FOR_POST_RESULT, READY_TO_PRESTART].includes(monitorFrame.field)}
                {#if team.ds === RED && statusChange.lastChange.getTime() + 30e3 < Date.now()}
                    <p>👀</p>
                {:else if team.ds === GREEN_X && statusChange.lastChange.getTime() + 30e3 < Date.now()}
                    <p>👀</p>
                {:else if team.radio === RED && statusChange.lastChange.getTime() + 180e3 < Date.now()}
                    <p>👀</p>
                {:else if team.rio === RED && statusChange.lastChange.getTime() + 45e3 < Date.now()}
                    <p>👀</p>
                {:else if team.code === NO_CODE && statusChange.lastChange.getTime() + 30e3 < Date.now()}
                    <p>👀</p>
                {/if}
            {/if}
        </TableBodyCell>
        <TableBodyCell class="{DS_Colors[team.ds]} text-4xl text-black text-center border-x border-gray-800 font-mono" on:click={detailView}>
            {#if team.ds === GREEN_X}
                X
            {:else if team.ds === MOVE_STATION}
                M
            {:else if team.ds === WRONG_MATCH}
                W
            {:else if team.ds === BYPASS}
                B
            {:else if team.ds === ESTOP}
                E
            {:else if team.ds === ASTOP}
                A
            {/if}
        </TableBodyCell>
        <TableBodyCell class="{DS_Colors[team.radio]} border-x border-gray-800" on:click={detailView}></TableBodyCell>
        <TableBodyCell class="{RIO_Colors[(team.rio > 0 ? 1 : 0) + team.code]} border-x border-gray-800" on:click={detailView}></TableBodyCell>
        <TableBodyCell
            class="p-0 relative aspect-square"
            on:click={detailView}
            style="background-color: rgba(255,0,0,{team.battery < 11 && team.battery > 0 ? (-1.5 * team.battery ** 2 - 6.6 * team.battery + 255) / 255 : 0})"
        >
            <div class="h-full text-center top-0 px-0.5 aspect-square">
                <BatteryGraph data={parsedData} />
            </div>
            <div class="absolute w-full bottom-0 p-2">
                {team.battery.toFixed(1)}v
            </div>
        </TableBodyCell>
        <TableBodyCell on:click={detailView}>{team.ping} ms<br />{team.bwu.toFixed(2)} mbps</TableBodyCell>
    </TableBodyRow>
{/key}
