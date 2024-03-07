<script lang="ts">
    import { Button, Modal } from "flowbite-svelte";

    export let welcomeOpen = false;
    export let installPrompt: Event | null;
    export let closeModal: () => void;
    export let openChangelog: () => void;
</script>

<Modal bind:open={welcomeOpen} dismissable outsideclose size="lg">
    <div slot="header">
        <h1 class="text-xl">Welcome to FTA Buddy</h1>
    </div>
    <div class="flex flex-col justify-left text-left space-y-1">
        {#if installPrompt}
            <p>Hi, hello, I recommened installing this page as an app so it's on your homescreen and the UI looks better.</p>
            <Button
                color="primary"
                class="w-fit"
                size="sm"
                on:click={() => {
                    // @ts-ignore
                    if (installPrompt) installPrompt.prompt();
                }}>Install</Button
            >
        {/if}
        <h2 class="font-bold">Field Monitor</h2>
        <p>
            If you click on a status indicator on the monitor, it'll open a modal with more details and potential troubleshooting steps. If you click on a team number, it will take
            you to the notes page for that team.
        </p>
        <h2 class="font-bold">Notes/Tickets</h2>
        <p>
            Notes are for keeping track of weird things that happened or solutions to problems. Tickets are for communicating with CSAs and other tech staff to make sure teams get
            the help they need.
        </p>
        <h2 class="font-bold">Making it work</h2>
        <p>
            First create the event from the app, then install the chrome extension on the FTA laptop that runs the main field monitor. Click on the extension and set the event
            code, then refresh the field monitor tab.
        </p>
        <p>
            You can find it in the Chrome Webstore as
            <a href="https://chromewebstore.google.com/detail/fta-buddy/kddnhihfpfnehnnhbkfajdldlgigohjc" class="underline text-blue-500">FTA Buddy</a>.
        </p>
    </div>
    <div slot="footer">
        <Button color="primary" on:click={closeModal}>Close</Button>
        <Button color="primary" on:click={openChangelog}>Changelog</Button>
    </div>
</Modal>
