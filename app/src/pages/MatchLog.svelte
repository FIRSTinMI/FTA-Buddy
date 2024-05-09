<script lang="ts">
    import { Button, Spinner } from "flowbite-svelte";
import { trpc } from "../main";
    import { navigate } from "svelte-routing";

    export let matchid: string;

    const match = trpc.match.getMatch.query({ id: matchid });

    function back() {
        if (window.history.state === null) {
            navigate("/app/logs")
        } else {
            window.history.back();
        }
    }
</script>

<div class="container mx-auto p-2 w-full flex flex-col">
    <Button on:click={back} class="w-fit">Back</Button>
    {#await match}
        <Spinner />
    {:then match}
        <pre class="text-left"><code>
            {JSON.stringify(match, null, 4)}
        </code></pre>
    {/await}
</div>