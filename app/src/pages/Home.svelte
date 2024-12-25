<script lang=ts>
    import { authStore } from "../stores/auth";
    import { eventStore } from "../stores/event";
    import { onMount } from "svelte";
    import { trpc } from "../main";
    import { Button, Input, Label, Select, type SelectOptionType } from "flowbite-svelte";
    import { navigate } from "svelte-routing";


    let auth = $authStore;
    let event = $eventStore;

    onMount(async () => {
        const checkAuth = await trpc.user.checkAuth.query({
            token: auth.token,
            eventToken: auth.eventToken
        });

        if (checkAuth.user) {
            auth.user = checkAuth.user
        }

        if (auth.eventToken && !checkAuth.event) {

        }
    })
</script>

<div class="container mx-auto md:max-w-4xl flex flex-col justify-center p-4 space-y-4">
    <h1 class="text-5xl" style="font-weight:bold;">Welcome to FTA/CSA Buddy</h1>
    {#if !auth || !auth.token}
        <h1 class="text-3xl" style="font-weight:bold;">Please Create an Account or Log In</h1>
        <Button on:click={() => navigate("/app/login")} class="w-full mt-4">Create Account / Log In</Button>
    {:else if auth && auth.token}
        <h1 class="text-3xl" style="font-weight:bold; font-style: italic;">Hello {auth.user?.username}!</h1>
        <h1 style="font-style: italic;">Your account is currently in {auth.user?.role} mode.</h1>
        <Button on:click={() => navigate("/app/login")} class="w-full mt-4">Log Out</Button>


        {#if auth.user?.role === "ADMIN"}
            {#if auth.eventToken}
                <h1 class="text-2xl" style="font-weight:bold;">You have selected the {event.code} event.</h1>
                <h1 style="font-weight:bold;  font-style: italic;">To change this, please click the button below</h1>
                <Button on:click={() => navigate("/app/login")} class="w-full mt-4">Change Event</Button>
                
                <h1 class="text-2xl" style="font-style: italic; font-weight: bold; padding-top: 10px;">ADMIN Quick Links:</h1>
                <Button on:click={() => navigate("/app/monitor")} class="w-1/2 mt-4">Monitor</Button>
                <Button on:click={() => navigate("/app/flashcards")} class="w-1/2 mt-4">Flashcards</Button>
                <Button on:click={() => navigate("/app/messages")} class="w-1/2 mt-4">Tickets</Button>
                <Button on:click={() => navigate("/app/logs")} class="w-1/2 mt-4">Match Logs</Button>
                <Button on:click={() => navigate("/app/checklist")} class="w-1/2 mt-4">Checklist</Button>
                <Button on:click={() => navigate("/app/event-report")} class="w-1/2 mt-4">Event Report</Button>
                <Button on:click={() => navigate("/app/dashboard")} class="w-1/2 mt-4">Event Dashboard</Button>
                <Button on:click={() => navigate("/app/fieldmanuals")} class="w-1/2 mt-4">Field Manuals</Button>
                <Button on:click={() => navigate("/app/references")} class="w-1/2 mt-4">References</Button>
                <Button on:click={() => navigate("/app/statuslights")} class="w-1/2 mt-4">Status Lights</Button>
                <Button on:click={() => navigate("/app/componentmanuals")} class="w-1/2 mt-4">Component Manuals</Button>
                <Button on:click={() => navigate("/app/wiringdiagrams")} class="w-1/2 mt-4">Wiring Diagrams</Button>
                <Button on:click={() => navigate("/app/softwaredocs")} class="w-1/2 mt-4">Software Documentation</Button>
            {:else}
                <h1 class="text-2xl" style="font-weight:bold;">You have NOT selected an event.</h1>
                <h1 style="font-weight:bold;  font-style: italic;">To change this, please click the button below</h1>
                <Button on:click={() => navigate("/app/login")} class="w-full mt-4">Select Event</Button>
            {/if}
        {:else if auth.user?.role === "FTA"}
            {#if auth.eventToken}
                <h1 class="text-2xl" style="font-weight:bold;">You have selected the {event.code} event.</h1>
                <h1 style="font-weight:bold;  font-style: italic;">To change this, please click the button below</h1>
                <Button on:click={() => navigate("/app/login")} class="w-full mt-4">Change Event</Button>
        
                <h1 class="text-2xl" style="font-style: italic; font-weight: bold; padding-top: 10px;">FTA Quick Links:</h1>
                <Button on:click={() => navigate("/app/monitor")} class="w-1/2 mt-4">Monitor</Button>
                <Button on:click={() => navigate("/app/flashcards")} class="w-1/2 mt-4">Flashcards</Button>
                <Button on:click={() => navigate("/app/messages")} class="w-1/2 mt-4">Tickets</Button>
                <Button on:click={() => navigate("/app/logs")} class="w-1/2 mt-4">Match Logs</Button>
                <Button on:click={() => navigate("/app/checklist")} class="w-1/2 mt-4">Checklist</Button>
                <Button on:click={() => navigate("/app/event-report")} class="w-1/2 mt-4">Event Report</Button>
                <Button on:click={() => navigate("/app/dashboard")} class="w-1/2 mt-4">Event Dashboard</Button>
                <Button on:click={() => navigate("/app/fieldmanuals")} class="w-1/2 mt-4">Field Manuals</Button>
                
            {:else}
                <h1 class="text-2xl" style="font-weight:bold;">You have NOT selected an event.</h1>
                <h1 style="font-weight:bold;  font-style: italic;">To change this, please click the button below</h1>
                <Button on:click={() => navigate("/app/login")} class="w-full mt-4">Select Event</Button>
            {/if}
        {:else if auth.user?.role === "CSA"}
            {#if auth.eventToken}
                <h1 class="text-2xl" style="font-weight:bold;">You have selected the {event.code} event.</h1>
                <h1 style="font-weight:bold;  font-style: italic;">To change this, please click the button below</h1>
                <Button on:click={() => navigate("/app/login")} class="w-full mt-4">Change Event</Button>

                <h1 class="text-2xl" style="font-style: italic; font-weight: bold; padding-top: 10px;">CSA Quick Links:</h1>
                <Button on:click={() => navigate("/app/messages")} class="w-1/2 mt-4">Tickets</Button>
                <Button on:click={() => navigate("/app/logs")} class="w-1/2 mt-4">Match Logs</Button>
                <Button on:click={() => navigate("/app/references")} class="w-1/2 mt-4">References</Button>
                <Button on:click={() => navigate("/app/statuslights")} class="w-1/2 mt-4">Status Lights</Button>
                <Button on:click={() => navigate("/app/componentmanuals")} class="w-1/2 mt-4">Component Manuals</Button>
                <Button on:click={() => navigate("/app/wiringdiagrams")} class="w-1/2 mt-4">Wiring Diagrams</Button>
                <Button on:click={() => navigate("/app/softwaredocs")} class="w-1/2 mt-4">Software Documentation</Button>
            {:else}
                <h1 class="text-2xl" style="font-weight:bold;">You have NOT selected an event.</h1>
                <h1 style="font-weight:bold;  font-style: italic;">To change this, please click the button below</h1>
                <Button on:click={() => navigate("/app/login")} class="w-full mt-4">Select Event</Button>

                <h1 class="text-2xl" style="font-style: italic; font-weight: bold; padding-top: 10px;">CSA Quick Links:</h1>
                <Button on:click={() => navigate("/app/references")} class="w-1/2 mt-4">References</Button>
                <Button on:click={() => navigate("/app/statuslights")} class="w-1/2 mt-4">Status Lights</Button>
                <Button on:click={() => navigate("/app/componentmanuals")} class="w-1/2 mt-4">Component Manuals</Button>
                <Button on:click={() => navigate("/app/wiringdiagrams")} class="w-1/2 mt-4">Wiring Diagrams</Button>
                <Button on:click={() => navigate("/app/softwaredocs")} class="w-1/2 mt-4">Software Documentation</Button>
            {/if}
        {:else if auth.user?.role === "RI"}
            {#if auth.eventToken}
                <h1 class="text-2xl" style="font-weight:bold;">You have selected the {event.code} event.</h1>
                <h1 style="font-weight:bold;  font-style: italic;">To change this, please click the button below</h1>
                <Button on:click={() => navigate("/app/login")} class="w-full mt-4">Change Event</Button>

                <h1 class="text-2xl" style="font-style: italic; font-weight: bold; padding-top: 10px;">RI Quick Links:</h1>
                <Button on:click={() => navigate("/app/messages")} class="w-1/2 mt-4">Tickets</Button>
                <Button on:click={() => navigate("/app/logs")} class="w-1/2 mt-4">Match Logs</Button>
                <Button on:click={() => navigate("/app/references")} class="w-1/2 mt-4">References</Button>
                <Button on:click={() => navigate("/app/statuslights")} class="w-1/2 mt-4">Status Lights</Button>
                <Button on:click={() => navigate("/app/componentmanuals")} class="w-1/2 mt-4">Component Manuals</Button>
                <Button on:click={() => navigate("/app/wiringdiagrams")} class="w-1/2 mt-4">Wiring Diagrams</Button>
                <Button on:click={() => navigate("/app/softwaredocs")} class="w-1/2 mt-4">Software Documentation</Button>
            {:else}
                <h1 class="text-2xl" style="font-weight:bold;">You have NOT selected an event.</h1>
                <h1 style="font-weight:bold;  font-style: italic;">To change this, please click the button below</h1>
                <Button on:click={() => navigate("/app/login")} class="w-full mt-4">Select Event</Button>

                <h1 class="text-2xl" style="font-style: italic; font-weight: bold; padding-top: 10px;">RI Quick Links:</h1>
                <Button on:click={() => navigate("/app/references")} class="w-1/2 mt-4">References</Button>
                <Button on:click={() => navigate("/app/statuslights")} class="w-1/2 mt-4">Status Lights</Button>
                <Button on:click={() => navigate("/app/componentmanuals")} class="w-1/2 mt-4">Component Manuals</Button>
                <Button on:click={() => navigate("/app/wiringdiagrams")} class="w-1/2 mt-4">Wiring Diagrams</Button>
                <Button on:click={() => navigate("/app/softwaredocs")} class="w-1/2 mt-4">Software Documentation</Button>
            {/if}
        {:else}
            {#if auth.eventToken}
                <h1 class="text-2xl" style="font-weight:bold;">You have selected the {event.code} event.</h1>
                <h1 style="font-weight:bold;  font-style: italic;">To change this, please click the button below</h1>
                <Button on:click={() => navigate("/app/login")} class="w-full mt-4">Change Event</Button>

                <h1 class="text-2xl" style="font-weight:bold; padding-top: 10px;">You have not selected a User Role.</h1>
                <h1 class="text-2xl" style="font-weight:bold;">Please do so to see Quick Links.</h1>
            {/if}
        {/if}
    {/if}
</div>