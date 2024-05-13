<script lang="ts">
    import {
        Button,
        Label,
        Modal,
        MultiSelect,
        Table,
        TableBody,
        TableBodyCell,
        TableBodyRow,
        TableHead,
        TableHeadCell,
        type SelectOptionType,
    } from "flowbite-svelte";
    import { trpc } from "../main";
    import { navigate } from "svelte-routing";
    import type { FMSLogFrame, ROBOT } from "../../../shared/types";
    import LogGraph from "../components/LogGraph.svelte";
    import QrCode from "svelte-qrcode";
    import { authStore } from "../stores/auth";
    import { formatTimeNoAgo } from "../util/formatTime";
    import Spinner from "../components/Spinner.svelte";

    export let matchid: string;
    export let station: ROBOT | string;
    let actualStation: ROBOT;

    let log: FMSLogFrame[];
    let team: number;

    let match;

    if ($authStore.eventToken) {
        match = trpc.match.getStationMatch.query({ id: matchid, station: station });
    } else {
        match = trpc.match.getPublicMatch.query({ id: matchid, sharecode: station });
    }

    match.then((m) => {
        log = m.log;
        team = m.team;
        actualStation = m.station;
    });

    function back() {
        if (window.history.state === null) {
            navigate("/app/logs");
        } else {
            window.history.back();
        }
    }

    let view: "graph" | "table" = "graph";

    let columns: SelectOptionType<keyof FMSLogFrame>[] = [
        { name: "DS", value: "dsLinkActive" },
        { name: "Radio", value: "radioLink" },
        { name: "RIO", value: "rioLink" },
        { name: "Code", value: "linkActive" },
        { name: "Status", value: "enabled" },
        { name: "Battery", value: "battery" },
        { name: "Ping", value: "averageTripTime" },
        { name: "BWU", value: "dataRateTotal" },
        { name: "Lost Pkts", value: "lostPackets" },
        { name: "Sent Pkts", value: "sentPackets" },
        { name: "Signal", value: "signal" },
        { name: "Noise", value: "noise" },
        { name: "SNR", value: "snr" },
        { name: "TxRate", value: "txRate" },
        { name: "TxMCS", value: "txMCS" },
        { name: "RxRate", value: "rxRate" },
        { name: "RxMCS", value: "rxMCS" },
    ];

    let selectedColumns: (keyof FMSLogFrame)[] = [
        "dsLinkActive",
        "radioLink",
        "rioLink",
        "linkActive",
        "enabled",
        "battery",
        "averageTripTime",
        "dataRateTotal",
    ];

    let shareid: string;
    let shareOpen = false;

    async function share() {
        if (["blue1", "blue2", "blue3", "red1", "red2", "red3"].includes(station)) {
            let response = await trpc.match.publishMatch.query({ id: matchid, station: station as ROBOT, team: team });
            shareid = response.id;
            shareOpen = true;
        } else {
            shareid = station;
            shareOpen = true;
        }
    }
</script>

<Modal bind:open={shareOpen} dismissable outsideclose>
    <h1 slot="header" class="text-xl">Share Log</h1>
    <div class="flex flex-col gap-2">
        <p>
            Log published for 72 hours.
            Share this log only with team #{team} or other volunteers.
        </p>
        <div class="max-w-48 mx-auto">
            <QrCode value="https://ftabuddy.com/app/logs/{matchid}/{shareid}" padding=5 />
        </div>
        <Button on:click={() => (shareOpen = false)} class="mt-2">Close</Button>
    </div>
</Modal>

<div
    class="container mx-auto p-2 lg:max-w-7xl w-full flex flex-col gap-2 md:gap-4"
>
    {#if $authStore.eventToken}
        <div class="flex">
            <Button on:click={back} class="w-fit mx-1.5">Back</Button>
            <Button on:click={share} class="w-fit mx-1.5">Share Log</Button>
        </div>
    {/if}
    {#await match}
        <Spinner size=12 />
    {:then match}
        <div>
            <h1 class="text-xl">
                {match?.event.toUpperCase()} {match?.level === "None" ? "Test" : match?.level} Match {match?.match_number}/{match?.play_number}
            </h1>
            <p>{formatTimeNoAgo(new Date(match?.start_time))}</p>
            <h2 class="text-lg">
                {(actualStation.startsWith("blue") ? "Blue " : "Red ") +
                    actualStation.charAt(actualStation.length - 1)} - Team #{team}
            </h2>
            <p class="md:hidden text-gray-600 text-sm">View on desktop for more detail</p>
        </div>

        <LogGraph {log} />

        <Label class="text-left">
            Select Columns
            <MultiSelect items={columns} bind:value={selectedColumns} size="sm" class="mt-2" />
        </Label>

        <Table class="log-table">
            <TableHead>
                <TableHeadCell class="px-6 py-4">Time</TableHeadCell>
                {#each selectedColumns as col}
                    <TableHeadCell class="px-6 py-4"
                        >{columns.find((c) => c.value === col)
                            ?.name}</TableHeadCell
                    >
                {/each}
            </TableHead>
            <TableBody>
                {#if match}
                    {#each log as frame}
                        <TableBodyRow>
                            <TableBodyCell>{frame.matchTime}</TableBodyCell>
                            {#each selectedColumns as col}
                                {#if col === "enabled"}
                                    {#if frame.eStopPressed}
                                        <TableBodyCell class="bg-red-500"
                                            >E</TableBodyCell
                                        >
                                    {:else if frame.aStopPressed}
                                        <TableBodyCell class="bg-orange-500"
                                            >A</TableBodyCell
                                        >
                                    {:else if !frame.enabled}
                                        <TableBodyCell class="bg-red-500"
                                            >N</TableBodyCell
                                        >
                                    {:else if frame.auto}
                                        <TableBodyCell>A</TableBodyCell>
                                    {:else}
                                        <TableBodyCell>T</TableBodyCell>
                                    {/if}
                                {:else if col === "battery"}
                                    <TableBodyCell
                                        style="background-color: rgba(255,0,0,{frame.battery <
                                            11 && frame.battery > 0
                                            ? (-1.5 * frame.battery ** 2 -
                                                  6.6 * frame.battery +
                                                  255) /
                                              255
                                            : 0})"
                                        >{frame.battery.toFixed(2)}</TableBodyCell
                                    >
                                {:else if ["averageTripTime", "lostPackets", "sentPackets", "signal", "noise"].includes(col)}
                                        <TableBodyCell
                                        >{frame.averageTripTime.toFixed(
                                            0,
                                        )}</TableBodyCell
                                    >
                                {:else if ["dataRateTotal", "txRate", "txMCS", "rxRate", "rxMCS"].includes(col)}
                                    <TableBodyCell
                                    >{frame.dataRateTotal.toFixed(
                                        2,
                                    )}</TableBodyCell>
                                {:else}
                                    <TableBodyCell
                                        class={frame[col] ? "" : "bg-red-500"}
                                        >{frame[col] ? "Y" : "N"}</TableBodyCell
                                    >
                                {/if}
                            {/each}
                        </TableBodyRow>
                    {/each}
                {/if}
            </TableBody>
        </Table>
    {/await}
</div>
