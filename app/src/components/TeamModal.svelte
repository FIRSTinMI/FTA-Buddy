<script lang="ts">
    import { Button, Modal } from "flowbite-svelte";
    import {
    DSState,
    MatchState,
    MatchStateMap,
    ROBOT,
        type MonitorFrame,
        type RobotInfo,
    } from "../../../shared/types";
    import MonitorRow from "./MonitorRow.svelte";
    import { navigate } from "svelte-routing";
    import { formatTimeShort, formatTimeShortNoAgoSeconds } from "../../../shared/formatTime";
    import type { MonitorFrameHandler } from "../util/monitorFrameHandler";
	import { trpc } from '../main';

    export let modalOpen: boolean;
    export let modalStation: ROBOT;
    export let monitorFrame: MonitorFrame;
    export let frameHandler: MonitorFrameHandler;

    let modalRobot: RobotInfo | undefined;
    let averages: Awaited<ReturnType<typeof trpc.cycles.getTeamAverageCycle.query>> | undefined;
    $: {
        modalRobot = monitorFrame[modalStation];
        timeSinceChange = modalRobot.lastChange ? formatTimeShort(modalRobot.lastChange) : "";
        (async (team: number) => { averages = await trpc.cycles.getTeamAverageCycle.query({ teamNumber: team })})(modalRobot?.number);
    }

    let timeSinceChange = modalRobot?.lastChange ? formatTimeShort(modalRobot.lastChange) : "";

    setInterval(() => {
        if (modalOpen) {
            timeSinceChange = modalRobot?.lastChange ? formatTimeShort(modalRobot.lastChange) : "";
        }
    }, 1000);
</script>

