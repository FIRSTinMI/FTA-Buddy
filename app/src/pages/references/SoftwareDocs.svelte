<script lang="ts">
    import { Accordion, AccordionItem } from "flowbite-svelte";
    import QrCode from "svelte-qrcode";

    let wpilibOpenState = {
        java: false,
        cpp: false,
        python: false,
    }
    let wpilibLoadState = {
        java: false,
        cpp: false,
        python: false,
    }

    let wpilibComOpenState = {
        main: false,
        java: false,
        python: false,
    }
    let wpilibComLoadState = {
        java: false,
        main: false,
        python: false,
    }

    let phoenix6OpenState = {
        main: false,
        java: false,
        cpp: false,
        python: false,
    }
    let phoenix6LoadState = {
        main: false,
        java: false,
        cpp: false,
        python: false,
    }

    let phoenix5OpenState = {
        main: false,
        java: false,
        cpp: false,
    }
    let phoenix5LoadState = {
        main: false,
        java: false,
        cpp: false,
    }

    let reduxlibOpenState = {
        main: false,
        java: false,
        cpp: false,
    }
    let reduxlibLoadState = {
        main: false,
        java: false,
        cpp: false,
    }

    let pwfOpenState = {
        java: false,
        cpp: false, 
    }
    let pwfLoadState = {
        java: false,
        cpp: false, 
    }

    let kauaiOpenState = {
        java: false,
        cpp: false,
        labview: false,
    }
    let kauaiLoadState = {
        java: false,
        cpp: false,
        labview: false,
    }

    let revlibOpenState = {
        main: false,
        java: false,
        cpp: false,
    }
    let revlibLoadState = {
        main: false,
        java: false,
        cpp: false,
    }

    let photonOpenState = {
        main: false,
        java: false,
        cpp: false,
    }
    let photonLoadState = {
        main: false,
        java: false,
        cpp: false,
    }

    let pathplannerOpenState = {
        main: false,
        java: false,
        cpp: false,
        python: false,
    }
    let pathplannerLoadState = {
        main: false,
        java: false,
        cpp: false,
        python: false,
    }

    let choreoOpenState = {
        main: false,
        java: false,
        cpp: false,
    }
    let choreoLoadState = {
        main: false,
        java: false,
        cpp: false,
    }

    let yagslOpenState = {
        main: false,
        java: false,
    }
    let yagslLoadState = {
        main: false,
        java: false,
    }

    $: { if (wpilibOpenState.java) wpilibLoadState.java = true; }
    $: { if (wpilibOpenState.cpp) wpilibLoadState.cpp = true; }
    $: { if (wpilibOpenState.python) wpilibLoadState.python = true; }

    $: { if (wpilibComOpenState.main) wpilibComLoadState.main = true; }
    $: { if (wpilibComOpenState.java) wpilibComLoadState.java = true; }

    $: { if (phoenix6OpenState.main) phoenix6LoadState.main = true; }
    $: { if (phoenix6OpenState.java) phoenix6LoadState.java = true; }
    $: { if (phoenix6OpenState.cpp) phoenix6LoadState.cpp = true; }
    $: { if (phoenix6OpenState.python) phoenix6LoadState.python = true; }
    
    $: { if (phoenix5OpenState.main) phoenix5LoadState.main = true; }
    $: { if (phoenix5OpenState.java) phoenix5LoadState.java = true; }
    $: { if (phoenix5OpenState.cpp) phoenix5LoadState.cpp = true; }
    
    $: { if (reduxlibOpenState.main) reduxlibLoadState.main = true; }
    $: { if (reduxlibOpenState.main) reduxlibLoadState.main = true; }
    $: { if (reduxlibOpenState.main) reduxlibLoadState.main = true; }
    
    $: { if (pwfOpenState.java) pwfLoadState.java = true; }
    $: { if (pwfOpenState.cpp) pwfLoadState.cpp = true; }
    
    $: { if (kauaiOpenState.java) kauaiLoadState.java = true; }
    $: { if (kauaiOpenState.cpp) kauaiLoadState.cpp = true; }
    $: { if (kauaiOpenState.labview) kauaiLoadState.labview = true; }
    
    $: { if (revlibOpenState.main) revlibLoadState.main = true; }
    $: { if (revlibOpenState.cpp) revlibLoadState.cpp = true; }
    $: { if (revlibOpenState.java) revlibLoadState.java = true; }
    
    $: { if (photonOpenState.java) photonLoadState.java = true; }
    $: { if (photonOpenState.java) photonLoadState.java = true; }
    $: { if (photonOpenState.java) photonLoadState.java = true; }
    
    $: { if (pathplannerOpenState.main) pathplannerLoadState.main = true; }
    $: { if (pathplannerOpenState.java) pathplannerLoadState.java = true; }
    $: { if (pathplannerOpenState.cpp) pathplannerLoadState.cpp = true; }
    $: { if (pathplannerOpenState.python) pathplannerLoadState.python = true; }
    
    $: { if (choreoOpenState.main) choreoLoadState.main = true; }
    $: { if (choreoOpenState.java) choreoLoadState.java = true; }
    $: { if (choreoOpenState.cpp) choreoLoadState.cpp = true; }
    
    $: { if (yagslOpenState.main) yagslOpenState.main = true; }
    $: { if (yagslOpenState.java) yagslOpenState.java = true; }

