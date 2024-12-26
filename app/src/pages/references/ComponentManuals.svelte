<script lang="ts">
    import { Accordion, AccordionItem } from "flowbite-svelte";
    import QrCode from "svelte-qrcode";
</script>

<div class="container mx-auto p-2 pr-3 w-full">
    <h1 class="text-3xl" style="font-weight: bold">Component Manuals</h1>
    <p>To visit the links, please click or scan the QR Codes</p>
    <Accordion flush class="text-left">
        <AccordionItem class="text-black dark:text-white">
            <span slot="header">FRC Robot Radio</span>
                <a href="https://frc-radio.vivid-hosting.net/"><QrCode value="https://frc-radio.vivid-hosting.net/" padding={5} /></a>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header">roboRio 2</span>
                <a href="https://www.ni.com/docs/en-US/bundle/roborio/resource/roborio.pdf?srsltid=AfmBOopSjpf-vTxFsZYLIQrGhHn-m7GKoiZHkRsGJSpym2-IW-Q_xw-x"><QrCode value="https://www.ni.com/docs/en-US/bundle/roborio/resource/roborio.pdf?srsltid=AfmBOopSjpf-vTxFsZYLIQrGhHn-m7GKoiZHkRsGJSpym2-IW-Q_xw-x" padding={5} /></a>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header">REV Spark Max</span>
                <a href="https://docs.revrobotics.com/brushless/spark-max/overview"><QrCode value="https://docs.revrobotics.com/brushless/spark-max/overview" padding={5} /></a>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header">REV Spark Flex</span>
                <a href="https://docs.revrobotics.com/brushless/spark-flex/overview"><QrCode value="https://docs.revrobotics.com/brushless/spark-flex/overview" padding={5} /></a>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header">CTRE Talon FX</span>
                <a href="https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/talonfx/"><QrCode value="https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/talonfx/" padding={5} /></a>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header">CTRE Talon SRX</span>
                <a href="https://ctre.download/files/user-manual/Talon%20SRX%20User's%20Guide.pdf"><QrCode value="https://ctre.download/files/user-manual/Talon%20SRX%20User's%20Guide.pdf" padding={5} /></a>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header">CTRE Victor SPX</span>
                <a href="https://ctre.download/files/user-manual/Victor%20SPX%20User's%20Guide.pdf"><QrCode value="https://ctre.download/files/user-manual/Victor%20SPX%20User's%20Guide.pdf" padding={5} /></a>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header">CTRE CANivore</span>
                <a href="https://ctre.download/files/user-manual/CANivore%20User's%20Guide.pdf"><QrCode value="https://ctre.download/files/user-manual/CANivore%20User's%20Guide.pdf" padding={5} /></a>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header">CTRE Pigeon 2.0</span>
                <a href="https://v6.docs.ctr-electronics.com/en/2024/docs/hardware-reference/pigeon2/index.html"><QrCode value="https://v6.docs.ctr-electronics.com/en/2024/docs/hardware-reference/pigeon2/index.html" padding={5} /></a>
        </AccordionItem>
    </Accordion>
</div>