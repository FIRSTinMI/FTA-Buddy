<script lang="ts">
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
	import { settingsStore } from "../stores/settings";
	import { formatTimeShortNoAgo } from "../util/formatTime";

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
        1: "bg-green-500" + ($settingsStore.roundGreen ? " rounded-full" : ""),
        2: "bg-green-500" + ($settingsStore.roundGreen ? " rounded-full" : ""),
        3: "bg-yellow-400" + ($settingsStore.roundGreen ? " rounded-full" : ""),
        4: "bg-yellow-400" + ($settingsStore.roundGreen ? " rounded-full" : ""),
        5: "bg-red-800",
        6: "bg-red-800",
        7: "bg-red-800",
    };

    const Status_Colors: { [key: number]: string } = {
        0: "bg-red-600",
        1: "bg-green-500" + ($settingsStore.roundGreen ? " rounded-full" : ""),
        2: "bg-green-500" + ($settingsStore.roundGreen ? " rounded-full" : ""),
    };

    let parsedData = frameHandler.getHistory(station, 'battery', 20).map((d, i) => ({ time: i, data: d as number }));
    let signalData = processSignalStrengthForGraph(frameHandler
        .getHistory(station, "signal", 20) as number[]);
</script>

{#key team}
<button
    class="w-full fieldmonitor-square-height md:aspect-square flex flex-col px-1 items-center justify-center text-lg sm:text-2xl lg:text-4xl {fullscreen && "lg:text-6xl"} font-mono tabular-nums {getKey(team)?.startsWith('blue') ? 'bg-blue-600' : 'bg-red-600'}"
    on:click={() => navigate("/notes/" + team.number)}
>
    <p>{team.number}</p>
    <p style="{window.innerWidth > 1000 && "letter-spacing: -8px;"}">
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
        {#if team.warnings.includes(TeamWarnings.NOT_INSPECTED) && $settingsStore.inspectionAlerts}
            🔍
        {/if}
        {#if team.warnings.includes(TeamWarnings.RADIO_NOT_FLASHED)}
            🛜
        {/if}
        {#if team.warnings.includes(TeamWarnings.SLOW)}
            🕑
        {/if}
    </p>
</button>
<button
    class="{DS_Colors[
        team.ds
    ]} fieldmonitor-square-height md:aspect-square flex items-center justify-center font-mono text-4xl lg:text-8xl text-black"
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
</button>
<button
    class="{Status_Colors[team.radio ? 1 : 0]} fieldmonitor-square-height md:aspect-square flex"
    on:click={detailView}
></button>
<button
    class="{Status_Colors[(team.rio ? 1 : 0)]} fieldmonitor-square-height md:aspect-square flex items-center justify-center font-mono text-4xl lg:text-8xl text-black"
    on:click={detailView}
>
    {#if team.rio && !team.code}
        X
    {/if}
</button>
<button
    class="fieldmonitor-square-height p-0 relative aspect-square max-w-8 lg:max-w-32"
    on:click={detailView}
    style="background-color: rgba(255,0,0,{team.battery < 11 &&
    team.battery > 0
        ? (-1.5 * team.battery ** 2 - 6.6 * team.battery + 255) / 255
        : 0})"
>
    <div class="h-full text-center top-0 px-0.5 aspect-square">
        <Graph data={parsedData} min={0} max={8} time={20} />
    </div>
    <div
        class="absolute w-full bottom-0 p-2 monitor-battery text-md sm:text-xl lg:text-4xl {fullscreen && "lg:text-5xl"} tabular-nums"
    >
        {team.battery?.toFixed(1)}v
    </div>
</button>
<button on:click={() => detailView} class="fieldmonitor-square-height hidden lg:flex items-end pb-2 justify-center text-md sm:text-xl lg:text-4xl {fullscreen && "lg:text-5xl"} tabular-nums">{team.ping}</button>
<button on:click={() => detailView} class="fieldmonitor-square-height hidden lg:flex items-end pb-2 justify-center text-md sm:text-xl lg:text-4xl {fullscreen && "lg:text-5xl"} tabular-nums">
    {team.bwu.toFixed(2)}
</button>
<button class="fieldmonitor-square-height hidden lg:flex p-0 relative aspect-square" on:click={() => detailView}>
    <div class="text-center top-0 px-0.5 aspect-square">
        <Graph data={signalData} min={-140} max={100} time={20} />
    </div>
    <div class="absolute w-full bottom-0 p-2 monitor-signal text-md sm:text-lg lg:text-4xl {fullscreen && "lg:text-5xl"} tabular-nums">
        {team.signal ? team.signal : 0}
    </div>
</button>
<button on:click={() => detailView} class="fieldmonitor-square-height hidden lg:flex items-end pb-2 justify-center text-md sm:text-xl lg:text-4xl {fullscreen && "lg:text-5xl"} tabular-nums">
    {(!team.code && team.lastChange) ? formatTimeShortNoAgo(team.lastChange) : ""}
</button>
<button on:click={() => detailView} class="fieldmonitor-square-height lg:hidden flex flex-col items-end justify-center tabular-nums">
    <div>{team.ping} ms</div>
    <div>{team.bwu.toFixed(2)}</div>
    <div>{team.signal ? team.signal : 0} dBm</div>
</button>
{/key}
