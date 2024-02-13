<script lang="ts">
    import { Router, Route, Link } from "svelte-routing";
    import Home from "./pages/Home.svelte";
    import Flashcard from "./pages/Flashcards.svelte";
    import { Button } from "flowbite-svelte";
    import Icon from "@iconify/svelte";
    import Reference from "./pages/Reference.svelte";
    import Notes from "./pages/Notes.svelte";
</script>

<main>
    <Router basepath="/app/">
        <div class="bg-neutral-800 w-screen h-screen flex flex-col">
            <div class="bg-primary flex">
                <Button class="!py-0 !px-1">
                    <Icon icon="mdi:dots-vertical" class="w-6 h-8 sm:w-10 sm:h-12" />
                </Button>
            </div>

            <div class="overflow-y-auto flex-grow pb-4">
                <Route path="/" component={Home} />
                <Route path="/flashcards" component={Flashcard} />
                <Route path="/references" component={Reference} />
                <Route path="/notes" component={Notes} />
                <Route path="/notes/:team" component={Notes} />
            </div>

            <div
                class="flex justify-around py-2 bg-neutral-700"
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
                        <Icon
                            icon="mdi:file-document-outline"
                            class="w-8 h-8"
                        />
                    </Button>
                </Link>
                <Link to="/app/notes">
                    <Button class="!p-2">
                        <Icon icon="mdi:message-text" class="w-8 h-8" />
                    </Button>
                </Link>
            </div>
        </div>
    </Router>
</main>
