<script lang="ts">
    import { Accordion, AccordionItem, Indicator } from "flowbite-svelte";
    import { onMount } from "svelte";
    import { SignalR } from "../util/signalR";
    import type { MonitorFrame } from "../../../shared/types";

    export let toast: (title: string, text: string, color?: string) => void;

    let fmsDetected = false;
    let detectedEventName: string | undefined = undefined;
    let signalR = new SignalR('filips-laptop.local', (e) => {frame = e});
    let frame: MonitorFrame | undefined = undefined;

    async function checkFMSConnection() {
        try {
            const response = await fetch("http://filips-laptop.local/FieldMonitor", {mode: "no-cors"});
            if (response.ok || response.status === 0) {
                fmsDetected = true;

                if (signalR.connection === null || signalR.connection?.state === "Disconnected") {
                    await signalR.start();
                    console.log(await signalR.fetchEventName());
                }
            } else {
                throw new Error("Failed to connect to FMS");
            }
        } catch (e) {
            console.error(e);
            if (fmsDetected) {
                toast("Failed to connect to FMS", e.message);
                fmsDetected = false;
            }
        }
    
    }

    onMount(() => {
        checkFMSConnection();
        //setInterval(checkFMSConnection, 5000);
    });
</script>

<div class="container mx-auto md:max-w-4xl flex flex-col justify-center p-4 h-full space-y-4">
    <h1 class="text-3xl font-bold">Host an FTA Buddy Instance</h1>
    <span class="inline-flex gap-2 font-bold mx-auto">
        <Indicator color={(fmsDetected) ? "green" : "red"} class="my-auto" />
        {#if fmsDetected}
            <span class="text-green-500">FMS Detected</span>
        {:else}
            <span class="text-red-500">FMS Not Detected</span>
        {/if}
    </span>
    <p class="text-lg">
        In order to work, FTA Buddy needs a host to send data to it from FMS.
        The computer hosting the instance needs to be on the field network and be able to see FMS at <code class="bg-neutral-900 px-2 py-.5 rounded-xl">10.0.100.5</code>
        You can use FTA Buddy as your primary field monitor and send data to other devices from this tab,
        or use the FTA Buddy extension with the regular FMS field monitor.
    </p>
    <Accordion flush>
        <AccordionItem open>
            <h3 slot="header">Use FTA Buddy as your primary field monitor</h3>
            <div>
                Instructions
            </div>
        </AccordionItem>
        <AccordionItem>
            <h3 slot="header">Use the FTA Buddy extension with FMS field monitor</h3>
            <div>
                Instructions
            </div>
        </AccordionItem>
    </Accordion>
</div>

