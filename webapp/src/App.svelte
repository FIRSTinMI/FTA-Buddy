<script lang="ts">
    import { Router, Route } from "svelte-routing";
    import Home from "./pages/Home.svelte";
    import Flashcard from "./pages/Flashcards.svelte";
    import { Button } from "flowbite-svelte";
    import Icon from "@iconify/svelte";
    import Reference from "./pages/Reference.svelte";

    let page = window.location.pathname;
</script>

<main class="min-h-screen h-full bg-neutral-800 w-screen">
    <Router basepath="/app/">
        <Route path="/" component={Home} />
        <Route path="/flashcards" component={Flashcard} />
        <Route path="/references" component={Reference} />
    </Router>
</main>

<div class="flex justify-around py-2 fixed w-full bottom-0 bg-neutral-700">
    <Button class="!p-2" href="./">
        <Icon icon="mdi:television" class="w-8 h-8" />
    </Button>
    <Button class="!p-2" href="./flashcards">
        <Icon icon="mdi:message-alert" class="w-8 h-8" />
    </Button>
    <Button class="!p-2" href="./references">
        <Icon icon="mdi:file-document-outline" class="w-8 h-8" />
    </Button>
    <Button class="!p-2">
        <Icon icon="mdi:message-text" class="w-8 h-8" />
    </Button>
</div>
