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
			<a href="https://roadcase.frc.tools/REDREEF" target="_blank"><QrCode value="https://roadcase.frc.tools/REDREEF" padding={12} /></a>
		</AccordionItem>
		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Pack Case 23</span>
			<a href="https://roadcase.frc.tools/23" target="_blank"><QrCode value="https://roadcase.frc.tools/23" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Pack Case 24</span>
			<a href="https://roadcase.frc.tools/24" target="_blank"><QrCode value="https://roadcase.frc.tools/24" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header"> Pack Case 31 Practice Field </span>
			<a href="https://roadcase.frc.tools/31" target="_blank"><QrCode value="https://roadcase.frc.tools/31" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Carpet and Border</span>
			<a href="https://roadcase.frc.tools/BorderSetup" target="_blank"><QrCode value="https://roadcase.frc.tools/BorderSetup" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Field Marking and Tape</span>
			<a href="https://roadcase.frc.tools/FieldMarkings" target="_blank"><QrCode value="https://roadcase.frc.tools/FieldMarkings" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Build Coral Station</span>
			<a href="https://roadcase.frc.tools/CoralStationSetup" target="_blank"
				><QrCode value="https://roadcase.frc.tools/CoralStationSetup" padding={12} /></a
			>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Build Processor</span>
			<a href="https://roadcase.frc.tools/ProcessorSetup" target="_blank"><QrCode value="https://roadcase.frc.tools/ProcessorSetup" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Build Barge</span>
			<a href="https://roadcase.frc.tools/BargeSetup" target="_blank"><QrCode value="https://roadcase.frc.tools/BargeSetup" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Build Reef</span>
			<a href="https://roadcase.frc.tools/ReefSetup" target="_blank"><QrCode value="https://roadcase.frc.tools/ReefSetup" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Build Practice Field</span>
			<a href="https://roadcase.frc.tools/PracticeFieldSetup" target="_blank"
				><QrCode value="https://roadcase.frc.tools/PracticeFieldSetup" padding={12} /></a
			>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Scoring Table</span>
			<a href="https://roadcase.frc.tools/ScoringTableSetup"><QrCode value="https://roadcase.frc.tools/ScoringTableSetup" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header">Full Manual</span>
			<a href="https://roadcase.frc.tools/FieldManual" target="_blank"><QrCode value="https://roadcase.frc.tools/FieldManual" padding={12} /></a>
		</AccordionItem>
	</Accordion>
</div>
