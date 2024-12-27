<script lang="ts">  
    import { Accordion, AccordionItem } from "flowbite-svelte";

    let ctreOpenState = false;
	let ctreLoadedState = false;
    let revOpenState = false;
	let revLoadedState = false;

	$: { if (ctreOpenState) ctreLoadedState = true; }
	$: { if (revOpenState) revLoadedState = true; }
</script>

<div class="container mx-auto p-2 pr-3 w-full">
    <h1 class="text-3xl" style="font-weight: bold">Wiring Diagrams</h1>
    <Accordion flush class="text-left">
        <AccordionItem class="text-black dark:text-white" bind:open={ctreOpenState}>
            <span slot="header">CTRE + POE Diagram</span>
            {#if ctreOpenState === true || ctreLoadedState === true}
                <img src="/app/frc-control-system-layout-ctre.png" alt="Wiring Diagram Using CTRE Components and Power Over Ethernet">
            {/if}
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white" bind:open={revOpenState}>
            <span slot="header">REV + RPM Diagram</span>
            {#if revOpenState === true || revLoadedState === true}
                <img src="/app/frc-control-system-layout-rev.png" alt="Wiring Diagram Using REV Components and Radio Power Module">
            {/if}
        </AccordionItem>
    </Accordion>
</div>