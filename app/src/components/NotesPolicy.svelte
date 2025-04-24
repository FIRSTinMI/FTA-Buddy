<script lang="ts">
	import { Modal, Button } from "flowbite-svelte";
	import { settingsStore } from "../stores/settings";

    interface Props {
        notesPolicyOpen?: boolean;
    }

    let { notesPolicyOpen = $bindable(false) }: Props = $props();
    let resolve: () => void = $state();
    let reject: () => void = $state();
    export function confirmPolicy() {
        notesPolicyOpen = true;
        return new Promise((_resolve, _reject) => {
            resolve = () => {
                $settingsStore.acknowledgedNotesPolicy = true;
                notesPolicyOpen = false;
                _resolve(void 0);
            }
            reject = () => {
                notesPolicyOpen = false;
                _reject(new Error("Messaging policy denied"));
            }
        })
    }
</script>

<Modal bind:open={notesPolicyOpen}>
    {#snippet header()}
        <h1 >Messaging Policy</h1>
    {/snippet}
    <p class="text-left">
        All notes and tickets are saved after the end of the event and can be viewed by volunteers at other events this team attends in the future.
    </p>
    <p class="text-left">
        Keep this in mind when writing messages, keep it GP and don't include any personal information like names, phone numbers, emails.
    </p>
    {#snippet footer()}
        <div  class="ml-auto">
            <Button on:click={() => resolve()}>Agree and Send</Button>
            <Button color="red" on:click={() => reject()}>Back</Button>
        </div>
    {/snippet}
</Modal>
