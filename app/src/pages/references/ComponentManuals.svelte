<script lang="ts">
	import { Accordion, AccordionItem } from "flowbite-svelte";
	import QrCode from "svelte-qrcode";
    import CustomIcon from "../../components/CustomIcon.svelte";

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
		pdh: false,
		cancoder: false,
		ctrepdp: false,
	};

	let loadedState = {
		...openState,
	};

	$: {
		if (openState.radio) loadedState.radio = true;
		if (openState.roborio) loadedState.roborio = true;
		if (openState.sparkmax) loadedState.sparkmax = true;
		if (openState.sparkflex) loadedState.sparkflex = true;
		if (openState.talonfx) loadedState.talonfx = true;
		if (openState.talonsrx) loadedState.talonsrx = true;
		if (openState.victorspx) loadedState.victorspx = true;
		if (openState.canivore) loadedState.canivore = true;
		if (openState.pigeon) loadedState.pigeon = true;
		if (openState.pdh) loadedState.pdh = true;
		if (openState.cancoder) loadedState.cancoder = true;
		if (openState.ctrepdp) loadedState.ctrepdp = true;
	}

	addEventListener("load", async () => {
		// Once the page is loaded, wait 100ms, then generate the QR codes
		await new Promise((r) => setTimeout(r, 100));
		loadedState.radio = true;
		loadedState.roborio = true;
		loadedState.sparkmax = true;
		loadedState.sparkflex = true;
		loadedState.talonfx = true;
		loadedState.talonsrx = true;
		loadedState.victorspx = true;
		loadedState.canivore = true;
		loadedState.pigeon = true;
		loadedState.pdh = true;
		loadedState.cancoder = true;
		loadedState.ctrepdp = true;
	});
</script>