</script>

<div class="container mx-auto p-2 pr-3 w-full">
    <h1 class="text-3xl" style="font-weight: bold">Software Documentation</h1>
    <p>To visit the links, please click or scan the QR Codes</p>
    <Accordion flush class="text-left">
        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">WPILib</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white" bind:open={wpilibOpenState.java}>
                    <span slot="header">Java API Documentation</span>
                    {#if wpilibOpenState.java === true || wpilibLoadState.java === true}
                        <a href="https://github.wpilib.org/allwpilib/docs/release/java/index.html" target="_blank"><QrCode value="https://github.wpilib.org/allwpilib/docs/release/java/index.html" padding={5} /></a>
                    {/if}
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white" bind:open={wpilibOpenState.cpp}>
                    <span slot="header">C++ API Documentation</span>
                    {#if wpilibOpenState.cpp === true || wpilibLoadState.cpp === true}
                        <a href="https://github.wpilib.org/allwpilib/docs/release/cpp/index.html" target="_blank"><QrCode value="https://github.wpilib.org/allwpilib/docs/release/cpp/index.html" padding={5} /></a>
                    {/if}
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white" bind:open={wpilibOpenState.python}>
                    <span slot="header">Python API Documentation</span>
                    {#if wpilibOpenState.python === true || wpilibLoadState.python === true}
                        <a href="https://robotpy.readthedocs.io/projects/robotpy/en/stable/" target="_blank"><QrCode value="https://robotpy.readthedocs.io/projects/robotpy/en/stable/" padding={5} /></a>
                    {/if}
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">WPILib Commands</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white" bind:open={wpilibComOpenState.main}>
                    <span slot="header">Main Documentation</span>
                    {#if wpilibComOpenState.main === true || wpilibComLoadState.main === true}
                        <a href="https://docs.wpilib.org/en/stable/docs/software/commandbased/index.html" target="_blank"><QrCode value="https://docs.wpilib.org/en/stable/docs/software/commandbased/index.html" padding={5} /></a>
                    {/if}
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white" bind:open={wpilibComOpenState.java}>
                    <span slot="header">Java API Documentation</span>
                    {#if wpilibComOpenState.java === true || wpilibComLoadState.java === true}
                        <a href="https://docs.wpilib.org/en/stable/docs/software/commandbased/index.html" target="_blank"><QrCode value="https://docs.wpilib.org/en/stable/docs/software/commandbased/index.html" padding={5} /></a>
                    {/if}
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white" bind:open={wpilibComOpenState.python}>
                    <span slot="header">Python API Documentation</span>
                    {#if wpilibComOpenState.python === true || wpilibComLoadState.python === true}
                        <a href="https://docs.wpilib.org/en/stable/docs/software/commandbased/index.html" target="_blank"><QrCode value="https://docs.wpilib.org/en/stable/docs/software/commandbased/index.html" padding={5} /></a>
                    {/if}
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">CTRE Phoenix 6</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white" bind:open={phoenix6OpenState.main}>
                    <span slot="header">Main Documentation</span>
                    {#if phoenix6OpenState.main === true || phoenix6LoadState.main === true}
                        <a href="https://api.ctr-electronics.com/phoenix6/release/java/" target="_blank"><QrCode value="https://api.ctr-electronics.com/phoenix6/release/java/" padding={5} /></a>
                    {/if}
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white" bind:open={phoenix6OpenState.java}>
                    <span slot="header">Java API Documentation</span>
                    {#if phoenix6OpenState.java === true || phoenix6LoadState.java === true}
                        <a href="https://api.ctr-electronics.com/phoenix6/release/java/" target="_blank"><QrCode value="https://api.ctr-electronics.com/phoenix6/release/java/" padding={5} /></a>
                    {/if}
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white" bind:open={phoenix6OpenState.cpp}>
                    <span slot="header">C++ API Documentation</span>
                    {#if phoenix6OpenState.cpp === true || phoenix6LoadState.cpp === true}
                        <a href="https://api.ctr-electronics.com/phoenix6/release/cpp/" target="_blank"><QrCode value="https://api.ctr-electronics.com/phoenix6/release/cpp/" padding={5} /></a>
                    {/if}
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white" bind:open={phoenix6OpenState.python}>
                    <span slot="header">Python API Documentation</span>
                    {#if phoenix6OpenState.python === true || phoenix6LoadState.python === true}
                        <a href="https://api.ctr-electronics.com/phoenix6/release/python/" target="_blank"><QrCode value="https://api.ctr-electronics.com/phoenix6/release/python/" padding={5} /></a>
                    {/if}
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">CTRE Phoenix 5</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white" bind:open={phoenix5OpenState.main}>
                    <span slot="header">Main Documentation</span>
                    {#if phoenix5OpenState.main === true || phoenix5LoadState.main === true}
                        <a href="https://v5.docs.ctr-electronics.com/en/stable/" target="_blank"><QrCode value="https://v5.docs.ctr-electronics.com/en/stable/" padding={5} /></a>
                    {/if}
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white" bind:open={phoenix5OpenState.java}>
                    <span slot="header">Java API Documentation</span>
                    {#if phoenix5OpenState.java === true || phoenix5LoadState.java === true}
                        <a href="https://api.ctr-electronics.com/phoenix/release/java/" target="_blank"><QrCode value="https://api.ctr-electronics.com/phoenix/release/java/" padding={5} /></a>
                    {/if}
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white" bind:open={phoenix5OpenState.cpp}>
                    <span slot="header">C++ API Documentation</span>
                    {#if phoenix5OpenState.cpp === true || phoenix5LoadState.cpp === true}
                        <a href="https://api.ctr-electronics.com/phoenix/release/cpp/" target="_blank"><QrCode value="https://api.ctr-electronics.com/phoenix/release/cpp/" padding={5} /></a>
                    {/if}
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">ReduxLib</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white" bind:open={reduxlibOpenState.main}>
                    <span slot="header">Main Documentation</span>
                    {#if reduxlibOpenState.main === true || reduxlibLoadState.main === true}
                        <a href="https://docs.reduxrobotics.com/reduxlib" target="_blank"><QrCode value="https://docs.reduxrobotics.com/reduxlib" padding={5} /></a>
                    {/if}
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white" bind:open={reduxlibOpenState.java}>
                    <span slot="header">Java API Documentation</span>
                    {#if reduxlibOpenState.java === true || reduxlibLoadState.java === true}
                        <a href="https://apidocs.reduxrobotics.com/current/java/" target="_blank"><QrCode value="https://apidocs.reduxrobotics.com/current/java/" padding={5} /></a>
                    {/if}
                </AccordionItem>
                
                <AccordionItem class="text-black dark:text-white" bind:open={reduxlibOpenState.cpp}>
                    <span slot="header">C++ API Documentation</span>
                    {#if reduxlibOpenState.cpp === true || reduxlibLoadState.cpp === true}
                        <a href="https://apidocs.reduxrobotics.com/current/cpp/" target="_blank"><QrCode value="https://apidocs.reduxrobotics.com/current/cpp/" padding={5} /></a>
                    {/if}
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">Playing With Fusion</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white" bind:open={pwfOpenState.java}>
                    <span slot="header">Java API Documentation</span>
                    {#if pwfOpenState.java === true || pwfLoadState.java === true}
                        <a href="https://www.playingwithfusion.com/frc/2022/javadoc/com/playingwithfusion/package-summary.html" target="_blank"><QrCode value="https://www.playingwithfusion.com/frc/2022/javadoc/com/playingwithfusion/package-summary.html" padding={5} /></a>
                    {/if}
                </AccordionItem>
                <AccordionItem class="text-black dark:text-white" bind:open={pwfOpenState.cpp}>
                    <span slot="header">C++ API Documentation</span>
                    {#if pwfOpenState.cpp === true || pwfLoadState.cpp === true}
                        <a href="https://www.playingwithfusion.com/frc/2022/cppdoc/html/annotated.html" target="_blank"><QrCode value="https://www.playingwithfusion.com/frc/2022/cppdoc/html/annotated.html" padding={5} /></a>
                    {/if}
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">Kauai Labs (navX MXP)</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white" bind:open={kauaiOpenState.java}>
                    <span slot="header">Java API Documentation</span>
                    {#if kauaiOpenState.java === true || kauaiLoadState.java === true}
                        <a href="https://www.kauailabs.com/public_files/navx-mxp/apidocs/java/com/kauailabs/navx/frc/package-summary.html" target="_blank"><QrCode value="https://www.kauailabs.com/public_files/navx-mxp/apidocs/java/com/kauailabs/navx/frc/package-summary.html" padding={5} /></a>
                    {/if}
                </AccordionItem>
                
                <AccordionItem class="text-black dark:text-white" bind:open={kauaiOpenState.cpp}>
                    <span slot="header">C++ API Documentation</span>
                    {#if kauaiOpenState.cpp === true || kauaiLoadState.cpp === true}
                        <a href="https://www.kauailabs.com/public_files/navx-mxp/apidocs/c++/" target="_blank"><QrCode value="https://www.kauailabs.com/public_files/navx-mxp/apidocs/c++/" padding={5} /></a>
                    {/if}
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white" bind:open={kauaiOpenState.labview}>
                    <span slot="header">Labview Documentation</span>
                    {#if kauaiOpenState.labview === true || kauaiLoadState.labview === true}
                        <a href="https://www.kauailabs.com/public_files/navx-mxp/apidocs/labview/index.html" target="_blank"><QrCode value="https://www.kauailabs.com/public_files/navx-mxp/apidocs/labview/index.html" padding={5} /></a>
                    {/if}
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">REVLib</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white" bind:open={revlibOpenState.main}>
                    <span slot="header">Main Documentation</span>
                    {#if revlibOpenState.main === true || revlibLoadState.main === true}
                        <a href="https://docs.revrobotics.com/docs/software-resources" target="_blank"><QrCode value="https://docs.revrobotics.com/docs/software-resources" padding={5} /></a>
                    {/if}
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white" bind:open={revlibOpenState.java}>
                    <span slot="header">Java API Documentation</span>
                    {#if revlibOpenState.java === true || revlibLoadState.java === true}
                        <a href="https://codedocs.revrobotics.com/java/com/revrobotics/package-summary.html" target="_blank"><QrCode value="https://codedocs.revrobotics.com/java/com/revrobotics/package-summary.html" padding={5} /></a>
                    {/if}
                </AccordionItem>
                
                <AccordionItem class="text-black dark:text-white" bind:open={revlibOpenState.cpp}>
                    <span slot="header">C++ API Documentation</span>
                    {#if revlibOpenState.cpp === true || revlibLoadState.cpp === true}
                        <a href="https://codedocs.revrobotics.com/cpp/namespacerev.html" target="_blank"><QrCode value="https://codedocs.revrobotics.com/cpp/namespacerev.html" padding={5} /></a>
                    {/if}
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">PhotonVision</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white" bind:open={photonOpenState.main}>
                    <span slot="header">Main Documentation</span>
                    {#if photonOpenState.main === true || photonLoadState.main === true}
                        <a href="https://docs.photonvision.org/en/latest/docs/description.html" target="_blank"><QrCode value="https://docs.photonvision.org/en/latest/docs/description.html" padding={5} /></a>
                    {/if}
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white" bind:open={photonOpenState.java}>
                    <span slot="header">Java API Documentation</span>
                    {#if photonOpenState.java === true || photonLoadState.java === true}
                        <a href="https://javadocs.photonvision.org/" target="_blank"><QrCode value="https://javadocs.photonvision.org/" padding={5} /></a>
                    {/if}
                </AccordionItem>
                
                <AccordionItem class="text-black dark:text-white" bind:open={photonOpenState.cpp}>
                    <span slot="header">C++ API Documentation</span>
                    {#if photonOpenState.cpp === true || photonLoadState.cpp === true}
                        <a href="https://cppdocs.photonvision.org/" target="_blank"><QrCode value="https://cppdocs.photonvision.org/" padding={5} /></a>
                    {/if}
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">PathPlanner</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white" bind:open={pathplannerOpenState.main}>
                    <span slot="header">Main Documentation</span>
                    {#if pathplannerOpenState.main === true || pathplannerLoadState.main === true}
                        <a href="https://pathplanner.dev/home.html" target="_blank"><QrCode value="https://pathplanner.dev/home.html" padding={5} /></a>
                    {/if}
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white" bind:open={pathplannerOpenState.java}>
                    <span slot="header">Java API Documentation</span>
                    {#if pathplannerOpenState.java === true || pathplannerLoadState.java === true}
                        <a href="https://pathplanner.dev/api/java/" target="_blank"><QrCode value="https://pathplanner.dev/api/java/" padding={5} /></a>
                    {/if}
                </AccordionItem>
                
                <AccordionItem class="text-black dark:text-white" bind:open={pathplannerOpenState.cpp}>
                    <span slot="header">C++ API Documentation</span>
                    {#if pathplannerOpenState.cpp === true || pathplannerLoadState.cpp === true}
                        <a href="https://pathplanner.dev/api/cpp/" target="_blank"><QrCode value="https://pathplanner.dev/api/cpp/" padding={5} /></a>
                    {/if}
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white" bind:open={pathplannerOpenState.python}>
                    <span slot="header">Python API Documentation</span>
                    {#if pathplannerOpenState.python === true || pathplannerLoadState.python === true}
                        <a href="https://pathplanner.dev/api/python/" target="_blank"><QrCode value="https://pathplanner.dev/api/python/" padding={5} /></a>
                    {/if}
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">Choreo</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white" bind:open={choreoOpenState.main}>
                    <span slot="header">Main Documentation</span>
                    {#if choreoOpenState.main === true || choreoLoadState.main === true}
                        <a href="https://choreo.autos/" target="_blank"><QrCode value="https://choreo.autos/" padding={5} /></a>
                    {/if}
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white" bind:open={choreoOpenState.java}>
                    <span slot="header">Java API Documentation</span>
                    {#if choreoOpenState.java === true || choreoLoadState.java === true}
                        <a href="https://choreo.autos/api/choreolib/java/index.html" target="_blank"><QrCode value="https://choreo.autos/api/choreolib/java/index.html" padding={5} /></a>
                    {/if}
                </AccordionItem>
                
                <AccordionItem class="text-black dark:text-white" bind:open={choreoOpenState.cpp}>
                    <span slot="header">C++ API Documentation</span>
                    {#if choreoOpenState.cpp === true || choreoLoadState.cpp === true}
                        <a href="https://choreo.autos/api/choreolib/cpp/index.html" target="_blank"><QrCode value="https://choreo.autos/api/choreolib/cpp/index.html" padding={5} /></a>
                    {/if}
                </AccordionItem>
            </Accordion>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header" style="font-weight: bold;">Yet Another Generic Swerve Library (YAGSL)</span>
            <Accordion class="text-left">
                <AccordionItem class="text-black dark:text-white" bind:open={yagslOpenState.main}>
                    <span slot="header">Main Documentation</span>
                    {#if yagslOpenState.main === true || yagslLoadState.main === true}
                        <a href="https://docs.yagsl.com/" target="_blank"><QrCode value="https://docs.yagsl.com/" padding={5} /></a>
                    {/if}
                </AccordionItem>

                <AccordionItem class="text-black dark:text-white" bind:open={yagslOpenState.java}>
                    <span slot="header">Java API Documentation</span>
                    {#if yagslOpenState.java === true || yagslLoadState.java === true}
                        <a href="https://broncbotz3481.github.io/YAGSL-Lib/docs/" target="_blank"><QrCode value="https://broncbotz3481.github.io/YAGSL-Lib/docs/" padding={5} /></a>
                    {/if}
                </AccordionItem>
            </Accordion>
        </AccordionItem>
    </Accordion>
</div>