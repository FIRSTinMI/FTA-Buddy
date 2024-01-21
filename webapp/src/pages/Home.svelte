<script lang="ts">
    import { BYPASS, ESTOP, GREEN_X, MOVE_STATION, WRONG_MATCH, type MonitorFrame } from "./../../../shared/types.ts";
    import {
        Input,
        Label,
        Table,
        TableBody,
        TableBodyCell,
        TableBodyRow,
        TableHead,
        TableHeadCell,
    } from "flowbite-svelte";
    import { eventStore } from "../stores/event";
    import { get } from "svelte/store";
    import { onMount } from "svelte";

    let monitorEvent = get(eventStore) || "";
    let ws;
    let monitorFrame: MonitorFrame;

    function connectToMonitor(evt: Event) {
        evt.preventDefault();
        if (monitorEvent.match("^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}$")) {
            let uri = "ws://" + monitorEvent + ":8284/";
            eventStore.set(monitorEvent);
            openWebSocket(uri);
        } else if (monitorEvent.trim().length > 0) {
        }
    }

    function openWebSocket(uri: string) {
        console.log(uri);
        ws = new WebSocket(uri);
        ws.onopen = function () {
            console.log("Connected to " + uri);
        };
        ws.onmessage = function (evt) {
            console.log(evt.data);
            monitorFrame = JSON.parse(evt.data);
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
    <Table>
        <TableHead>
            <TableHeadCell class="w-24">Team</TableHeadCell>
            <TableHeadCell class="w-24">DS</TableHeadCell>
            <TableHeadCell class="w-12">Radio</TableHeadCell>
            <TableHeadCell class="w-12">Rio</TableHeadCell>
            <TableHeadCell class="w-24">Bat</TableHeadCell>
            <TableHeadCell class="w-24">Net</TableHeadCell>
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
    <form on:submit={connectToMonitor} class="flex w-screen">
        <Label class="space-y-2 mx-auto">
            <span>Event Code</span>
            <Input
                class="max-w-64 w-full"
                bind:value={monitorEvent}
                placeholder="Event Code or IP"
            />
        </Label>
    </form>
</div>
