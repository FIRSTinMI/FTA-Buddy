<script lang="ts">
	import { Accordion, AccordionItem } from "flowbite-svelte";
	import QrCode from "svelte-qrcode";
</script>

<div class="container mx-auto p-2 pr-3 w-full">
	<h1 class="text-3xl" style="font-weight: bold">Field Manuals</h1>
	<p>To visit the links, please click or scan the QR Codes</p>

	<Accordion flush class="text-left">
		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
				<span class="font-bold">Pack Case 23/24 (Trench, Tower, Outpost)</span>
			{/snippet}
			<a href="https://roadcase.frc.tools/23/d" target="_blank"
				><QrCode value="https://roadcase.frc.tools/23/d" padding={12} /></a
			>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
				<span class="font-bold">Pack Case 31 (Hub)</span>
			{/snippet}
			<a href="https://roadcase.frc.tools/31/d" target="_blank"
				><QrCode value="https://roadcase.frc.tools/31/d" padding={12} /></a
			>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
				<span class="font-bold"> Pack Case 32 (Test Area)</span>
			{/snippet}
			<a href="https://roadcase.frc.tools/32/d" target="_blank"
				><QrCode value="https://roadcase.frc.tools/32/d" padding={12} /></a
			>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
				<span class="font-bold">Border Cart</span>
			{/snippet}
			<a href="https://roadcase.frc.tools/BORDERCART/d" target="_blank"
				><QrCode value="https://roadcase.frc.tools/BORDERCART/d" padding={12} /></a
			>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
				<span class="font-bold">Field Marking and Border Setup</span>
			{/snippet}
			<a href="https://roadcase.frc.tools/FieldMarkingsBorder" target="_blank"
				><QrCode value="https://roadcase.frc.tools/FieldMarkingsBorder" padding={12} /></a
			>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
				<span class="font-bold">Build Hub</span>
			{/snippet}
			<a href="https://roadcase.frc.tools/HubSetup" target="_blank"
				><QrCode value="https://roadcase.frc.tools/HubSetup" padding={12} /></a
			>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
				<span class="font-bold">Build Trench</span>
			{/snippet}
			<a href="https://roadcase.frc.tools/TrenchSetup" target="_blank"
				><QrCode value="https://roadcase.frc.tools/TrenchSetup" padding={12} /></a
			>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
				<span class="font-bold">Build Tower</span>
			{/snippet}
			<a href="https://roadcase.frc.tools/TowerSetup" target="_blank"
				><QrCode value="https://roadcase.frc.tools/TowerSetup" padding={12} /></a
			>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
				<span class="font-bold">Build Outpost</span>
			{/snippet}
			<a href="https://roadcase.frc.tools/OutpostSetup" target="_blank"
				><QrCode value="https://roadcase.frc.tools/OutpostSetup" padding={12} /></a
			>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
				<span class="font-bold">Build Test Area</span>
			{/snippet}
			<a href="https://roadcase.frc.tools/TestAreaSetup" target="_blank"
				><QrCode value="https://roadcase.frc.tools/TestAreaSetup" padding={12} /></a
			>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
				<span class="font-bold">Scoring Table</span>
			{/snippet}
			<a href="https://roadcase.frc.tools/ScoringTableSetup"
				><QrCode value="https://roadcase.frc.tools/ScoringTableSetup" padding={12} /></a
			>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
				<span class="font-bold">Full Manual</span>
			{/snippet}
			<a href="https://roadcase.frc.tools/FieldManual" target="_blank"
				><QrCode value="https://roadcase.frc.tools/FieldManual" padding={12} /></a
			>
		</AccordionItem>
	</Accordion>
</div>
