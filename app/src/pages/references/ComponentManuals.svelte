<script lang="ts">
    import { Accordion, AccordionItem } from "flowbite-svelte";
    import QrCode from "svelte-qrcode";

    let openState = {
        radio: false,
        roborio: false,
        sparkmax: false,
        sparkflex: false,
        talonfx: false,
        talonsrx: false,
        victorspx: false,
        canivore: false,
        pigeon: false,
    }

    let loadedState = {
        radio: false,
        roborio: false,
        sparkmax: false,
        sparkflex: false,
        talonfx: false,
        talonsrx: false,
        victorspx: false,
        canivore: false,
        pigeon: false,
    }

    $: { if (openState.radio) loadedState.radio = true; }
    $: { if (openState.roborio) loadedState.roborio = true; }
    $: { if (openState.sparkmax) loadedState.sparkmax = true; }
    $: { if (openState.sparkflex) loadedState.sparkflex = true; }
    $: { if (openState.talonfx) loadedState.talonfx = true; }
    $: { if (openState.talonsrx) loadedState.talonsrx = true; }
    $: { if (openState.victorspx) loadedState.victorspx = true; }
    $: { if (openState.canivore) loadedState.canivore = true; }
    $: { if (openState.pigeon) loadedState.pigeon = true; }

</script>

<div class="container mx-auto p-2 pr-3 w-full">
    <h1 class="text-3xl" style="font-weight: bold">Component Manuals</h1>
    <p>To visit the links, please click or scan the QR Codes</p>

    <Accordion flush class="text-left">
        <AccordionItem class="text-black dark:text-white" bind:open={openState.radio}>
            <span slot="header">FRC Robot Radio</span>
            {#if openState.radio === true || loadedState.radio === true}
                <a href="https://frc-radio.vivid-hosting.net/"><QrCode value="https://frc-radio.vivid-hosting.net/" padding={5} /></a>
            {/if}
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white" bind:open={openState.roborio}>
            <span slot="header">roboRio 2</span>
            {#if openState.roborio === true || loadedState.roborio === true}
                <a href="https://www.ni.com/docs/en-US/bundle/roborio/resource/roborio.pdf?srsltid=AfmBOopSjpf-vTxFsZYLIQrGhHn-m7GKoiZHkRsGJSpym2-IW-Q_xw-x"><QrCode value="https://www.ni.com/docs/en-US/bundle/roborio/resource/roborio.pdf?srsltid=AfmBOopSjpf-vTxFsZYLIQrGhHn-m7GKoiZHkRsGJSpym2-IW-Q_xw-x" padding={5} /></a>
            {/if}
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white" bind:open={openState.sparkmax}>
            <span slot="header">REV Spark Max</span>
            {#if openState.sparkmax === true || loadedState.sparkmax === true}
                <a href="https://docs.revrobotics.com/brushless/spark-max/overview/"><QrCode value="https://docs.revrobotics.com/brushless/spark-max/overview" padding={5} /></a>
            {/if}
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white" bind:open={openState.sparkflex}>
            <span slot="header">REV Spark Flex</span>
            {#if openState.sparkflex === true || loadedState.sparkflex === true}
                <a href="https://docs.revrobotics.com/brushless/spark-flex/overview"><QrCode value="https://docs.revrobotics.com/brushless/spark-flex/overview" padding={5} /></a>
            {/if}    
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white" bind:open={openState.talonfx}>
            <span slot="header">CTRE Talon FX</span>
            {#if openState.talonfx === true || loadedState.talonfx === true}
                <a href="https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/talonfx/"><QrCode value="https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/talonfx/" padding={5} /></a>
            {/if}
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white" bind:open={openState.talonsrx}>
            <span slot="header">CTRE Talon SRX</span>
            {#if openState.talonsrx === true  || loadedState.talonsrx === true}
                <a href="https://ctre.download/files/user-manual/Talon%20SRX%20User's%20Guide.pdf"><QrCode value="https://ctre.download/files/user-manual/Talon%20SRX%20User's%20Guide.pdf" padding={5} /></a>
            {/if}
            </AccordionItem>

        <AccordionItem class="text-black dark:text-white" bind:open={openState.victorspx}>
            <span slot="header">CTRE Victor SPX</span>
            {#if openState.victorspx === true || loadedState.victorspx === true}
                <a href="https://ctre.download/files/user-manual/Victor%20SPX%20User's%20Guide.pdf"><QrCode value="https://ctre.download/files/user-manual/Victor%20SPX%20User's%20Guide.pdf" padding={5} /></a>
            {/if}
            </AccordionItem>

        <AccordionItem class="text-black dark:text-white" bind:open={openState.canivore}>
            <span slot="header">CTRE CANivore</span>
            {#if openState.canivore === true || loadedState.canivore === true}
                <a href="https://ctre.download/files/user-manual/CANivore%20User's%20Guide.pdf"><QrCode value="https://ctre.download/files/user-manual/CANivore%20User's%20Guide.pdf" padding={5} /></a>
            {/if}
            </AccordionItem>

        <AccordionItem class="text-black dark:text-white" bind:open={openState.pigeon}>
            <span slot="header">CTRE Pigeon 2.0</span>
            {#if openState.pigeon === true || loadedState.pigeon === true}
                <a href="https://v6.docs.ctr-electronics.com/en/2024/docs/hardware-reference/pigeon2/index.html"><QrCode value="https://v6.docs.ctr-electronics.com/en/2024/docs/hardware-reference/pigeon2/index.html" padding={5} /></a>
            {/if}
            </AccordionItem>
    </Accordion>
</div>