<Modal bind:open={modalOpen} size="lg" outsideclose id="team-modal" dismissable={false}>
    <div slot="header" class="md:w-full -m-2">
        <div class="grid grid-cols-fieldmonitor lg:grid-cols-fieldmonitor-large gap-0.5 md:gap-1 lg:gap-2 mx-auto justify-center">
            <p>Team</p>
            <p>DS</p>
            <p>Radio</p>
            <p>Rio</p>
            <p>Battery</p>
            <p class="hidden lg:flex">Ping (ms)</p>
            <p class="hidden lg:flex">BWU (mbps)</p>
            <p class="hidden lg:flex">Signal (dBm)</p>
            <p class="lg:hidden">Net</p>
            <p class="hidden lg:flex">Last Change</p>
            <MonitorRow station={modalStation} {monitorFrame} detailView={() => {}} {frameHandler} />
        </div>
    </div>
    {#if modalRobot}
        <div class="flex flex-col w-full items-center space-y-4 -mt-4">
            <p>
                {#if modalRobot.ds === DSState.RED}
                    <p class="font-bold">Ethernet not plugged in</p>
                    <p>Unplugged {timeSinceChange}</p>
                    <ol class="text-left list-decimal space-y-2">
                        <li>Make sure the cable is plugged into the laptop</li>
                        <li>Check if there are link lights on the port</li>
                        <li>Try a dongle</li>
                        <li>Try replacing the ethernet cable</li>
                    </ol>
                {:else if modalRobot.ds === DSState.GREEN_X}
                    <p class="font-bold">Ethernet plugged in but no communication with DS</p>
                    {#if modalRobot.improved}
                        <p>Plugged in {timeSinceChange}</p>
                    {:else}
                        <p>Lost FMS {timeSinceChange}</p>
                    {/if}
                    <ol class="text-left list-decimal space-y-2">
                        <li>Make sure DS is open, and only one instance is open.</li>
                        <li>Check if there are link lights on the port.</li>
                        <li>Make sure WIFI is off.</li>
                        <li>
                            Click on the diagnostics tabs of DS, make sure firewall is green. Turn off firewalls if it's not <code>Win + R</code>, <code>wf.msc</code>.
                        </li>
                        <li>Try clicking the refresh button to release and renew DHCP address.</li>
                        <li>Try a dongle.</li>
                        <li>Try restarting DS software.</li>
                        <li>
                            Go to network adapters <code>Win + R</code>, <code>ncpa.cpl</code>. Make sure the ethernet adapter is enabled and shows a connection Disable any other
                            network adapters. Double check to make sure the ethernet adapter is set to "Obtain an IP address automatically."
                        </li>
                        <li>If none of the above works, try the spare DS laptop. Advise the team to come during lunch or at the end of the day to do a connection test.</li>
                    </ol>
                {:else if modalRobot.ds === DSState.MOVE_STATION}
                    <p class="font-bold">Team is in wrong station</p>
                    {#if modalRobot.improved}
                        <p>Plugged in {timeSinceChange}</p>
                    {:else}
                        <p>{timeSinceChange}</p>
                    {/if}
                    <br />
                    Their DS will tell them which station to move to.<br />
                    If this is during playoffs, double check with the HR and Scorekeeper before instructing teams to move.
                {:else if modalRobot.ds === DSState.WAITING}
                    <p class="font-bold">Team is in wrong match</p>
                    {#if modalRobot.improved}
                        <p>Plugged in {timeSinceChange}</p>
                    {:else}
                        <p>{timeSinceChange}</p>
                    {/if}
                    <ol class="text-left list-decimal space-y-2">
                        {#if MatchStateMap[monitorFrame.field] === MatchState.OVER}
                            <li>DS is connected but the field hasn't been prestarted yet.</li>
                        {:else if MatchStateMap[monitorFrame.field] === MatchState.PRESTART}
                            <li>Double check the schedule</li>
                            <li>If they're on the schedule, check if the team number in their DS is set correctly.</li>
                        {/if}
                        <li>
                            There is currently a known issue with FMS showing this state when it's not supposed to. If it occurs during a match, don't be concerned, the match will
                            still run as normal. If the match hasn't started yet, re-prestart.
                        </li>
                    </ol>
                {:else if modalRobot.ds === DSState.BYPASS}
                    <p class="font-bold">Team is bypassed</p>
                    <p>{timeSinceChange}</p>
                {:else if modalRobot.ds === DSState.ESTOP}
                    <p class="font-bold">Team is E-stopped</p>
                    <p>{timeSinceChange}</p>
                    <ol class="text-left list-decimal space-y-2">
                        <li>To clear an E-stop the roborio must be physically restarted and the DS software restarted.</li>
                        <li>If the robot was E-stopped by the HR, you should let the team know why.</li>
                    </ol>
                {:else if modalRobot.ds === DSState.ASTOP}
                    <p class="font-bold">Team is A-stopped</p>
                    <p>{timeSinceChange}</p>
                    <ol class="text-left list-decimal space-y-2">
                        <li>The A-stop will clear once teleop starts, remember to reset the button after the match.</li>
                    </ol>
                {:else if !modalRobot.radio}
                    <p class="font-bold">Radio not connected to field</p>
                    {#if modalRobot.improved}
                        <p>DS Connected {timeSinceChange}</p>
                    {:else}
                        <p>Lost Radio {timeSinceChange}</p>
                    {/if}
                    <ol class="text-left list-decimal space-y-2">
                        <li>Make sure robot is on</li>
                        <li>
                            Make sure the radio is getting power, at least one blue LED should be on. <br />
                            It may take up to 2 minutes for the radio to boot.
                        </li>
                        <li>Make sure the WIFI light (opposite of the power light) is green, if it is amber or off the radio needs to be programmed.</li>
                        <li>If you notice all the lights are solid for a while, the radio may have gotten stuck. Reboot the radio.</li>
                    </ol>
                {:else if !modalRobot.rio}
                    <p class="font-bold">Radio connected but no communication with RIO</p>
                    {#if modalRobot.improved}
                        <p>Radio Connected {timeSinceChange}</p>
                    {:else}
                        <p>Lost RIO {timeSinceChange}</p>
                    {/if}
                    <ol class="text-left list-decimal space-y-2">
                        <li>
                            <p>Check the status lights on the RIO, power should be green, link lights should be flashing, status should be off.</p>
                            <p>If the link lights are not flashing, go to 2.</p>
                            <p>If the status light is flashing, this means "Unrecoverable error", go to 5.</p>
                            <p>A solid status light means the RIO is still booting, this should take about 40 seconds.</p>
                            <p>If the lights appear normal, and you've waited for a minute or two, go to 4.</p>
                        </li>
                        <li>
                            <p>Make sure the ethernet cable is plugged into the RIO and the radio. Try unplugging and plugging it back in. Try a different cable.</p>
                            <p>If the team is using a switch, try connecting directly to the radio.</p>
                        </li>
                        <li>If time allows, try power cycling only the RIO.</li>
                        <li>Use the team number setter tool to verify the RIO has the correct team number.</li>
                        <li>
                            <p>If the status light is flashing, and it is a RIO 2, try turning off the RIO, reseating the SD card, and turning it back on.</p>
                            <p>
                                If the unrecoverable error persists, try reimaging the SD card, sometimes it may even require a new SD card. Keep in mind this require code to be
                                deployed again.
                            </p>
                            If it is a RIO 1, try entering safe mode by holding the reset button for 5 seconds and then using the RIO imaging tool.<br />
                            If the issue persists, replace the RIO.
                        </li>
                    </ol>
                {:else if !modalRobot.code}
                    <p class="font-bold">Radio and RIO connected, but code not running</p>
                    {#if modalRobot.improved}
                        <p>RIO Connected {timeSinceChange}</p>
                    {:else}
                        <p>Lost Code {timeSinceChange}</p>
                    {/if}
                    <ol class="text-left list-decimal space-y-2">
                        <li>If it is a RIO 2, try restarting the RIO, this can be done from the DS.</li>
                        <li>
                            Check the DS log to see if there's any error messages.<br />
                            Ask the team if they've recently deployed code, a recent change or a bad deploy could be the cause.
                        </li>
                    </ol>
                {:else}
                    <p class="font-bold">Robot Connected</p>
                    <p>{timeSinceChange}</p>
                    <br />
                    {#if modalRobot.battery < 11}
                        Low Battery {modalRobot.battery.toFixed(1)}V<br />
                    {/if}
                    {#if modalRobot.bwu > 3.5}
                        High Bandwidth Utilization {modalRobot.bwu.toFixed(2)}/4.00 mbps<br />
                    {/if}
                    {#if modalRobot.ping > 100}
                        High Latency {modalRobot.ping}<br />
                    {/if}
                    {#if modalRobot.packets > 10000}
                        High Packet Loss: {modalRobot.packets}<br />
                    {/if}
                {/if}
            </p>
            <div class="grid grid-cols-2">
                <h4 class="col-span-2">Average Times</h4>
                <p>DS</p>
                <p>{formatTimeShortNoAgoSeconds(averages?.ds ?? 0)}</p>
                <p>Radio</p>
                <p>{formatTimeShortNoAgoSeconds(averages?.radio ?? 0)}</p>
                <p>Rio</p>
                <p>{formatTimeShortNoAgoSeconds(averages?.rio ?? 0)}</p>
                <p>Code</p>
                <p>{formatTimeShortNoAgoSeconds(averages?.code ?? 0)}</p>
            </div>
        </div>
    {/if}
    <div slot="footer">
        <Button color="primary" on:click={() => navigate("/notes/" + modalRobot?.number)}>Notes</Button>
        <Button color="primary" on:click={() => (modalOpen = false)}>Close</Button>
    </div>
</Modal>