<div class="container mx-auto p-2 pr-3 w-full">
	<h1 class="text-3xl" style="font-weight: bold">Component Manuals</h1>
	<p>To visit the links, please click or scan the QR Codes</p>

	<Accordion flush class="text-left">
		<AccordionItem class="text-black dark:text-white" bind:open={openState.radio}>
			<span slot="header" class="font-bold">
				<div class="flex flex-row gap-x-5">
					<CustomIcon type="/component_icons/vividhostingradio"></CustomIcon>
					<h1 class="pt-3">VividHosting Robot Radio</h1>
				</div>
			</span>
			{#if openState.radio === true || loadedState.radio === true}
				<a href="https://frc-radio.vivid-hosting.net/" target="_blank"><QrCode value="https://frc-radio.vivid-hosting.net/" padding={12} /></a>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.roborio}>
			<span slot="header" class="font-bold">
				<div class="flex flex-row gap-x-5">
					<CustomIcon type="/component_icons/roborio2"></CustomIcon>
					<h1 class="pt-3">RoboRIO 2</h1>
				</div>
			</span>			{#if openState.roborio === true || loadedState.roborio === true}
				<a
					href="https://www.ni.com/docs/en-US/bundle/roborio-20-umanual/page/umanual.html"
					target="_blank"
					><QrCode
						value="https://www.ni.com/docs/en-US/bundle/roborio-20-umanual/page/umanual.html"
						padding={12}
					/></a
				>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.sparkmax}>
			<span slot="header" class="font-bold">
				<div class="flex flex-row gap-x-5">
					<CustomIcon type="/component_icons/revsparkmax"></CustomIcon>
					<h1 class="pt-3">REV SparkMax</h1>
				</div>
			</span>
			{#if openState.sparkmax === true || loadedState.sparkmax === true}
				<a href="https://docs.revrobotics.com/brushless/spark-max/overview/" target="_blank"
					><QrCode value="https://docs.revrobotics.com/brushless/spark-max/overview" padding={12} /></a
				>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.sparkflex}>
			<span slot="header" class="font-bold">
				<div class="flex flex-row gap-x-5">
					<CustomIcon type="/component_icons/revsparkflex"></CustomIcon>
					<h1 class="pt-3">REV SparkFlex</h1>
				</div>
			</span>
			{#if openState.sparkflex === true || loadedState.sparkflex === true}
				<a href="https://docs.revrobotics.com/brushless/spark-flex/overview" target="_blank"
					><QrCode value="https://docs.revrobotics.com/brushless/spark-flex/overview" padding={12} /></a
				>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.talonfx}>
			<span slot="header" class="font-bold">
				<div class="flex flex-row gap-x-5">
					<CustomIcon type="/component_icons/ctretalonfxkraken"></CustomIcon>
					<h1 class="pt-3">CTRE TalonFX</h1>
				</div>
			</span>
			{#if openState.talonfx === true || loadedState.talonfx === true}
				<a href="https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/talonfx/" target="_blank"
					><QrCode value="https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/talonfx/" padding={12} /></a
				>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.talonsrx}>
			<span slot="header" class="font-bold">
				<div class="flex flex-row gap-x-5">
					<CustomIcon type="/component_icons/ctretalonsrx"></CustomIcon>
					<h1 class="pt-3">CTRE TalonSRX</h1>
				</div>
			</span>
			{#if openState.talonsrx === true || loadedState.talonsrx === true}
				<a href="https://ctre.download/files/user-manual/Talon%20SRX%20User's%20Guide.pdf" target="_blank"
					><QrCode value="https://ctre.download/files/user-manual/Talon%20SRX%20User's%20Guide.pdf" padding={12} /></a
				>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.victorspx}>
			<span slot="header" class="font-bold">
				<div class="flex flex-row gap-x-5">
					<CustomIcon type="/component_icons/ctrevictorspx"></CustomIcon>
					<h1 class="pt-3">CTRE VictorSPX</h1>
				</div>
			</span>
			{#if openState.victorspx === true || loadedState.victorspx === true}
				<a href="https://ctre.download/files/user-manual/Victor%20SPX%20User's%20Guide.pdf" target="_blank"
					><QrCode value="https://ctre.download/files/user-manual/Victor%20SPX%20User's%20Guide.pdf" padding={12} /></a
				>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.canivore}>
			<span slot="header" class="font-bold">
				<div class="flex flex-row gap-x-5">
					<CustomIcon type="/component_icons/ctrecanivore"></CustomIcon>
					<h1 class="pt-3">CTRE CANivore</h1>
				</div>
			</span>
			{#if openState.canivore === true || loadedState.canivore === true}
				<a href="https://ctre.download/files/user-manual/CANivore%20User's%20Guide.pdf" target="_blank"
					><QrCode value="https://ctre.download/files/user-manual/CANivore%20User's%20Guide.pdf" padding={12} /></a
				>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.pigeon}>
			<span slot="header" class="font-bold">
				<div class="flex flex-row gap-x-5">
					<CustomIcon type="/component_icons/ctrepigeon"></CustomIcon>
					<h1 class="pt-3">CTRE Pigeon 2.0</h1>
				</div>
			</span>
			{#if openState.pigeon === true || loadedState.pigeon === true}
				<a href="https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/pigeon2/" target="_blank"
					><QrCode value="https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/pigeon2/" padding={12} /></a
				>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.pdh}>
			<span slot="header" class="font-bold">
				<div class="flex flex-row gap-x-5">
					<CustomIcon type="/component_icons/revpdh"></CustomIcon>
					<h1 class="pt-3">REV PDH (Power Distribution Hub)</h1>
				</div>
			</span>
			{#if openState.pdh === true || loadedState.pdh === true}
				<a href="https://docs.revrobotics.com/ion-control-system/pdh/overview" target="_blank"
					><QrCode value="https://docs.revrobotics.com/ion-control-system/pdh/overview" padding={12} /></a
				>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.cancoder}>
			<span slot="header" class="font-bold">CTRE CANcoder</span>
			{#if openState.cancoder === true || loadedState.cancoder === true}
				<a href="https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/cancoder/index.html" target="_blank"
					><QrCode value="https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/cancoder/index.html" padding={5} /></a
				>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctrepdp}>
			<span slot="header" class="font-bold">
				<div class="flex flex-row gap-x-5">
					<CustomIcon type="/component_icons/ctrepdp"></CustomIcon>
					<h1 class="pt-3">CTRE PDP (Power Distribution Panel)</h1>
				</div>
			</span>
			{#if openState.ctrepdp === true || loadedState.ctrepdp === true}
				<a href="https://ctre.download/files/user-manual/PDP%20User's%20Guide.pdf" target="_blank"
					><QrCode value="https://ctre.download/files/user-manual/PDP%20User's%20Guide.pdf" padding={5} /></a
				>
			{/if}
		</AccordionItem>
	</Accordion>
</div>
