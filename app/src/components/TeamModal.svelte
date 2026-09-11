<script lang="ts">
	import { Button, Modal } from "flowbite-svelte";
	import { formatTimeShort } from "../../../shared/formatTime";
	import { DSState, MatchStateMap, ROBOT, type MonitorFrame, type RobotInfo } from "../../../shared/types";
	import { trpc } from "../main";
	import { navigate } from "../router";
	import { monitorIssue, waitingKey } from "../../../shared/troubleshooting/monitor-steps";
	import type { MonitorFrameHandler } from "../util/monitorFrameHandler";
	import FormattedTime from "./FormattedTime.svelte";
	import MonitorRow from "./MonitorRow.svelte";
	import StepFlowTree from "./troubleshoot/StepFlowTree.svelte";

	interface Props {
		modalOpen: boolean;
		modalStation: ROBOT;
		monitorFrame: MonitorFrame;
		frameHandler: MonitorFrameHandler;
	}

	let { modalOpen = $bindable(), modalStation, monitorFrame, frameHandler }: Props = $props();

	let modalRobot: RobotInfo | undefined = $state();
	let averages: Awaited<ReturnType<typeof trpc.cycles.getTeamAverageCycle.query>> | undefined = $state();

	$effect(() => {
		modalRobot = monitorFrame[modalStation];
	});
</script>

