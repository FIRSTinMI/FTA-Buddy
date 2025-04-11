<script lang="ts">
	import { Accordion, AccordionItem } from "flowbite-svelte";
	import { onDestroy } from "svelte";
    import CustomIcon from "../../components/CustomIcon.svelte";

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
		radio: false,
		roborio: false,
		sparkmax: false,
		sparkflex: false,
		talonfx: false,
		talonsrx: false,
		victorspx: false,
		canivore: false,
		pigeon: false,
		cancoder: false,
		powerDistributionHub: false,
		powerDistributionPanel: false,
	};

	let loadedState = {
		radio: false,
		roborio: false,
		sparkmax: false,
		sparkflex: false,
		talonfx: false,
		talonsrx: false,
		victorspx: false,
		canivore: false,
		pigeon: false,
		cancoder: false,
		powerDistributionHub: false,
		powerDistributionPanel: false,
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
		if (openState.cancoder) loadedState.cancoder = true;
		if (openState.powerDistributionHub) loadedState.powerDistributionHub = true;
		if (openState.powerDistributionPanel) loadedState.powerDistributionPanel = true;
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
	<Accordion flush class="text-left">
		<AccordionItem class="text-black dark:text-white" bind:open={openState.radio}>
			<span slot="header" class="font-bold">
				<div class="flex flex-row gap-x-5">
					<CustomIcon type="/component_icons/vividhostingradio"></CustomIcon>
					<h1 class="pt-3">VividHosting Robot Radio</h1>
				</div>
			</span>

			<img src="/vh103.png" width="325px" alt="Radio with LEDs labeled" />

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

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">
										<a class="underline" href="https://frc-radio.vivid-hosting.net/overview/led-status-indications">Source</a>
									</td>
								</tr>
							</table>
						</td>
					</tr>
				</table>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.roborio}>
			<span slot="header" class="font-bold">
				<div class="flex flex-row gap-x-5">
					<CustomIcon type="/component_icons/roborio2"></CustomIcon>
					<h1 class="pt-3">RoboRIO 2</h1>
				</div>
			</span>

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

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">
										<a class="underline" href="https://docs.wpilib.org/en/stable/docs/hardware/hardware-basics/status-lights-ref.html#roborio">Source</a>
									</td>								</tr>
							</table>
						</td>
					</tr>
				</table>
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

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">
										<a class="underline" href="https://docs.revrobotics.com/brushless/spark-max/status-led">Source</a>
									</td>								
								</tr>
							</table>
						</td>
					</tr>
				</table>
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

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">
										<a class="underline" href="https://docs.revrobotics.com/brushless/spark-flex/status-led">Source</a>
									</td>								
								</tr>
							</table>
						</td>
					</tr>
				</table>
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

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">
										<a class="underline" href="https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/talonfx/index.html#status-light-reference">Source</a>
									</td>								
								</tr>
							</table>
						</td>
					</tr>
				</table>
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

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">
										<a class="underline" href="https://ctre.download/files/user-manual/Talon%20SRX%20User's%20Guide.pdf">Source</a>
									</td>								
								</tr>
							</table>
						</td>
					</tr>
				</table>
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

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">
										<a class="underline" href="https://ctre.download/files/user-manual/Victor%20SPX%20User's%20Guide.pdf">Source</a>
									</td>								
								</tr>
							</table>
						</td>
					</tr>
				</table>
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

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">
										<a class="underline" href="https://ctre.download/files/user-manual/CANivore%20User's%20Guide.pdf">Source</a>
									</td>								
								</tr>
							</table>
						</td>
					</tr>
				</table>
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

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">
										<a class="underline" href="https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/pigeon2/index.html">Source</a>
									</td>								
								</tr>
							</table>
						</td>
					</tr>
				</table>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.cancoder}>
			<span slot="header" class="font-bold">CTRE CANcoder</span>

			{#if openState.cancoder === true || loadedState.cancoder === true}
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

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">
										<a class="underline" href="https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/cancoder/index.html">Source</a>
									</td>								
								</tr>
							</table>
						</td>
					</tr>
				</table>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.powerDistributionHub}>
			<span slot="header" class="font-bold">
				<div class="flex flex-row gap-x-5">
					<CustomIcon type="/component_icons/revpdh"></CustomIcon>
					<h1 class="pt-3">REV PDH (Power Distribution Hub)</h1>
				</div>
			</span>
			{#if openState.powerDistributionHub === true || loadedState.powerDistributionHub === true}
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
									<td class="blue led"> </td>
									<td>No communication established</td>
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

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">
										<a class="underline" href="https://docs.revrobotics.com/ion-control-system/pdh/status-led">Source</a>
									</td>								
								</tr>
							</table>
						</td>
					</tr>
				</table>
			{/if}
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white" bind:open={openState.powerDistributionPanel}>
			<span slot="header" class="font-bold">
				<div class="flex flex-row gap-x-5">
					<CustomIcon type="/component_icons/ctrepdp"></CustomIcon>
					<h1 class="pt-3">CTRE PDP (Power Distribution Panel)</h1>
				</div>
			</span>
			{#if openState.powerDistributionPanel === true || loadedState.powerDistributionPanel === true}
				<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td class="bold">STAT</td>
									<td class="bold">COMM</td>
								</tr>
								<tr>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
									<td class={LEDToggleState3Hz === true ? "green led" : "black led"}> </td>
									<td>Robot Enabled</td>
								</tr>
								<tr>
									<td class={LEDToggleState1Hz === true ? "green led" : "black led"}> </td>
									<td class={LEDToggleState1Hz === true ? "green led" : "black led"}> </td>
									<td>Robot Disabled</td>
								</tr>
								<tr>
									<td class={LEDToggleState1Hz === true ? "orange led" : "black led"}> </td>
									<td class={LEDToggleState1Hz === true ? "orange led" : "black led"}> </td>
									<td>Robot Disabled - Sticky Fault Present</td>
								</tr>
								<tr>
									<td class={LEDToggleState1Hz === true ? "red led" : "black led"}> </td>
									<td class={LEDToggleState1Hz === true ? "red led" : "black led"}> </td>
									<td>No CAN Communication</td>
								</tr>
								<tr>
									<td class="black led"> </td>
									<td class={LEDToggleState3Hz === true ? "green led" : "orange led"}> </td>
									<td>Device in Bootloader</td>
								</tr>
								<tr>
									<td class="black led"> </td>
									<td class="black led"> </td>
									<td>Device NOT Powered</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td>
							<table class="section-table">
								<tr>
									<td colspan="2" class="bold">
										<a class="underline" href="https://ctre.download/files/user-manual/PDP%20User's%20Guide.pdf">Source</a>
									</td>								
								</tr>
							</table>
						</td>
					</tr>
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
