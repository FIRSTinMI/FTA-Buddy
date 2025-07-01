<script lang="ts">
	console.log("StatusLights component mounted");
	import { Accordion, AccordionItem } from "flowbite-svelte";
	import { onDestroy } from "svelte";

	// Consolidated LED toggle states
	let LEDToggleState = {
		"1Hz": true,
		"10Hz": true,
		"20Hz": true,
		"50Hz": true,
		"3Hz": true,
	};

	let LEDOffsetToggleState3Hz = 0;
	let LEDBlinkState = {
		"2Blink": 0,
		"3Blink": 0,
		"4Blink": 0,
	};

	const componentKeys = [
		"radio",
		"roborio",
		"sparkmax",
		"sparkflex",
		"talonfx",
		"talonsrx",
		"victorspx",
		"canivore",
		"pigeon",
		"cancoder",
		"powerDistributionHub",
	];

	let openState = Object.fromEntries(componentKeys.map((k) => [k, false]));
	let loadedState = Object.fromEntries(componentKeys.map((k) => [k, false]));

	$: {
		for (const key of componentKeys) {
			if (openState[key]) loadedState[key] = true;
		}
	}

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
		{ fn: () => toggleLED("20Hz"), interval: 50 },
		{ fn: () => toggleLED("10Hz"), interval: 100 },
		{ fn: () => toggleLED("3Hz"), interval: 300 },
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

