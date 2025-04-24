<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Accordion, AccordionItem, Button } from "flowbite-svelte";
	import QrCode from "svelte-qrcode";
	import { settingsStore } from "../../stores/settings";
</script>

<div class="container mx-auto p-2 pr-3 w-full">
	<h1 class="text-3xl" style="font-weight: bold">References</h1>

	<div class="grid grid-cols-3 gap-2 mt-2">
		<Button href="/references/statuslights" class="flex-col p-2 md:p-4 text-xs md:text-sm" outline
			><Icon icon="heroicons:sun-16-solid" class="size-6 md:size-8" /> Status Lights</Button
		>
		<Button href="/references/softwaredocs" class="flex-col p-2 md:p-4 text-xs md:text-sm" outline
			><Icon icon="ion:library" class="size-6 md:size-8" /> Software Docs</Button
		>
		<Button href="/references/wiringdiagrams" class="flex-col p-2 md:p-4 text-xs md:text-sm" outline
			><Icon icon="fa6-solid:chart-diagram" class="size-6 md:size-8" /> Wiring Diagrams</Button
		>
		<div class="grid grid-cols-2 gap-2 col-span-3">
			<Button href="/references/componentmanuals" class="flex-col p-2 md:p-4 text-xs md:text-sm" outline
				><Icon icon="streamline:manual-book-solid" class="size-6 md:size-8" /> Component Manuals</Button
			>
			<Button href="/references/fieldmanuals" class="flex-col p-2 md:p-4 text-xs md:text-sm" outline
				><Icon icon="tabler:soccer-field" class="size-6 md:size-8" /> Field Manuals</Button
			>
		</div>
	</div>

	{#if $settingsStore.fimSpecifics}
		<div class="mt-2">
			FIM AV: <a href="https://docs.fimav.us/" target="_blank" class="underline">docs.fimav.us</a>
		</div>
	{/if}

	<Accordion flush class="text-left">
		<AccordionItem class="text-black dark:text-white">
			<span slot="header" class="font-bold">Keyboard Shortcuts</span>

			<h3 style="padding: 2pt;">Driver Station</h3>

			<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
				<tbody>
					<tr>
						<td>
							<table class="section-table">
								<tbody>
									<tr>
										<td width="125"><code>F1</code></td>
										<td>Joystick rescan</td>
									</tr>
									<tr>
										<td
											><code>[</code> + <code>]</code> +
											<code>\</code></td
										>
										<td>Enable Robot</td>
									</tr>
									<tr>
										<td><code>Enter</code></td>
										<td>Disable Robot</td>
									</tr>
									<tr>
										<td><code>Space</code></td>
										<td>E-Stop</td>
									</tr>
								</tbody>
							</table>
						</td>
					</tr>
				</tbody>
			</table>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header" class="font-bold">Team IP Addresses</span>

			<h3 style="padding: 2pt;">IP Config Guide Link</h3>

			<a href="https://docs.wpilib.org/en/stable/docs/networking/networking-introduction/ip-configurations.html" target="_blank">
				<QrCode value="https://docs.wpilib.org/en/stable/docs/networking/networking-introduction/ip-configurations.html" padding={5} />
			</a>

			<h3 style="padding: 2pt;">IP Address Format</h3>

			<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
				<tbody>
					<tr>
						<td>
							<table class="section-table">
								<tbody>
									<tr>
										<td width="125">Team 1</td>
										<td>10.0.1.x</td>
									</tr>
									<tr>
										<td>Team 12</td>
										<td>10.0.12.x</td>
									</tr>
									<tr>
										<td>Team 123</td>
										<td>10.1.23.x</td>
									</tr>
									<tr>
										<td>Team 1234</td>
										<td>10.12.34.x</td>
									</tr>
									<tr>
										<td>Team 12345</td>
										<td>10.123.45.x</td>
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
										<td width="125">Robot Radio</td>
										<td>10.TE.AM.1</td>
									</tr>
									<tr>
										<td>roboRIO</td>
										<td>10.TE.AM.2</td>
									</tr>
									<tr>
										<td>roboRIO USB</td>
										<td>172.22.11.2</td>
									</tr>
									<tr>
										<td>roboRIO Name</td>
										<td>roborio-TEAM-frc.local</td>
									</tr>
								</tbody>
							</table>
						</td>
					</tr>
					<tr>
						<td>
							<h3>On-Field Static IP Configuration</h3>
							<table class="section-table">
								<tbody>
									<tr>
										<td width="125">IP Address</td>
										<td>10.TE.AM.5</td>
									</tr>
									<tr>
										<td>Default Gateway</td>
										<td>10.TE.AM.4</td>
									</tr>
									<tr>
										<td>Subnet Mask</td>
										<td>255.255.255.0</td>
									</tr>
								</tbody>
							</table>
						</td>
					</tr>
				</tbody>
			</table>
		</AccordionItem>

		<AccordionItem class="text-black dark:text-white">
			<span slot="header" class="font-bold">Helpful Commands</span>

			<table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
				<tbody>
					<tr>
						<td>
							<table class="section-table">
								<tbody>
									<tr>
										<td width="125">ncpa.cpl</td>
										<td>Network adapters</td>
									</tr>
									<tr>
										<td>wf.msc</td>
										<td>Windows firewall</td>
									</tr>
									<tr>
										<td>ipconfig</td>
										<td>Show network settings</td>
									</tr>
									<tr>
										<td>ipconfig /release</td>
										<td>Release DHCP address</td>
									</tr>
									<tr>
										<td>ipconfig /renew</td>
										<td>Acquire DHCP address</td>
									</tr>
									<tr>
										<td>ping 10.TE.AM.255</td>
										<td>Scans network</td>
									</tr>
									<tr>
										<td>arp -a</td>
										<td>Shows reachable IPs</td>
									</tr>
								</tbody>
							</table>
						</td>
					</tr>
				</tbody>
			</table>
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
		width: 325px;
	}
	.section-table td {
		border: 0;
	}
	.highlight {
		background-color: #fbc02d;
		font-weight: bold;
		color: #000000;
	}
	.section-table td {
		vertical-align: top;
	}
	code {
		background-color: #212121;
		border-radius: 2px;
		padding: 1px 2px;
	}
</style>
