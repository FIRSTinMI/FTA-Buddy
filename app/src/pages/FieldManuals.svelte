<script lang="ts">
    import { Accordion, AccordionItem } from "flowbite-svelte";
    import QrCode from "svelte-qrcode";
    import { settingsStore } from "../stores/settings";
</script>

<div class="container mx-auto p-2 pr-3 w-full">
    <Accordion flush class="text-left">
        <AccordionItem class="text-black dark:text-white">
            <span slot="header">Pack Case 23/24 Amp and Truss</span>
            {#if $settingsStore.fimSpecifics}
                <a href="/app/pdf/FIM_Case_23_24.pdf"><QrCode value="https://ftabuddy.com/app/pdf/FIM_Case_23_24.pdf" padding={5}></QrCode></a>
            {:else}
                <a href="https://roadcase.frc.tools/23"><QrCode value="https://roadcase.frc.tools/23" padding={5} /></a>
            {/if}
        </AccordionItem>
        <AccordionItem class="text-black dark:text-white">
            <span slot="header">Pack Case 31 Speaker</span>
            {#if $settingsStore.fimSpecifics}
                <a href="/app/pdf/FIM_Case_31.pdf"><QrCode value="https://ftabuddy.com/app/pdf/FIM_Case_31.pdf" padding={5}></QrCode></a>
            {:else}
                <a href="https://roadcase.frc.tools/31"><QrCode value="https://roadcase.frc.tools/31" padding={5} /></a>
            {/if}
        </AccordionItem>
        <AccordionItem class="text-black dark:text-white">
            <span slot="header">Pack Case 32 {#if $settingsStore.fimSpecifics}Stage Walls{:else}Practice Field{/if}</span>
            {#if $settingsStore.fimSpecifics}
                <a href="/app/pdf/FIM_Case_32.pdf"><QrCode value="https://ftabuddy.com/app/pdf/FIM_Case_32.pdf" padding={5}></QrCode></a>
            {:else}
                <a href="https://roadcase.frc.tools/32"><QrCode value="https://roadcase.frc.tools/32" padding={5} /></a>
            {/if}
        </AccordionItem>
        <AccordionItem class="text-black dark:text-white">
            <span slot="header">Build Stage</span>
            <a href="https://usfirst.box.com/s/we7ufqu61k303jnjfmm6o8wg3jp2lkso"><QrCode value="https://usfirst.box.com/s/we7ufqu61k303jnjfmm6o8wg3jp2lkso" padding={5} /></a>
        </AccordionItem>
        <AccordionItem class="text-black dark:text-white">
            <span slot="header">Build Speaker</span>
            <a href="https://usfirst.box.com/s/dybf27uuqtskqpkljy37jkezgludm3f0"><QrCode value="https://usfirst.box.com/s/dybf27uuqtskqpkljy37jkezgludm3f0" padding={5} /></a>
        </AccordionItem>
        <AccordionItem class="text-black dark:text-white">
            <span slot="header">Build Amp</span>
            <a href="https://usfirst.box.com/s/3oilb7ji2ehr1sd7fg2tb31snwxs64kw"><QrCode value="https://usfirst.box.com/s/3oilb7ji2ehr1sd7fg2tb31snwxs64kw" padding={5} /></a>
        </AccordionItem>
        <AccordionItem class="text-black dark:text-white">
            <span slot="header">Build Source</span>
            <a href="https://usfirst.box.com/s/ah6oy40oqy07wfi3dldjfecx7hteoeg1"><QrCode value="https://usfirst.box.com/s/ah6oy40oqy07wfi3dldjfecx7hteoeg1" padding={5} /></a>
        </AccordionItem>
    </Accordion>
</div>