<div class="container mx-auto p-2 pr-3 w-full">
	<h1 class="text-3xl" style="font-weight: bold">Status Lights</h1>
	<h1>Please Note: Blink Frequency May Not Be Exact</h1>
	<Accordion flush class="text-left">
		<AccordionItem class="text-black dark:text-white" bind:open={openState.radio}>
			<span slot="header" class="font-bold">Robot Radio</span>

			<img src="/vh103.png" width="325px" alt="Radio with LEDs labeled" />

			{#if openState.radio === true || loadedState.radio === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tbody>
						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">No Power</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td>All LEDs</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Powered + Booting</td>
										</tr>
										<tr>
											<td class="green led"> </td>
											<td>Power</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td>System Status</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Powered + Unable to Ping Field</td>
										</tr>
										<tr>
											<td class="green led"> </td>
											<td>Power</td>
										</tr>
										<tr>
											<td class={LEDToggleState["1Hz"] === true ? "black led" : "green led"}> </td>
											<td>System Status</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Powered + Flashing Firmware</td>
										</tr>
										<tr>
											<td class="green led"> </td>
											<td>Power</td>
										</tr>
										<tr>
											<td class={LEDToggleState["20Hz"] === true ? "black led" : "green led"}> </td>
											<td>System Status</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Powered + Firmware Flashed + In First Boot</td>
										</tr>
										<tr>
											<td class="green led"> </td>
											<td>Power</td>
										</tr>
										<tr>
											<td class={LEDToggleState["50Hz"] === true ? "black led" : "green led"}> </td>
											<td>System Status</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Radio in AP Mode with Battery Detected</td>
										</tr>
										<tr>
											<td class="green led"> </td>
											<td>Power</td>
										</tr>
										<tr>
											<td class={LEDToggleState["20Hz"] === true ? "black led" : "green led"}> </td>
											<td>System Status</td>
										</tr>
										<tr>
											<td class={LEDToggleState["20Hz"] === true ? "black led" : "green led"}> </td>
											<td>2.4GHz</td>
										</tr>
										<tr>
											<td class={LEDToggleState["20Hz"] === true ? "black led" : "green led"}> </td>
											<td>6GHz</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Powered + Able to Ping Field</td>
										</tr>
										<tr>
											<td class="green led"> </td>
											<td>Power</td>
										</tr>
										<tr>
											<td class="green led"> </td>
											<td>System Status</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">2.4GHz Connection Enabled</td>
										</tr>
										<tr>
											<td class="green led"> </td>
											<td>2.4GHz</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">6GHz Connection Enabled</td>
										</tr>
										<tr>
											<td class="green led"> </td>
											<td>6GHz</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Valid RIO Connection</td>
										</tr>
										<tr>
											<td class="green led"> </td>
											<td>RIO Link</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">DIP Switches</td>
										</tr>
										<tr>
											<td>1</td>
											<td>Aux1 POE passthrough</td>
										</tr>
										<tr>
											<td>2</td>
											<td>Aux2 POE passthrough</td>
										</tr>
										<tr>
											<td>3</td>
											<td>Enable 2.4 GHz Radio</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>
					</tbody>
				</table>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.roborio}>
			<span slot="header" class="font-bold">RoboRIO</span>

			{#if openState.roborio === true || loadedState.roborio === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tbody>
						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Power</td>
										</tr>
										<tr>
											<td class="green led"> </td>
											<td>OK</td>
										</tr>
										<tr>
											<td class="orange led"> </td>
											<td>Brownout</td>
										</tr>
										<tr>
											<td class="red led"> </td>
											<td>Fault, check for short</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Status</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td>OK</td>
										</tr>
										<tr>
											<td class="{blinkClass('2Blink', ['orange', 'black', 'orange', 'black', 'black'])} led"></td>
											<td>(2 Blinks) Software error, reimage roboRIO</td>
										</tr>

										<tr>
											<td class="{blinkClass('3Blink', ['orange', 'black', 'orange', 'black', 'orange', 'black', 'black'])} led"></td>
											<td>(3 Blinks) Safe Mode, restart roboRIO, reimage if not resolved</td>
										</tr>

										<tr>
											<td
												class="{blinkClass('4Blink', [
													'orange',
													'black',
													'orange',
													'black',
													'orange',
													'black',
													'orange',
													'black',
													'black',
												])} led"
											></td>
											<td>(4 Blinks) Software crashed twice without rebooting, reboot roboRIO, reimage if not fixed</td>
										</tr>
										<tr>
											<td class="orange led"> </td>
											<td>Unrecoverable error</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Radio</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td>Ignore</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Comm</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td>No Comms</td>
										</tr>
										<tr>
											<td class="red led"> </td>
											<td>Comms, no code</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}> </td>
											<td>E-Stop</td>
										</tr>
										<tr>
											<td class="green led"> </td>
											<td>OK</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Mode</td>
										</tr>
										<tr>
											<td class="black led"></td>
											<td>Disabled</td>
										</tr>
										<tr>
											<td class="orange led"> </td>
											<td>Auto</td>
										</tr>
										<tr>
											<td class="green led"> </td>
											<td>Teleop</td>
										</tr>
										<tr>
											<td class="red led"> </td>
											<td>Test</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">RSL (State Reflects RSL State)</td>
										</tr>
										<tr>
											<td class="red led"></td>
											<td>Disabled</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}> </td>
											<td>Enabled</td>
										</tr>
										<tr>
											<td class="black led"></td>
											<td>Robot Off, No roboRIO Power, OR No RSL Power</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>
					</tbody>
				</table>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.sparkmax}>
			<span slot="header" class="font-bold">REV Spark Max</span>

			{#if openState.sparkmax === true || loadedState.sparkmax === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tbody>
						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Brushless Mode</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "cyan led" : "black led"}> </td>
											<td>Brake No Signal</td>
										</tr>
										<tr>
											<td class="cyan led"> </td>
											<td>Brake Valid Signal</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "magenta led" : "black led"}> </td>
											<td>Coast No Signal</td>
										</tr>
										<tr>
											<td class="magenta led"> </td>
											<td>Coast Valid Signal</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Brushed Mode</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "blue led" : "black led"}> </td>
											<td>Brake No Signal</td>
										</tr>
										<tr>
											<td class="blue led"> </td>
											<td>Brake Valid Signal</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "yellow led" : "black led"}> </td>
											<td>Coast No Signal</td>
										</tr>
										<tr>
											<td class="yellow led"> </td>
											<td>Coast Valid Signal</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Fault Conditions</td>
										</tr>
										<tr>
											<td class={LEDToggleState["1Hz"] === true ? "magenta led" : "orange led"}> </td>
											<td>Sensor Fault</td>
										</tr>
										<tr>
											<td class={LEDToggleState["1Hz"] === true ? "blue led" : "orange led"}> </td>
											<td>12V Missing</td>
										</tr>
										<tr>
											<td class={LEDToggleState["1Hz"] === true ? "cyan led" : "orange led"}> </td>
											<td>Gate Driver Fault</td>
										</tr>
										<tr>
											<td class={LEDToggleState["1Hz"] === true ? "yellow led" : "orange led"}> </td>
											<td>CAN Fault</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td>Corrupt Firmware</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Identification, Updating, and Recovery</td>
										</tr>
										<tr>
											<td class={LEDToggleState["20Hz"] === true ? "magenta led" : "white led"}> </td>
											<td>Identify</td>
										</tr>
										<tr>
											<td class={LEDToggleState["1Hz"] === true ? "magenta led" : "yellow led"}> </td>
											<td>CAN Firmware Updating v1.5.0</td>
										</tr>
										<tr>
											<td class={LEDToggleState["1Hz"] === true ? "green led" : "magenta led"}> </td>
											<td>CAN Firmware Updating v1.4.0</td>
										</tr>
										<tr>
											<td class={LEDToggleState["1Hz"] === true ? "white led" : "blue led"}> </td>
											<td>CAN Firmware Retry</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td>USB Device Firmware Update</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td>Recovery Mode</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Movement</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}> </td>
											<td>Partial Forward</td>
										</tr>
										<tr>
											<td class="green led"> </td>
											<td>Full Forward</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}> </td>
											<td>Partial Reverse</td>
										</tr>
										<tr>
											<td class="red led"> </td>
											<td>Full Reverse</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "white led"}> </td>
											<td>Forward Limit</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "white led"}> </td>
											<td>Reverse Limit</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>
					</tbody>
				</table>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.sparkflex}>
			<span slot="header" class="font-bold">REV Spark Flex</span>

			{#if openState.sparkflex === true || loadedState.sparkflex === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tbody>
						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="3" class="bold">Brushless Mode</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "cyan led" : "black led"}> </td>
											<td>Brake No Signal</td>
										</tr>
										<tr>
											<td class="cyan led"> </td>
											<td>Brake Valid Signal</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "magenta led" : "black led"}> </td>
											<td>Coast No Signal</td>
										</tr>
										<tr>
											<td class="magenta led"> </td>
											<td>Coast Valid Signal</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="3" class="bold">Brushed Mode</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "blue led" : "black led"}> </td>
											<td>Brake No Signal</td>
										</tr>
										<tr>
											<td class="blue led"> </td>
											<td>Brake Valid Signal</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "yellow led" : "black led"}> </td>
											<td>Coast No Signal</td>
										</tr>
										<tr>
											<td class="yellow led"> </td>
											<td>Coast Valid Signal</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="3" class="bold">Fault Modes</td>
										</tr>
										<tr>
											<td class={LEDToggleState["1Hz"] === true ? "orange led" : "magenta led"}> </td>
											<td>Sensor Fault</td>
										</tr>
										<tr>
											<td class={LEDToggleState["1Hz"] === true ? "orange led" : "blue led"}> </td>
											<td>12V Missing</td>
										</tr>
										<tr>
											<td class={LEDToggleState["1Hz"] === true ? "orange led" : "cyan led"}> </td>
											<td>Gate Driver Fault</td>
										</tr>
										<tr>
											<td class={LEDToggleState["1Hz"] === true ? "orange led" : "yellow led"}> </td>
											<td>CAN Fault</td>
										</tr>
										<tr>
											<td class={LEDToggleState["1Hz"] === true ? "orange led" : "green led"}> </td>
											<td>Temperature Fault</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td>Corrupt Firmware</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="3" class="bold">Identification, Updating, and Recovery</td>
										</tr>
										<tr>
											<td class={LEDToggleState["20Hz"] === true ? "white led" : "magenta led"}> </td>
											<td>Identify</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "white led" : "yellow led"}> </td>
											<td>CAN Firmware Updating</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "white led" : "blue led"}> </td>
											<td>CAN Firmware Retry</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td>USB Device Firmware Update</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td>Recovery Mode</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="3" class="bold">Movement Codes</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}> </td>
											<td>Forward Power Applied</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}> </td>
											<td>Reverse Power Applied</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "white led"}> </td>
											<td>Forward Limit</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "white led"}> </td>
											<td>Reverse Limit</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>
					</tbody>
				</table>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.talonfx}>
			<span slot="header" class="font-bold">CTRE TalonFX</span>

			{#if openState.talonfx === true || loadedState.talonfx === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tbody>
						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="3" class="bold">Disabled Codes</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td class="black led"> </td>
											<td>No Power</td>
										</tr>
										<tr>
											<td class="blink-orange led"> </td>
											<td class="blink-orange led"> </td>
											<td>Valid CAN/PWM Signal, Robot is Disabled, Phoenix is Running </td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "orange led" : "black led"}> </td>
											<td class={LEDToggleState["3Hz"] === false ? "orange led" : "black led"}> </td>
											<td>Valid CAN/PWM, Phoenix is NOT Detected</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}> </td>
											<td class={LEDToggleState["3Hz"] === false ? "red led" : "black led"}> </td>
											<td>Invalid CAN/PWM Signal</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="3" class="bold">Enabled Codes</td>
										</tr>
										<tr>
											<td class="orange led"> </td>
											<td class="orange led"> </td>
											<td>Enabled with Nuetral Input</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}> </td>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}> </td>
											<td>Driving in Reverse, Rate = DutyCycle</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}> </td>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}> </td>
											<td>Driving in Forward, Rate = DutyCycle</td>
										</tr>
										<tr>
											<td
												class={LEDOffsetToggleState3Hz === 0
													? "red led"
													: LEDOffsetToggleState3Hz === 1
														? "black led"
														: LEDOffsetToggleState3Hz === 2
															? "black led"
															: "black led"}
											>
											</td>
											<td
												class={LEDOffsetToggleState3Hz === 0
													? "black led"
													: LEDOffsetToggleState3Hz === 1
														? "red led"
														: LEDOffsetToggleState3Hz === 2
															? "black led"
															: "black led"}
											>
											</td>
											<td>Talon Limited, Offset Direction = Forward/Reverse</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="3" class="bold">Special Codes</td>
										</tr>
										<tr>
											<td
												class={LEDOffsetToggleState3Hz === 0
													? "orange led"
													: LEDOffsetToggleState3Hz === 1
														? "black led"
														: LEDOffsetToggleState3Hz === 2
															? "black led"
															: "black led"}
											>
											</td>
											<td
												class={LEDOffsetToggleState3Hz === 0
													? "black led"
													: LEDOffsetToggleState3Hz === 1
														? "orange led"
														: LEDOffsetToggleState3Hz === 2
															? "black led"
															: "black led"}
											>
											</td>
											<td>Thermal Cutoff Warning</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "green led"}> </td>
											<td class={LEDToggleState["3Hz"] === false ? "green led" : "red led"}> </td>
											<td>Using Pro Command without License</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "orange led"}> </td>
											<td class={LEDToggleState["3Hz"] === false ? "orange led" : "red led"}> </td>
											<td>Damaged Hardware</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td class={LEDToggleState["3Hz"] === false ? "green led" : "orange led"}> </td>
											<td>Limit Switch/Soft Limit</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>
					</tbody>
				</table>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.talonsrx}>
			<span slot="header" class="font-bold">CTRE TalonSRX</span>

			{#if openState.talonsrx === true || loadedState.talonsrx === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tbody>
						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="3" class="bold">Calibration Codes</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "green led"}> </td>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "red led"}> </td>
											<td>Calibration in Progress</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}> </td>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}> </td>
											<td>Successful Calibration</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}> </td>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}> </td>
											<td>Failed Calibration</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="3" class="bold">Normal Operation Codes</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td class="black led"> </td>
											<td>No Power</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}> </td>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}> </td>
											<td>Driving in Forward, Rate = DutyCycle</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}> </td>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}> </td>
											<td>Driving in Reverse, Rate = DutyCycle</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "black led" : "orange led"}> </td>
											<td class={LEDToggleState["3Hz"] === false ? "black led" : "orange led"}> </td>
											<td>CAN/PWM Detected, Robot Disabled</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "black led" : "red led"}> </td>
											<td class={LEDToggleState["3Hz"] === false ? "black led" : "red led"}> </td>
											<td>CAN/PWM Not Detected</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "orange led" : "red led"}> </td>
											<td class={LEDToggleState["3Hz"] === false ? "orange led" : "red led"}> </td>
											<td>Damaged Hardware</td>
										</tr>
										<tr>
											<td
												class={LEDOffsetToggleState3Hz === 0
													? "red led"
													: LEDOffsetToggleState3Hz === 1
														? "black led"
														: LEDOffsetToggleState3Hz === 2
															? "black led"
															: "black led"}
											>
											</td>
											<td
												class={LEDOffsetToggleState3Hz === 0
													? "black led"
													: LEDOffsetToggleState3Hz === 1
														? "red led"
														: LEDOffsetToggleState3Hz === 2
															? "black led"
															: "black led"}
											>
											</td>
											<td>Forward Soft/Hard Limit Triggered</td>
										</tr>
										<tr>
											<td
												class={LEDOffsetToggleState3Hz === 0
													? "black led"
													: LEDOffsetToggleState3Hz === 1
														? "red led"
														: LEDOffsetToggleState3Hz === 2
															? "black led"
															: "black led"}
											>
											</td>
											<td
												class={LEDOffsetToggleState3Hz === 0
													? "red led"
													: LEDOffsetToggleState3Hz === 1
														? "black led"
														: LEDOffsetToggleState3Hz === 2
															? "black led"
															: "black led"}
											>
											</td>
											<td>Reverse Soft/Hard Limit Triggered</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td class={LEDToggleState["3Hz"] === false ? "orange led" : "green led"}> </td>
											<td>In Boot Loader</td>
										</tr>
										<tr>
											<td class="orange led"> </td>
											<td class="orange led"> </td>
											<td>Nuetral Signal Applied Within Deadband</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="3" class="bold">B/C CAL Button Color Codes</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td class="red led"> </td>
											<td>Brake Mode</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td class="black led"> </td>
											<td>Coast Mode</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>
					</tbody>
				</table>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.victorspx}>
			<span slot="header" class="font-bold">CTRE VictorSPX</span>

			{#if openState.victorspx === true || loadedState.victorspx === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tbody>
						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="3" class="bold">Calibration Codes</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "green led"}> </td>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "red led"}> </td>
											<td>Calibration in Progress</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}> </td>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}> </td>
											<td>Successful Calibration</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}> </td>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}> </td>
											<td>Failed Calibration</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="3" class="bold">Normal Operation Codes</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td class="black led"> </td>
											<td>No Power</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}> </td>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}> </td>
											<td>Driving in Forward, Rate = DutyCycle</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}> </td>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}> </td>
											<td>Driving in Reverse, Rate = DutyCycle</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "black led" : "orange led"}> </td>
											<td class={LEDToggleState["3Hz"] === false ? "black led" : "orange led"}> </td>
											<td>CAN/PWM Detected, Robot Disabled</td>
										</tr>
										<tr>
											<td class={LEDToggleState["1Hz"] === true ? "black led" : "red led"}> </td>
											<td class={LEDToggleState["1Hz"] === false ? "black led" : "red led"}> </td>
											<td>CAN/PWM Not Detected</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "black led" : "red led"}> </td>
											<td class={LEDToggleState["3Hz"] === false ? "black led" : "red led"}> </td>
											<td>Fault Detected</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "orange led" : "red led"}> </td>
											<td class={LEDToggleState["3Hz"] === false ? "orange led" : "red led"}> </td>
											<td>Damaged Hardware</td>
										</tr>
										<tr>
											<td
												class={LEDOffsetToggleState3Hz === 0
													? "red led"
													: LEDOffsetToggleState3Hz === 1
														? "black led"
														: LEDOffsetToggleState3Hz === 2
															? "black led"
															: "black led"}
											>
											</td>
											<td
												class={LEDOffsetToggleState3Hz === 0
													? "black led"
													: LEDOffsetToggleState3Hz === 1
														? "red led"
														: LEDOffsetToggleState3Hz === 2
															? "black led"
															: "black led"}
											>
											</td>
											<td>Forward Soft/Hard Limit Triggered</td>
										</tr>
										<tr>
											<td
												class={LEDOffsetToggleState3Hz === 0
													? "black led"
													: LEDOffsetToggleState3Hz === 1
														? "red led"
														: LEDOffsetToggleState3Hz === 2
															? "black led"
															: "black led"}
											>
											</td>
											<td
												class={LEDOffsetToggleState3Hz === 0
													? "red led"
													: LEDOffsetToggleState3Hz === 1
														? "black led"
														: LEDOffsetToggleState3Hz === 2
															? "black led"
															: "black led"}
											>
											</td>
											<td>Reverse Soft/Hard Limit Triggered</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td class={LEDToggleState["3Hz"] === false ? "orange led" : "green led"}> </td>
											<td>In Boot Loader</td>
										</tr>
										<tr>
											<td class="orange led"> </td>
											<td class="orange led"> </td>
											<td>Nuetral Signal Applied Within Deadband</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="3" class="bold">B/C CAL Button Color Codes</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td class="red led"> </td>
											<td>Brake Mode</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td class="black led"> </td>
											<td>Coast Mode</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>
					</tbody>
				</table>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.canivore}>
			<span slot="header" class="font-bold">CTRE CANivore</span>

			{#if openState.canivore === true || loadedState.canivore === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tbody>
						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">STAT</td>
										</tr>
										<tr>
											<td class="{blinkClass('2Blink', ['red', 'black', 'red', 'black', 'black'])} led"> </td>
											<td>Powered but USB not plugged in</td>
										</tr>
										<tr>
											<td class={LEDToggleState["20Hz"] === true ? "red led" : "black led"}> </td>
											<td>USB plugged in but no comms</td>
										</tr>
										<tr>
											<td class="{blinkClass('2Blink', ['orange', 'black', 'orange', 'black', 'black'])} led"> </td>
											<td>CAN disabled, no power</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "orange led" : "black led"}> </td>
											<td>CAN disabled</td>
										</tr>
										<tr>
											<td class="{blinkClass('2Blink', ['green', 'black', 'green', 'black', 'black'])} led"> </td>
											<td>CAN enabled, no power</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}> </td>
											<td>CAN enabled</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "orange led"}> </td>
											<td>Bootloader</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "orange led"}> </td>
											<td>Hardware Damage</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">WIFI</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}> </td>
											<td>Wi-Fi Enabled</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td>Wi-Fi Disabled</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">BlueTooth</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}> </td>
											<td>Bluetooth Enabled</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td>Bluetooth Disabled</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">CAN</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td>No Power</td>
										</tr>
										<tr>
											<td class="red led"> </td>
											<td>Voltage too low for CAN bus</td>
										</tr>
										<tr>
											<td class={LEDToggleState["20Hz"] === true ? "red led" : "black led"}> </td>
											<td>No CAN comms, Termination Enabled</td>
										</tr>
										<tr>
											<td class="{blinkClass('2Blink', ['red', 'black', 'red', 'black', 'black'])} led"> </td>
											<td>No CAN comms, Termination Disabled</td>
										</tr>
										<tr>
											<td class={LEDToggleState["20Hz"] === true ? "orange led" : "black led"}> </td>
											<td>CAN 2.0b Legacy Mode, Termination Enabled</td>
										</tr>
										<tr>
											<td class="{blinkClass('2Blink', ['orange', 'black', 'orange', 'black', 'black'])} led"> </td>
											<td>CAN 2.0b Legacy Mode, Termination Disabled</td>
										</tr>
										<tr>
											<td class={LEDToggleState["20Hz"] === true ? "green led" : "black led"}> </td>
											<td>CAN FD Active, Termination Enabled</td>
										</tr>
										<tr>
											<td class="{blinkClass('2Blink', ['green', 'black', 'green', 'black', 'black'])} led"> </td>
											<td>CAN FD Active, Termination Disabled</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>
					</tbody>
				</table>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.pigeon}>
			<span slot="header" class="font-bold">CTRE Pigeon 2.0 Lights</span>

			{#if openState.pigeon === true || loadedState.pigeon === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tbody>
						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Blink Codes</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td class="black led"> </td>
											<td>No Power</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}> </td>
											<td class={LEDToggleState["3Hz"] === false ? "red led" : "black led"}> </td>
											<td>Invalid CAN Signal</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "orange led" : "black led"}> </td>
											<td class={LEDToggleState["3Hz"] === false ? "orange led" : "black led"}> </td>
											<td>Valid CAN, Phoenix is NOT Detected</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "orange led" : "black led"}> </td>
											<td class={LEDToggleState["3Hz"] === true ? "orange led" : "black led"}> </td>
											<td>Valid CAN + Phoenix Detected + Robot Disabled</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "black led"}> </td>
											<td class={LEDToggleState["3Hz"] === false ? "green led" : "black led"}> </td>
											<td>Valid CAN + Phoenix Detected + Robot Enabled</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "orange led"}> </td>
											<td class={LEDToggleState["3Hz"] === false ? "red led" : "orange led"}> </td>
											<td>Hardware Fault Detected; Confirm with TunerX Self Test</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td class={LEDToggleState["3Hz"] === false ? "green led" : "orange led"}> </td>
											<td>Device in Bootloader; Field-upgrade device in TunerX</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>
					</tbody>
				</table>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.cancoder}>
			<span slot="header" class="font-bold">CANcoder</span>

			{#if openState.cancoder === true || loadedState.cancoder === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tbody>
						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td class="black led"> </td>
											<td>No Power</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "yellow led"}> </td>
											<td>Bootloader</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "green led" : "red led"}> </td>
											<td>Unlicensed Phoenix Pro</td>
										</tr>
										<tr>
											<td class={LEDToggleState["1Hz"] === true ? "black led" : "red led"}> </td>
											<td>CAN bus has been lost</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "black led" : "dim-red led"}> </td>
											<td>(dim) No CAN and magnet out of range</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "black led" : "dim-yellow led"}> </td>
											<td>(dim) No CAN and reduced magnet accuracy</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "black led" : "dim-green led"}> </td>
											<td>(dim) No CAN and magnet present</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "black led" : "red led"}> </td>
											<td>(bright) CAN and magnet out of range</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "black led" : "yellow led"}> </td>
											<td>(bright) CAN and reduced magnet accuracy</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "black led" : "green led"}> </td>
											<td>(bright) CAN and magnet present</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>
					</tbody>
				</table>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.powerDistributionHub}>
			<span slot="header" class="font-bold">REV PDH</span>

			{#if openState.powerDistributionHub === true || loadedState.powerDistributionHub === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tbody>
						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">General Status</td>
										</tr>
										<tr>
											<td class="blue led"> </td>
											<td>No communication established</td>
										</tr>
										<tr>
											<td class="green led"> </td>
											<td>RoboRIO communication established</td>
										</tr>
										<tr>
											<td class="blue led"> </td>
											<td>No communication established</td>
										</tr>
										<tr>
											<td class="cyan led"> </td>
											<td>Connected to REV Hardware Client</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "magenta led" : "black led"}> </td>
											<td>Keep Alive Timeout</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "orange led" : "blue led"}> </td>
											<td>Low Battery</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "orange led" : "yellow led"}> </td>
											<td>CAN Fault</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "orange led" : "cyan led"}> </td>
											<td>Hardware Fault</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "orange led" : "magenta led"}> </td>
											<td>Device Over Current</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Channel Status</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td>Has voltage and normal operation</td>
										</tr>
										<tr>
											<td class="red led"> </td>
											<td>No voltage and active fault</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}> </td>
											<td>Sticky fault</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>

						<tr>
							<td>
								<table class="section-table">
									<tbody>
										<tr>
											<td colspan="2" class="bold">Switched Channel</td>
										</tr>
										<tr>
											<td class="black led"> </td>
											<td>Has voltage and normal operation</td>
										</tr>
										<tr>
											<td class="red led"> </td>
											<td>No voltage and active fault</td>
										</tr>
										<tr>
											<td class={LEDToggleState["3Hz"] === true ? "red led" : "black led"}> </td>
											<td>Sticky fault</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>
					</tbody>
				</table>
			{/if}
		</AccordionItem>
	</Accordion>
</div>

<style>
	table td {
		text-align: left;
	}
	table td:not(:first-child) {
		padding-left: 0.5rem;
	}
	.led-table td {
		border: 2px solid #b0bec5;
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
		width: 50px;
		border: 5px black solid !important;
		border-radius: 25%;
	}
	.section-table td {
		vertical-align: top;
	}
</style>
