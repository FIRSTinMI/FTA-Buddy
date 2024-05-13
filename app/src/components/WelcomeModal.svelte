<script lang="ts">
    import Icon from "@iconify/svelte";
    import { Button, Indicator, Modal } from "flowbite-svelte";
    import Reference from "../pages/Reference.svelte";

    export let welcomeOpen = false;
    export let installPrompt: Event | null;
    export let closeModal: () => void;
    export let openChangelog: () => void;

    let step = 0;
</script>

<Modal bind:open={welcomeOpen} dismissable outsideclose size="lg">
    <div slot="header">
        <h1 class="text-xl">Welcome to FTA Buddy</h1>
    </div>
    <div class="flex flex-col justify-left text-left gap-1 min-h-96">
        {#if step === 0}
            <p>
                FTA Buddy has some new features to help you during competitions. <br />
                Click through these screens to learn about them.
            </p>
            {#if installPrompt}
                <h2 class="font-bold">Install this App</h2>
                <p>Recommened for the best experience.</p>
                <Button
                    color="primary"
                    class="w-fit"
                    size="sm"
                    on:click={() => {
                        // @ts-ignore
                        if (installPrompt) installPrompt.prompt();
                    }}>Install</Button
                >
            {:else if navigator.userAgent.includes("iPhone")}
                <h2 class="font-bold">Install this App</h2>
                <p>Recommened for the best experience.</p>
                <p>On iOS you can do this by clicking the share button and then "Add to Home Screen".</p>
            {/if}
        {:else if step === 1}
            <h2 class="font-bold">Monitor</h2>
            <p>
                Click on a team number to go to their notes and tickets. <br />
                Click on the status to see more details including: how long since the last status change and troubleshooting suggestions. <br />
            </p>
            <div>
                <img src="/app/tutorial/monitor.png" alt="Monitor" class="max-h-48 w-fit mx-auto" />
            </div>
            <h2 class="font-bold">Emojis</h2>
            <p>
                A 👀 emoji will appear for a team when something is taking longer than expected to connect. <br />
                A 🕑 emoji will appear when a team that frequently takes a long time to connect is on the field. <br />
            </p>
            <h2 class="font-bold">RIO Status</h2>
            <p>
                Green: RIO connected and code running. <br />
                Yellow: RIO connected no code. <br />
                Red: No RIO.
            </p>
            <h2 class="font-bold">Cycle Times</h2>
            <div>
                <img src="/app/tutorial/cycles.png" alt="Cycle Times" class="max-h-48 w-fit mx-auto" />
            </div>
            <p>
                Cycle time information is displayed at the bottom of the monitor screen. <br />
                The C: time is the last cycle time, if green that means it was your best cycle time yet. <br />
                The T: time is the time since the last match started, or your current cycle time.
            </p>
        {:else if step === 2}
            <h2 class="font-bold">Navigation</h2>
            <div>
                <img src="/app/tutorial/navigation.png" alt="Navigation" class="max-h-56 w-fit mx-auto" />
            </div>
            <p>
                Use the navigation bar at the bottom or the sidebar to switch between pages. <br />
            </p>
            <ul class="space-y-2">
                <li><strong>Flashcards</strong>: Show a message on your screen to communicate through DS glass</li>
                <li><strong>References</strong>: Status light codes, useful commands, field manual links/QR codes</li>
                <li><strong>Messages</strong>: Team notes and CSA tickets</li>
                <li><strong>Match Logs</strong>: Logs from FMS that can be viewed and shared with teams</li>
            </ul>
        {:else if step === 3}
            <h2 class="font-bold">Match Logs</h2>
            <div>
                <img src="/app/tutorial/logs.png" alt="Navigation" class="max-h-72 w-fit mx-auto" />
            </div>
            <p>
                Click the share button to generate a temporary public link to that specific log. <br />
                Click on the graph legend to toggle the visibility of the data. <br />
                Use the select box to select which columns to display in the table.
            </p>
        {:else if step === 4}
            <h2 class="font-bold">Documentation</h2>
            <p>
                More information about the app and the API can be found on the <a href="https://docs.ftabuddy.com/" target="_blank">docs site</a>.
            </p>
            <h2 class="font-bold">Setup</h2>
            <p>
                To setup the app for your event, visit FTABuddy.com on a computer connected to the field network, and follow the instructions for hosting.
            </p>
            <h2 class="font-bold">Feedback</h2>
            <p>
                If you have any feedback or feature requests, please let me know on the <a href="https://github.com/Filip-Kin/FTA-Buddy/issues">GitHub</a> page.
            </p>
            <Button color="primary" class="w-full" on:click={openChangelog}>Changelog</Button>
            <Button color="primary" class="w-full" on:click={closeModal}>Close</Button>
        {/if}
    </div>
    <div class="flex justify-center gap-2 w-full" slot="footer">
        <Button color="dark" class="p-1" on:click={() => step--} disabled={step <= 0}><Icon icon="mdi:arrow-left" class="w-6 h-6" /></Button>
        <Indicator color={step >= 0 ? "gray" : "dark"} class="my-auto" />
        <Indicator color={step >= 1 ? "gray" : "dark"} class="my-auto" />
        <Indicator color={step >= 2 ? "gray" : "dark"} class="my-auto" />
        <Indicator color={step >= 3 ? "gray" : "dark"} class="my-auto" />
        <Indicator color={step >= 4 ? "gray" : "dark"} class="my-auto" />
        <Button color="dark" class="p-1" on:click={() => step++} disabled={step >= 4}><Icon icon="mdi:arrow-right" class="w-6 h-6" /></Button>
    </div>
</Modal>
