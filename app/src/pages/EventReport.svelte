<script lang="ts">
	import { Button } from "flowbite-svelte";
	import { trpc } from "../main";
	import { toast } from "../util/toast";

    async function downloadCycleTimeReport() {
        try {
            const pdf = await trpc.cycles.generateCycleTimeReport.query();
            const a = document.createElement("a");
            a.href = window.location.origin + pdf.path;
            a.download = pdf.path.split("/").pop() ?? "CycleTimeReport.pdf";
            a.click();
        } catch (err: any) {
            console.error(err);
            toast("Failed to download report", err.message);
        }
    }

    async function downloadBypassReport() {
        try {
            const pdf = await trpc.match.generateBypassReport.query();
            const a = document.createElement("a");
            a.href = window.location.origin + pdf.path;
            a.download = pdf.path.split("/").pop() ?? "BypassReport.pdf";
            a.click();
        } catch (err: any) {
            console.error(err);
            toast("Failed to download report", err.message);
        }
    }
</script>

<div class="container flex flex-col gap-2 p-4 mx-auto max-w-4xl">
    <h1 class="text-2xl font-bold">Event Report</h1>
    <div class="flex flex-col items-start">
        <p>Cycle Time Report</p>
        <Button on:click={downloadCycleTimeReport} class="mt-2">Download</Button>
    </div>
    <div class="flex flex-col items-start">
        <p>Bypass Report</p>
        <Button on:click={downloadBypassReport} class="mt-2">Download</Button>
    </div>
</div>