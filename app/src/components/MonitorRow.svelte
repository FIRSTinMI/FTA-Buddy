<script lang="ts">
	import Icon from "@iconify/svelte";
	import { formatTimeShortNoAgoSecondsOnly } from "../../../shared/formatTime";
	import {
		DSState,
		MatchState,
		MatchStateMap,
		ROBOT,
		RobotWarnings,
		type MonitorFrame,
		type RobotInfo,
	} from "../../../shared/types";
	import { frameHandler } from "../field-monitor";
	import { navigate } from "../router";
	import { fullscreen } from "../stores/fullscreen";
	import { settingsStore } from "../stores/settings";
	import { processSignalStrengthForGraph } from "../util/signalStrengthProcessor";
	import Graph from "./Graph.svelte";

	let {
		station,
		monitorFrame,
		compact = false,
		detailView = (evt: Event) => {},
	}: {
		station: ROBOT;
		monitorFrame: MonitorFrame;
		compact?: boolean;
		detailView?: (evt: Event) => void;
	} = $props();

	let robot: RobotInfo | undefined = $state();

	$effect(() => {
		robot = monitorFrame[station];
		parsedData = frameHandler.getHistory(station, "battery", 20).map((d, i) => ({ time: i, data: d as number }));
		parsedPingData = frameHandler.getHistory(station, "ping", 20).map((d, i) => ({ time: i, data: d as number }));
		signalData = processSignalStrengthForGraph(frameHandler.getHistory(station, "signal", 20) as number[]);
		percentileVoltage = getPercentileVoltage();
	});

	const DS_Colors: { [key: number]: string } = {
		0: "bg-red-600",
		1: "bg-green-500" + ($settingsStore.roundGreen ? " rounded-full" : ""),
		2: "bg-green-500" + ($settingsStore.roundGreen ? " rounded-full" : ""),
		3: "bg-yellow-400" + ($settingsStore.roundGreen ? " rounded-full" : ""),
		4: "bg-yellow-400" + ($settingsStore.roundGreen ? " rounded-full" : ""),
		5: "bg-red-800",
		6: "bg-red-800",
		7: "bg-green-600",
	};

	const Status_Colors: { [key: number]: string } = {
		0: "bg-red-600",
		1: "bg-green-500" + ($settingsStore.roundGreen ? " rounded-full" : ""),
		2: "bg-green-500" + ($settingsStore.roundGreen ? " rounded-full" : ""),
	};

	let parsedData = $state(
		// svelte-ignore state_referenced_locally
		frameHandler.getHistory(station, "battery", 20).map((d, i) => ({ time: i, data: d as number })),
	);
	let parsedPingData = $state(
		// svelte-ignore state_referenced_locally
		frameHandler.getHistory(station, "ping", 20).map((d, i) => ({ time: i, data: d as number })),
	);
	let signalData = $state(
		// svelte-ignore state_referenced_locally
		processSignalStrengthForGraph(frameHandler.getHistory(station, "signal", 20) as number[]),
	);

	let percentileVoltage = $state(0);

	function getPercentileVoltage() {
		const frames = (new Date().getTime() - matchStart.getTime()) / 500;
		const voltages = (frameHandler.getHistory(station, "battery", frames) as number[])
			.filter((v) => v > 0)
			.sort((a, b) => a - b);
		return voltages[Math.floor(voltages.length * 0.02)] || 0;
	}

	let matchStart = new Date();

	frameHandler.addEventListener("match-start", () => {
		matchStart = new Date();
	});
</script>

