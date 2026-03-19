<script lang="ts">
	import { Accordion, AccordionItem, Modal } from "flowbite-svelte";
	import { onDestroy } from "svelte";

	let enlargedSrc = $state<string | null>(null);
	let enlargedAlt = $state<string>('');
	let modalOpen = $state(false);

	function enlarge(src: string, alt: string) {
		enlargedSrc = src;
		enlargedAlt = alt;
		modalOpen = true;
	}

	function onModalClose() {
		setTimeout(() => { enlargedSrc = null; }, 300);
	}

	// Consolidated LED toggle states
	let LEDToggleState = $state({
		"1Hz": true,
		"2Hz": true,
		"10Hz": true,
		"8Hz": true,
		"20Hz": true,
		"50Hz": true,
		"3Hz": true,
		"6Hz": true,
	});

	let LEDOffsetToggleState3Hz = $state(0);
	let LEDBlinkState = $state({
		"2Blink": 0,
		"3Blink": 0,
		"4Blink": 0,
	});

	const componentKeys = [
		"radio",
		"roborio",
		"revsparkmax",
		"revsparkflex",
		"revpowerdistributionhub",
		"revpneumaticshub",
		"ctretalonfx",
		"ctretalonfxs",
		"ctretalonsrx",
		"ctrevictorspx",
		"ctrecanivore",
		"ctrepigeon",
		"ctrecancoder",
		"ctretbcancoder",
		"ctrecanrange",
		"ctrecandle",
		"ctrepowerdistributionpanel",
		"ctrepneumaticscontrolmodule",
	];

	let openState = $state(Object.fromEntries(componentKeys.map((k) => [k, false])));
	let loadedState = $state(Object.fromEntries(componentKeys.map((k) => [k, false])));

	$effect(() => {
		for (const key of componentKeys) {
			if (openState[key]) loadedState[key] = true;
		}
	});

	function toggleLED(freq: keyof typeof LEDToggleState) {
		LEDToggleState[freq] = !LEDToggleState[freq];
	}

	function toggleBlink(blinkKey: keyof typeof LEDBlinkState, max: number) {
		LEDBlinkState[blinkKey] = (LEDBlinkState[blinkKey] + 1) % max;
	}

	function toggleLEDOffset3Hz() {
		LEDOffsetToggleState3Hz = (LEDOffsetToggleState3Hz + 1) % 3;
	}

	let timers = [
		{ fn: () => toggleLED("1Hz"), interval: 1000 },
		{ fn: () => toggleLED("2Hz"), interval: 500 },
		{ fn: () => toggleLED("20Hz"), interval: 50 },
		{ fn: () => toggleLED("10Hz"), interval: 100 },
		{ fn: () => toggleLED("8Hz"), interval: 125 },
		{ fn: () => toggleLED("3Hz"), interval: 300 },
		{ fn: () => toggleLED("6Hz"), interval: 166 },
		{ fn: () => toggleLED("50Hz"), interval: 20 },
		{ fn: () => toggleBlink("2Blink", 5), interval: 300 },
		{ fn: () => toggleBlink("3Blink", 7), interval: 300 },
		{ fn: () => toggleBlink("4Blink", 9), interval: 300 },
		{ fn: toggleLEDOffset3Hz, interval: 300 },
	];

	const activeTimers = timers.map(({ fn, interval }) => setInterval(fn, interval));
	onDestroy(() => activeTimers.forEach(clearInterval));

	function blinkClass(blinkKey: keyof typeof LEDBlinkState, pattern: string[]): string {
		const index = LEDBlinkState[blinkKey];
		return pattern[index] ?? "black led";
	}
</script>

<Modal
	bind:open={modalOpen}
	size="xl"
	outsideclose
	onclose={onModalClose}
