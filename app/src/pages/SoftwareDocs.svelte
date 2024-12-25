<script lang="ts">
    import { Accordion, AccordionItem } from "flowbite-svelte";
    import QrCode from "svelte-qrcode";
</script>

<div class="container mx-auto p-2 pr-3 w-full">
    <h1 class="text-3xl" style="font-weight: bold">Software Documentation</h1>
    <p>To visit the links, please click or scan the QR Codes</p>
    <Accordion flush class="text-left">
        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">WPILib</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Java API Documentation</span>
                    <a href="https://github.wpilib.org/allwpilib/docs/release/java/index.html"><QrCode value="https://github.wpilib.org/allwpilib/docs/release/java/index.html" padding={5} /></a>
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">C++ API Documentation</span>
                    <a href="https://github.wpilib.org/allwpilib/docs/release/cpp/index.html"><QrCode value="https://github.wpilib.org/allwpilib/docs/release/cpp/index.html" padding={5} /></a>
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Python API Documentation</span>
                    <a href="https://robotpy.readthedocs.io/projects/robotpy/en/stable/"><QrCode value="https://robotpy.readthedocs.io/projects/robotpy/en/stable/" padding={5} /></a>
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">WPILib Commands</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Main Documentation</span>
                    <a href="https://docs.wpilib.org/en/stable/docs/software/commandbased/index.html"><QrCode value="https://docs.wpilib.org/en/stable/docs/software/commandbased/index.html" padding={5} /></a>
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Java API Documentation</span>
                    <a href="https://docs.wpilib.org/en/stable/docs/software/commandbased/index.html"><QrCode value="https://docs.wpilib.org/en/stable/docs/software/commandbased/index.html" padding={5} /></a>
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">CTRE Phoenix 6</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Main Documentation</span>
                    <a href="https://api.ctr-electronics.com/phoenix6/release/java/"><QrCode value="https://api.ctr-electronics.com/phoenix6/release/java/" padding={5} /></a>
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Java API Documentation</span>
                    <a href="https://api.ctr-electronics.com/phoenix6/release/java/"><QrCode value="https://api.ctr-electronics.com/phoenix6/release/java/" padding={5} /></a>
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">C++ API Documentation</span>
                    <a href="https://api.ctr-electronics.com/phoenix6/release/cpp/"><QrCode value="https://api.ctr-electronics.com/phoenix6/release/cpp/" padding={5} /></a>
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Python API Documentation</span>
                    <a href="https://api.ctr-electronics.com/phoenix6/release/python/"><QrCode value="https://api.ctr-electronics.com/phoenix6/release/python/" padding={5} /></a>
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">CTRE Phoenix 5</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Main Documentation</span>
                    <a href="https://v5.docs.ctr-electronics.com/en/stable/"><QrCode value="https://v5.docs.ctr-electronics.com/en/stable/" padding={5} /></a>
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Java API Documentation</span>
                    <a href="https://api.ctr-electronics.com/phoenix/release/java/"><QrCode value="https://api.ctr-electronics.com/phoenix/release/java/" padding={5} /></a>
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">C++ API Documentation</span>
                    <a href="https://api.ctr-electronics.com/phoenix/release/cpp/"><QrCode value="https://api.ctr-electronics.com/phoenix/release/cpp/" padding={5} /></a>
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">ReduxLib</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Main Documentation</span>
                    <a href="https://docs.reduxrobotics.com/reduxlib"><QrCode value="https://docs.reduxrobotics.com/reduxlib" padding={5} /></a>
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Java API Documentation</span>
                    <a href="https://apidocs.reduxrobotics.com/current/java/"><QrCode value="https://apidocs.reduxrobotics.com/current/java/" padding={5} /></a>
                </AccordionItem>
                
                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">C++ API Documentation</span>
                    <a href="https://apidocs.reduxrobotics.com/current/cpp/"><QrCode value="https://apidocs.reduxrobotics.com/current/cpp/" padding={5} /></a>
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">Playing With Fusion</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Main Documentation NEED TO EDIT</span>
                    <a href="https://docs.reduxrobotics.com/reduxlib"><QrCode value="https://docs.reduxrobotics.com/reduxlib" padding={5} /></a>
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">Kauai Labs (navX MXP)</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Java API Documentation</span>
                    <a href="https://www.kauailabs.com/public_files/navx-mxp/apidocs/java/com/kauailabs/navx/frc/package-summary.html"><QrCode value="https://www.kauailabs.com/public_files/navx-mxp/apidocs/java/com/kauailabs/navx/frc/package-summary.html" padding={5} /></a>
                </AccordionItem>
                
                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">C++ API Documentation</span>
                    <a href="https://www.kauailabs.com/public_files/navx-mxp/apidocs/c++/"><QrCode value="https://www.kauailabs.com/public_files/navx-mxp/apidocs/c++/" padding={5} /></a>
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Labview Documentation</span>
                    <a href="https://www.kauailabs.com/public_files/navx-mxp/apidocs/labview/index.html"><QrCode value="https://www.kauailabs.com/public_files/navx-mxp/apidocs/labview/index.html" padding={5} /></a>
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">REVLib</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Main Documentation</span>
                    <a href="https://docs.revrobotics.com/docs/software-resources"><QrCode value="https://docs.revrobotics.com/docs/software-resources" padding={5} /></a>
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Java API Documentation</span>
                    <a href="https://codedocs.revrobotics.com/java/com/revrobotics/package-summary.html"><QrCode value="https://codedocs.revrobotics.com/java/com/revrobotics/package-summary.html" padding={5} /></a>
                </AccordionItem>
                
                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">C++ API Documentation</span>
                    <a href="https://codedocs.revrobotics.com/cpp/namespacerev.html"><QrCode value="https://codedocs.revrobotics.com/cpp/namespacerev.html" padding={5} /></a>
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">PhotonVision</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Main Documentation</span>
                    <a href="https://docs.photonvision.org/en/latest/docs/description.html"><QrCode value="https://docs.photonvision.org/en/latest/docs/description.html" padding={5} /></a>
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Java API Documentation</span>
                    <a href="https://javadocs.photonvision.org/"><QrCode value="https://javadocs.photonvision.org/" padding={5} /></a>
                </AccordionItem>
                
                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">C++ API Documentation</span>
                    <a href="https://cppdocs.photonvision.org/"><QrCode value="https://cppdocs.photonvision.org/" padding={5} /></a>
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">PathPlanner</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Main Documentation</span>
                    <a href="https://pathplanner.dev/home.html"><QrCode value="https://pathplanner.dev/home.html" padding={5} /></a>
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Java API Documentation</span>
                    <a href="https://pathplanner.dev/api/java/"><QrCode value="https://pathplanner.dev/api/java/" padding={5} /></a>
                </AccordionItem>
                
                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">C++ API Documentation</span>
                    <a href="https://pathplanner.dev/api/cpp/"><QrCode value="https://pathplanner.dev/api/cpp/" padding={5} /></a>
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Python API Documentation</span>
                    <a href="https://pathplanner.dev/api/python/"><QrCode value="https://pathplanner.dev/api/python/" padding={5} /></a>
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">Choreo</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Main Documentation</span>
                    <a href="https://choreo.autos/"><QrCode value="https://choreo.autos/" padding={5} /></a>
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Java API Documentation</span>
                    <a href="https://choreo.autos/api/choreolib/java/index.html"><QrCode value="https://choreo.autos/api/choreolib/java/index.html" padding={5} /></a>
                </AccordionItem>
                
                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">C++ API Documentation</span>
                    <a href="https://choreo.autos/api/choreolib/cpp/index.html"><QrCode value="https://choreo.autos/api/choreolib/cpp/index.html" padding={5} /></a>
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">Yet Another Generic Swerve Library (YAGSL)</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Main Documentation</span>
                    <a href="https://docs.yagsl.com/"><QrCode value="https://docs.yagsl.com/" padding={5} /></a>
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white">
                    <span slot="header">Java API Documentation</span>
                    <a href="https://broncbotz3481.github.io/YAGSL-Lib/docs/"><QrCode value="https://broncbotz3481.github.io/YAGSL-Lib/docs/" padding={5} /></a>
                </AccordionItem>
            </Accordion>
        </AccordionItem>
    </Accordion>
</div>