<script lang="ts">
    import { Button, Modal } from "flowbite-svelte";

    export let welcomeOpen = false;
    export let installPrompt: Event | null;
    export let closeModal: () => void;
</script>

<Modal bind:open={welcomeOpen} dismissable outsideclose size="lg">
    <div slot="header">
        <h1 class="text-xl">Welcome to FTA Buddy</h1>
    </div>
    <div class="flex flex-col justify-left text-left space-y-1">
        <p>
            Hi, hello, I recommened installing this page as an app so it's on your homescreen and the UI looks better.
        </p>
        {#if installPrompt}
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
        <h2 class="text-lg font-bold">Field Monitor</h2>
        <p>
            The field monitor is mostly the same as the real one, some things have been moved around to make it fit
            better on a phone. Most notably the RIO indicator will be yellow if the RIO is connect but is not running
            code, and green if it is running code.
        </p>
        <p>
            If you click on a status indicator on the monitor, it'll open a modal that explains what it means and
            potential troubleshooting steps. If you click on a team number, it will take you to the notes page for that
            team.
        </p>
        <h2 class="text-lg font-bold">Notes</h2>
        <p>
            Notes are syncronized between events. So if you have a robot with a weird problem, you can leave a note and
            hopefully it'll save the FTA at their next event some time.
        </p>
        <p>
            To use the notes feature, you'll need to create an account. You can do that by clicking the settings button
            in the top left.
        </p>
        <h2 class="text-lg font-bold">Making it work</h2>
        <p>
            You'll also have to make sure the chrome extension is setup for the event you're at. On the FTA laptop that
            runs the main field monitor, click on the extension and set the event code, then refresh the field monitor
            tab.
        </p>
        <p>
            If you don't have the extension installed, you can find it in the Chrome Webstore as <a
                href="https://chromewebstore.google.com/detail/fta-buddy/kddnhihfpfnehnnhbkfajdldlgigohjc"
                class="underline text-blue-500">FTA Buddy</a
            >.
        </p>
    </div>
    <div slot="footer">
        <Button color="primary" on:click={closeModal}>Close</Button>
    </div>
</Modal>
