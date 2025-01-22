<script lang="ts">
	import { Accordion, AccordionItem } from "flowbite-svelte";
	import QrCode from "svelte-qrcode";
</script>

<div class="container mx-auto p-2 pr-3 w-full">
	<h1 class="text-3xl" style="font-weight: bold">Field Manuals</h1>
	<p>To visit the links, please click or scan the QR Codes</p>

	<Accordion flush class="text-left">
		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Pack Reef Cart</span>
			<a href="/app/pdf/reefcase.pdf" target="_blank"><QrCode value="https://ftabuddy.com/app/pdf/reefcase.pdf" padding={12} /></a>
		</AccordionItem>
		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Pack Case 23</span>
			<a href="/app/pdf/23.pdf" target="_blank"> <QrCode value="https://ftabuddy.com/app/pdf/23.pdf" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Pack Case 24</span>
			<a href="/app/pdf/24.pdf" target="_blank"> <QrCode value="https://ftabuddy.com/app/pdf/24.pdf" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header"> Pack Case 32 Practice Field </span>
			<a href="/app/pdf/32.pdf" target="_blank"> <QrCode value="https://ftabuddy.com/app/pdf/32.pdf" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Carpet and Border</span>
			<a href="/app/pdf/carpet.pdf" target="_blank"> <QrCode value="https://ftabuddy.com/app/pdf/carpet.pdf" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Build Coral Station</span>
			<a href="/app/pdf/coral.pdf" target="_blank"> <QrCode value="https://ftabuddy.com/app/pdf/coral.pdf" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Build Processor</span>
			<a href="/app/pdf/processor.pdf" target="_blank"> <QrCode value="https://ftabuddy.com/app/pdf/processor.pdf" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Build Barge</span>
			<a href="/app/pdf/barge.pdf" target="_blank"> <QrCode value="https://ftabuddy.com/app/pdf/barge.pdf" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Build Reef</span>
			<a href="/app/pdf/reef.pdf" target="_blank"> <QrCode value="https://ftabuddy.com/app/pdf/reef.pdf" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Build Practice Field</span>
			<a href="/app/pdf/practice.pdf" target="_blank"> <QrCode value="https://ftabuddy.com/app/pdf/practice.pdf" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Full Manual</span>
			<a href="/app/pdf/2025.pdf" target="_blank"> <QrCode value="/app/pdf/2025.pdf" padding={12} /></a>
		</AccordionItem>
	</Accordion>
</div>
