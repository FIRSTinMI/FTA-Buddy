<script lang="ts">
	import { Modal, Button } from "flowbite-svelte";

    export let notesPolicyOpen = false;
    let resolve: () => void;
    let reject: () => void;
    export function confirmPolicy() {
        notesPolicyOpen = true;
        return new Promise((_resolve, _reject) => {
            resolve = () => {
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
    <h1 slot="header">Messaging Policy</h1>
    <p class="text-left">
        All notes and tickets are saved after the end of the event and can be viewed by volunteers at other events this team attends in the future.
    </p>
    <p class="text-left">
        Keep this in mind when writing messages, keep it GP and don't include any personal information like names, phone numbers, emails.
    </p>
    <div slot="footer" class="ml-auto">
        <Button on:click={() => resolve()}>Agree and Send</Button>
        <Button color="red" on:click={() => reject()}>Back</Button>
    </div>
</Modal>
