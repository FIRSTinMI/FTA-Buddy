<script lang="ts">
    import { Accordion, AccordionItem, Indicator } from "flowbite-svelte";
    import { onMount } from "svelte";

    export let toast: (title: string, text: string, color?: string) => void;

    let extensionDetected = false;
    let extensionEnabled = false;
    let extensionVersion = "unknown version";
    let fmsDetected = false;

    const FMS_IP = "192.168.1.220"; // "10.0.100.5";

    window.addEventListener("message", (event) => {
        if (event.data.type === "pong") {
            extensionDetected = true;
            extensionVersion = "v"+event.data.version;
            extensionEnabled = event.data.enabled;

            if (extensionEnabled && event.data.signalR) {
                window.postMessage({ source: 'page', type: "eventCode" }, "*");
            }
        } else if (event.data.type === "eventCode") {
            console.log(event.data.eventCode);
        }
    });

    async function checkConnection() {
        window.postMessage({ source: 'page', type: "ping" }, "*");
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!extensionDetected) {
            checkConnection();
        }
    }

    async function checkFMSConnection(){
        const img = new Image();
        img.src = `http://${FMS_IP}/dist/images/FIRST_Logo_Reverse_Horizontal.png`;

        img.onload = () => {
            fmsDetected = true;
        };

        await new Promise(resolve => setTimeout(resolve, 1000));

        if (img.height > 0){
            fmsDetected = true;
        } else {
            if (fmsDetected) {
                toast("Connection Lost", "Lost connection to FMS. Please check the connection and try again.");
            }
            fmsDetected = false;
        }

        img.remove();
        // loop
        await new Promise(resolve => setTimeout(resolve, 4000));
        checkFMSConnection();
    }

    onMount(() => {
        checkFMSConnection();
        checkConnection();
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
    <span class="inline-flex gap-2 font-bold mx-auto">
        {#if extensionDetected}
            {#if extensionEnabled}
                <Indicator color="green" class="my-auto" />
                <span class="text-green text-green-500">Extension Enabled ({extensionVersion})</span>
            {:else}
                <Indicator color="yellow" class="my-auto" />
                <span class="text-yellow-300">Extension Not Enabled</span>
                <button class="text-blue-400 hover:underline" on:click={() => window.postMessage({ type: "enable" }, "*")}>Enable</button>
            {/if}
        {:else}
            <Indicator color="red" class="my-auto" />
            <span class="text-red-500">Extension Not Detected</span>
            <a href="https://chromewebstore.google.com/detail/fta-buddy/kddnhihfpfnehnnhbkfajdldlgigohjc" class="text-blue-400 hover:underline" target="_blank">Install</a>
        {/if}
    </span>
    <p class="text-lg">
        In order to work, FTA Buddy needs a host to send data to it from FMS.
        The extension must be installed and be able to communicate with FMS at <code class="bg-neutral-900 px-2 py-.5 rounded-xl">10.0.100.5</code>
        You can use FTA Buddy as your primary field monitor by enabling the SignalR option,
        or use the FTA Buddy extension with the regular FMS field monitor and scraping from the tab.
    </p>
    <Accordion flush>
        <AccordionItem open>
            <h3 slot="header">Use FTA Buddy as your primary field monitor</h3>
            <div>
                Instructions
            </div>
        </AccordionItem>
        <AccordionItem>
            <h3 slot="header">Use the FMS field monitor</h3>
            <div>
                Instructions
            </div>
        </AccordionItem>
    </Accordion>
</div>

