<script lang="ts">
    import { type MonitorFrame, type TeamInfo } from "./../../../shared/types";
    import { Button, Input, Label, Modal, Table, TableBody, TableHead, TableHeadCell } from "flowbite-svelte";
    import { eventStore, relayStore } from "../stores/event";
    import { get } from "svelte/store";
    import { onMount } from "svelte";
    import { navigate } from "svelte-routing";
    import MonitorRow from "../components/MonitorRow.svelte";
    import TeamModal from "../components/TeamModal.svelte";

    let monitorEvent = get(eventStore) || "test";
    let relayOn = true; //get(relayStore);
    let secureOnly = true;
    let ws: WebSocket;
    let monitorFrame: MonitorFrame;

    if (window.location.href.startsWith("https")) {
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
            const response = await fetch("https://ftabuddy.com/register/" + monitorEvent);
            const eventData = await response.json();
            if (response.status !== 200) {
                alert(response.statusText);
                return;
            }

            let uri = "ws://" + eventData.local_ip + ":8284/";
            if (relayOn) {
                uri = "wss://ftabuddy.com/ws";
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
                this.send("client-" + monitorEvent);
            }
            setInterval(() => ws.send("ping"), 60e3);
        };
        ws.onmessage = function (evt) {
            console.log(evt.data);
            try {
                let data = JSON.parse(evt.data);
                if (data.type === "monitorUpdate") monitorFrame = data;
            } catch (e) {
                console.error(e);
            }
        };
        ws.onclose = function () {
            console.log("Disconnected from " + uri + " reconnecting in 5 sec");
            setTimeout(() => openWebSocket(uri), 5e3);
        };
    }

    onMount(() => {
        connectToMonitor(new Event("submit"));
    });

    const FieldStates = {
        0: "Unknown",
        1: "Match Running Teleop",
        2: "Match Transistioning",
        3: "Match Running Auto",
        4: "Match Ready",
        5: "Prestart Completed",
        6: "Prestart Initiated",
        7: "Ready to Prestart",
        8: "Match Aborted",
        9: "Match Over",
        10: "Ready for Post Result",
        11: "Match Not Ready",
    };

    function navigateToNotes(evt: Event) {
        let target = evt.target as HTMLElement;
        let team = target.parentElement?.id.replace("-row", "");
        navigate("/app/notes/" + team);
    }

    let modalOpen = false;
    let modalStation = "blue1";
    let modalTeam: TeamInfo;

    function detailView(evt: Event) {
        let target = evt.target as HTMLElement;
        let station = target.parentElement?.id.replace("-row", "");
        modalStation = station || "blue1";
        modalOpen = true;
    }
</script>

<TeamModal bind:modalOpen bind:modalStation bind:monitorFrame {navigateToNotes} />

<div class="w-full mx-auto container md:max-w-lg md:p-2">
    {#key monitorFrame}
        <div class="flex w-full mb-1">
            {#if monitorFrame}
                <div>M: {monitorFrame.match}</div>
                <div class="grow">{FieldStates[monitorFrame.field]}</div>
                <div>{monitorFrame.time}</div>
            {/if}
        </div>
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
                {#if monitorFrame}
                    {#each ["blue1", "blue2", "blue3", "red1", "red2", "red3"] as station}
                        <MonitorRow {station} {monitorFrame} {detailView} />
                    {/each}
                {/if}
            </TableBody>
        </Table>
    {/key}
    <form on:submit={connectToMonitor} class="flex w-full justify-center items-center space-x-4 mt-4 px-2">
        <!-- <Toggle class="toggle" bind:checked={relayOn} on:click={relayChanged} bind:disabled={secureOnly}>Relay</Toggle> -->
        <Label class="space-y-2">
            <Input class="max-w-64 w-full" bind:value={monitorEvent} placeholder="Event Code or IP" />
        </Label>
        <Button color="primary" class="dark:bg-primary" on:click={connectToMonitor}>Connect</Button>
    </form>
    <!-- {#if secureOnly}
        <div class="flex justify-center text-xs dark:text-gray-700 underline mt-2">
            <button
                on:click={() => {
                    window.location.href = "http://ftabuddy.filipkin.com/app/";
                }}>Go to insecure website to connect to server localy</button
            >
        </div>
    {/if} -->
</div>
