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
    } from "../../../shared/types";
    import { navigate } from "svelte-routing";

    export let station: Station;
    export let monitorFrame: MonitorFrame;
    let team: TeamInfo;
    $: {
        team = monitorFrame[station];
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
    };

    const RIO_Colors: { [key: number]: string } = {
        0: "bg-red-600",
        1: "bg-yellow-500",
        2: "bg-green-500",
    };
</script>

{#key team}
    <TableBodyRow class="h-20 border-y border-gray-800 cursor-pointer" id="{station}-row">
        <TableBodyCell
            class="{getKey(team)?.startsWith('blue') ? 'bg-blue-600' : 'bg-red-600'} font-mono"
            on:click={() => navigate("/notes/" + team.number)}
        >
            {team.number}
        </TableBodyCell>
        <TableBodyCell
            class="{DS_Colors[team.ds]} text-4xl text-black text-center border-x border-gray-800 font-mono"
            on:click={detailView}
        >
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
            {/if}
        </TableBodyCell>
        <TableBodyCell class="{DS_Colors[team.radio]} border-x border-gray-800" on:click={detailView}></TableBodyCell>
        <TableBodyCell
            class="{RIO_Colors[(team.rio > 0 ? 1 : 0) + team.code]} border-x border-gray-800"
            on:click={detailView}
        ></TableBodyCell>
        <TableBodyCell on:click={detailView}>{team.battery.toFixed(1)}v</TableBodyCell>
        <TableBodyCell on:click={detailView}>{team.ping} ms<br />{team.bwu.toFixed(2)} mbps</TableBodyCell>
    </TableBodyRow>
{/key}
