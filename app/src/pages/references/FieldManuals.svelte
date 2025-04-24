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
						<span  class="font-bold">Pack Reef Cart</span>
					{/snippet}
			<a href="https://roadcase.frc.tools/REDREEF" target="_blank"><QrCode value="https://roadcase.frc.tools/REDREEF" padding={12} /></a>
		</AccordionItem>
		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
						<span  class="font-bold">Pack Case 23</span>
					{/snippet}
			<a href="https://roadcase.frc.tools/23" target="_blank"><QrCode value="https://roadcase.frc.tools/23" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
						<span  class="font-bold">Pack Case 24</span>
					{/snippet}
			<a href="https://roadcase.frc.tools/24" target="_blank"><QrCode value="https://roadcase.frc.tools/24" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
						<span  class="font-bold"> Pack Case 31 Practice Field </span>
					{/snippet}
			<a href="https://roadcase.frc.tools/31" target="_blank"><QrCode value="https://roadcase.frc.tools/31" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
						<span  class="font-bold">Carpet and Border</span>
					{/snippet}
			<a href="https://roadcase.frc.tools/BorderSetup" target="_blank"><QrCode value="https://roadcase.frc.tools/BorderSetup" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
						<span  class="font-bold">Field Marking and Tape</span>
					{/snippet}
			<a href="https://roadcase.frc.tools/FieldMarkings" target="_blank"><QrCode value="https://roadcase.frc.tools/FieldMarkings" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
						<span  class="font-bold">Build Coral Station</span>
					{/snippet}
			<a href="https://roadcase.frc.tools/CoralStationSetup" target="_blank"
				><QrCode value="https://roadcase.frc.tools/CoralStationSetup" padding={12} /></a
			>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
						<span  class="font-bold">Build Processor</span>
					{/snippet}
			<a href="https://roadcase.frc.tools/ProcessorSetup" target="_blank"><QrCode value="https://roadcase.frc.tools/ProcessorSetup" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
						<span  class="font-bold">Build Barge</span>
					{/snippet}
			<a href="https://roadcase.frc.tools/BargeSetup" target="_blank"><QrCode value="https://roadcase.frc.tools/BargeSetup" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
						<span  class="font-bold">Build Reef</span>
					{/snippet}
			<a href="https://roadcase.frc.tools/ReefSetup" target="_blank"><QrCode value="https://roadcase.frc.tools/ReefSetup" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
						<span  class="font-bold">Build Practice Field</span>
					{/snippet}
			<a href="https://roadcase.frc.tools/PracticeFieldSetup" target="_blank"
				><QrCode value="https://roadcase.frc.tools/PracticeFieldSetup" padding={12} /></a
			>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
						<span  class="font-bold">Scoring Table</span>
					{/snippet}
			<a href="https://roadcase.frc.tools/ScoringTableSetup"><QrCode value="https://roadcase.frc.tools/ScoringTableSetup" padding={12} /></a>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			{#snippet header()}
						<span  class="font-bold">Full Manual</span>
					{/snippet}
			<a href="https://roadcase.frc.tools/FieldManual" target="_blank"><QrCode value="https://roadcase.frc.tools/FieldManual" padding={12} /></a>
		</AccordionItem>
	</Accordion>
</div>