>
	{#if enlargedSrc}
		<img src={enlargedSrc} alt={enlargedAlt} class="w-full h-auto rounded-lg" style="background-color: white;"/>
	{/if}
</Modal>

<div class="container w-full flex flex-col h-full mx-auto gap-2 overflow-y-auto">
	<h1 class="text-3xl" style="font-weight: bold">Status Lights</h1>

	<!-- Main Accordion -->
	<Accordion flush class="text-left">
		<!-- General Devices -->
		<br />
		<h1 class="text-xl text-white" style="font-weight: bold">General Devices</h1>

		<!-- Robot Radio -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.radio}>
			{#snippet header()} 
				<div class="flex flex-row items-center">
					<button
						onclick={(e) => {
							e.stopPropagation();
							enlarge("/references/components/images/radio-large.webp", 'VH-109 Robot Radio')
						}}
						class="cursor-zoom-in rounded hover:ring-2 hover:ring-blue-400 transition"
						title="Click to enlarge"
					>
						<img src="/references/components/icons/radio.webp" width="72px" alt="VH-109 Robot Radio" style="background-color: white;" class="ml-2"/>
					</button>
					<div class="ml-8">Robot Radio VH-109</div>
				</div>
			{/snippet}
			<div class="flex flex-col pl-1" style="max-width: 375px;">
				<img src="/vh109.png" width="325px" alt="Radio with LEDs labeled" class="mb-4 place-self-center"/>

				{#if openState.radio === true || loadedState.radio === true}
					<table class="text-black dark:text-white" >
						<tbody>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="">
												<td colspan="2" class="bold w-100 pt-2 pl-1 border-b-2 border-b-gray-600 ">No Power</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="black led"> </span></td>
												<td>All LEDs</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Powered + Booting</td>
											</tr>
											<tr class="border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>Power</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td>System Status</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Powered + Unable to Ping Field</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>Power</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["1Hz"] === true ? "black led" : "green led"}></span></td>
												<td>System Status</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Powered + Flashing Firmware</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>Power</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["20Hz"] === true ? "black led" : "green led"}></span> </td>
												<td>System Status</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Powered + Firmware Flashed + In First Boot</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>Power</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["50Hz"] === true ? "black led" : "green led"}></span> </td>
												<td>System Status</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Radio in AP Mode with Battery Detected</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>Power</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["20Hz"] === true ? "black led" : "green led"}></span> </td>
												<td>System Status</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["20Hz"] === true ? "black led" : "green led"}></span> </td>
												<td>2.4GHz</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["20Hz"] === true ? "black led" : "green led"}></span> </td>
												<td>6GHz</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Powered + Able to Ping Field</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>Power</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>System Status</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">No Robot Radio Link</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>Power</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>System Status</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td>2.4GHz</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td>6GHz</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td>RIO Link</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">2.4GHz Connection Enabled</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>2.4GHz</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">6GHz Connection Enabled</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>6GHz</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Valid RIO Connection</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>RIO Link</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">DIP Switches</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-10 py-1">1</td>
												<td>Aux1 POE passthrough</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-10 py-1">2</td>
												<td>Aux2 POE passthrough</td>
											</tr>
											<tr>
												<td class="w-20 pl-10 py-1">3</td>
												<td>N/A (controlled in software)</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<a class="underline text-sm px-2 place-self-end pt-2" href="https://frc-radio.vivid-hosting.net/overview/led-status-indications">Source Link</a>
				{/if}
			</div>
		</AccordionItem>

		<!-- RoboRIO -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.roborio}>
			{#snippet header()}
				<div class="flex flex-row items-center">
					<button
						onclick={(e) => {
							e.stopPropagation();
							enlarge("/references/components/images/roborio-large.webp", 'RoboRIO 2.0')
						}}
						class="cursor-zoom-in rounded hover:ring-2 hover:ring-blue-400 transition"
						title="Click to enlarge"
					>
						<img src="/references/components/icons/roborio.webp" width="72px" alt="RoboRIO 2.0" style="background-color: white;" class="ml-2"/>
					</button>
					<div class="ml-8">RoboRIO 2.0</div>
				</div>			
			{/snippet}

			{#if openState.roborio === true || loadedState.roborio === true}
				<div class="flex flex-col pl-1" style="max-width: 375px;">
					<table cellpadding="5" cellspacing="0" class="text-black dark:text-white">
						<tbody>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Power</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>OK</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="orange led"></span> </td>
												<td>Brownout</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="red led"></span> </td>
												<td>Fault, check for short</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Status</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td>OK</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2">
													<span class="{blinkClass('2Blink', [
														'orange',
														'black',
														'orange',
														'black',
														'black',
													])} led">
													</span>
												</td>
												<td>(2 Blinks) Software error, reimage device</td>
											</tr>

											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2">
													<span class="{blinkClass('3Blink', [
														'orange',
														'black',
														'orange',
														'black',
														'orange',
														'black',
														'black',
													])} led">
													</span>
												</td>
												<td>(3 Blinks) Safe Mode, restart, reimage if not resolved</td>
											</tr>

											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2">
													<span class="{blinkClass('4Blink', [
														'orange',
														'black',
														'orange',
														'black',
														'orange',
														'black',
														'orange',
														'black',
														'black',
													])} led">
													</span>
												</td>
												<td>(4 Blinks) Software crashed twice without rebooting: reboot,
													reimage if not resolved</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="orange led"></span> </td>
												<td>Unrecoverable error</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Radio</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td>Ignore</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Comm</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td>No Comms</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="red led"></span> </td>
												<td>Comms, no code</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span> </td>
												<td>E-Stop</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>OK</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Mode</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td>Disabled</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="orange led"></span> </td>
												<td>Auto</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>Teleop</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="red led"></span> </td>
												<td>Test</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">RSL (Reflects RSL State)</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="red led"></span> </td>
												<td>Disabled</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span> </td>
												<td>Enabled</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td>Robot Off, No roboRIO Power, or No RSL Power</td>
											</tr>
										</tbody>
									</table>
									<p class="text-sm mt-2 ml-2 italic">
										Note: Rapid or erratic RSL blinking may indicate insufficient power to the roboRIO.
									</p>
								</td>
							</tr>
						</tbody>
					</table>
					<a class="underline text-sm px-2 place-self-end pt-2" href="https://docs.wpilib.org/en/stable/docs/hardware/hardware-basics/status-lights-ref.html#roborio">Source Link</a>
				</div>
			{/if}
		</AccordionItem>

		<!-- REV Devices -->
		<br /> <br />
		<h1 class="text-xl text-white" style="font-weight: bold">REV Devices</h1>

		<!-- REV Spark Max -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.revsparkmax}>
			{#snippet header()}
				<div class="flex flex-row items-center">
					<button
						onclick={(e) => {
							e.stopPropagation();
							enlarge("/references/components/images/rev-sparkmax-large.webp", 'REV SparkMax')
						}}
						class="cursor-zoom-in rounded hover:ring-2 hover:ring-blue-400 transition"
						title="Click to enlarge"
					>
						<img src="/references/components/icons/rev-sparkmax.webp" width="72px" alt="REV SparkMax" style="background-color: white;" class="ml-2"/>
					</button>
					<div class="ml-8">REV SparkMax</div>
				</div>
			{/snippet}

			{#if openState.revsparkmax === true || loadedState.revsparkmax === true}
				<div class="flex flex-col pl-1" style="max-width: 375px;">
					<table cellpadding="5" cellspacing="0" class="text-black dark:text-white">
						<tbody>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Brushless Mode</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "cyan led" : "black led"}></span> </td>
												<td>Brake No Signal</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="cyan led"></span> </td>
												<td>Brake Valid Signal</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "magenta led" : "black led"}></span></td>
												<td>Coast No Signal</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="magenta led"></span> </td>
												<td>Coast Valid Signal</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Brushed Mode</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "blue led" : "black led"}></span> </td>
												<td>Brake No Signal</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="blue led"></span> </td>
												<td>Brake Valid Signal</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "yellow led" : "black led"}></span></td>
												<td>Coast No Signal</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="yellow led"></span> </td>
												<td>Coast Valid Signal</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Fault Conditions</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["1Hz"] === true ? "magenta led" : "orange led"}></span></td>
												<td>Sensor Fault</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["1Hz"] === true ? "blue led" : "orange led"}></span></td>
												<td>12V Missing</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["1Hz"] === true ? "cyan led" : "orange led"}></span></td>
												<td>Gate Driver Fault</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["1Hz"] === true ? "yellow led" : "orange led"}></span></td>
												<td>CAN Fault</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td>Corrupt Firmware</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Identification, Updating, and Recovery</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["20Hz"] === true ? "magenta led" : "white led"}></span></td>
												<td>Identify</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["1Hz"] === true ? "magenta led" : "yellow led"}></span></td>
												<td>CAN Firmware Updating v1.5.0</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["1Hz"] === true ? "green led" : "magenta led"}></span></td>
												<td>CAN Firmware Updating v1.4.0</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["1Hz"] === true ? "white led" : "blue led"}></span> </td>
												<td>CAN Firmware Retry</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td>USB Device Firmware Update</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td>Recovery Mode</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Movement</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td>Partial Forward</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>Full Forward</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span> </td>
												<td>Partial Reverse</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="red led"></span> </td>
												<td>Full Reverse</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "white led"}></span></td>
												<td>Forward Limit</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "white led"}></span> </td>
												<td>Reverse Limit</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<a class="underline text-sm px-2 place-self-end pt-2" href="https://docs.revrobotics.com/brushless/spark-max/status-led">Source Link</a>
				</div>
			{/if}
		</AccordionItem>

		<!-- REV Spark Flex -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.revsparkflex}>
			{#snippet header()}
				<div class="flex flex-row items-center">
					<button
						onclick={(e) => {
							e.stopPropagation();
							enlarge("/references/components/images/rev-sparkflex-large.webp", 'REV SparkFlex')
						}}
						class="cursor-zoom-in rounded hover:ring-2 hover:ring-blue-400 transition"
						title="Click to enlarge"
					>
						<img src="/references/components/icons/rev-sparkflex.webp" width="72px" alt="REV SparkFlex" style="background-color: white;" class="ml-2"/>
					</button>
					<div class="ml-8">REV SparkFlex</div>
				</div>
			{/snippet}

			{#if openState.revsparkflex === true || loadedState.revsparkflex === true}
				<div class="flex flex-col pl-1" style="max-width: 375px;">
					<table cellpadding="5" cellspacing="0" class="text-black dark:text-white" style="max-width: 375px;">
						<tbody>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="3" class="bold w-100 pt-2 pl-2">Brushless Mode</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "cyan led" : "black led"}></span> </td>
												<td>Brake No Signal</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="cyan led"></span> </td>
												<td>Brake Valid Signal</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "magenta led" : "black led"}></span></td>
												<td>Coast No Signal</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="magenta led"></span> </td>
												<td>Coast Valid Signal</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="3" class="bold w-100 pt-2 pl-2">Brushed Mode</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "blue led" : "black led"}></span> </td>
												<td>Brake No Signal</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="blue led"></span> </td>
												<td>Brake Valid Signal</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "yellow led" : "black led"}></span></td>
												<td>Coast No Signal</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="yellow led"></span> </td>
												<td>Coast Valid Signal</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="3" class="bold w-100 pt-2 pl-2">Fault Modes</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["1Hz"] === true ? "orange led" : "magenta led"}></span></td>
												<td>Sensor Fault</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["1Hz"] === true ? "orange led" : "blue led"}></span></td>
												<td>12V Missing</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["1Hz"] === true ? "orange led" : "cyan led"}></span></td>
												<td>Gate Driver Fault</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["1Hz"] === true ? "orange led" : "yellow led"}></span></td>
												<td>CAN Fault</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["1Hz"] === true ? "orange led" : "green led"}></span></td>
												<td>Temperature Fault</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td>Corrupt Firmware</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="3" class="bold w-100 pt-2 pl-2">Identification, Updating, and Recovery</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["20Hz"] === true ? "white led" : "magenta led"}></span></td>
												<td>Identify</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "white led" : "yellow led"}></span></td>
												<td>CAN Firmware Updating</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "white led" : "blue led"}></span> </td>
												<td>CAN Firmware Retry</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td>USB Device Firmware Update</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td>Recovery Mode</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Movement</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td>Partial Forward</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>Full Forward</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span> </td>
												<td>Partial Reverse</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="red led"></span> </td>
												<td>Full Reverse</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "white led"}></span></td>
												<td>Forward Limit</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "white led"}></span> </td>
												<td>Reverse Limit</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<a class="underline text-sm px-2 place-self-end pt-2" href="https://docs.revrobotics.com/brushless/spark-flex/status-led">Source Link</a>
				</div>
			{/if}
		</AccordionItem>

		<!-- REV Power Distribution Hub -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.revpowerdistributionhub}>
			{#snippet header()}
				<div class="flex flex-row items-center">
					<button
						onclick={(e) => {
							e.stopPropagation();
							enlarge("/references/components/images/rev-pdh-large.webp", 'REV Power Distribution Hub')
						}}
						class="cursor-zoom-in rounded hover:ring-2 hover:ring-blue-400 transition"
						title="Click to enlarge"
					>
						<img src="/references/components/icons/rev-pdh.webp" width="72px" alt="REV Power Distribution Hub" style="background-color: white;" class="ml-2"/>
					</button>
					<div class="ml-8">REV Power Distribution Hub</div>
				</div>
			{/snippet}

			{#if openState.revpowerdistributionhub === true || loadedState.revpowerdistributionhub === true}
				<div class="flex flex-col pl-1" style="max-width: 375px;">
					<table cellpadding="5" cellspacing="0" class="text-black dark:text-white">
						<tbody>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">General Status</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="blue led"></span> </td>
												<td>No communication established</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>RoboRIO communication established</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="cyan led"></span> </td>
												<td>Connected to REV Hardware Client</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "magenta led" : "black led"}></span></td>
												<td>Keep Alive Timeout</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "blue led"}></span></td>
												<td>Low Battery</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "yellow led"}></span></td>
												<td>CAN Fault</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "cyan led"}></span></td>
												<td>Hardware Fault</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "magenta led"}></span></td>
												<td>Device Over Current</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Channel Status</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td>Has voltage and normal operation</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="red led"></span> </td>
												<td>No voltage and active fault</td>
											</tr>
											<tr >
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span> </td>
												<td>Sticky fault</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Switched Channel</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td>Has voltage and normal operation</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="red led"></span> </td>
												<td>No voltage and active fault</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span> </td>
												<td>Sticky fault</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<a class="underline text-sm px-2 place-self-end pt-2" href="https://docs.revrobotics.com/ion-control/pdh/status-led">Source Link</a>
				</div>
			{/if}
		</AccordionItem>

		<!-- REV Pneumatics Hub -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.revpneumaticshub}>
			{#snippet header()}
				<div class="flex flex-row items-center">
					<button
						onclick={(e) => {
							e.stopPropagation();
							enlarge("/references/components/images/rev-pneumatic-hub-large.webp", 'REV Pneumatic Hub')
						}}
						class="cursor-zoom-in rounded hover:ring-2 hover:ring-blue-400 transition"
						title="Click to enlarge"
					>
						<img src="/references/components/icons/rev-pneumatic-hub.webp" width="72px" alt="REV Pneumatic Hub" style="background-color: white;" class="ml-2"/>
					</button>
					<div class="ml-8">REV Pneumatic Hub</div>
				</div>
			{/snippet}

			{#if openState.revpneumaticshub === true || loadedState.revpneumaticshub === true}
				<div class="flex flex-col pl-1" style="max-width: 375px;">
					<table cellpadding="5" cellspacing="0" class="text-black dark:text-white">
						<tbody>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">General Status</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="blue led"></span> </td>
												<td>No communication established</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>RoboRIO communication established</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="cyan led"></span> </td>
												<td>Secondary Heartbeat</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "magenta led" : "black led"}></span></td>
												<td>Keep Alive Timeout</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "cyan led"}></span></td>
												<td>Hardware Fault</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "yellow led"}></span></td>
												<td>CAN Fault</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "green led"}></span></td>
												<td>Compressor Over Current</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "magenta led"}></span></td>
												<td>Device Over Current</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Compressor Status</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td>Compressor OFF</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>Compressor ON</td>
											</tr></tbody
										>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Solenoid Status</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td>Solenoid OFF</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="green led"></span> </td>
												<td>Solenoid ON</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<a class="underline text-sm px-2 place-self-end pt-2" href="https://docs.revrobotics.com/ion-control/ph/status-led">Source Link</a>
				</div>
			{/if}
		</AccordionItem>

		<!-- CTRE Devices -->
		<br /> <br />
		<h1 class="text-xl text-white" style="font-weight: bold">CTRE Devices</h1>

		<!-- CTRE Talon FX -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctretalonfx}>
			{#snippet header()}
				<div class="flex flex-row items-center">
					<button
						onclick={(e) => {
							e.stopPropagation();
							enlarge("/references/components/images/ctre-talonfx-large.webp", 'CTRE TalonFX')
						}}
						class="cursor-zoom-in rounded hover:ring-2 hover:ring-blue-400 transition"
						title="Click to enlarge"
					>
						<img src="/references/components/icons/ctre-talonfx.webp" width="72px" alt="CTRE TalonFX" style="background-color: white;" class="ml-2"/>
					</button>
					<div class="ml-8">CTRE TalonFX</div>
				</div>
			{/snippet}

			{#if openState.ctretalonfx === true || loadedState.ctretalonfx === true}
				<div class="flex flex-col pl-1" style="max-width: 375px;">
					<table cellpadding="5" cellspacing="0" class="text-black dark:text-white" style="max-width: 375px;">
						<tbody>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="3" class="bold w-100 pt-2 pl-2">Disabled Codes</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class="black led"></span> </td>
												<td class="w-1/6 pl-2 pt-2"><span class="black led"></span> </td>
												<td class="w-2/3">No Power</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "black led"}></span></td>
												<td class="w-1/6 pl-2 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "black led"}></span></td>
												<td class="w-2/3">Valid CAN/PWM Signal, Robot is Disabled, Phoenix is Running </td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "black led"}></span></td>
												<td class="w-1/6 pl-2 pt-2"><span class={LEDToggleState["3Hz"] === false ? "orange led" : "black led"}></span></td>
												<td class="w-2/3">Valid CAN/PWM, Phoenix is NOT Detected</td>
											</tr>
											<tr>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span></td>
												<td class="w-1/6 pl-2 pt-2"><span class={LEDToggleState["3Hz"] === false ? "red led" : "black led"}></span></td>
												<td class="w-2/3">Invalid CAN/PWM Signal</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="3" class="bold w-100 pt-2 pl-2">Enabled Codes</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class="orange led"></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class="orange led"></span> </td>
												<td class="w-2/3">Enabled with Neutral Output</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span></td>
												<td class="w-2/3">Driving in Reverse, Rate = DutyCycle</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td class="w-2/3">Driving in Forward, Rate = DutyCycle</td>
											</tr>
											<tr>
												<td class="w-1/6 pl-8 pt-2">
													<span 
														class={LEDOffsetToggleState3Hz === 0
															? "red led"
															: LEDOffsetToggleState3Hz === 1
																? "black led"
																: LEDOffsetToggleState3Hz === 2
																	? "black led"
																	: "black led"}
													></span>
												</td>
												<td class="w-1/6 pl-8 pt-2">
													<span 
														class={LEDOffsetToggleState3Hz === 0
															? "black led"
															: LEDOffsetToggleState3Hz === 1
																? "red led"
																: LEDOffsetToggleState3Hz === 2
																	? "black led"
																	: "black led"}
													></span>
												</td>
												<td class="w-2/3">Talon Limited, Offset Direction = Forward/Reverse</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="3" class="bold w-100 pt-2 pl-2">Special Codes</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2">
													<span 
														class={LEDOffsetToggleState3Hz === 0
															? "orange led"
															: LEDOffsetToggleState3Hz === 1
																? "black led"
																: LEDOffsetToggleState3Hz === 2
																	? "black led"
																	: "black led"}
													></span>
												</td>
												<td class="w-1/6 pl-8 pt-2">
													<span 
														class={LEDOffsetToggleState3Hz === 0
															? "black led"
															: LEDOffsetToggleState3Hz === 1
																? "orange led"
																: LEDOffsetToggleState3Hz === 2
																	? "black led"
																	: "black led"}
													></span>
												</td>
												<td class="w-2/3">Thermal Cutoff Warning</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "green led"}></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "red led" : "green led"}></span> </td>
												<td class="w-2/3">Using Pro Command without License</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "orange led"}></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "red led" : "orange led"}></span> </td>
												<td class="w-2/3">Damaged Hardware</td>
											</tr>
											<tr>
												<td class="w-1/6 pl-8 pt-2"><span class="black led"></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "orange led"}></span> </td>
												<td class="w-2/3">Limit Switch/Soft Limit</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<a class="underline text-sm px-2 place-self-end pt-2" href="https://v6.docs.ctr-electronics.com/en/2025/docs/hardware-reference/talonfx/index.html#status-light-reference">Source Link</a>
				</div>
			{/if}
		</AccordionItem>

		<!-- CTRE Talon FXS -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctretalonfxs}>
			{#snippet header()}
				<div class="flex flex-row items-center">
					<button
						onclick={(e) => {
							e.stopPropagation();
							enlarge("/references/components/images/ctre-talonfxs-large.webp", 'CTRE TalonFXS')
						}}
						class="cursor-zoom-in rounded hover:ring-2 hover:ring-blue-400 transition"
						title="Click to enlarge"
					>
						<img src="/references/components/icons/ctre-talonfxs.webp" width="72px" alt="CTRE TalonFXS" style="background-color: white;" class="ml-2"/>
					</button>
					<div class="ml-8">CTRE TalonFXS</div>
				</div>
			{/snippet}

			{#if openState.ctretalonfxs === true || loadedState.ctretalonfxs === true}
				<div class="flex flex-col pl-1" style="max-width: 375px;">
					<table cellpadding="5" cellspacing="0" class="text-black dark:text-white">
						<tbody>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="3" class="bold w-100 pt-2 pl-2">Disabled Codes</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class="black led"></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class="black led"></span> </td>
												<td class="w-2/3">No Power</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "black led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "black led"}></span></td>
												<td class="w-2/3">Valid CAN/PWM Signal, Robot is Disabled, Phoenix is Running </td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "black led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "orange led" : "black led"}></span></td>
												<td class="w-2/3">Valid CAN/PWM, Phoenix is NOT Detected</td>
											</tr>
											<tr>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "red led" : "black led"}></span></td>
												<td class="w-2/3">Invalid CAN/PWM Signal</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="3" class="bold w-100 pt-2 pl-2">Enabled Codes</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class="orange led"></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class="orange led"></span> </td>
												<td class="w-2/3">Enabled with Neutral Output</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span></td>
												<td class="w-2/3">Driving in Reverse, Rate = DutyCycle</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td class="w-2/3">Driving in Forward, Rate = DutyCycle</td>
											</tr>
											<tr>
												<td class="w-1/6 pl-8 pt-2">
													<span 
														class={LEDOffsetToggleState3Hz === 0
															? "red led"
															: LEDOffsetToggleState3Hz === 1
																? "black led"
																: LEDOffsetToggleState3Hz === 2
																	? "black led"
																	: "black led"}
													></span>
												</td>
												<td class="w-1/6 pl-8 pt-2">
													<span 
														class={LEDOffsetToggleState3Hz === 0
															? "black led"
															: LEDOffsetToggleState3Hz === 1
																? "red led"
																: LEDOffsetToggleState3Hz === 2
																	? "black led"
																	: "black led"}
													></span>
												</td>
												<td class="w-2/3">Talon Limited, Offset Direction = Forward/Reverse</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="3" class="bold w-100 pt-2 pl-2">Special Codes</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2">
													<span 
														class={LEDOffsetToggleState3Hz === 0
															? "orange led"
															: LEDOffsetToggleState3Hz === 1
																? "black led"
																: LEDOffsetToggleState3Hz === 2
																	? "black led"
																	: "black led"}
													></span>
												</td>
												<td class="w-1/6 pl-8 pt-2">
													<span 
														class={LEDOffsetToggleState3Hz === 0
															? "black led"
															: LEDOffsetToggleState3Hz === 1
																? "orange led"
																: LEDOffsetToggleState3Hz === 2
																	? "black led"
																	: "black led"}
													></span>
												</td>
												<td class="w-2/3">Thermal Cutoff Warning</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "green led"}></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "red led" : "green led"}></span> </td>
												<td class="w-2/3">Using Pro Command without License</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "orange led"}></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "red led" : "orange led"}></span> </td>
												<td class="w-2/3">Damaged Hardware</td>
											</tr>
											<tr>
												<td class="w-1/6 pl-8 pt-2"><span class="black led"></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "orange led"}></span> </td>
												<td class="w-2/3">Limit Switch/Soft Limit</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<a class="underline text-sm px-2 place-self-end pt-2" href="https://v6.docs.ctr-electronics.com/en/2025/docs/hardware-reference/talonfxs/index.html#supported-motors">Source Link</a>
				</div>
			{/if}
		</AccordionItem>

		<!-- CTRE Talon SRX -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctretalonsrx}>
			{#snippet header()}
				<div class="flex flex-row items-center">
					<button
						onclick={(e) => {
							e.stopPropagation();
							enlarge("/references/components/images/ctre-talonsrx-large.webp", 'CTRE TalonSRX')
						}}
						class="cursor-zoom-in rounded hover:ring-2 hover:ring-blue-400 transition"
						title="Click to enlarge"
					>
						<img src="/references/components/icons/ctre-talonsrx.webp" width="72px" alt="CTRE TalonSRX" style="background-color: white;" class="ml-2"/>
					</button>
					<div class="ml-8">CTRE TalonSRX</div>
				</div>
			{/snippet}

			{#if openState.ctretalonsrx === true || loadedState.ctretalonsrx === true}
				<div class="flex flex-col pl-1" style="max-width: 375px;">
					<table cellpadding="5" cellspacing="0" class="text-black dark:text-white">
						<tbody>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="3" class="bold w-100 pt-2 pl-2">Calibration Codes</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "green led"}></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "red led"}></span> </td>
												<td class="w-2/3">Calibration in Progress</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td class="w-2/3">Successful Calibration</td>
											</tr>
											<tr>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span> </td>
												<td class="w-2/3">Failed Calibration</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="3" class="bold w-100 pt-2 pl-2">Normal Operation Codes</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class="black led"></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class="black led"></span> </td>
												<td class="w-2/3">No Power</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td class="w-2/3">Driving in Forward, Rate = DutyCycle</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span> </td>
												<td class="w-2/3">Driving in Reverse, Rate = DutyCycle</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "black led" : "orange led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "black led" : "orange led"}></span></td>
												<td class="w-2/3">CAN/PWM Detected, Robot Disabled</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "black led" : "red led"}></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "black led" : "red led"}></span> </td>
												<td class="w-2/3">CAN/PWM Not Detected</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "red led"}></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "orange led" : "red led"}></span></td>
												<td class="w-2/3">Damaged Hardware</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2">
													<span
														class={LEDOffsetToggleState3Hz === 0
															? "red led"
															: LEDOffsetToggleState3Hz === 1
																? "black led"
																: LEDOffsetToggleState3Hz === 2
																	? "black led"
																	: "black led"}
													></span>
												</td>
												<td class="w-1/6 pl-8 pt-2">
													<span
														class={LEDOffsetToggleState3Hz === 0
															? "black led"
															: LEDOffsetToggleState3Hz === 1
																? "red led"
																: LEDOffsetToggleState3Hz === 2
																	? "black led"
																	: "black led"}
													></span>
												</td>
												<td class="w-2/3">Forward Soft/Hard Limit Triggered</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2">
													<span
														class={LEDOffsetToggleState3Hz === 0
															? "black led"
															: LEDOffsetToggleState3Hz === 1
																? "red led"
																: LEDOffsetToggleState3Hz === 2
																	? "black led"
																	: "black led"}
													></span>
												</td>
												<td class="w-1/6 pl-8 pt-2">
													<span
														class={LEDOffsetToggleState3Hz === 0
															? "red led"
															: LEDOffsetToggleState3Hz === 1
																? "black led"
																: LEDOffsetToggleState3Hz === 2
																	? "black led"
																	: "black led"}
													></span>
												</td>
												<td class="w-2/3">Reverse Soft/Hard Limit Triggered</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class="black led"></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "orange led" : "green led"}></span></td>
												<td class="w-2/3">In Boot Loader</td>
											</tr>
											<tr>
												<td class="w-1/6 pl-8 pt-2"><span class="orange led"></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class="orange led"></span> </td>
												<td class="w-2/3">Neutral Signal Applied Within Deadband</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="3" class="bold w-100 pt-2 pl-2">B/C CAL Button Color Codes</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class="black led"></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class="red led"></span> </td>
												<td class="w-2/3">Brake Mode</td>
											</tr>
											<tr>
												<td class="w-1/6 pl-8 pt-2"><span class="black led"></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class="black led"></span> </td>
												<td class="w-2/3">Coast Mode</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<a class="underline text-sm px-2 place-self-end pt-2" href="https://ctre.download/files/user-manual/Talon%20SRX%20User's%20Guide.pdf">Source Link (Page 32)</a>
				</div>
			{/if}
		</AccordionItem>

		<!-- CTRE Victor SPX -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctrevictorspx}>
			{#snippet header()}
				<div class="flex flex-row items-center">
					<button
						onclick={(e) => {
							e.stopPropagation();
							enlarge("/references/components/images/ctre-victorspx-large.webp", 'CTRE VictorSPX')
						}}
						class="cursor-zoom-in rounded hover:ring-2 hover:ring-blue-400 transition"
						title="Click to enlarge"
					>
						<img src="/references/components/icons/ctre-victorspx.webp" width="72px" alt="CTRE VictorSPX" style="background-color: white;" class="ml-2"/>
					</button>
					<div class="ml-8">CTRE VictorSPX</div>
				</div>
			{/snippet}

			{#if openState.ctrevictorspx === true || loadedState.ctrevictorspx === true}
				<div class="flex flex-col pl-1" style="max-width: 375px;">
					<table cellpadding="5" cellspacing="0" class="text-black dark:text-white">
						<tbody>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="3" class="bold w-100 pt-2 pl-2">Calibration Codes</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "green led"}></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "red led"}></span> </td>
												<td class="w-2/3">Calibration in Progress</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td class="w-2/3">Successful Calibration</td>
											</tr>
											<tr>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span> </td>
												<td class="w-2/3">Failed Calibration</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="3" class="bold w-100 pt-2 pl-2">Normal Operation Codes</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class="black led"></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class="black led"></span> </td>
												<td class="w-2/3">No Power</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td class="w-2/3">Driving in Forward, Rate = DutyCycle</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span></td>
												<td class="w-2/3">Driving in Reverse, Rate = DutyCycle</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "black led" : "orange led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "black led" : "orange led"}></span></td>
												<td class="w-2/3">CAN/PWM Detected, Robot Disabled</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "black led" : "red led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "black led" : "red led"}></span></td>
												<td class="w-2/3">CAN/PWM Not Detected</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "black led" : "red led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "black led" : "red led"}></span></td>
												<td class="w-2/3">Fault Detected</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "red led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "orange led" : "red led"}></span></td>
												<td class="w-2/3">Damaged Hardware</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2">
													<span
														class={LEDOffsetToggleState3Hz === 0
															? "red led"
															: LEDOffsetToggleState3Hz === 1
																? "black led"
																: LEDOffsetToggleState3Hz === 2
																	? "black led"
																	: "black led"}
													></span>
												</td>
												<td class="w-1/6 pl-8 pt-2">
													<span
														class={LEDOffsetToggleState3Hz === 0
															? "black led"
															: LEDOffsetToggleState3Hz === 1
																? "red led"
																: LEDOffsetToggleState3Hz === 2
																	? "black led"
																	: "black led"}
													></span>
												</td>
												<td class="w-2/3">Forward Soft/Hard Limit Triggered</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2">
													<span
														class={LEDOffsetToggleState3Hz === 0
															? "black led"
															: LEDOffsetToggleState3Hz === 1
																? "red led"
																: LEDOffsetToggleState3Hz === 2
																	? "black led"
																	: "black led"}
													></span>
												</td>
												<td class="w-1/6 pl-8 pt-2">
													<span
														class={LEDOffsetToggleState3Hz === 0
															? "red led"
															: LEDOffsetToggleState3Hz === 1
																? "black led"
																: LEDOffsetToggleState3Hz === 2
																	? "black led"
																	: "black led"}
													></span>
												</td>
												<td class="w-2/3">Reverse Soft/Hard Limit Triggered</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "orange led" : "green led"}></span></td>
												<td class="w-2/3">In Boot Loader</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="orange led"></span> </td>
												<td class="w-20 pl-8 pt-2"><span class="orange led"></span> </td>
												<td class="w-2/3">Neutral Signal Applied Within Deadband</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="3" class="bold w-100 pt-2 pl-2">B/C CAL Button Color Codes</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td class="w-20 pl-8 pt-2"><span class="red led"></span> </td>
												<td class="w-2/3">Brake Mode</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td class="w-20 pl-8 pt-2"><span class="black led"></span> </td>
												<td class="w-2/3">Coast Mode</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<a class="underline text-sm px-2 place-self-end pt-2" href="https://ctre.download/files/user-manual/Victor%20SPX%20User's%20Guide.pdf">Source Link (Page 11)</a>
				</div>
			{/if}
		</AccordionItem>

		<!-- CTRE CANivore -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctrecanivore}>
			{#snippet header()}
				<div class="flex flex-row items-center">
					<button
						onclick={(e) => {
							e.stopPropagation();
							enlarge("/references/components/images/ctre-canivore-large.webp", 'CTRE CANivore')
						}}
						class="cursor-zoom-in rounded hover:ring-2 hover:ring-blue-400 transition"
						title="Click to enlarge"
					>
						<img src="/references/components/icons/ctre-canivore.webp" width="72px" alt="CTRE CANivore" style="background-color: white;" class="ml-2"/>
					</button>
					<div class="ml-8">CTRE CANivore</div>
				</div>
			{/snippet}

			{#if openState.ctrecanivore === true || loadedState.ctrecanivore === true}
				<div class="flex flex-col pl-1" style="max-width: 375px;">
					<table cellpadding="5" cellspacing="0" class="text-black dark:text-white">
						<tbody>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">STAT</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2">
													<span
														class="{blinkClass('2Blink', [
															'red',
															'black',
															'red',
															'black',
															'black',
														])} led"
													></span>
												</td>
												<td>Powered but USB not plugged in</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["20Hz"] === true ? "red led" : "black led"}></span> </td>
												<td>USB plugged in but no comms</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2">
													<span
														class="{blinkClass('2Blink', [
															'orange',
															'black',
															'orange',
															'black',
															'black',
														])} led"
													></span>
												</td>
												<td>CAN disabled, no power</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "black led"}></span></td>
												<td>CAN disabled</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2">
													<span
														class="{blinkClass('2Blink', [
															'green',
															'black',
															'green',
															'black',
															'black',
														])} led"
													></span>
												</td>
												<td>CAN enabled, no power</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td>CAN enabled</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "orange led"}></span></td>
												<td>Bootloader</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "orange led"}></span> </td>
												<td>Hardware Damage</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table class="section-table">
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2"></td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td>Wi-Fi Enabled</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="black led"></span></td>
												<td>Wi-Fi Disabled</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table class="section-table">
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">BlueTooth</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td>Bluetooth Enabled</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="black led"></span></td>
												<td>Bluetooth Disabled</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table class="section-table">
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">CAN</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span></td>
												<td>No Power</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="red led"></span></td>
												<td>Voltage too low for CAN bus</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["20Hz"] === true ? "red led" : "black led"}></span> </td>
												<td>No CAN comms, Termination Enabled</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2">
													<span
														class="{blinkClass('2Blink', [
															'red',
															'black',
															'red',
															'black',
															'black',
														])} led"
													></span>
												</td>
												<td>No CAN comms, Termination Disabled</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["20Hz"] === true ? "orange led" : "black led"}></span></td>
												<td>CAN 2.0b Legacy Mode, Termination Enabled</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2">
													<span
														class="{blinkClass('2Blink', [
															'orange',
															'black',
															'orange',
															'black',
															'black',
														])} led"
													></span>
												</td>
												<td>CAN 2.0b Legacy Mode, Termination Disabled</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["20Hz"] === true ? "green led" : "black led"}></span></td>
												<td>CAN FD Active, Termination Enabled</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2">
													<span
														class="{blinkClass('2Blink', [
															'green',
															'black',
															'green',
															'black',
															'black',
														])} led"
													></span>
												</td>
												<td>CAN FD Active, Termination Disabled</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<a class="underline text-sm px-2 place-self-end pt-2" href="https://v6.docs.ctr-electronics.com/en/stable/docs/canivore/canivore-intro.html#status-light-reference">Source Link</a>
				</div>
			{/if}
		</AccordionItem>

		<!-- CTRE Pigeon 2.0 -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctrepigeon}>
			{#snippet header()}
				<div class="flex flex-row items-center">
					<button
						onclick={(e) => {
							e.stopPropagation();
							enlarge("/references/components/images/ctre-pigeon-2-large.webp", 'CTRE Pigeon 2.0')
						}}
						class="cursor-zoom-in rounded hover:ring-2 hover:ring-blue-400 transition"
						title="Click to enlarge"
					>
						<img src="/references/components/icons/ctre-pigeon-2.webp" width="72px" alt="CTRE Pigeon 2.0" style="background-color: white;" class="ml-2"/>
					</button>
					<div class="ml-8">CTRE Pigeon 2.0</div>
				</div>
			{/snippet}

			{#if openState.ctrepigeon === true || loadedState.ctrepigeon === true}
				<div class="flex flex-col pl-1" style="max-width: 375px;">
					<table cellpadding="5" cellspacing="0" class="text-black dark:text-white">
						<tbody>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class="black led"></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class="black led"></span></td>
												<td class="w-2/3">No Power</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "red led" : "black led"}></span></td>
												<td class="w-2/3">Invalid CAN Signal</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "black led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "orange led" : "black led"}></span></td>
												<td class="w-2/3">Valid CAN, Phoenix is NOT Detected</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "black led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "black led"}></span></td>
												<td class="w-2/3">Valid CAN + Phoenix Detected + Robot Disabled</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "green led" : "black led"}></span></td>
												<td class="w-2/3">Valid CAN + Phoenix Detected + Robot Enabled</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "orange led"}></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "red led" : "orange led"}></span></td>
												<td class="w-2/3">Hardware Fault Detected; Confirm with TunerX Self Test</td>
											</tr>
											<tr>
												<td class="w-1/6 pl-8 pt-2"><span class="black led"></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === false ? "green led" : "orange led"}></span></td>
												<td class="w-2/3">Device in Bootloader; Field-upgrade device in TunerX</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<a class="underline text-sm px-2 place-self-end pt-2" href="https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/pigeon2/index.html#status-light-reference">Source Link</a>
				</div>
			{/if}
		</AccordionItem>

		<!-- CTRE CANcoder -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctrecancoder}>
			{#snippet header()}
				<div class="flex flex-row items-center">
					<button
						onclick={(e) => {
							e.stopPropagation();
							enlarge("/references/components/images/ctre-cancoder-large.webp", 'CTRE CANcoder')
						}}
						class="cursor-zoom-in rounded hover:ring-2 hover:ring-blue-400 transition"
						title="Click to enlarge"
					>
						<img src="/references/components/icons/ctre-cancoder.webp" width="72px" alt="CTRE CANcoder" style="background-color: white;" class="ml-2"/>
					</button>
					<div class="ml-8">CTRE CANcoder</div>
				</div>
			{/snippet}

			{#if openState.ctrecancoder === true || loadedState.ctrecancoder === true}
				<div class="flex flex-col pl-1" style="max-width: 375px;">
					<table cellpadding="5" cellspacing="0" class="text-black dark:text-white">
						<tbody>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span></td>
												<td>No Power</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "yellow led"}></span></td>
												<td>Bootloader</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "red led"}></span> </td>
												<td>Unlicensed Phoenix Pro</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["1Hz"] === true ? "black led" : "red led"}></span> </td>
												<td>CAN bus has been lost</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "black led" : "dim-red led"}></span></td>
												<td>(dim) No CAN and magnet out of range</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "black led" : "dim-yellow led"}></span></td>
												<td>(dim) No CAN and reduced magnet accuracy</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "black led" : "dim-green led"}></span></td>
												<td>(dim) No CAN and magnet present</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "black led" : "red led"}></span></td>
												<td>(bright) CAN and magnet out of range</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "black led" : "yellow led"}></span></td>
												<td>(bright) CAN and reduced magnet accuracy</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "black led" : "green led"}></span></td>
												<td>(bright) CAN and magnet present</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<a class="underline text-sm px-2 place-self-end pt-2" href="https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/cancoder/index.html#status-light-reference">Source Link</a>
				</div>
			{/if}
		</AccordionItem>

		<!-- CTRE ThroughboreCANcoder -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctretbcancoder}>
			{#snippet header()}
				<div class="flex flex-row items-center">
					<button
						onclick={(e) => {
							e.stopPropagation();
							enlarge("/references/components/images/ctre-tb-cancoder-large.webp", 'CTRE Throughbore CANcoder')
						}}
						class="cursor-zoom-in rounded hover:ring-2 hover:ring-blue-400 transition"
						title="Click to enlarge"
					>
						<img src="/references/components/icons/ctre-tb-cancoder.webp" width="72px" alt="CTRE Throughbore CANcoder" style="background-color: white;" class="ml-2"/>
					</button>
					<div class="ml-8">CTRE Throughbore CANcoder</div>
				</div>
			{/snippet}

			{#if openState.ctretbcancoder === true || loadedState.ctretbcancoder === true}
				<div class="flex flex-col pl-1" style="max-width: 375px;">
					<table cellpadding="5" cellspacing="0" class="text-black dark:text-white" style="max-width: 375px;">
						<tbody>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span></td>
												<td>No Power</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "yellow led"}></span></td>
												<td>Bootloader</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "red led"}></span> </td>
												<td>Unlicensed Phoenix Pro</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["1Hz"] === true ? "black led" : "red led"}></span> </td>
												<td>CAN bus has been lost</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "black led" : "green led"}></span></td>
												<td>CAN is present</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<a class="underline text-sm px-2 place-self-end pt-2" href="https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/cancoder/index.html#status-light-reference">Source Link</a>
				</div>
			{/if}
		</AccordionItem>

		<!-- CTRE CANrange -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctrecanrange}>
			{#snippet header()}
				<div class="flex flex-row items-center">
					<button
						onclick={(e) => {
							e.stopPropagation();
							enlarge("/references/components/images/ctre-canrange-large.webp", 'CTRE CANrange')
						}}
						class="cursor-zoom-in rounded hover:ring-2 hover:ring-blue-400 transition"
						title="Click to enlarge"
					>
						<img src="/references/components/icons/ctre-canrange.webp" width="72px" alt="CTRE CANrange" style="background-color: white;" class="ml-2"/>
					</button>
					<div class="ml-8">CTRE CANrange</div>
				</div>
			{/snippet}

			{#if openState.ctrecanrange === true || loadedState.ctrecanrange === true}
				<div class="flex flex-col pl-1" style="max-width: 375px;">
					<table cellpadding="5" cellspacing="0" class="text-black dark:text-white">
						<tbody>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class="black led"></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class="black led"></span></td>
												<td class="w-2/3">No Power</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class="black led"></span></td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["2Hz"] === true ? "green led" : "orange led"}></span> </td>
												<td class="w-2/3">Bootloader</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["2Hz"] === true ? "black led" : "red led"}></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["2Hz"] === false ? "black led" : "red led"}></span> </td>
												<td class="w-2/3">CAN bus has been lost</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["2Hz"] === true ? "black led" : "orange led"}></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["2Hz"] === false ? "black led" : "orange led"}></span> </td>
												<td class="w-2/3">CAN present. Distance not detected.</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["2Hz"] === true ? "black led" : "green led"}></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["2Hz"] === false ? "black led" : "green led"}></span> </td>
												<td class="w-2/3">CAN present. Distance detected. (ANY SPEED)</td>
											</tr>
											<tr>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["2Hz"] === true ? "orange led" : "red led"}></span> </td>
												<td class="w-1/6 pl-8 pt-2"><span class={LEDToggleState["2Hz"] === false ? "orange led" : "red led"}></span> </td>
												<td class="w-2/3">Damaged Hardware</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<a class="underline text-sm px-2 place-self-end pt-2" href="https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/canrange/index.html#status-light-reference">Source Link</a>
				</div>
			{/if}
		</AccordionItem>

		<!-- CTRE CANdle -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctrecandle}>
			{#snippet header()}
				<div class="flex flex-row items-center">
					<button
						onclick={(e) => {
							e.stopPropagation();
							enlarge("/references/components/images/ctre-candle-large.webp", 'CTRE CANdle')
						}}
						class="cursor-zoom-in rounded hover:ring-2 hover:ring-blue-400 transition"
						title="Click to enlarge"
					>
						<img src="/references/components/icons/ctre-candle.webp" width="72px" alt="CTRE CANdle" style="background-color: white;" class="ml-2"/>
					</button>
					<div class="ml-8">CTRE CANdle</div>
				</div>
			{/snippet}

			{#if openState.ctrecandle === true || loadedState.ctrecandle === true}
				<div class="flex flex-col pl-1" style="max-width: 375px;">
					<table cellpadding="5" cellspacing="0" class="text-black dark:text-white">
						<tbody>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span></td>
												<td>No Power or StatusLedWhenActive config is set to Disabled</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["2Hz"] === true ? "green led" : "orange led"}></span> </td>
												<td>Bootloader</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["2Hz"] === true ? "black led" : "red led"}></span> </td>
												<td>No CAN detected</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["2Hz"] === true ? "black led" : "orange led"}></span> </td>
												<td>CAN present. Not being controlled.</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["2Hz"] === true ? "black led" : "green led"}></span> </td>
												<td>CAN present. Actively being controlled.</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["6Hz"] === true ? "black led" : "red led"}></span> </td>
												<td>5V too high fault</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["8Hz"] === true ? "black led" : "red led"}></span> </td>
												<td>Short circuit or software fuse fault</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["8Hz"] === true ? "black led" : "orange led"}></span> </td>
												<td>Thermal fault</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["2Hz"] === false ? "orange led" : "red led"}></span> </td>
												<td>Damaged Hardware</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<a class="underline text-sm px-2 place-self-end pt-2" href="https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/candle/index.html#status-light-reference">Source Link</a>
				</div>
			{/if}
		</AccordionItem>

		<!-- CTRE Power Distribution Panel -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctrepowerdistributionpanel}>
			{#snippet header()}
				<div class="flex flex-row items-center">
					<button
						onclick={(e) => {
							e.stopPropagation();
							enlarge("/references/components/images/ctre-pdp-large.webp", 'CTRE Power Distribution Panel')
						}}
						class="cursor-zoom-in rounded hover:ring-2 hover:ring-blue-400 transition"
						title="Click to enlarge"
					>
						<img src="/references/components/icons/ctre-pdp.webp" width="72px" alt="CTRE Power Distribution Panel" style="background-color: white;" class="ml-2"/>
					</button>
					<div class="ml-8">CTRE Power Distribution Panel</div>
				</div>
			{/snippet}

			{#if openState.ctrepowerdistributionpanel === true || loadedState.ctrepowerdistributionpanel === true}
				<div class="flex flex-col pl-1" style="max-width: 375px;">
					<h1 class="px-2 pb-2">
						The two LEDs are always the same color/blink pattern. The only exception is when the device is in
						boot-loader.
					</h1>
					<table cellpadding="5" cellspacing="0" class="text-black dark:text-white">
						<tbody>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span></td>
												<td>No Power</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["20Hz"] === true ? "green led" : "black led"}></span></td>
												<td>Robot Enabled</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td>Robot Disabled</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "black led"}></span></td>
												<td>Disabled; Sticky Fault Present</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span> </td>
												<td>No CAN</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "orange led"}></span></td>
												<td>COMM ONLY; In Boot-Loader, Field-Upgrade necessary</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "orange led"}></span> </td>
												<td>Hardware Damaged; DO NOT ATTEMPT TO USE</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<a class="underline text-sm px-2 place-self-end pt-2" href="https://ctre.download/files/user-manual/PDP%20User's%20Guide.pdf">Source Link (Page 16)</a>
				</div>
			{/if}
		</AccordionItem>

		<!-- CTRE Pneumatics Control Module -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctrepneumaticscontrolmodule}>
			{#snippet header()}
				<div class="flex flex-row items-center">
					<button
						onclick={(e) => {
							e.stopPropagation();
							enlarge("/references/components/images/ctre-pcm-large.webp", 'CTRE Pneumatic Control Module')
						}}
						class="cursor-zoom-in rounded hover:ring-2 hover:ring-blue-400 transition"
						title="Click to enlarge"
					>
						<img src="/references/components/icons/ctre-pcm.webp" width="72px" alt="CTRE Pneumatic Control Module" style="background-color: white;" class="ml-2"/>
					</button>
					<div class="ml-8">CTRE Pneumatic Control Module</div>
				</div>
			{/snippet}

			{#if openState.ctrepneumaticscontrolmodule === true || loadedState.ctrepneumaticscontrolmodule === true}
				<div class="flex flex-col pl-1" style="max-width: 375px;">
					<table cellpadding="5" cellspacing="0" class="text-black dark:text-white">
						<tbody>
							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Status</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span></td>
												<td>No Power</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["20Hz"] === true ? "green led" : "black led"}></span></td>
												<td>Robot Enabled</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}></span></td>
												<td>Robot Disabled</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "orange led" : "black led"}></span></td>
												<td>Disabled; Sticky Fault Present</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}></span> </td>
												<td>
													No CAN or Solenoid Fault (Will blink # of faulted Solenoid followed by pause)
												</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2">
													<span
														class={
															blinkClass(
																"2Blink", 
																["red led", 
																"black led", 
																"red led", 
																"black led", 
																"black led"]
															)}
													></span>
												</td>
												<td>Compressor Fault</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "green led" : "orange led"}></span></td>
												<td>In Boot-Loader, Field-Upgrade necessary</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class={LEDToggleState["3Hz"] === true ? "red led" : "orange led"}></span> </td>
												<td>Hardware Damaged; DO NOT ATTEMPT TO USE</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Compressor LED (COMP)</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span></td>
												<td>Compressor OFF</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="green led"></span></td>
												<td>Compressor ON</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>

							<tr class="border-2 border-gray-400">
								<td>
									<table>
										<tbody>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td colspan="2" class="bold w-100 pt-2 pl-2">Solenoid Status LED</td>
											</tr>
											<tr class="w-100 border-b-2 border-b-gray-600">
												<td class="w-20 pl-8 pt-2"><span class="black led"></span></td>
												<td>Solenoid OFF</td>
											</tr>
											<tr>
												<td class="w-20 pl-8 pt-2"><span class="green led"></span></td>
												<td>Solenoid ON</td>
											</tr>
										</tbody>
									</table>
								</td>
							</tr>
						</tbody>
					</table>
					<a class="underline text-sm px-2 place-self-end pt-2" href="https://ctre.download/files/user-manual/PCM%20User's%20Guide.pdf">Source Link (Pages 13-15)</a>
				</div>
			{/if}
		</AccordionItem>

		<!-- Other Devices -->
	</Accordion>
</div>

<style>
	table td {
		text-align: left;
	}
	table td:not(:first-child) {
		padding-left: 0.5rem;
	}
	.led-table {
		border-collapse: collapse;
		border: 2px solid #b0bec5;
		width: 375px;
	}
	.section-table td {
		border: 0;
	}
	.bold {
		font-weight: bold;
	}
	.blue {
		background-color: blue;
	}
	.red {
		background-color: red;
	}
	.orange {
		background-color: orange;
	}
	.yellow {
		background-color: yellow;
	}
	.green {
		background-color: green;
	}
	.cyan {
		background-color: cyan;
	}
	.magenta {
		background-color: magenta;
	}
	.black {
		background-color: black;
	}
	.white {
		background-color: #ffffff;
	}
	.dim-red {
		background-color: #7a0000;
	}
	.dim-green {
		background-color: #004200;
	}
	.dim-yellow {
		background-color: #a7a700;
	}
	.led {
		display: inline-block;
		width: 25px;
		height: 25px;
		border: 1px black solid !important;
		border-radius: 50% !important;
	}
	.section-table td {
		vertical-align: top;
	}
</style>
