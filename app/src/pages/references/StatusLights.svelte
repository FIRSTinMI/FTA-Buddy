<script lang="ts">
	import { Accordion, AccordionItem } from "flowbite-svelte";
	import { onDestroy } from "svelte";

	let LEDToggleState1Hz = true;
	let LEDToggleState20Hz = true;
	let LEDToggleState50Hz = true;
	let LEDToggleState10Hz = true;
	let LEDToggleState3Hz = true;

	let LEDOffsetToggleState3Hz = 0;
 
	let LEDToggleState2Blink = 0;
	let LEDToggleState3Blink = 0;
	let LEDToggleState4Blink = 0;

	let openState = {
		// General Devices
		radio: false,
		roborio: false,

		// REV Devices
		revsparkmax: false,
		revsparkflex: false,
		revpowerdistributionhub: false,
		revpneumaticshub: false,

		// CTRE Devices
		ctretalonfx: false,
		ctretalonsrx: false,
		ctrevictorspx: false,
		ctrecanivore: false,
		ctrepigeon: false,
		ctrecancoder: false,
		ctrepowerdistributionpanel: false,
		ctrepneumaticscontrolmodule: false,

		// Other Devices
	};

	let loadedState = {
		// General Devices
		radio: false,
		roborio: false,

		// REV Devices
		revsparkmax: false,
		revsparkflex: false,
		revpowerdistributionhub: false,
		revpneumaticshub: false,

		// CTRE Devices
		ctretalonfx: false,
		ctretalonsrx: false,
		ctrevictorspx: false,
		ctrecanivore: false,
		ctrepigeon: false,
		ctrecancoder: false,
		ctrepowerdistributionpanel: false,
		ctrepneumaticscontrolmodule: false,

		// Other Devices
	};

	$: {
		if (openState.radio) loadedState.radio = true;
		if (openState.roborio) loadedState.roborio = true;
		if (openState.revsparkmax) loadedState.revsparkmax = true;
		if (openState.revsparkflex) loadedState.revsparkflex = true;
		if (openState.ctretalonfx) loadedState.ctretalonfx = true;
		if (openState.ctretalonsrx) loadedState.ctretalonsrx = true;
		if (openState.ctrevictorspx) loadedState.ctrevictorspx = true;
		if (openState.ctrecanivore) loadedState.ctrecanivore = true;
		if (openState.ctrepigeon) loadedState.ctrepigeon = true;
		if (openState.ctrecancoder) loadedState.ctrecancoder = true;
		if (openState.revpowerdistributionhub) loadedState.revpowerdistributionhub = true;
		if (openState.revpneumaticshub) loadedState.revpneumaticshub = true;
		if (openState.ctrepowerdistributionpanel) loadedState.ctrepowerdistributionpanel = true;
		if (openState.ctrepneumaticscontrolmodule) loadedState.ctrepneumaticscontrolmodule = true;
	}

	function toggleLED1Hz() {
		if (LEDToggleState1Hz === true) {
			LEDToggleState1Hz = false;
		} else {
			LEDToggleState1Hz = true;
		}
	}

	function toggleLED10Hz() {
		if (LEDToggleState10Hz === true) {
			LEDToggleState10Hz = false;
		} else {
			LEDToggleState10Hz = true;
		}
	}

	function toggleLED3Hz() {
		if (LEDToggleState3Hz === true) {
			LEDToggleState3Hz = false;
		} else {
			LEDToggleState3Hz = true;
		}
	}

	function toggleLED20Hz() {
		if (LEDToggleState20Hz === true) {
			LEDToggleState20Hz = false;
		} else {
			LEDToggleState20Hz = true;
		}
	}

	function toggleLED50Hz() {
		if (LEDToggleState50Hz === true) {
			LEDToggleState50Hz = false;
		} else {
			LEDToggleState50Hz = true;
		}
	}

	function toggle2Blink() {
		if (LEDToggleState2Blink < 4) {
			LEDToggleState2Blink++;
		} else {
			LEDToggleState2Blink = 0;
		}
	}

	function toggle3Blink() {
		if (LEDToggleState3Blink < 6) {
			LEDToggleState3Blink++;
		} else {
			LEDToggleState3Blink = 0;
		}
	}

	function toggle4Blink() {
		if (LEDToggleState4Blink < 8) {
			LEDToggleState4Blink++;
		} else {
			LEDToggleState4Blink = 0;
		}
	}

	function toggleLEDOffset3Hz() {
		if (LEDOffsetToggleState3Hz === 0) {
			LEDOffsetToggleState3Hz = 1;
		} else if (LEDOffsetToggleState3Hz === 1) {
			LEDOffsetToggleState3Hz = 2;
		} else if (LEDOffsetToggleState3Hz === 2) {
			LEDOffsetToggleState3Hz = 0;
		}
	}

	let timerID1Hz = setInterval(toggleLED1Hz, 1000);
	onDestroy(() => clearInterval(timerID1Hz));

	let timerID20Hz = setInterval(toggleLED20Hz, 50);
	onDestroy(() => clearInterval(timerID20Hz));	
	
	let timerID10Hz = setInterval(toggleLED10Hz, 100);
	onDestroy(() => clearInterval(timerID10Hz));

	let timerID3Hz = setInterval(toggleLED3Hz, 300);
	onDestroy(() => clearInterval(timerID3Hz));

	let timerID50Hz = setInterval(toggleLED50Hz, 20);
	onDestroy(() => clearInterval(timerID50Hz));

	let timerID2Blink = setInterval(toggle2Blink, 300);
	onDestroy(() => clearInterval(timerID2Blink));

	let timerID3Blink = setInterval(toggle3Blink, 300);
	onDestroy(() => clearInterval(timerID3Blink));

	let timerID4Blink = setInterval(toggle4Blink, 300);
	onDestroy(() => clearInterval(timerID4Blink));
	
	let timerIDOffset3Hz = setInterval(toggleLEDOffset3Hz, 300);
	onDestroy(() => clearInterval(timerIDOffset3Hz))

