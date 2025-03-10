<script lang="ts">
	import { Accordion, AccordionItem } from "flowbite-svelte";
	import QrCode from "svelte-qrcode";

	let openState = {
		wpilib: false,
		wpilibCommands: false,
		phoenix6: false,
		phoenix5: false,
		reduxLib: false,
		pwf: false,
		kauai: false,
		revLib: false,
		photon: false,
		pathPlanner: false,
		choreo: false,
		yagsl: false,
	};

	let loadedState = { ...openState };

	$: {
		if (openState.wpilib) loadedState.wpilib = true;
		if (openState.wpilibCommands) loadedState.wpilibCommands = true;
		if (openState.phoenix6) loadedState.phoenix6 = true;
		if (openState.phoenix5) loadedState.phoenix5 = true;
		if (openState.reduxLib) loadedState.reduxLib = true;
		if (openState.pwf) loadedState.pwf = true;
		if (openState.kauai) loadedState.kauai = true;
		if (openState.revLib) loadedState.revLib = true;
		if (openState.photon) loadedState.photon = true;
		if (openState.pathPlanner) loadedState.pathPlanner = true;
		if (openState.choreo) loadedState.choreo = true;
		if (openState.yagsl) loadedState.yagsl = true;
	}
</script>

<div class="container mx-auto p-2 pr-3 w-full">
	<h1 class="text-3xl font-bold">Software Documentation</h1>
	<p>To visit the links, please click or scan the QR Codes</p>

	<Accordion flush class="text-left">
		<!-- WPILib Section -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.wpilib}>
			<span slot="header" class="font-bold">WPILib</span>
			{#if loadedState.wpilib}
				<Accordion class="text-left">
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Java API Documentation</span>
						<a href="https://github.wpilib.org/allwpilib/docs/release/java/index.html" target="_blank">
							<QrCode value="https://github.wpilib.org/allwpilib/docs/release/java/index.html" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">C++ API Documentation</span>
						<a href="https://github.wpilib.org/allwpilib/docs/release/cpp/index.html" target="_blank">
							<QrCode value="https://github.wpilib.org/allwpilib/docs/release/cpp/index.html" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Python API Documentation</span>
						<a href="https://robotpy.readthedocs.io/projects/robotpy/en/stable/" target="_blank">
							<QrCode value="https://robotpy.readthedocs.io/projects/robotpy/en/stable/" padding={12} />
						</a>
					</AccordionItem>
				</Accordion>
			{/if}
		</AccordionItem>

		<!-- WPILib Commands Section -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.wpilibCommands}>
			<span slot="header" class="font-bold">WPILib Commands</span>
			{#if loadedState.wpilibCommands}
				<Accordion class="text-left">
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Main Documentation</span>
						<a href="https://docs.wpilib.org/en/stable/docs/software/commandbased/index.html" target="_blank">
							<QrCode value="https://docs.wpilib.org/en/stable/docs/software/commandbased/index.html" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Java API Documentation</span>
						<a href="https://docs.wpilib.org/en/stable/docs/software/commandbased/index.html" target="_blank">
							<QrCode value="https://docs.wpilib.org/en/stable/docs/software/commandbased/index.html" padding={12} />
						</a>
					</AccordionItem>
				</Accordion>
			{/if}
		</AccordionItem>

		<!-- Phoenix 6 Section -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.phoenix6}>
			<span slot="header" class="font-bold">CTRE Phoenix 6</span>
			{#if loadedState.phoenix6}
				<Accordion class="text-left">
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Main Documentation</span>
						<a href="https://v6.docs.ctr-electronics.com/en/stable/index.html" target="_blank">
							<QrCode value="https://v6.docs.ctr-electronics.com/en/stable/index.html" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Java API Documentation</span>
						<a href="https://api.ctr-electronics.com/phoenix6/release/java/" target="_blank">
							<QrCode value="https://api.ctr-electronics.com/phoenix6/release/java/" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">C++ API Documentation</span>
						<a href="https://api.ctr-electronics.com/phoenix6/release/cpp/" target="_blank">
							<QrCode value="https://api.ctr-electronics.com/phoenix6/release/cpp/" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Python API Documentation</span>
						<a href="https://api.ctr-electronics.com/phoenix6/release/python/" target="_blank">
							<QrCode value="https://api.ctr-electronics.com/phoenix6/release/python/" padding={12} />
						</a>
					</AccordionItem>
				</Accordion>
			{/if}
		</AccordionItem>

		<!-- Phoenix 5 Section -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.phoenix5}>
			<span slot="header" class="font-bold">CTRE Phoenix 5</span>
			{#if loadedState.phoenix5}
				<Accordion class="text-left">
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Main Documentation</span>
						<a href="https://v5.docs.ctr-electronics.com/en/stable/" target="_blank">
							<QrCode value="https://v5.docs.ctr-electronics.com/en/stable/" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Java API Documentation</span>
						<a href="https://api.ctr-electronics.com/phoenix/release/java/" target="_blank">
							<QrCode value="https://api.ctr-electronics.com/phoenix/release/java/" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">C++ API Documentation</span>
						<a href="https://api.ctr-electronics.com/phoenix/release/cpp/" target="_blank">
							<QrCode value="https://api.ctr-electronics.com/phoenix/release/cpp/" padding={12} />
						</a>
					</AccordionItem>
				</Accordion>
			{/if}
		</AccordionItem>

		<!-- ReduxLib Section -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.reduxLib}>
			<span slot="header" class="font-bold">ReduxLib</span>
			{#if loadedState.reduxLib}
				<Accordion class="text-left">
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Main Documentation</span>
						<a href="https://docs.reduxrobotics.com/reduxlib" target="_blank">
							<QrCode value="https://docs.reduxrobotics.com/reduxlib" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Java API Documentation</span>
						<a href="https://apidocs.reduxrobotics.com/current/java/" target="_blank">
							<QrCode value="https://apidocs.reduxrobotics.com/current/java/" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">C++ API Documentation</span>
						<a href="https://apidocs.reduxrobotics.com/current/cpp/" target="_blank">
							<QrCode value="https://apidocs.reduxrobotics.com/current/cpp/" padding={12} />
						</a>
					</AccordionItem>
				</Accordion>
			{/if}
		</AccordionItem>

		<!-- Playing With Fusion Section -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.pwf}>
			<span slot="header" class="font-bold">Playing With Fusion</span>
			{#if loadedState.pwf}
				<Accordion class="text-left">
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Java API Documentation</span>
						<a href="https://www.playingwithfusion.com/frc/2022/javadoc/com/playingwithfusion/package-summary.html" target="_blank">
							<QrCode value="https://www.playingwithfusion.com/frc/2022/javadoc/com/playingwithfusion/package-summary.html" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">C++ API Documentation</span>
						<a href="https://www.playingwithfusion.com/frc/2022/cppdoc/html/annotated.html" target="_blank">
							<QrCode value="https://www.playingwithfusion.com/frc/2022/cppdoc/html/annotated.html" padding={12} />
						</a>
					</AccordionItem>
				</Accordion>
			{/if}
		</AccordionItem>

		<!-- Kauai Labs Section -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.kauai}>
			<span slot="header" class="font-bold">Kauai Labs (navX MXP)</span>
			{#if loadedState.kauai}
				<Accordion class="text-left">
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Java API Documentation</span>
						<a href="https://www.kauailabs.com/public_files/navx-mxp/apidocs/java/com/kauailabs/navx/frc/package-summary.html" target="_blank">
							<QrCode
								value="https://www.kauailabs.com/public_files/navx-mxp/apidocs/java/com/kauailabs/navx/frc/package-summary.html"
								padding={12}
							/>
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">C++ API Documentation</span>
						<a href="https://www.kauailabs.com/public_files/navx-mxp/apidocs/c++/" target="_blank">
							<QrCode value="https://www.kauailabs.com/public_files/navx-mxp/apidocs/c++/" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">LabVIEW Documentation</span>
						<a href="https://www.kauailabs.com/public_files/navx-mxp/apidocs/labview/index.html" target="_blank">
							<QrCode value="https://www.kauailabs.com/public_files/navx-mxp/apidocs/labview/index.html" padding={12} />
						</a>
					</AccordionItem>
				</Accordion>
			{/if}
		</AccordionItem>

		<!-- REVLib Section -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.revLib}>
			<span slot="header" class="font-bold">REVLib</span>
			{#if loadedState.revLib}
				<Accordion class="text-left">
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Main Documentation</span>
						<a href="https://docs.revrobotics.com/docs/software-resources" target="_blank">
							<QrCode value="https://docs.revrobotics.com/docs/software-resources" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Java API Documentation</span>
						<a href="https://codedocs.revrobotics.com/java/com/revrobotics/package-summary.html" target="_blank">
							<QrCode value="https://codedocs.revrobotics.com/java/com/revrobotics/package-summary.html" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">C++ API Documentation</span>
						<a href="https://codedocs.revrobotics.com/cpp/namespacerev.html" target="_blank">
							<QrCode value="https://codedocs.revrobotics.com/cpp/namespacerev.html" padding={12} />
						</a>
					</AccordionItem>
				</Accordion>
			{/if}
		</AccordionItem>

		<!-- PhotonVision Section -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.photon}>
			<span slot="header" class="font-bold">PhotonVision</span>
			{#if loadedState.photon}
				<Accordion class="text-left">
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Main Documentation</span>
						<a href="https://docs.photonvision.org/en/latest/docs/description.html" target="_blank">
							<QrCode value="https://docs.photonvision.org/en/latest/docs/description.html" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Java API Documentation</span>
						<a href="https://javadocs.photonvision.org/" target="_blank">
							<QrCode value="https://javadocs.photonvision.org/" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">C++ API Documentation</span>
						<a href="https://cppdocs.photonvision.org/" target="_blank">
							<QrCode value="https://cppdocs.photonvision.org/" padding={12} />
						</a>
					</AccordionItem>
				</Accordion>
			{/if}
		</AccordionItem>

		<!-- PathPlanner Section -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.pathPlanner}>
			<span slot="header" class="font-bold">PathPlanner</span>
			{#if loadedState.pathPlanner}
				<Accordion class="text-left">
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Main Documentation</span>
						<a href="https://pathplanner.dev/home.html" target="_blank">
							<QrCode value="https://pathplanner.dev/home.html" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Java API Documentation</span>
						<a href="https://pathplanner.dev/api/java/" target="_blank">
							<QrCode value="https://pathplanner.dev/api/java/" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">C++ API Documentation</span>
						<a href="https://pathplanner.dev/api/cpp/" target="_blank">
							<QrCode value="https://pathplanner.dev/api/cpp/" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Python API Documentation</span>
						<a href="https://pathplanner.dev/api/python/" target="_blank">
							<QrCode value="https://pathplanner.dev/api/python/" padding={12} />
						</a>
					</AccordionItem>
				</Accordion>
			{/if}
		</AccordionItem>

		<!-- Choreo Section -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.choreo}>
			<span slot="header" class="font-bold">Choreo</span>
			{#if loadedState.choreo}
				<Accordion class="text-left">
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Main Documentation</span>
						<a href="https://choreo.autos/" target="_blank">
							<QrCode value="https://choreo.autos/" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Java API Documentation</span>
						<a href="https://choreo.autos/api/choreolib/java/index.html" target="_blank">
							<QrCode value="https://choreo.autos/api/choreolib/java/index.html" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">C++ API Documentation</span>
						<a href="https://choreo.autos/api/choreolib/cpp/index.html" target="_blank">
							<QrCode value="https://choreo.autos/api/choreolib/cpp/index.html" padding={12} />
						</a>
					</AccordionItem>
				</Accordion>
			{/if}
		</AccordionItem>

		<!-- YAGSL Section -->
		<AccordionItem class="text-black dark:text-white" bind:open={openState.yagsl}>
			<span slot="header" class="font-bold">YAGSL</span>
			{#if loadedState.yagsl}
				<Accordion class="text-left">
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Main Documentation</span>
						<a href="https://docs.yagsl.com/" target="_blank">
							<QrCode value="https://docs.yagsl.com/" padding={12} />
						</a>
					</AccordionItem>
					<AccordionItem class="text-black dark:text-white">
						<span slot="header">Java API Documentation</span>
						<a href="https://broncbotz3481.github.io/YAGSL-Lib/docs/" target="_blank">
							<QrCode value="https://broncbotz3481.github.io/YAGSL-Lib/docs/" padding={12} />
						</a>
					</AccordionItem>
				</Accordion>
			{/if}
		</AccordionItem>
	</Accordion>
</div>
