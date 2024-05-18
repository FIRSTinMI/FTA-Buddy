<script lang="ts">
    import {
        TableBodyCell,
        TableBodyRow,
    } from "flowbite-svelte";
    import {
    DSState,
    MatchState,
    MatchStateMap,
    ROBOT,
        TeamWarnings,
        type MonitorFrame,
        type TeamInfo
    } from "../../../shared/types";
    import { navigate } from "svelte-routing";
    import Graph from "./Graph.svelte";
    import type { MonitorFrameHandler } from "../util/monitorFrameHandler";
    import { processSignalStrengthForGraph } from "../util/signalStrengthProcessor";

    export let station: ROBOT;
    export let monitorFrame: MonitorFrame;
    export let fullscreen = false;
    export let frameHandler: MonitorFrameHandler;
    let team: TeamInfo;

    $: {
        team = monitorFrame[station];
        parsedData = frameHandler.getHistory(station, 'battery', 20).map((d, i) => ({ time: i, data: d as number }));
        signalData = processSignalStrengthForGraph(frameHandler
        .getHistory(station, "signal", 20) as number[]);
    }

    export let detailView: (evt: Event) => void;

    function getKey(value: any) {
        return Object.keys(monitorFrame).find(
            (key) => (monitorFrame as any)[key] === value,
        );
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

    let parsedData = frameHandler.getHistory(station, 'battery', 20).map((d, i) => ({ time: i, data: d as number }));
    let signalData = processSignalStrengthForGraph(frameHandler
        .getHistory(station, "signal", 20) as number[]);
</script>

{#key team}
    <TableBodyRow
        class="{fullscreen
            ? 'h-16'
            : 'h-20 lg:h-24'} border-y border-gray-800 cursor-pointer"
        id="{station}-row"
    >
        <TableBodyCell
            class="text-center {getKey(team)?.startsWith('blue')
                ? 'bg-blue-600'
                : 'bg-red-600'} font-mono monitor-team {fullscreen
                ? 'monitor-fullscreen'
                : ''}"
            on:click={() => navigate("/notes/" + team.number)}
        >
            <p>{team.number}</p>
            <p style="letter-spacing: -8px;">
                {#if MatchStateMap[monitorFrame.field] === MatchState.PRESTART && team.lastChange}
                    {#if team.ds === DSState.RED && team.lastChange.getTime() + 30e3 < Date.now()}
                        👀
                    {:else if team.ds === DSState.GREEN_X && team.lastChange.getTime() + 30e3 < Date.now()}
                        👀
                    {:else if !team.radio && team.lastChange.getTime() + 180e3 < Date.now()}
                        👀
                    {:else if !team.rio && team.lastChange.getTime() + 45e3 < Date.now()}
                        👀
                    {:else if !team.code && team.lastChange.getTime() + 30e3 < Date.now()}
                        👀
                    {/if}
                {/if}
                {#if team.warnings.includes(TeamWarnings.NOT_INSPECTED)}
                    🔍
                {/if}
                {#if team.warnings.includes(TeamWarnings.RADIO_NOT_FLASHED)}
                    🛜
                {/if}
                {#if team.warnings.includes(TeamWarnings.SLOW)}
                    🕑
                {/if}
            </p>
        </TableBodyCell>
        <TableBodyCell
            class="{DS_Colors[
                team.ds
            ]} text-4xl text-black text-center {fullscreen
                ? 'ring-inset ring-4 ring-gray-800'
                : ''} border-x-2 border-gray-800 font-mono monitor-ds {fullscreen
                ? 'monitor-fullscreen'
                : ''}"
            on:click={detailView}
        >
            {#if team.ds === DSState.GREEN_X}
                X
            {:else if team.ds === DSState.MOVE_STATION}
                M
            {:else if team.ds === DSState.WAITING}
                W
            {:else if team.ds === DSState.BYPASS}
                B
            {:else if team.ds === DSState.ESTOP}
                E
            {:else if team.ds === DSState.ASTOP}
                A
            {/if}
        </TableBodyCell>
        <TableBodyCell
            class="{team.radio ? "bg-green-500" : "bg-red-600"} {fullscreen
                ? 'ring-inset ring-4 ring-gray-800'
                : 'border-x'} border-gray-800 "
            on:click={detailView}
        ></TableBodyCell>
        <TableBodyCell
            class="{RIO_Colors[(team.rio ? 1 : 0) + (team.code ? 1 : 0)]} {fullscreen
                ? 'ring-inset ring-4 ring-gray-800'
                : 'border-x'} border-gray-800"
            on:click={detailView}
        ></TableBodyCell>
        <TableBodyCell
            class="p-0 relative aspect-square"
            on:click={detailView}
            style="background-color: rgba(255,0,0,{team.battery < 11 &&
            team.battery > 0
                ? (-1.5 * team.battery ** 2 - 6.6 * team.battery + 255) / 255
                : 0})"
        >
            <div class="h-full text-center top-0 px-0.5 aspect-square">
                <Graph data={parsedData} min={6} max={14} time={20} />
            </div>
            <div
                class="absolute w-full bottom-0 p-2 monitor-battery {fullscreen
                    ? 'monitor-fullscreen'
                    : ''}"
            >
                {team.battery?.toFixed(1)}v
            </div>
        </TableBodyCell>
        {#if fullscreen}
            <TableBodyCell
                on:click={detailView}
                class="monitor-ping monitor-fullscreen"
                >{team.ping} ms</TableBodyCell
            >
            <TableBodyCell
                on:click={detailView}
                class="monitor-bwu monitor-fullscreen"
                >{team.bwu.toFixed(2)} mbps</TableBodyCell
            >
            <TableBodyCell
                class="p-0 relative aspect-square"
                on:click={detailView}
            >
                <div class="h-full text-center top-0 px-0.5 aspect-square">
                    <Graph data={signalData} min={-140} max={100} time={20} />
                </div>
                <div
                    class="absolute w-full bottom-0 p-2 monitor-signal monitor-fullscreen"
                >
                    {team.signal ? team.signal : 0} dBm
                </div>
            </TableBodyCell>
        {:else}
            <TableBodyCell on:click={detailView} class="monitor-net">
                {team.ping} ms<br />
                {team.bwu.toFixed(2)} mbps<br />
                {team.signal ? team.signal : 0} dBm
            </TableBodyCell>
        {/if}
    </TableBodyRow>
{/key}