</script>

<div class="container mx-auto p-2 pr-3 w-full">
	<h1 class="text-3xl" style="font-weight: bold">Status Lights</h1>
	<h1>Please Note: Blink Frequency May Not Be Exact</h1>

	<!-- Main Accordion -->
	<Accordion flush class="text-left">
		<!-- General Devices -->
		<br>
		<h1 class="text-xl text-white" style="font-weight: bold">General Devices</h1>
		
		<!-- Robot Radio -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.radio}>
			<span slot="header" class="font-bold">Robot Radio VH-109</span>

			<img src="/vh109.png" width="325px" alt="Radio with LEDs labeled" />

			{#if openState.radio === true || loadedState.radio === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">No Power</td>
								</tr>
								<tr>
									<td class="black led"> </td>
									<td>All LEDs</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
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
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">Powered + Unable to Ping Field</td>
								</tr>
								<tr>
									<td class="green led"> </td>
									<td>Power</td>
								</tr>
								<tr>
									<td class={LEDToggleState1Hz === true ? "black led" : "green led"}> </td>
									<td>System Status</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">Powered + Flashing Firmware</td>
								</tr>
								<tr>
									<td class="green led"> </td>
									<td>Power</td>
								</tr>
								<tr>
									<td class={LEDToggleState20Hz === true ? "black led" : "green led"}> </td>
									<td>System Status</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">Powered + Firmware Flashed + In First Boot</td>
								</tr>
								<tr>
									<td class="green led"> </td>
									<td>Power</td>
								</tr>
								<tr>
									<td class={LEDToggleState50Hz === true ? "black led" : "green led"}> </td>
									<td>System Status</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">Radio in AP Mode with Battery Detected</td>
								</tr>
								<tr>
									<td class="green led"> </td>
									<td>Power</td>
								</tr>
								<tr>
									<td class={LEDToggleState20Hz === true ? "black led" : "green led"}> </td>
									<td>System Status</td>
								</tr>
								<tr>
									<td class={LEDToggleState20Hz === true ? "black led" : "green led"}> </td>
									<td>2.4GHz</td>
								</tr>
								<tr>
									<td class={LEDToggleState20Hz === true ? "black led" : "green led"}> </td>
									<td>6GHz</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
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
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">2.4GHz Connection Enabled</td>
								</tr>
								<tr>
									<td class="green led"> </td>
									<td>2.4GHz</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">6GHz Connection Enabled</td>
								</tr>
								<tr>
									<td class="green led"> </td>
									<td>6GHz</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">Valid RIO Connection</td>
								</tr>
								<tr>
									<td class="green led"> </td>
									<td>RIO Link</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
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
							</table>
						</td>
					</tr>
				</table>
			{/if}
		</AccordionItem>

		<!-- RoboRIO -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.roborio}>
			<span slot="header" class="font-bold">RoboRIO</span>

			{#if openState.roborio === true || loadedState.roborio === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tr>
						<td>
							<table class="section-table">
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
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">Status</td>
								</tr>
								<tr>
									<td class="black led"> </td>
									<td>OK</td>
								</tr>
								<tr>
									<td class={LEDToggleState2Blink === 0
										? "orange led"
										: LEDToggleState2Blink === 1
											? "black led"
											: LEDToggleState2Blink === 2
												? "orange led"
												: LEDToggleState2Blink === 3
													? "black led"
													: LEDToggleState2Blink === 4
														? "black led"
															: "black led"}> </td>
									<td>(2 Blinks) Software error, reimage roboRIO</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Blink === 0
										? "orange led"
										: LEDToggleState3Blink === 1
											? "black led"
											: LEDToggleState3Blink === 2
												? "orange led"
												: LEDToggleState3Blink === 3
													? "black led"
													: LEDToggleState3Blink === 4
														? "orange led"
														: LEDToggleState3Blink === 5
															? "black led"
															: LEDToggleState3Blink === 6
																? "black led"
																: "black led"}> </td>
									<td>(3 Blinks)Safe Mode, restart roboRIO, reimage if not resolved</td>
								</tr>
								<tr>
									<td class={LEDToggleState4Blink === 0
										? "orange led"
										: LEDToggleState4Blink === 1
											? "black led"
											: LEDToggleState4Blink === 2
												? "orange led"
												: LEDToggleState4Blink === 3
													? "black led"
													: LEDToggleState4Blink === 4
														? "orange led"
														: LEDToggleState4Blink === 5
															? "black led"
															: LEDToggleState4Blink === 6
																? "orange led"
																: LEDToggleState4Blink === 7
																	? "black led"
																	: LEDToggleState4Blink === 8
																		? "black led"
																		: "black led"}> </td>
									<td>(4 Blinks) Software crashed twice without rebooting, reboot roboRIO, reimage if not fixed</td>
								</tr>
								<tr>
									<td class="orange led"> </td>
									<td>Unrecoverable error</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">Radio</td>
								</tr>
								<tr>
									<td class="black led"> </td>
									<td>Ignore</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
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
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td>E-Stop</td>
								</tr>
								<tr>
									<td class="green led"> </td>
									<td>OK</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
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
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">RSL (State Reflects RSL State)</td>
								</tr>
								<tr>
									<td class="red led"></td>
									<td>Disabled</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td>Enabled</td>
								</tr>
								<tr>
									<td class="black led"></td>
									<td>Robot Off, No roboRIO Power, OR No RSL Power</td>
								</tr>
							</table>
						</td>
					</tr>
				</table>
			{/if}
		</AccordionItem>

		<!-- REV Devices -->
		<br> <br>
		<h1 class="text-xl text-white" style="font-weight: bold">REV Devices</h1>

		<!-- REV Spark Max -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.revsparkmax}>
			<span slot="header" class="font-bold">REV Spark Max</span>

			{#if openState.revsparkmax === true || loadedState.revsparkmax === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">Brushless Mode</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "cyan led" : "black led"}> </td>
									<td>Brake No Signal</td>
								</tr>
								<tr>
									<td class="cyan led"> </td>
									<td>Brake Valid Signal</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "magenta led" : "black led"}> </td>
									<td>Coast No Signal</td>
								</tr>
								<tr>
									<td class="magenta led"> </td>
									<td>Coast Valid Signal</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">Brushed Mode</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "blue led" : "black led"}> </td>
									<td>Brake No Signal</td>
								</tr>
								<tr>
									<td class="blue led"> </td>
									<td>Brake Valid Signal</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "yellow led" : "black led"}> </td>
									<td>Coast No Signal</td>
								</tr>
								<tr>
									<td class="yellow led"> </td>
									<td>Coast Valid Signal</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">Fault Conditions</td>
								</tr>
								<tr>
									<td class={LEDToggleState1Hz === true ? "magenta led" : "orange led"}> </td>
									<td>Sensor Fault</td>
								</tr>
								<tr>
									<td class={LEDToggleState1Hz === true ? "blue led" : "orange led"}> </td>
									<td>12V Missing</td>
								</tr>
								<tr>
									<td class={LEDToggleState1Hz === true ? "cyan led" : "orange led"}> </td>
									<td>Gate Driver Fault</td>
								</tr>
								<tr>
									<td class={LEDToggleState1Hz === true ? "yellow led" : "orange led"}> </td>
									<td>CAN Fault</td>
								</tr>
								<tr>
									<td class="black led"> </td>
									<td>Corrupt Firmware</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">Identification, Updating, and Recovery</td>
								</tr>
								<tr>
									<td class={LEDToggleState20Hz === true ? "magenta led" : "white led"}> </td>
									<td>Identify</td>
								</tr>
								<tr>
									<td class={LEDToggleState1Hz === true ? "magenta led" : "yellow led"}> </td>
									<td>CAN Firmware Updating v1.5.0</td>
								</tr>
								<tr>
									<td class={LEDToggleState1Hz === true ? "green led" : "magenta led"}> </td>
									<td>CAN Firmware Updating v1.4.0</td>
								</tr>
								<tr>
									<td class={LEDToggleState1Hz === true ? "white led" : "blue led"}> </td>
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
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">Movement</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
									<td>Partial Forward</td>
								</tr>
								<tr>
									<td class="green led"> </td>
									<td>Full Forward</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td>Partial Reverse</td>
								</tr>
								<tr>
									<td class="red led"> </td>
									<td>Full Reverse</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "white led"}> </td>
									<td>Forward Limit</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "white led"}> </td>
									<td>Reverse Limit</td>
								</tr>
							</table>
						</td>
					</tr>
				</table>
			{/if}
		</AccordionItem>

		<!-- REV Spark Flex -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.revsparkflex}>
			<span slot="header" class="font-bold">REV Spark Flex</span>

			{#if openState.revsparkflex === true || loadedState.revsparkflex === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="3" class="bold">Brushless Mode</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "cyan led" : "black led"}> </td>
									<td>Brake No Signal</td>
								</tr>
								<tr>
									<td class="cyan led"> </td>
									<td>Brake Valid Signal</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "magenta led" : "black led"}> </td>
									<td>Coast No Signal</td>
								</tr>
								<tr>
									<td class="magenta led"> </td>
									<td>Coast Valid Signal</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="3" class="bold">Brushed Mode</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "blue led" : "black led"}> </td>
									<td>Brake No Signal</td>
								</tr>
								<tr>
									<td class="blue led"> </td>
									<td>Brake Valid Signal</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "yellow led" : "black led"}> </td>
									<td>Coast No Signal</td>
								</tr>
								<tr>
									<td class="yellow led"> </td>
									<td>Coast Valid Signal</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="3" class="bold">Fault Modes</td>
								</tr>
								<tr>
									<td class={LEDToggleState1Hz === true ? "orange led" : "magenta led"}> </td>
									<td>Sensor Fault</td>
								</tr>
								<tr>
									<td class={LEDToggleState1Hz === true ? "orange led" : "blue led"}> </td>
									<td>12V Missing</td>
								</tr>
								<tr>
									<td class={LEDToggleState1Hz === true ? "orange led" : "cyan led"}> </td>
									<td>Gate Driver Fault</td>
								</tr>
								<tr>
									<td class={LEDToggleState1Hz === true ? "orange led" : "yellow led"}> </td>
									<td>CAN Fault</td>
								</tr>
								<tr>
									<td class={LEDToggleState1Hz === true ? "orange led" : "green led"}> </td>
									<td>Temperature Fault</td>
								</tr>
								<tr>
									<td class="black led"> </td>
									<td>Corrupt Firmware</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="3" class="bold">Identification, Updating, and Recovery</td>
								</tr>
								<tr>
									<td class={LEDToggleState20Hz === true ? "white led" : "magenta led"}> </td>
									<td>Identify</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "white led" : "yellow led"}> </td>
									<td>CAN Firmware Updating</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "white led" : "blue led"}> </td>
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
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="3" class="bold">Movement Codes</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
									<td>Forward Power Applied</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td>Reverse Power Applied</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "white led"}> </td>
									<td>Forward Limit</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "white led"}> </td>
									<td>Reverse Limit</td>
								</tr>
							</table>
						</td>
					</tr>
				</table>
			{/if}
		</AccordionItem>

		<!-- REV Power Distribution Hub -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.revpowerdistributionhub}>
			<span slot="header" class="font-bold">REV Power Distribution Hub</span>

			{#if openState.revpowerdistributionhub === true || loadedState.revpowerdistributionhub === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tr>
						<td>
							<table class="section-table">
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
									<td class="cyan led"> </td>
									<td>Connected to REV Hardware Client</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "magenta led" : "black led"}> </td>
									<td>Keep Alive Timeout</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "orange led" : "blue led"}> </td>
									<td>Low Battery</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "orange led" : "yellow led"}> </td>
									<td>CAN Fault</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "orange led" : "cyan led"}> </td>
									<td>Hardware Fault</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "orange led" : "magenta led"}> </td>
									<td>Device Over Current</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
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
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td>Sticky fault</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
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
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td>Sticky fault</td>
								</tr>
							</table>
						</td>
					</tr>

					
				</table>
			{/if}
		</AccordionItem>

		<!-- REV Pneumatics Hub -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.revpneumaticshub}>
			<span slot="header" class="font-bold">REV Pneumatics Hub</span>

			{#if openState.revpneumaticshub === true || loadedState.revpneumaticshub === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tr>
						<td>
							<table class="section-table">
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
									<td class="cyan led"> </td>
									<td>Secondary Heartbeat</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "magenta led" : "black led"}> </td>
									<td>Keep Alive Timeout</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "orange led" : "cyan led"}> </td>
									<td>Hardware Fault</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "orange led" : "yellow led"}> </td>
									<td>CAN Fault</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "orange led" : "green led"}> </td>
									<td>Compressor Over Current</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "orange led" : "magenta led"}> </td>
									<td>Device Over Current</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">Compressor Status LED</td>
								</tr>
								<tr>
									<td class="black led"> </td>
									<td>Compressor OFF</td>
								</tr>
								<tr>
									<td class="green led"> </td>
									<td>Compressor ON</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">Solenoid Status LED</td>
								</tr>
								<tr>
									<td class="black led"> </td>
									<td>Solenoid OFF</td>
								</tr>
								<tr>
									<td class="green led"> </td>
									<td>Solenoid ON</td>
								</tr>
							</table>
						</td>
					</tr>

					
				</table>
			{/if}
		</AccordionItem>

		<!-- CTRE Devices -->
		<br> <br>
		<h1 class="text-xl text-white" style="font-weight: bold">CTRE Devices</h1>

		<!-- CTRE Talon FX -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctretalonfx}>
			<span slot="header" class="font-bold">CTRE Talon FX</span>

			{#if openState.ctretalonfx === true || loadedState.ctretalonfx === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tr>
						<td>
							<table class="section-table">
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
									<td class={LEDToggleState3Hz === true ? "orange led" : "black led"}> </td>
									<td class={LEDToggleState3Hz === false ? "orange led" : "black led"}> </td>
									<td>Valid CAN/PWM, Phoenix is NOT Detected</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td class={LEDToggleState3Hz === false ? "red led" : "black led"}> </td>
									<td>Invalid CAN/PWM Signal</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="3" class="bold">Enabled Codes</td>
								</tr>
								<tr>
									<td class="orange led"> </td>
									<td class="orange led"> </td>
									<td>Enabled with Nuetral Input</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td>Driving in Reverse, Rate = DutyCycle</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
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
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
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
									<td class={LEDToggleState3Hz === true ? "red led" : "green led"}> </td>
									<td class={LEDToggleState3Hz === false ? "green led" : "red led"}> </td>
									<td>Using Pro Command without License</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "orange led"}> </td>
									<td class={LEDToggleState3Hz === false ? "orange led" : "red led"}> </td>
									<td>Damaged Hardware</td>
								</tr>
								<tr>
									<td class="black led"> </td>
									<td class={LEDToggleState3Hz === false ? "green led" : "orange led"}> </td>
									<td>Limit Switch/Soft Limit</td>
								</tr>
							</table>
						</td>
					</tr>
				</table>
			{/if}
		</AccordionItem>

		<!-- CTRE Talon SRX -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctretalonsrx}>
			<span slot="header" class="font-bold">CTRE Talon SRX</span>

			{#if openState.ctretalonsrx === true || loadedState.ctretalonsrx === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="3" class="bold">Calibration Codes</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "green led"}> </td>
									<td class={LEDToggleState3Hz === true ? "green led" : "red led"}> </td>
									<td>Calibration in Progress</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
									<td>Successful Calibration</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td>Failed Calibration</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="3" class="bold">Normal Operation Codes</td>
								</tr>
								<tr>
									<td class="black led"> </td>
									<td class="black led"> </td>
									<td>No Power</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
									<td>Driving in Forward, Rate = DutyCycle</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td>Driving in Reverse, Rate = DutyCycle</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "black led" : "orange led"}> </td>
									<td class={LEDToggleState3Hz === false ? "black led" : "orange led"}> </td>
									<td>CAN/PWM Detected, Robot Disabled</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "black led" : "red led"}> </td>
									<td class={LEDToggleState3Hz === false ? "black led" : "red led"}> </td>
									<td>CAN/PWM Not Detected</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "orange led" : "red led"}> </td>
									<td class={LEDToggleState3Hz === false ? "orange led" : "red led"}> </td>
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
									<td class={LEDToggleState3Hz === false ? "orange led" : "green led"}> </td>
									<td>In Boot Loader</td>
								</tr>
								<tr>
									<td class="orange led"> </td>
									<td class="orange led"> </td>
									<td>Nuetral Signal Applied Within Deadband</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
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
							</table>
						</td>
					</tr>
				</table>
			{/if}
		</AccordionItem>

		<!-- CTRE Victor SPX -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctrevictorspx}>
			<span slot="header" class="font-bold">CTRE Victor SPX</span>

			{#if openState.ctrevictorspx === true || loadedState.ctrevictorspx === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="3" class="bold">Calibration Codes</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "green led"}> </td>
									<td class={LEDToggleState3Hz === true ? "green led" : "red led"}> </td>
									<td>Calibration in Progress</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
									<td>Successful Calibration</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td>Failed Calibration</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="3" class="bold">Normal Operation Codes</td>
								</tr>
								<tr>
									<td class="black led"> </td>
									<td class="black led"> </td>
									<td>No Power</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
									<td>Driving in Forward, Rate = DutyCycle</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td>Driving in Reverse, Rate = DutyCycle</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "black led" : "orange led"}> </td>
									<td class={LEDToggleState3Hz === false ? "black led" : "orange led"}> </td>
									<td>CAN/PWM Detected, Robot Disabled</td>
								</tr>
								<tr>
									<td class={LEDToggleState1Hz === true ? "black led" : "red led"}> </td>
									<td class={LEDToggleState1Hz === false ? "black led" : "red led"}> </td>
									<td>CAN/PWM Not Detected</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "black led" : "red led"}> </td>
									<td class={LEDToggleState3Hz === false ? "black led" : "red led"}> </td>
									<td>Fault Detected</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "orange led" : "red led"}> </td>
									<td class={LEDToggleState3Hz === false ? "orange led" : "red led"}> </td>
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
									<td class={LEDToggleState3Hz === false ? "orange led" : "green led"}> </td>
									<td>In Boot Loader</td>
								</tr>
								<tr>
									<td class="orange led"> </td>
									<td class="orange led"> </td>
									<td>Nuetral Signal Applied Within Deadband</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
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
							</table>
						</td>
					</tr>
				</table>
			{/if}
		</AccordionItem>

		<!-- CTRE CANivore -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctrecanivore}>
			<span slot="header" class="font-bold">CTRE Canivore</span>

			{#if openState.ctrecanivore === true || loadedState.ctrecanivore === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">STAT</td>
								</tr>
								<tr>
									<td class={LEDToggleState2Blink === 0
										? "red led"
										: LEDToggleState2Blink === 1
											? "black led"
											: LEDToggleState2Blink === 2
												? "red led"
													: "black led"}> </td>									<td>Powered but USB not plugged in</td>
								</tr>
								<tr>
									<td class={LEDToggleState20Hz === true ? "red led" : "black led"}> </td>
									<td>USB plugged in but no comms</td>
								</tr>
								<tr>
									<td class={LEDToggleState2Blink === 0
										? "orange led"
										: LEDToggleState2Blink === 1
											? "black led"
											: LEDToggleState2Blink === 2
												? "orange led"
													: "black led"}> </td>									<td>CAN disabled, no power</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "orange led" : "black led"}> </td>
									<td>CAN disabled</td>
								</tr>
								<tr>
									<td class={LEDToggleState2Blink === 0
										? "green led"
										: LEDToggleState2Blink === 1
											? "black led"
											: LEDToggleState2Blink === 2
												? "green led"
													: "black led"}> </td>									<td>CAN enabled, no power</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
									<td>CAN enabled</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "orange led"}> </td>
									<td>Bootloader</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "orange led"}> </td>
									<td>Hardware Damage</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">WIFI</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
									<td>Wi-Fi Enabled</td>
								</tr>
								<tr>
									<td class="black led"> </td>
									<td>Wi-Fi Disabled</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">BlueTooth</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
									<td>Bluetooth Enabled</td>
								</tr>
								<tr>
									<td class="black led"> </td>
									<td>Bluetooth Disabled</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
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
									<td class={LEDToggleState20Hz === true ? "red led" : "black led"}> </td>
									<td>No CAN comms, Termination Enabled</td>
								</tr>
								<tr>
									<td class={LEDToggleState2Blink === 0
										? "red led"
										: LEDToggleState2Blink === 1
											? "black led"
											: LEDToggleState2Blink === 2
												? "red led"
													: "black led"}> </td>									<td>No CAN comms, Termination Disabled</td>
								</tr>
								<tr>
									<td class={LEDToggleState20Hz === true ? "orange led" : "black led"}> </td>
									<td>CAN 2.0b Legacy Mode, Termination Enabled</td>
								</tr>
								<tr>
									<td class={LEDToggleState2Blink === 0
										? "orange led"
										: LEDToggleState2Blink === 1
											? "black led"
											: LEDToggleState2Blink === 2
												? "orange led"
													: "black led"}> </td>									<td>CAN 2.0b Legacy Mode, Termination Disabled</td>
								</tr>
								<tr>
									<td class={LEDToggleState20Hz === true ? "green led" : "black led"}> </td>
									<td>CAN FD Active, Termination Enabled</td>
								</tr>
								<tr>
									<td class={LEDToggleState2Blink === 0
										? "green led"
										: LEDToggleState2Blink === 1
											? "black led"
											: LEDToggleState2Blink === 2
												? "green led"
													: "black led"}> </td>	
									<td>CAN FD Active, Termination Disabled</td>
								</tr>
							</table>
						</td>
					</tr>
				</table>
			{/if}
		</AccordionItem>

		<!-- CTRE Pigeon 2.0 -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctrepigeon}>
			<span slot="header" class="font-bold">CTRE Pigeon 2.0 Lights</span>

			{#if openState.ctrepigeon === true || loadedState.ctrepigeon === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">Blink Codes</td>
								</tr>
								<tr>
									<td class="black led"> </td>
									<td class="black led"> </td>
									<td>No Power</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td class={LEDToggleState3Hz === false ? "red led" : "black led"}> </td>
									<td>Invalid CAN Signal</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "orange led" : "black led"}> </td>
									<td class={LEDToggleState3Hz === false ? "orange led" : "black led"}> </td>
									<td>Valid CAN, Phoenix is NOT Detected</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "orange led" : "black led"}> </td>
									<td class={LEDToggleState3Hz === true ? "orange led" : "black led"}> </td>
									<td>Valid CAN + Phoenix Detected + Robot Disabled</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
									<td class={LEDToggleState3Hz === false ? "green led" : "black led"}> </td>
									<td>Valid CAN + Phoenix Detected + Robot Enabled</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "orange led"}> </td>
									<td class={LEDToggleState3Hz === false ? "red led" : "orange led"}> </td>
									<td>Hardware Fault Detected; Confirm with TunerX Self Test</td>
								</tr>
								<tr>
									<td class="black led"> </td>
									<td class={LEDToggleState3Hz === false ? "green led" : "orange led"}> </td>
									<td>Device in Bootloader; Field-upgrade device in TunerX</td>
								</tr>
							</table>
						</td>
					</tr>
				</table>
			{/if}
		</AccordionItem>

		<!-- CTRE CANcoder -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctrecancoder}>
			<span slot="header" class="font-bold">CTRE CANcoder</span>

			{#if openState.ctrecancoder === true || loadedState.ctrecancoder === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td class="black led"> </td>
									<td>No Power</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "yellow led"}> </td>
									<td>Bootloader</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "red led"}> </td>
									<td>Unlicensed Phoenix Pro</td>
								</tr>
								<tr>
									<td class={LEDToggleState1Hz === true ? "black led" : "red led"}> </td>
									<td>CAN bus has been lost</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "black led" : "dim-red led"}> </td>
									<td>(dim) No CAN and magnet out of range</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "black led" : "dim-yellow led"}> </td>
									<td>(dim) No CAN and reduced magnet accuracy</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "black led" : "dim-green led"}> </td>
									<td>(dim) No CAN and magnet present</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "black led" : "red led"}> </td>
									<td>(bright) CAN and magnet out of range</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "black led" : "yellow led"}> </td>
									<td>(bright) CAN and reduced magnet accuracy</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "black led" : "green led"}> </td>
									<td>(bright) CAN and magnet present</td>
								</tr>
							</table>
						</td>
					</tr>
				</table>
			{/if}
		</AccordionItem>

		<!-- CTRE Power Distribution Panel -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctrepowerdistributionpanel}>
			<span slot="header" class="font-bold">CTRE Power Distribution Panel</span>

			{#if openState.ctrepowerdistributionpanel === true || loadedState.ctrepowerdistributionpanel === true}
				<h1>The two LEDs are always the same color/blink pattern. The only exception is when the device is in boot-loader.</h1>
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td class="black led"> </td>
									<td>No Power</td>
								</tr>
								<tr>
									<td class={LEDToggleState20Hz === true ? "green led" : "black led"}> </td>
									<td>Robot Enabled</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
									<td>Robot Disabled</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "orange led" : "black led"}> </td>
									<td>Disabled; Sticky Fault Present</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td>No CAN</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "orange led"}> </td>
									<td>COMM ONLY; In Boot-Loader, Field-Upgrade necessary</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "orange led"}> </td>
									<td>Hardware Damaged; DO NOT ATTEMPT TO USE</td>
								</tr>
							</table>
						</td>
					</tr>
				</table>
			{/if}
		</AccordionItem>

		<!-- CTRE Pneumatics Control Module -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.ctrepneumaticscontrolmodule}>
			<span slot="header" class="font-bold">CTRE Pneumatics Control Module</span>

			{#if openState.ctrepneumaticscontrolmodule === true || loadedState.ctrepneumaticscontrolmodule === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">Status</td>
								</tr>
								<tr>
									<td class="black led"> </td>
									<td>No Power</td>
								</tr>
								<tr>
									<td class={LEDToggleState20Hz === true ? "green led" : "black led"}> </td>
									<td>Robot Enabled</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
									<td>Robot Disabled</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "orange led" : "black led"}> </td>
									<td>Disabled; Sticky Fault Present</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "black led"}> </td>
									<td>No CAN or Compressor Fault or Solenoid Fault (Solenoid light will be blinking)</td>
								</tr>
								<tr>
									<td class={LEDToggleState2Blink === 0
										? "red led"
										: LEDToggleState2Blink === 1
											? "red led"
											: LEDToggleState2Blink === 2
												? "red led"
													: "black led"}> </td>
									<td>Compressor Fault</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "orange led"}> </td>
									<td>COMM ONLY; In Boot-Loader, Field-Upgrade necessary</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "red led" : "orange led"}> </td>
									<td>Hardware Damaged; DO NOT ATTEMPT TO USE</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">Compressor Status LED</td>
								</tr>
								<tr>
									<td class="black led"> </td>
									<td>Compressor OFF</td>
								</tr>
								<tr>
									<td class="green led"> </td>
									<td>Compressor ON</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">Solenoid Status LED</td>
								</tr>
								<tr>
									<td class="black led"> </td>
									<td>Solenoid OFF</td>
								</tr>
								<tr>
									<td class="green led"> </td>
									<td>Solenoid ON</td>
								</tr>
							</table>
						</td>
					</tr>
				</table>
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
