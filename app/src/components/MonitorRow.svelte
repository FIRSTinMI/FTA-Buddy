<script lang="ts">
	import Icon from "@iconify/svelte";
	import { onDestroy, onMount } from "svelte";
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

	// Initial values are empty; the $effect below populates them on first run.
	// The previous pattern computed history here AND in the $effect, wasting work on mount.
	let parsedData = $state<{ time: number; data: number }[]>([]);
	let parsedPingData = $state<{ time: number; data: number }[]>([]);
	let signalData = $state<{ time: number; data: number }[]>([]);

	let percentileVoltage = $state(0);

	function getPercentileVoltage() {
		const frames = (new Date().getTime() - matchStart.getTime()) / 500;
		const voltages = (frameHandler.getHistory(station, "battery", frames) as number[])
			.filter((v) => v > 0)
			.sort((a, b) => a - b);
		return voltages[Math.floor(voltages.length * 0.02)] || 0;
	}

	let matchStart = new Date();

	// Use a named function so onDestroy can remove the exact same reference.
	// Previously this was registered at the top level of the component (outside
	// onMount), so each of the 6 per-row instances accumulated a new anonymous
	// listener on every mount without ever cleaning them up.
	function onMatchStart() {
		matchStart = new Date();
	}

	onMount(() => {
		frameHandler.addEventListener("match-start", onMatchStart);
	});

	onDestroy(() => {
		frameHandler.removeEventListener("match-start", onMatchStart);
	});
</script>