{#if robot}
	<button
		class="w-full fieldmonitor-square-height md:aspect-square flex flex-col px-1 items-center justify-center text-lg sm:text-2xl lg:text-3xl font-mono tabular-nums {station?.startsWith(
			'blue',
		)
			? 'bg-blue-600'
			: 'bg-red-600'}"
		class:lg:text-5xl={$fullscreen}
		onclick={() => navigate("/notepad/team/:team", { params: { team: String(robot?.number) } })}
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
			{#if robot.warnings.includes(RobotWarnings.OPEN_NOTE)}
				<span>📝</span>
			{:else if robot.warnings.includes(RobotWarnings.RECENT_NOTE)}
				<span>📝</span>
			{/if}
			{#if robot.warnings.includes(RobotWarnings.PREVIOUS_MATCH_EVENT)}
				<span>⚙️</span>
			{/if}
		</p>
	</button>
	<button
		class="{DS_Colors[
			robot.ds
		]} fieldmonitor-square-height md:aspect-square flex items-center justify-center font-mono text-4xl lg:text-8xl text-black"
		onclick={detailView}
		id="{station}-ds"
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
		onclick={detailView}
		id="{station}-radio"
	>
		{#if robot.radioConnected && !robot.radio}
			X
		{/if}
	</button>
	<button
		class="{Status_Colors[
			robot.rio ? 1 : 0
		]} fieldmonitor-square-height md:aspect-square flex items-center justify-center font-mono text-4xl lg:text-8xl text-black"
		onclick={detailView}
		id="{station}-rio"
	>
		{#if robot.rio && !robot.code}
			X
		{/if}
	</button>
	<button
		class="fieldmonitor-square-height p-0 relative aspect-square max-w-8 lg:max-w-32"
		onclick={detailView}
		style="background-color: rgba(255,0,0,{robot.battery < 11 && robot.battery > 0
			? (-1.5 * robot.battery ** 2 - 6.6 * robot.battery + 255) / 255
			: 0})"
		id="{station}-battery"
	>
		<div class="h-full text-center top-0 px-0.5 aspect-square">
			<Graph data={parsedData} min={6} max={14} time={20} />
		</div>
		<div
			class="absolute w-full bottom-2 xl:bottom-3 p-2 monitor-battery text-md sm:text-xl lg:text-4xl tabular-nums"
			class:lg:text-5xl={$fullscreen}
		>
			{robot.battery?.toFixed(1)}v
		</div>
		<p
			class="absolute bottom-0 px-2 py-0.5 text-xs xl:text-sm {percentileVoltage < 7.8 && percentileVoltage > 0
				? 'text-red-600'
				: 'text-gray-500'}"
		>
			{percentileVoltage.toFixed(1)}v
		</p>
	</button>
	{#if !compact}
		<button
			class="fieldmonitor-square-height hidden lg:flex p-0 relative aspect-square max-w-8 lg:max-w-32"
			onclick={detailView}
			style="background-color: rgba(255,0,0,{robot.ping >= 20 && robot.ping < 100
				? Math.log10(robot.ping / 25)
				: robot.ping > 100
					? 0.5
					: 0})"
			id="{station}-ping"
		>
			<div class="h-full text-center top-0 px-0.5 aspect-square">
				<Graph
					data={parsedPingData}
					min={0}
					max={Math.max(23, ...parsedPingData.map((s) => s.data)) + 2}
					time={20}
				/>
			</div>
			<div
				class="absolute w-full bottom-0 p-2 monitor-battery text-md sm:text-xl lg:text-4xl tabular-nums"
				class:lg:text-5xl={$fullscreen}
			>
				{robot.ping}ms
			</div>
		</button>
		<button
			onclick={() => detailView}
			class="fieldmonitor-square-height hidden lg:flex items-end pb-2 justify-center text-md sm:text-xl lg:text-4xl tabular-nums"
			class:lg:text-5xl={$fullscreen}
			id="{station}-bwu"
		>
			{robot.bwu.toFixed(2)}
		</button>
		<button
			class="fieldmonitor-square-height hidden lg:flex md:aspect-square flex-col items-center justify-end"
			onclick={() => detailView}
			id="{station}-signal"
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
			onclick={() => detailView}
			class="fieldmonitor-square-height hidden lg:flex items-end pb-2 justify-center text-md sm:text-xl lg:text-4xl tabular-nums"
			class:lg:text-5xl={$fullscreen}
			id="{station}-lastchange"
		>
			{robot.lastChange ? formatTimeShortNoAgoSecondsOnly(robot.lastChange) : ""}
		</button>
		<button
			onclick={() => detailView}
			class="fieldmonitor-square-height lg:hidden flex flex-col items-end justify-center tabular-nums"
			id="{station}-net"
		>
			<div>{robot.ping} ms</div>
			<div>{robot.bwu.toFixed(2)}</div>
			<div>{robot.signal ? robot.signal : 0} dBm</div>
		</button>
	{:else}
		<button
			onclick={() => detailView}
			class="fieldmonitor-square-height flex-col items-end justify-center tabular-nums"
			id="{station}-net"
		>
			<div>{robot.ping} ms</div>
			<div>{robot.bwu.toFixed(2)}</div>
			<div>{robot.signal ? robot.signal : 0} dBm</div>
		</button>
	{/if}
{/if}
