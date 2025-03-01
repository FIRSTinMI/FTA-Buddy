<script lang="ts">
	import { DSState, MatchState, MatchStateMap, ROBOT, RobotWarnings, type MonitorFrame, type RobotInfo } from "../../../shared/types";
	import { navigate } from "svelte-routing";
	import Graph from "./Graph.svelte";
	import type { MonitorFrameHandler } from "../util/monitorFrameHandler";
	import { processSignalStrengthForGraph } from "../util/signalStrengthProcessor";
	import { settingsStore } from "../stores/settings";
	import { formatTimeShortNoAgoSecondsOnly } from "../../../shared/formatTime";
	import Icon from "@iconify/svelte";

	export let station: ROBOT;
	export let monitorFrame: MonitorFrame;
	export let fullscreen = false;
	export let frameHandler: MonitorFrameHandler;
	let robot: RobotInfo;

	$: {
		robot = monitorFrame[station];
		parsedData = frameHandler.getHistory(station, "battery", 20).map((d, i) => ({ time: i, data: d as number }));
		parsedPingData = frameHandler.getHistory(station, "ping", 20).map((d, i) => ({ time: i, data: d as number }));
		signalData = processSignalStrengthForGraph(frameHandler.getHistory(station, "signal", 20) as number[]);
	}

	export let detailView: (evt: Event) => void;

	function getKey(value: any) {
		return Object.keys(monitorFrame).find((key) => (monitorFrame as any)[key] === value);
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

	let parsedData = frameHandler.getHistory(station, "battery", 20).map((d, i) => ({ time: i, data: d as number }));
	let parsedPingData = frameHandler.getHistory(station, "ping", 20).map((d, i) => ({ time: i, data: d as number }));
	let signalData = processSignalStrengthForGraph(frameHandler.getHistory(station, "signal", 20) as number[]);
</script>

{#key robot}
	<button
		class="w-full fieldmonitor-square-height md:aspect-square flex flex-col px-1 items-center justify-center text-lg sm:text-2xl lg:text-4xl {fullscreen &&
			'lg:text-6xl'} font-mono tabular-nums {getKey(robot)?.startsWith('blue') ? 'bg-blue-600' : 'bg-red-600'}"
		on:click={() => navigate("/app/notes/" + robot.number)}
	>
		<p>{robot.number}</p>
		<p class="text-sm lg:text-3xl flex">
			{#if MatchStateMap[monitorFrame.field] === MatchState.PRESTART && robot.lastChange}
				{#if robot.ds === DSState.RED && robot.lastChange.getTime() + 30e3 < Date.now()}
					<span>👀</span>
				{:else if robot.ds === DSState.GREEN_X && robot.lastChange.getTime() + 30e3 < Date.now()}
					<span>👀</span>
				{:else if !robot.radio && robot.lastChange.getTime() + 180e3 < Date.now()}
					<span>👀</span>
				{:else if !robot.rio && robot.lastChange.getTime() + 45e3 < Date.now()}
					<span>👀</span>
				{:else if !robot.code && robot.lastChange.getTime() + 30e3 < Date.now()}
					<span>👀</span>
				{/if}
			{/if}
			{#if robot.warnings.includes(RobotWarnings.NOT_INSPECTED) && $settingsStore.inspectionAlerts}
				<span>🔍</span>
			{/if}
			{#if robot.warnings.includes(RobotWarnings.RADIO_NOT_FLASHED)}
				<span>🛜</span>
			{/if}
			{#if robot.warnings.includes(RobotWarnings.SLOW)}
				<span>🕑</span>
			{/if}
			{#if robot.warnings.includes(RobotWarnings.OPEN_TICKET)}
				<span>📝</span>
			{:else if robot.warnings.includes(RobotWarnings.RECENT_TICKET)}
				<span>📝</span>
			{/if}
		</p>
	</button>
	<button
		class="{DS_Colors[robot.ds]} fieldmonitor-square-height md:aspect-square flex items-center justify-center font-mono text-4xl lg:text-8xl text-black"
		on:click={detailView}
		id="{getKey(robot)}-ds"
	>
		{#if robot.ds === DSState.GREEN_X}
			X
		{:else if robot.ds === DSState.MOVE_STATION}
			M
		{:else if robot.ds === DSState.WAITING}
			W
		{:else if robot.ds === DSState.BYPASS}
			B
		{:else if robot.ds === DSState.ESTOP}
			E
		{:else if robot.ds === DSState.ASTOP}
			A
		{/if}
	</button>
	<button
		class="{Status_Colors[
			robot.radio || robot.radioConnected ? 1 : 0
		]} fieldmonitor-square-height md:aspect-square flex items-center justify-center font-mono text-4xl lg:text-8xl text-black"
		on:click={detailView}
		id="{getKey(robot)}-radio"
	>
		{#if robot.radioConnected && !robot.radio}
			X
		{/if}
	</button>
	<button
		class="{Status_Colors[
			robot.rio ? 1 : 0
		]} fieldmonitor-square-height md:aspect-square flex items-center justify-center font-mono text-4xl lg:text-8xl text-black"
		on:click={detailView}
		id="{getKey(robot)}-rio"
	>
		{#if robot.rio && !robot.code}
			X
		{/if}
	</button>
	<button
		class="fieldmonitor-square-height p-0 relative aspect-square max-w-8 lg:max-w-32"
		on:click={detailView}
		style="background-color: rgba(255,0,0,{robot.battery < 11 && robot.battery > 0 ? (-1.5 * robot.battery ** 2 - 6.6 * robot.battery + 255) / 255 : 0})"
		id="{getKey(robot)}-battery"
	>
		<div class="h-full text-center top-0 px-0.5 aspect-square">
			<Graph data={parsedData} min={6} max={14} time={20} />
		</div>
		<div class="absolute w-full bottom-0 p-2 monitor-battery text-md sm:text-xl lg:text-4xl {fullscreen && 'lg:text-5xl'} tabular-nums">
			{robot.battery?.toFixed(1)}v
		</div>
	</button>
	<button
		class="fieldmonitor-square-height hidden lg:flex p-0 relative aspect-square max-w-8 lg:max-w-32"
		on:click={detailView}
		style="background-color: rgba(255,0,0,{robot.ping >= 20 && robot.ping < 100 ? Math.log10(robot.ping / 25) : robot.ping > 100 ? 0.5 : 0})"
		id="{getKey(robot)}-ping"
	>
		<div class="h-full text-center top-0 px-0.5 aspect-square">
			<Graph data={parsedPingData} min={0} max={Math.max(23, ...parsedPingData.map((s) => s.data)) + 2} time={20} />
		</div>
		<div class="absolute w-full bottom-0 p-2 monitor-battery text-md sm:text-xl lg:text-4xl {fullscreen && 'lg:text-5xl'} tabular-nums">
			{robot.ping}ms
		</div>
	</button>
	<button
		on:click={() => detailView}
		class="fieldmonitor-square-height hidden lg:flex items-end pb-2 justify-center text-md sm:text-xl lg:text-4xl {fullscreen &&
			'lg:text-5xl'} tabular-nums"
		id="{getKey(robot)}-bwu"
	>
		{robot.bwu.toFixed(2)}
	</button>
	<button
		class="fieldmonitor-square-height hidden lg:flex md:aspect-square flex-col items-center justify-end"
		on:click={() => detailView}
		id="{getKey(robot)}-signal"
	>
		{robot.signal ?? ""}
		{#if (robot.signal ?? -100) > -60 && robot.signal !== 0}
			<Icon icon="mdi:signal-cellular-3" class="size-12 lg:size-20 2xl:size-24 text-green-600" />
		{:else if (robot.signal ?? -100) > -70 && robot.signal !== 0}
			<Icon icon="mdi:signal-cellular-2" class="size-12 lg:size-20 2xl:size-24 text-yellow-600" />
		{:else if (robot.signal ?? -100) > -80 && robot.signal !== 0}
			<Icon icon="mdi:signal-cellular-1" class="size-12 lg:size-20  2xl:size-24 text-red-600" />
		{:else}
			<Icon icon="mdi:signal-cellular-outline" class="size-12 lg:size-20 2xl:size-24" />
		{/if}
	</button>
	<button
		on:click={() => detailView}
		class="fieldmonitor-square-height hidden lg:flex items-end pb-2 justify-center text-md sm:text-xl lg:text-4xl {fullscreen &&
			'lg:text-5xl'} tabular-nums"
		id="{getKey(robot)}-time"
	>
		{!robot.code && robot.lastChange ? formatTimeShortNoAgoSecondsOnly(robot.lastChange) : ""}
	</button>
	<button
		on:click={() => detailView}
		class="fieldmonitor-square-height lg:hidden flex flex-col items-end justify-center tabular-nums"
		id="{getKey(robot)}-net"
	>
		<div>{robot.ping} ms</div>
		<div>{robot.bwu.toFixed(2)}</div>
		<div>{robot.signal ? robot.signal : 0} dBm</div>
	</button>
{/key}