{#if robot}
	<button
		class="fieldmonitor-square-height md:aspect-square overflow-hidden flex flex-col px-1 items-center justify-center text-base sm:text-xl lg:text-2xl xl:text-3xl font-mono tabular-nums {station?.startsWith(
			'blue',
		)
			? 'bg-blue-600'
			: 'bg-red-600'}"
		class:lg:text-7xl={$fullscreen}
		onclick={() => navigate("/notepad/team/:team", { params: { team: String(robot?.number) } })}
	>
		<p>{robot.number}</p>
		<p class="text-sm lg:text-sm xl:text-xl flex">
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
				<span title="Consistently slow to connect at this event">🐌</span>
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
		]} fieldmonitor-square-height md:aspect-square flex items-center justify-center font-mono text-4xl lg:text-5xl xl:text-6xl 2xl:text-8xl text-black"
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
		]} fieldmonitor-square-height md:aspect-square flex items-center justify-center font-mono text-4xl lg:text-5xl xl:text-6xl 2xl:text-8xl text-black"
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
		]} fieldmonitor-square-height md:aspect-square flex items-center justify-center font-mono text-4xl lg:text-5xl xl:text-6xl 2xl:text-8xl text-black"
		onclick={detailView}
		id="{station}-rio"
	>
		{#if robot.rio && !robot.code}
			X
		{/if}
	</button>
	<button
		class="fieldmonitor-square-height p-0 relative overflow-hidden aspect-square flex flex-col"
		onclick={detailView}
		style="background-color: rgba(255,0,0,{robot.battery < 11 && robot.battery > 0
			? (-1.5 * robot.battery ** 2 - 6.6 * robot.battery + 255) / 255
			: 0})"
		id="{station}-battery"
	>
		<div class="flex-1 min-h-0 text-center px-0.5">
			<Graph data={parsedData} min={6} max={14} time={20} />
		</div>
		<!-- Mobile/tablet: current voltage over the match-minimum, centered on the graph -->
		<div class="lg:hidden absolute inset-0 flex flex-col items-center justify-center leading-none pointer-events-none">
			<div class="monitor-battery px-1 text-sm sm:text-base tabular-nums">
				{robot.battery?.toFixed(1)}v
			</div>
			<div
				class="text-xs sm:text-sm font-semibold leading-none tabular-nums {percentileVoltage < 7.8 && percentileVoltage > 0
					? 'text-red-400'
					: 'text-gray-400'}"
				title="Match minimum (2nd percentile)"
			>
				{percentileVoltage.toFixed(1)}v
			</div>
		</div>
		<!-- Desktop: match-minimum bottom-left, current voltage bottom-right, kept below/clear of the graph.
		     grid + justify-self-end anchors the current voltage to the right edge, so if it is wider than
		     its column it overflows leftward and the trailing "v" is never clipped. -->
		<div class="hidden lg:grid grid-cols-2 items-end gap-1 px-1 pb-0.5 leading-none pointer-events-none">
			<span
				class="justify-self-start whitespace-nowrap font-semibold tabular-nums text-xs xl:text-sm 2xl:text-sm {percentileVoltage < 7.8 && percentileVoltage > 0
					? 'text-red-400'
					: 'text-gray-400'}"
				class:lg:text-lg={$fullscreen}
				title="Match minimum (2nd percentile)"
			>
				{percentileVoltage.toFixed(1)}v
			</span>
			<span
				class="monitor-battery justify-self-end whitespace-nowrap tabular-nums text-base xl:text-lg 2xl:text-2xl"
				class:lg:text-3xl={$fullscreen}
			>
				{robot.battery?.toFixed(1)}v
			</span>
		</div>
	</button>
	{#if !compact}
		<button
			class="fieldmonitor-square-height hidden lg:flex p-0 relative overflow-hidden aspect-square"
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
				class="absolute w-full bottom-0 px-1 py-0 xl:py-0.5 monitor-battery text-sm sm:text-base lg:text-lg xl:text-xl 2xl:text-3xl tabular-nums"
				class:lg:text-5xl={$fullscreen}
			>
				{robot.ping}ms
			</div>
		</button>
		<button
			onclick={detailView}
			class="fieldmonitor-square-height hidden lg:flex items-end pb-1 xl:pb-2 justify-center text-sm sm:text-base lg:text-lg xl:text-xl 2xl:text-3xl tabular-nums"
			class:lg:text-5xl={$fullscreen}
			id="{station}-bwu"
		>
			{robot.bwu.toFixed(2)}
		</button>
		<button
			class="fieldmonitor-square-height hidden lg:flex md:aspect-square flex-col items-center justify-end overflow-hidden"
			onclick={detailView}
			id="{station}-signal"
		>
			<span class="text-xs xl:text-sm 2xl:text-base">{robot.signal ?? ""}</span>
			{#if (robot.signal ?? -100) > -60 && robot.signal !== 0}
				<Icon icon="mdi:signal-cellular-3" class="size-10 lg:size-12 xl:size-14 2xl:size-20 text-green-600" />
			{:else if (robot.signal ?? -100) > -70 && robot.signal !== 0}
				<Icon icon="mdi:signal-cellular-2" class="size-10 lg:size-12 xl:size-14 2xl:size-20 text-yellow-600" />
			{:else if (robot.signal ?? -100) > -80 && robot.signal !== 0}
				<Icon icon="mdi:signal-cellular-1" class="size-10 lg:size-12 xl:size-14 2xl:size-20 text-red-600" />
			{:else}
				<Icon icon="mdi:signal-cellular-outline" class="size-10 lg:size-12 xl:size-14 2xl:size-20" />
			{/if}
		</button>
		<button
			onclick={detailView}
			class="fieldmonitor-square-height hidden lg:flex items-end pb-1 xl:pb-2 justify-center text-sm sm:text-base lg:text-lg xl:text-xl 2xl:text-3xl tabular-nums"
			class:lg:text-5xl={$fullscreen}
			id="{station}-lastchange"
		>
			{robot.lastChange ? formatTimeShortNoAgoSecondsOnly(robot.lastChange) : ""}
		</button>
		<button
			onclick={detailView}
			class="fieldmonitor-square-height lg:hidden flex flex-col items-end justify-center overflow-hidden px-1 text-xs sm:text-sm leading-tight tabular-nums"
			id="{station}-net"
		>
			<div>{robot.ping} ms</div>
			<div>{robot.bwu.toFixed(2)}</div>
			<div>{robot.signal ? robot.signal : 0} dBm</div>
		</button>
	{:else}
		<button
			onclick={detailView}
			class="fieldmonitor-square-height flex flex-col items-end justify-center overflow-hidden px-1 text-xs sm:text-sm leading-tight tabular-nums"
			id="{station}-net"
		>
			<div>{robot.ping} ms</div>
			<div>{robot.bwu.toFixed(2)}</div>
			<div>{robot.signal ? robot.signal : 0} dBm</div>
		</button>
	{/if}
{/if}