<Modal bind:open={modalOpen} fullscreen outsideclose id="team-modal" dismissable={false}>
	{#snippet header()}
		<div class="md:w-full -m-2">
			<div class="grid grid-cols-teammodal gap-0.5 md:gap-1 lg:gap-2 mx-auto justify-center">
				<p>Team</p>
				<p>DS</p>
				<p>Radio</p>
				<p>Rio</p>
				<p>Battery</p>
				<p>Net</p>
				<MonitorRow station={modalStation} {monitorFrame} compact />
			</div>
		</div>
	{/snippet}

	{#if modalRobot}
		<div class="flex flex-col w-full items-center space-y-4 -mt-4">
			{#if modalRobot.ds === DSState.RED}
				<div>
					<p class="font-bold">Ethernet not plugged in</p>
					<p>Unplugged <FormattedTime date={modalRobot?.lastChange} formatter={formatTimeShort} /></p>
					<StepFlowTree steps={monitorIssue("ds-red").steps} />
					{#if monitorIssue("ds-red").href}
						<a
							href={monitorIssue("ds-red").href ?? "/troubleshoot"}
							class="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 underline dark:text-blue-400"
							>Open the full guide</a
						>
					{/if}
				</div>
			{:else if modalRobot.ds === DSState.GREEN_X}
				<div>
					<p class="font-bold">Ethernet plugged in but no communication with DS</p>
					<p>
						{modalRobot.improved ? "Plugged in" : "Lost FMS"}
						<FormattedTime date={modalRobot?.lastChange} formatter={formatTimeShort} />
					</p>
					<StepFlowTree steps={monitorIssue("ds-green-x").steps} />
					{#if monitorIssue("ds-green-x").href}
						<a
							href={monitorIssue("ds-green-x").href ?? "/troubleshoot"}
							class="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 underline dark:text-blue-400"
							>Open the full guide</a
						>
					{/if}
				</div>
			{:else if modalRobot.ds === DSState.MOVE_STATION}
				<div>
					<p class="font-bold">Team is in wrong station</p>
					<p>
						{modalRobot.improved ? "Plugged in " : ""}<FormattedTime
							date={modalRobot?.lastChange}
							formatter={formatTimeShort}
						/>
					</p>
					<StepFlowTree steps={monitorIssue("move-station").steps} />
					{#if monitorIssue("move-station").href}
						<a
							href={monitorIssue("move-station").href ?? "/troubleshoot"}
							class="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 underline dark:text-blue-400"
							>Open the full guide</a
						>
					{/if}
				</div>
			{:else if modalRobot.ds === DSState.WAITING}
				<div>
					<p class="font-bold">Team mismatch / wrong match</p>
					<p>
						{modalRobot.improved ? "Plugged in " : ""}<FormattedTime
							date={modalRobot?.lastChange}
							formatter={formatTimeShort}
						/>
					</p>
					<StepFlowTree steps={monitorIssue(waitingKey(MatchStateMap[monitorFrame.field])).steps} />
				</div>
			{:else if modalRobot.ds === DSState.BYPASS}
				<div>
					<p class="font-bold">Team is bypassed</p>
					<p><FormattedTime date={modalRobot?.lastChange} formatter={formatTimeShort} /></p>
				</div>
			{:else if modalRobot.ds === DSState.ESTOP}
				<div>
					<p class="font-bold">Team is E-stopped</p>
					<p><FormattedTime date={modalRobot?.lastChange} formatter={formatTimeShort} /></p>
					<StepFlowTree steps={monitorIssue("estop").steps} />
					{#if monitorIssue("estop").href}
						<a
							href={monitorIssue("estop").href ?? "/troubleshoot"}
							class="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 underline dark:text-blue-400"
							>Open the full guide</a
						>
					{/if}
				</div>
			{:else if modalRobot.ds === DSState.ASTOP}
				<div>
					<p class="font-bold">Team is A-stopped</p>
					<p><FormattedTime date={modalRobot?.lastChange} formatter={formatTimeShort} /></p>
					<StepFlowTree steps={monitorIssue("astop").steps} />
					{#if monitorIssue("astop").href}
						<a
							href={monitorIssue("astop").href ?? "/troubleshoot"}
							class="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 underline dark:text-blue-400"
							>Open the full guide</a
						>
					{/if}
				</div>
			{:else if !modalRobot.radio}
				<div>
					<p class="font-bold">Radio not connected to field</p>
					<p>
						{modalRobot.improved ? "DS Connected" : "Lost Radio"}
						<FormattedTime date={modalRobot?.lastChange} formatter={formatTimeShort} />
					</p>
					<StepFlowTree steps={monitorIssue("no-radio").steps} />
					{#if monitorIssue("no-radio").href}
						<a
							href={monitorIssue("no-radio").href ?? "/troubleshoot"}
							class="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 underline dark:text-blue-400"
							>Open the full guide</a
						>
					{/if}
				</div>
			{:else if !modalRobot.rio}
				<div>
					<p class="font-bold">Radio connected but no communication with RIO</p>
					<p>
						{modalRobot.improved ? "Radio Connected" : "Lost RIO"}
						<FormattedTime date={modalRobot?.lastChange} formatter={formatTimeShort} />
					</p>
					<StepFlowTree steps={monitorIssue("no-rio").steps} />
					{#if monitorIssue("no-rio").href}
						<a
							href={monitorIssue("no-rio").href ?? "/troubleshoot"}
							class="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 underline dark:text-blue-400"
							>Open the full guide</a
						>
					{/if}
				</div>
			{:else if !modalRobot.code}
				<div>
					<p class="font-bold">Radio and RIO connected, but code not running</p>
					<p>
						{modalRobot.improved ? "RIO Connected" : "Lost Code"}
						<FormattedTime date={modalRobot?.lastChange} formatter={formatTimeShort} />
					</p>
					<StepFlowTree steps={monitorIssue("no-code").steps} />
					{#if monitorIssue("no-code").href}
						<a
							href={monitorIssue("no-code").href ?? "/troubleshoot"}
							class="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 underline dark:text-blue-400"
							>Open the full guide</a
						>
					{/if}
				</div>
			{:else}
				<div>
					<p class="font-bold">Robot Connected</p>
					<p><FormattedTime date={modalRobot?.lastChange} formatter={formatTimeShort} /></p>
					{#if modalRobot.battery < 11}
						<p>Low Battery: {modalRobot.battery.toFixed(1)}V</p>
					{/if}
					{#if modalRobot.bwu > 3.5}
						<p>High Bandwidth: {modalRobot.bwu.toFixed(2)}/4.00 mbps</p>
					{/if}
					{#if modalRobot.ping > 100}
						<p>High Latency: {modalRobot.ping}</p>
					{/if}
					{#if modalRobot.packets > 10000}
						<p>High Packet Loss: {modalRobot.packets}</p>
					{/if}
				</div>
			{/if}

			<!-- <div class="grid grid-cols-2">
				<h4 class="col-span-2">Average Times</h4>
				<p>DS</p>
				<p>{formatTimeShortNoAgoSeconds(averages?.ds ?? 0)}</p>
				<p>Radio</p>
				<p>{formatTimeShortNoAgoSeconds(averages?.radio ?? 0)}</p>
				<p>Rio</p>
				<p>{formatTimeShortNoAgoSeconds(averages?.rio ?? 0)}</p>
				<p>Code</p>
				<p>{formatTimeShortNoAgoSeconds(averages?.code ?? 0)}</p>
			</div> -->
		</div>
	{/if}

	{#snippet footer()}
		<Button
			color="primary"
			onclick={() => navigate("/notepad/team/:team", { params: { team: String(modalRobot?.number) } })}
			>History</Button
		>
		<Button color="primary" onclick={() => (modalOpen = false)}>Close</Button>
	{/snippet}
</Modal>
