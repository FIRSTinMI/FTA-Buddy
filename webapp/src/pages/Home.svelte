<script lang="ts">
    import { BYPASS, ESTOP, GREEN_X, MOVE_STATION, WRONG_MATCH, type MonitorFrame } from "./../../../shared/types";
    import {
  Button,
        Input,
        Label,
        Table,
        TableBody,
        TableBodyCell,
        TableBodyRow,
        TableHead,
        TableHeadCell,
        Toggle,
    } from "flowbite-svelte";
    import { eventStore, relayStore } from "../stores/event";
    import { get } from "svelte/store";
    import { onMount } from "svelte";

    let monitorEvent = get(eventStore) || "";
    let relayOn = get(relayStore);
    let secureOnly = false;
    let ws: WebSocket;
    let monitorFrame: MonitorFrame;
    
    if (window.location.href.startsWith('https')) {
    	relayOn = true;
        secureOnly = true;
    }

    async function connectToMonitor(evt: Event) {
        evt.preventDefault();
        if (ws) ws?.close();
        if (monitorEvent.match("^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}$")) {
            let uri = "ws://" + monitorEvent + ":8284/";
            eventStore.set(monitorEvent);
            openWebSocket(uri);
        } else if (monitorEvent.trim().length > 0) {
            console.log(relayOn);
            eventStore.set(monitorEvent);
            const response = await fetch('https://ftabuddy.filipkin.com/register/'+monitorEvent);
            const eventData = await response.json();
            if (response.status !== 200) {
                alert(response.statusText);
                return;
            }

            let uri = "ws://" + eventData.local_ip + ":8284/";
            if (relayOn) {
                uri = "wss://ftabuddy.filipkin.com/ws";
            }
            
            openWebSocket(uri);
        }
    }

    function relayChanged() {
        console.log(!relayOn);
        relayStore.set(!relayOn);
        connectToMonitor(new Event("submit"));
    }

    function openWebSocket(uri: string) {
        console.log(uri);
        ws = new WebSocket(uri);
        ws.onopen = function () {
            console.log("Connected to " + uri);
            if (relayOn) {
                this.send("client-"+monitorEvent);
            }
        };
        ws.onmessage = function (evt) {
            console.log(evt.data);
            try {
            	monitorFrame = JSON.parse(evt.data);
            } catch (e) {
            	console.error(e);
            }
        };
        ws.onclose = function () {
            console.log("Disconnected from " + uri);
        };
    }

    onMount(() => {
        connectToMonitor(new Event("submit"));
    });

    function getKey(value: any) {
        return Object.keys(monitorFrame).find((key) => (monitorFrame as any)[key] === value);
    }

    const DS_Colors = {
        0: "bg-red-600",
        1: "bg-green-500",
        2: "bg-green-500",
        3: "bg-yellow-500",
        4: "bg-yellow-500",
        5: "bg-red-700",
        6: "bg-neutral-900",
    }
</script>

<div>
    <Table class="w-fit mx-auto">
        <TableHead class="dark:bg-primary dark:text-black">
            <TableHeadCell class="w-20">Team</TableHeadCell>
            <TableHeadCell class="w-20">DS</TableHeadCell>
            <TableHeadCell class="w-10">Radio</TableHeadCell>
            <TableHeadCell class="w-10">Rio</TableHeadCell>
            <TableHeadCell class="w-12">Bat</TableHeadCell>
            <TableHeadCell class="w-12">Net</TableHeadCell>
        </TableHead>
        <TableBody>
            {#if monitorFrame}
                {#each [monitorFrame.blue1, monitorFrame.blue2, monitorFrame.blue3, monitorFrame.red1, monitorFrame.red2, monitorFrame.red3] as team}
                    <TableBodyRow class="h-20">
                        <TableBodyCell class={(getKey(team)?.startsWith('blue')) ? "bg-blue-600" : "bg-red-600"}>{team.number}</TableBodyCell>
                        <TableBodyCell class="{DS_Colors[team.ds]} text-4xl text-black">
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
                        <TableBodyCell class={DS_Colors[team.radio]}></TableBodyCell>
                        <TableBodyCell class={DS_Colors[team.rio]}></TableBodyCell>
                        <TableBodyCell>{team.battery}v</TableBodyCell>
                        <TableBodyCell
                            >{team.ping} ms<br />{team.bwu} mbps</TableBodyCell
                        >
                    </TableBodyRow>
                {/each}
            {/if}
        </TableBody>
    </Table>
    <form on:submit={connectToMonitor} class="flex w-screen justify-center items-center space-x-4 mt-4">
        <Toggle class="toggle" bind:checked={relayOn} on:click={relayChanged} bind:disabled={secureOnly}>Relay</Toggle>
        <Label class="space-y-2">
            <Input
                class="max-w-64 w-full"
                bind:value={monitorEvent}
                placeholder="Event Code or IP"
            />
        </Label>
        <Button color="primary" on:click={connectToMonitor}>Connect</Button>
    </form>
</div>
