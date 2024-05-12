<script lang="ts">
    import {
        Button,
        Label,
        MultiSelect,
        Spinner,
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

    export let matchid: string;
    export let station: ROBOT;

    let log: FMSLogFrame[];
    let team: number;

    const match = trpc.match.getMatch.query({ id: matchid });

    match.then((m) => {
        // I don't want to talk about it
        log =
            (m?.[(station + "_log") as keyof typeof m] as FMSLogFrame[]) ?? [];
        team = m?.[station] ?? 0;
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
</script>

<div
    class="container mx-auto p-2 lg:max-w-7xl w-full flex flex-col gap-2 md:gap-4"
>
    <div class="flex">
        <Button on:click={back} class="w-fit mx-1.5">Back</Button>
    </div>
    {#await match}
        <Spinner />
    {:then match}
        <h1 class="text-xl">
            {match?.level === "None" ? "Test" : match?.level} Match {match?.match_number}/{match?.play_number}
        </h1>
        <h2 class="text-lg">
            {(station.startsWith("blue") ? "Blue " : "Red ") +
                station.charAt(station.length - 1)} Team {team}
        </h2>

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
