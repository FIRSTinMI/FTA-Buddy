<script lang="ts">
	import { Accordion, AccordionItem } from "flowbite-svelte";
</script>

<div class="container mx-auto p-2 pr-3 w-full">
	<h1 class="text-3xl" style="font-weight: bold">Wiring Diagrams</h1>
	<Accordion flush class="text-left">
		<AccordionItem class="text-black dark:text-white">
			<span slot="header" class="font-bold">CTRE + POE Diagram</span>
			<img src="/frc-control-system-layout-ctre.svg" class="bg-white" alt="Wiring Diagram Using CTRE Components and Power Over Ethernet" />
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header" class="font-bold">REV + RPM Diagram</span>
			<img src="/frc-control-system-layout-rev.svg" alt="Wiring Diagram Using REV Components and Radio Power Module" />
		</AccordionItem>
	</Accordion>
</div>
