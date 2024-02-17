<script lang="ts">
    import { Button, Modal, Table, TableBody, TableHead, TableHeadCell } from "flowbite-svelte";
    import {
        RED,
        type MonitorFrame,
        type TeamInfo,
        GREEN_X,
        MOVE_STATION,
        WRONG_MATCH,
        BYPASS,
        ESTOP,
    } from "../../../shared/types";
    import MonitorRow from "./MonitorRow.svelte";

    export let modalOpen: boolean;
    export let modalStation: keyof MonitorFrame;
    export let monitorFrame: MonitorFrame;
    export let navigateToNotes: (evt: Event) => void;
    let modalTeam: TeamInfo | undefined;
    $: {
        // @ts-ignore
        modalTeam = monitorFrame ? monitorFrame[modalStation] : undefined;
    }
</script>

<Modal bind:open={modalOpen} size="lg" outsideclose>
    {#if modalTeam}
        <div class="flex flex-col w-full items-center space-y-4">
            <h1 class="text-2xl">
                Team {modalTeam.number}
            </h1>
            <div>
                <Table class="w-full sm:w-fit mx-auto">
                    <TableHead class="dark:bg-neutral-500 dark:text-white">
                        <TableHeadCell class="w-20">Team</TableHeadCell>
                        <TableHeadCell class="w-20">DS</TableHeadCell>
                        <TableHeadCell class="w-10">Radio</TableHeadCell>
                        <TableHeadCell class="w-10">Rio</TableHeadCell>
                        <TableHeadCell>Bat</TableHeadCell>
                        <TableHeadCell>Net</TableHeadCell>
                    </TableHead>
                    <TableBody>
                        <MonitorRow station={modalStation} bind:monitorFrame detailView={() => {}} />
                    </TableBody>
                </Table>
            </div>
            <p>
                {#if modalTeam.ds === RED}
                    Ethernet not plugged in
                    <ol class="text-left list-decimal">
                        <li>Make sure the cable is plugged into the laptop</li>
                        <li>Check if there are link lights on the port</li>
                        <li>Try a dongle</li>
                        <li>Try replacing the ethernet cable</li>
                    </ol>
                {:else if modalTeam.ds === GREEN_X}
                    Ethernet plugged in but no communication with DS
                    <ol class="text-left list-decimal">
                        <li>Make sure DS is open, and only one instance is open</li>
                        <li>Check if there are link lights on the port</li>
                        <li>Make sure WIFI is off</li>
                        <li>
                            Click on the diagnostics tabs of DS, make sure firewall is green. Turn off firewalls if it's
                            not <code>Win + R</code>, <code>wf.msc</code>
                        </li>
                        <li>Try clicking the refresh button to release and renew DHCP address</li>
                        <li>Try a dongle</li>
                        <li>Try restarting DS software</li>
                        <li>
                            Go to network adapters <code>Win + R</code>, <code>ncpa.cpl</code>. Make sure the ethernet
                            adapter is enabled and shows a connection Disable any other network adapters. Double check
                            to make sure the ethernet adapter is set to "Obtain an IP address automatically."
                        </li>
                        <li>
                            If none of the above works, try the spare DS laptop. Advise the team to come during lunch or
                            at the end of the day to do a connection test.
                        </li>
                    </ol>
                {:else if modalTeam.ds === MOVE_STATION}
                    Team is in wrong station<br />
                    Their DS will tell them which station to move to.
                {:else if modalTeam.ds === WRONG_MATCH}
                    Team is in wrong match
                    <ol class="text-left list-decimal">
                        <li>Double check the schedule</li>
                        <li>If they're on the schedule, check if the team number in their DS is set correctly</li>
                    </ol>
                {:else if modalTeam.ds === BYPASS}
                    Team is bypassed
                {:else if modalTeam.ds === ESTOP}
                    Team is E-stopped
                    <ol class="text-left list-decimal">
                        <li>
                            To clear an E-stop the roborio must be physically restarted and the DS software restarted
                        </li>
                    </ol>
                {:else if modalTeam.radio === RED}
                    Radio not connected to field
                    <ol class="text-left list-decimal">
                        <li>Make sure robot is on</li>
                        <li>
                            Make sure the radio is getting power, at least one blue LED should be on. <br />
                            It may take up to 2 minutes for the radio to boot.
                        </li>
                        <li>
                            Make sure the WIFI light (opposite of the power light) is amber, if it is green the radio
                            needs to be programmed. If it is red, the radio is trying to connect to the field network
                            but failing. If this issue is isolated to one robot, try reprogramming the radio.
                        </li>
                    </ol>
                {:else if modalTeam.rio === RED}
                    Radio connected but no communication with RIO
                {:else if modalTeam.code === RED}
                    Radio and RIO connected, but code not running
                {:else}
                    Robot Connected
                    {#if modalTeam.battery < 11}
                        Low Battery {modalTeam.battery}V
                    {/if}
                    {#if modalTeam.bwu > 3.5}
                        High Bandwidth Utilization {modalTeam.bwu}/4.00
                    {/if}
                    {#if modalTeam.ping > 100}
                        High Latency {modalTeam.ping}
                    {/if}
                    {#if modalTeam.packets > 10000}
                        High Packet Loss: {modalTeam.packets}
                    {/if}
                {/if}
            </p>
            <div class="flex space-x-4">
                <Button color="primary" class="dark:bg-primary" on:click={navigateToNotes}>Notes</Button>
                <Button color="primary" class="dark:bg-primary" on:click={() => (modalOpen = false)}>Close</Button>
            </div>
        </div>
    {/if}
</Modal>
