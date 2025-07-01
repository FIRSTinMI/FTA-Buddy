<script lang="ts">
    import { run } from 'svelte/legacy';
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
    import { writable, derived } from 'svelte/store';

    let tick = 0;
    setInterval(() => tick++, 1000);


    interface Props {
        modalOpen: boolean;
        modalStation: ROBOT;
        monitorFrame: MonitorFrame;
        frameHandler: MonitorFrameHandler;
    }

    let {
        modalOpen = $bindable(),
        modalStation,
        monitorFrame,
        frameHandler
    }: Props = $props();

    let modalRobot: RobotInfo | undefined = $state();
    let averages: Awaited<ReturnType<typeof trpc.cycles.getTeamAverageCycle.query>> | undefined = $state();

    run(() => {
        modalRobot = monitorFrame[modalStation];
        if (modalRobot?.number) {
            (async (team: number) => {
                averages = await trpc.cycles.getTeamAverageCycle.query({ teamNumber: team });
            })(modalRobot.number);
        }
    });

    let timeSinceChange = $derived(() => {
        tick; // force re-evaluation
        return modalRobot?.lastChange ? formatTimeShort(modalRobot.lastChange) : "";
    });

    setInterval(() => {
        if (modalOpen) {
            timeSinceChange = () => modalRobot?.lastChange ? formatTimeShort(modalRobot.lastChange) : "";
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
            {#if modalRobot.ds === DSState.RED}
                <div>
                    <p class="font-bold">Ethernet not plugged in</p>
                    <p>Unplugged {timeSinceChange}</p>
                    <ol class="text-left list-decimal space-y-2">
                        <li>Make sure the cable is plugged into the laptop</li>
                        <li>Check if there are link lights on the port</li>
                        <li>Try a dongle</li>
                        <li>Try replacing the ethernet cable</li>
                    </ol>
                </div>
            {:else if modalRobot.ds === DSState.GREEN_X}
                <div>
                    <p class="font-bold">Ethernet plugged in but no communication with DS</p>
                    <p>{modalRobot.improved ? `Plugged in ${timeSinceChange}` : `Lost FMS ${timeSinceChange}`}</p>
                    <ol class="text-left list-decimal space-y-2">
                        <li>Make sure DS is open, and only one instance is open.</li>
                        <li>Check if there are link lights on the port.</li>
                        <li>Make sure WIFI is off.</li>
                        <li>Click on the diagnostics tabs of DS, make sure firewall is green. Turn off firewalls if it's not (<code>Win + R</code>, <code>wf.msc</code>).</li>
                        <li>Try clicking the refresh button to release and renew DHCP address.</li>
                        <li>Try a dongle.</li>
                        <li>Try restarting DS software.</li>
                        <li>Go to network adapters (<code>Win + R</code>, <code>ncpa.cpl</code>). Ensure ethernet adapter is enabled and auto IP config is set.</li>
                        <li>If all else fails, use spare DS laptop and recommend lunch-time diagnostics.</li>
                    </ol>
                </div>
            {:else if modalRobot.ds === DSState.MOVE_STATION}
                <div>
                    <p class="font-bold">Team is in wrong station</p>
                    <p>{modalRobot.improved ? `Plugged in ${timeSinceChange}` : timeSinceChange}</p>
                    <p>Their DS will tell them which station to move to.</p>
                    <p>If this is during playoffs, double check with HR and Scorekeeper first.</p>
                </div>
            {:else if modalRobot.ds === DSState.WAITING}
                <div>
                    <p class="font-bold">Team is in wrong match</p>
                    <p>{modalRobot.improved ? `Plugged in ${timeSinceChange}` : timeSinceChange}</p>
                    <ol class="text-left list-decimal space-y-2">
                        {#if MatchStateMap[monitorFrame.field] === MatchState.OVER}
                            <li>DS is connected but the field hasn't been prestarted yet.</li>
                        {:else if MatchStateMap[monitorFrame.field] === MatchState.PRESTART}
                            <li>Double check the schedule</li>
                            <li>If they're on the schedule, verify the DS team number is correct.</li>
                        {/if}
                        <li>Known FMS bug may show this state incorrectly. Match will run as normal or re-prestart if needed.</li>
                    </ol>
                </div>
            {:else if modalRobot.ds === DSState.BYPASS}
                <div>
                    <p class="font-bold">Team is bypassed</p>
                    <p>{timeSinceChange}</p>
                </div>
            {:else if modalRobot.ds === DSState.ESTOP}
                <div>
                    <p class="font-bold">Team is E-stopped</p>
                    <p>{timeSinceChange}</p>
                    <ol class="text-left list-decimal space-y-2">
                        <li>RIO and DS must be restarted to clear E-stop.</li>
                        <li>If HR triggered it, explain to team why.</li>
                    </ol>
                </div>
            {:else if modalRobot.ds === DSState.ASTOP}
                <div>
                    <p class="font-bold">Team is A-stopped</p>
                    <p>{timeSinceChange}</p>
                    <ol class="text-left list-decimal space-y-2">
                        <li>Clears on teleop start. Reset the button after match.</li>
                    </ol>
                </div>
            {:else if !modalRobot.radio}
                <div>
                    <p class="font-bold">Radio not connected to field</p>
                    <p>{modalRobot.improved ? `DS Connected ${timeSinceChange}` : `Lost Radio ${timeSinceChange}`}</p>
                    <ol class="text-left list-decimal space-y-2">
                        <li>Make sure robot is on</li>
                        <li>Check radio power (at least one blue LED)</li>
                        <li>WIFI light should be green. Amber or off = reprogram</li>
                        <li>If lights freeze, reboot the radio</li>
                    </ol>
                </div>
            {:else if !modalRobot.rio}
                <div>
                    <p class="font-bold">Radio connected but no communication with RIO</p>
                    <p>{modalRobot.improved ? `Radio Connected ${timeSinceChange}` : `Lost RIO ${timeSinceChange}`}</p>
                    <ol class="text-left list-decimal space-y-2">
                        <li>Check RIO lights: Power (green), Status (off), Link (flashing)</li>
                        <li>Reconnect ethernet; avoid switches for testing</li>
                        <li>Try RIO power cycle</li>
                        <li>Verify team number with team number setter</li>
                        <li>
                            <p>If status flashes (RIO 2): turn off, reseat SD, power on</p>
                            <p>If persists: reimage SD or replace card. May need to redeploy code.</p>
                            <p>If RIO 1: safe mode + imaging tool. Replace if still dead.</p>
                        </li>
                    </ol>
                </div>
            {:else if !modalRobot.code}
                <div>
                    <p class="font-bold">Radio and RIO connected, but code not running</p>
                    <p>{modalRobot.improved ? `RIO Connected ${timeSinceChange}` : `Lost Code ${timeSinceChange}`}</p>
                    <ol class="text-left list-decimal space-y-2">
                        <li>Restart RIO (can be done from DS if RIO 2)</li>
                        <li>Check DS logs. Ask if code was recently changed or deployed.</li>
                    </ol>
                </div>
            {:else}
                <div>
                    <p class="font-bold">Robot Connected</p>
                    <p>{timeSinceChange}</p>
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
