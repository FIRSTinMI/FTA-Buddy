<script lang="ts">
	import { Accordion, AccordionItem } from "flowbite-svelte";
	import QrCode from "svelte-qrcode";
	import { settingsStore } from "../../stores/settings";

	let openState = {
		one: false,
		two: false,
		three: false,
		four: false,
		five: false,
		six: false,
		seven: false,
	};
	let loadedState = {
		...openState,
	};

	$: {
		if (openState.one) loadedState.one = true;
		if (openState.two) loadedState.two = true;
		if (openState.three) loadedState.three = true;
		if (openState.four) loadedState.four = true;
		if (openState.five) loadedState.five = true;
		if (openState.six) loadedState.six = true;
		if (openState.seven) loadedState.seven = true;
	}

	addEventListener("load", async () => {
		// Once the page is loaded, wait 100ms, then generate the QR codes
		await new Promise((r) => setTimeout(r, 100));
		loadedState.one = true;
		loadedState.two = true;
		loadedState.three = true;
		loadedState.four = true;
		loadedState.five = true;
		loadedState.six = true;
		loadedState.seven = true;
	});
</script>

<div class="container mx-auto p-2 pr-3 w-full">
	<h1 class="text-3xl" style="font-weight: bold">Field Manuals</h1>
	<p>To visit the links, please click or scan the QR Codes</p>

	<Accordion flush class="text-left">
		<AccordionItem class="text-black dark:text-white" bind:open={openState.one}>
			<span slot="header">Pack Case 23/24 Amp and Truss</span>
			{#if openState.one === true || loadedState.one === true}
				{#if $settingsStore.fimSpecifics}
					<a href="/app/pdf/FIM_Case_23_24.pdf" target="_blank"
						><QrCode value="https://ftabuddy.com/app/pdf/FIM_Case_23_24.pdf" padding={12}></QrCode></a
					>
				{:else}
					<a href="https://roadcase.frc.tools/23" target="_blank"><QrCode value="https://roadcase.frc.tools/23" padding={12} /></a>
				{/if}
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.two}>
			<span slot="header">Pack Case 31 Speaker</span>
			{#if openState.two === true || loadedState.two === true}
				{#if $settingsStore.fimSpecifics}
					<a href="/app/pdf/FIM_Case_31.pdf" target="_blank"><QrCode value="https://ftabuddy.com/app/pdf/FIM_Case_31.pdf" padding={12}></QrCode></a>
				{:else}
					<a href="https://roadcase.frc.tools/31" target="_blank"><QrCode value="https://roadcase.frc.tools/31" padding={12} /></a>
				{/if}
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.three}>
			<span slot="header"
				>Pack Case 32 {#if $settingsStore.fimSpecifics}Stage Walls{:else}Practice Field{/if}</span
			>
			{#if openState.three === true || loadedState.three === true}
				{#if $settingsStore.fimSpecifics}
					<a href="/app/pdf/FIM_Case_32.pdf" target="_blank"><QrCode value="https://ftabuddy.com/app/pdf/FIM_Case_32.pdf" padding={12}></QrCode></a>
				{:else}
					<a href="https://roadcase.frc.tools/32" target="_blank"><QrCode value="https://roadcase.frc.tools/32" padding={12} /></a>
				{/if}
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.four}>
			<span slot="header">Build Stage</span>
			{#if openState.four === true || loadedState.four === true}
				<a href="https://usfirst.box.com/s/we7ufqu61k303jnjfmm6o8wg3jp2lkso" target="_blank"
					><QrCode value="https://usfirst.box.com/s/we7ufqu61k303jnjfmm6o8wg3jp2lkso" padding={12} /></a
				>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.five}>
			<span slot="header">Build Speaker</span>
			{#if openState.five === true || loadedState.five === true}
				<a href="https://usfirst.box.com/s/dybf27uuqtskqpkljy37jkezgludm3f0" target="_blank"
					><QrCode value="https://usfirst.box.com/s/dybf27uuqtskqpkljy37jkezgludm3f0" padding={12} /></a
				>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.six}>
			<span slot="header">Build Amp</span>
			{#if openState.six === true || loadedState.six === true}
				<a href="https://usfirst.box.com/s/3oilb7ji2ehr1sd7fg2tb31snwxs64kw" target="_blank"
					><QrCode value="https://usfirst.box.com/s/3oilb7ji2ehr1sd7fg2tb31snwxs64kw" padding={12} /></a
				>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.seven}>
			<span slot="header">Build Source</span>
			{#if openState.seven === true || loadedState.seven === true}
				<a href="https://usfirst.box.com/s/ah6oy40oqy07wfi3dldjfecx7hteoeg1" target="_blank"
					><QrCode value="https://usfirst.box.com/s/ah6oy40oqy07wfi3dldjfecx7hteoeg1" padding={12} /></a
				>
			{/if}
		</AccordionItem>
	</Accordion>
</div>
