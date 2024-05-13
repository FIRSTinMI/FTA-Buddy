<script lang="ts">
    import { Checkbox, Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableHeadCell } from "flowbite-svelte";
    import Spinner from "../components/Spinner.svelte";
    import { trpc } from "../main";
    import type { EventChecklist } from "../../../shared/types";

    export let checklist: EventChecklist;
    trpc.checklist.get.query().then((c) => {
        checklist = c;
        updateTotals(c);
    });

    let present = 0;
    let weighed = 0;
    let inspected = 0;
    let radioProgrammed = 0;
    let connectionTested = 0;
    let total = 0;

    function updateTotals(c: EventChecklist) {
        present = 0;
        weighed = 0;
        inspected = 0;
        radioProgrammed = 0;
        connectionTested = 0;
        total = 0;
        for (let team of Object.values(c)) {
            if (team.present) present++;
            if (team.weighed) weighed++;
            if (team.inspected) inspected++;
            if (team.radioProgrammed) radioProgrammed++;
            if (team.connectionTested) connectionTested++;
            total++;
        }
    }
    $: updateTotals(checklist);

    async function updateChecklist(team: string, key: "present" | "weighed" | "inspected" | "radioProgrammed" | "connectionTested", value: boolean) {
        trpc.checklist.update.query({ team: team, key, value });
    }
</script>

<div class="container w-fit flex flex-col p-4 h-full mx-auto h-fit gap-2">
    {#await checklist}
        <Spinner />
    {:then checklist}
        <div class="flex w-full justify-start">
            <div class="grid gap-2 w-fit grid-cols-2">
                <div class="text-right">Present</div>
                <div class="text-left">{present}/{total}{#if present === total} 🎉{/if}</div>
                <div class="text-right">Weighed</div>
                <div class="text-left">{weighed}/{total}{#if weighed === total} 🎉{/if}</div>
                <div class="text-right">Inspected</div>
                <div class="text-left">{inspected}/{total}{#if inspected === total} 🎉{/if}</div>
                <div class="text-right">Radio Programmed</div>
                <div class="text-left">{radioProgrammed}/{total}{#if radioProgrammed === total} 🎉{/if}</div>
                <div class="text-right">Connection Tested</div>
                <div class="text-left">{connectionTested}/{total}{#if connectionTested === total} 🎉{/if}</div>
            </div>
        </div>
        <Table class="text-center">
            <TableHead>
                <TableHeadCell>Team</TableHeadCell>
                <TableHeadCell>Present</TableHeadCell>
                <TableHeadCell>Weighed</TableHeadCell>
                <TableHeadCell>Inspected</TableHeadCell>
                <TableHeadCell>Radio Programmed</TableHeadCell>
                <TableHeadCell>Connection</TableHeadCell>
            </TableHead>
            <TableBody>
                {#each Object.entries(checklist) as [team, items]}
                    <TableBodyRow>
                        <TableBodyCell>{team}</TableBodyCell>
                        <TableBodyCell
                            ><Checkbox
                                class="justify-center"
                                bind:checked={items.present}
                                on:change={() => updateChecklist(team, "present", items.present)}
                            /></TableBodyCell
                        >
                        <TableBodyCell
                            ><Checkbox
                                class="justify-center"
                                bind:checked={items.weighed}
                                on:change={() => updateChecklist(team, "weighed", items.weighed)}
                            /></TableBodyCell
                        >
                        <TableBodyCell
                            ><Checkbox
                                class="justify-center"
                                bind:checked={items.inspected}
                                on:change={() => updateChecklist(team, "inspected", items.inspected)}
                            /></TableBodyCell
                        >
                        <TableBodyCell
                            ><Checkbox
                                class="justify-center"
                                bind:checked={items.radioProgrammed}
                                on:change={() => updateChecklist(team, "radioProgrammed", items.radioProgrammed)}
                            /></TableBodyCell
                        >
                        <TableBodyCell
                            ><Checkbox
                                class="justify-center"
                                bind:checked={items.connectionTested}
                                on:change={() => updateChecklist(team, "connectionTested", items.connectionTested)}
                            /></TableBodyCell
                        >
                    </TableBodyRow>
                {/each}
            </TableBody>
        </Table>
    {/await}
</div>
