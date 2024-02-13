<script lang="ts">
    import { Router, Route, Link } from "svelte-routing";
    import Home from "./pages/Home.svelte";
    import Flashcard from "./pages/Flashcards.svelte";
    import { Button } from "flowbite-svelte";
    import Icon from "@iconify/svelte";
    import Reference from "./pages/Reference.svelte";
</script>

<main class="min-h-screen h-full bg-neutral-800 w-screen">
    <Router basepath="/app/">
        <Route path="/" component={Home} />
        <Route path="/flashcards" component={Flashcard} />
        <Route path="/references" component={Reference} />

        <div
            class="flex justify-around py-2 fixed w-full bottom-0 bg-neutral-700"
            id="nav-bar"
        >
            <Link to="/app/">
                <Button class="!p-2">
                    <Icon icon="mdi:television" class="w-8 h-8" />
                </Button>
            </Link>
            <Link to="/app/flashcards">
                <Button class="!p-2">
                    <Icon icon="mdi:message-alert" class="w-8 h-8" />
                </Button>
            </Link>
            <Link to="/app/references">
                <Button class="!p-2">
                    <Icon icon="mdi:file-document-outline" class="w-8 h-8" />
                </Button>
            </Link>
            <Link to="/app/notes">
                <Button class="!p-2">
                    <Icon icon="mdi:message-text" class="w-8 h-8" />
                </Button>
            </Link>
        </div>
    </Router>
</main>
