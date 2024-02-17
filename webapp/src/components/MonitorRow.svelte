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
    } from "../../../shared/types";
    import { navigate } from "svelte-routing";

    export let station: string;
    export let monitorFrame: MonitorFrame;
    // @ts-ignore
    let team: TeamInfo = monitorFrame[station];
    export let detailView: (evt: Event) => void;

    function getKey(value: any) {
        return Object.keys(monitorFrame).find((key) => (monitorFrame as any)[key] === value);
    }

    function navigateToNotes(evt: Event) {
        let target = evt.target as HTMLElement;
        let station = target.parentElement?.id.replace("-row", "");
        //@ts-ignore
        let team = monitorFrame[station].number;
        navigate("/app/notes/" + team);
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

<TableBodyRow class="h-20 border-y border-gray-800 cursor-pointer" id="{station}-row">
    <TableBodyCell
        class="{getKey(team)?.startsWith('blue') ? 'bg-blue-600' : 'bg-red-600'} font-mono"
        on:click={navigateToNotes}
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
    <TableBodyCell class="{RIO_Colors[team.rio + team.code]} border-x border-gray-800" on:click={detailView}
    ></TableBodyCell>
    <TableBodyCell on:click={detailView}>{team.battery}v</TableBodyCell>
    <TableBodyCell on:click={detailView}>{team.ping} ms<br />{team.bwu} mbps</TableBodyCell>
</TableBodyRow>
