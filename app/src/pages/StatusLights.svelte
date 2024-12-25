<script lang="ts">
    import { Accordion, AccordionItem } from "flowbite-svelte";
    import { onDestroy } from "svelte";

    let LEDToggleState = true;
    let LEDLongToggleState = true;
    let LEDFastToggleState = true;
    let LEDOffsetToggleState = 0;
    let LEDFastOffsetToggleState = 0;

    function toggleLED() {
        if (LEDToggleState === true) {
            LEDToggleState = false;
        } else {
            LEDToggleState = true;
        }
        //console.log(LEDState);
    }

    function toggleLEDLong() {
        if (LEDLongToggleState === true) {
            LEDLongToggleState = false;
        } else {
            LEDLongToggleState = true;
        }
        //console.log(LEDState);
    }

    function toggleLEDFast() {
        if (LEDFastToggleState === true) {
            LEDFastToggleState = false;
        } else {
            LEDFastToggleState = true;
        }
        //console.log(LEDState);
    }

    function toggleLEDOffset() {
        if (LEDOffsetToggleState === 0) {
            LEDOffsetToggleState = 1;
        } else if (LEDOffsetToggleState === 1) {
            LEDOffsetToggleState = 2;
        } else if (LEDOffsetToggleState == 2) {
            LEDOffsetToggleState = 0;
        }
    }

    function toggleLEDOffsetFast() {
        if (LEDFastOffsetToggleState === 0) {
            LEDFastOffsetToggleState = 1;
        } else if (LEDFastOffsetToggleState === 1) {
            LEDFastOffsetToggleState = 2;
        } else if (LEDFastOffsetToggleState == 2) {
            LEDFastOffsetToggleState = 0;
        }
    }

    let timerID = setInterval(toggleLED, 300);
    onDestroy(() => clearInterval(timerID));

    let timerIDLong = setInterval(toggleLEDLong, 600);
    onDestroy(() => clearInterval(timerIDLong));
    
    let timerIDFast = setInterval(toggleLEDFast, 100);
    onDestroy(() => clearInterval(timerIDFast));

    let timerIDOffset = setInterval(toggleLEDOffset, 300);
    onDestroy(() => clearInterval(timerIDOffset));

    let timerIDFastOffset = setInterval(toggleLEDOffsetFast, 200);
    onDestroy(() => clearInterval(timerIDFastOffset));

</script>

<div class="container mx-auto p-2 pr-3 w-full">
    <h1 class="text-3xl">Status Lights</h1>
    <Accordion flush class="text-left">
        <AccordionItem class="text-black dark:text-white">
            <span slot="header">Robot Radio</span>

            <img src="/app/vh103.png" width="325px" alt="Radio with LEDs labeled" />

            <table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
                <tr>
                    <td>
                        <table class="section-table">
                            <tr>
                                <td colspan="2" class="bold">Power</td>
                            </tr>
                            <tr>
                                <td class="green led"> </td>
                                <td>Has Power</td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <tr>
                    <td>
                        <table class="section-table">
                            <tr>
                                <td colspan="2" class="bold">Sys</td>
                            </tr>
                            <tr>
                                <td class="black led"> </td>
                                <td>Booting</td>
                            </tr>
                            <tr>
                                <td class="green blink led"> </td>
                                <td>Unable to ping field</td>
                            </tr>
                            <tr>
                                <td class="green hz-20-fast led"> </td>
                                <td>Firmware being flashed</td>
                            </tr>
                            <tr>
                                <td class="green led"> </td>
                                <td>Connected to field</td>
                            </tr>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td>
                        If the Sys, 2.4 GHz, and 6GHz are all blinking fast: The radio is configured as an AP and a battery was detected. Wireless is disabled until corrected and power cycled.
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
        </AccordionItem>
        <AccordionItem class="text-black dark:text-white">
            <span slot="header">RoboRIO</span>

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
                                <td class="orange led"> </td>
                                <td>Booting</td>
                            </tr>
                            <tr>
                                <td class="orange blink led"> </td>
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
                                <td class="red blink led"> </td>
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
            </table>
        </AccordionItem>
        <AccordionItem class="text-black dark:text-white">
            <span slot="header">REV Spark Max</span>

            <table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
                <tr>
                    <td>
                        <table class="section-table">
                            <tr>
                                <td colspan="2" class="bold">Brushless Mode</td>
                            </tr>
                            <tr>
                                <td class="cyan blink led"> </td>
                                <td>Brake No Signal</td>
                            </tr>
                            <tr>
                                <td class="cyan led"> </td>
                                <td>Brake Valid Signal</td>
                            </tr>
                            <tr>
                                <td class="magenta blink led"> </td>
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
                                <td class="blue blink led"> </td>
                                <td>Brake No Signal</td>
                            </tr>
                            <tr>
                                <td class="blue led"> </td>
                                <td>Brake Valid Signal</td>
                            </tr>
                            <tr>
                                <td class="yellow blink led"> </td>
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
                                <td class="magenta slow-orange led"> </td>
                                <td>Sensor Fault</td>
                            </tr>
                            <tr>
                                <td class="blue slow-orange led"> </td>
                                <td>12V Missing</td>
                            </tr>
                            <tr>
                                <td class="cyan slow-orange led"> </td>
                                <td>Gate Driver Fault</td>
                            </tr>
                            <tr>
                                <td class="yellow slow-orange led"> </td>
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
                                <td class="magenta fast blink-white led"> </td>
                                <td>Identify</td>
                            </tr>
                            <tr>
                                <td class="yellow blink-white led"> </td>
                                <td>CAN Firmware Updating</td>
                            </tr>
                            <tr>
                                <td class="blue blink-white led"> </td>
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
                                <td class="green fast led"> </td>
                                <td>Partial Forward</td>
                            </tr>
                            <tr>
                                <td class="green led"> </td>
                                <td>Full Forward</td>
                            </tr>
                            <tr>
                                <td class="red fast led"> </td>
                                <td>Partial Reverse</td>
                            </tr>
                            <tr>
                                <td class="red led"> </td>
                                <td>Full Reverse</td>
                            </tr>
                            <tr>
                                <td class="green blink-white led"> </td>
                                <td>Forward Limit</td>
                            </tr>
                            <tr>
                                <td class="red blink-white led"> </td>
                                <td>Reverse Limit</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header">REV Spark Flex</span>

            <table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
                <tr>
                    <td>
                        <table class="section-table">
                            <tr>
                                <td colspan="3" class="bold">Brushless Mode</td>
                            </tr>
                            <tr>
                                <td class="cyan blink led"> </td>
                                <td>Brake No Signal</td>
                            </tr>
                            <tr>
                                <td class="cyan led"> </td>
                                <td>Brake Valid Signal</td>
                            </tr>
                            <tr>
                                <td class="magenta blink led"> </td>
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
                                <td class="blue blink led"> </td>
                                <td>Brake No Signal</td>
                            </tr>
                            <tr>
                                <td class="blue led"> </td>
                                <td>Brake Valid Signal</td>
                            </tr>
                            <tr>
                                <td class="yellow blink led"> </td>
                                <td>Coast No Signal</td>
                            </tr>
                            <tr>
                                <td class="yellow led"> </td>
                                <td>Coast Valid Signal</td>
                            </tr>
                            <tr>
                                <td colspan="3" class="bold">Fault Conditions</td>
                            </tr>
                            <tr>
                                <td class="magenta slow-orange led"> </td>
                                <td>Sensor Fault</td>
                            </tr>
                            <tr>
                                <td class="blue slow-orange led"> </td>
                                <td>12V Missing</td>
                            </tr>
                            <tr>
                                <td class="cyan slow-orange led"> </td>
                                <td>Gate Driver Fault</td>
                            </tr>
                            <tr>
                                <td class="yellow slow-orange led"> </td>
                                <td>CAN Fault</td>
                            </tr>
                            <tr>
                                <td class="green slow-orange led"> </td>
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
                                <td class="magenta fast blink-white led"> </td>
                                <td>Identify</td>
                            </tr>
                            <tr>
                                <td class="yellow blink-white led"> </td>
                                <td>CAN Firmware Updating</td>
                            </tr>
                            <tr>
                                <td class="blue blink-white led"> </td>
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
                            <tr>
                                <td colspan="3" class="bold">Movement</td>
                            </tr>
                            <tr>
                                <td class="green fast led"> </td>
                                <td>Partial Forward</td>
                            </tr>
                            <tr>
                                <td class="green led"> </td>
                                <td>Full Forward</td>
                            </tr>
                            <tr>
                                <td class="red fast led"> </td>
                                <td>Partial Reverse</td>
                            </tr>
                            <tr>
                                <td class="red led"> </td>
                                <td>Full Reverse</td>
                            </tr>
                            <tr>
                                <td class="green blink-white led"> </td>
                                <td>Forward Limit</td>
                            </tr>
                            <tr>
                                <td class="red blink-white led"> </td>
                                <td>Reverse Limit</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header">CTRE TalonFX</span>
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
                                <td class= "blink-orange led"> </td>
                                <td class= "blink-orange led"> </td>
                                <td>Valid CAN/PWM Signal, Robot is Disabled, Phoenix is Running </td>
                            </tr>
                            <tr>
                                <td class= "{ LEDToggleState === true ? 'orange led' : 'black led' }"> </td>
                                <td class= "{ LEDToggleState === false ? 'orange led' : 'black led' }"> </td>
                                <td>Valid CAN/PWM, Phoenix is NOT Detected</td>
                            </tr>
                            <tr>
                                <td class= "{ LEDToggleState === true ? 'red led' : 'black led' }"> </td>
                                <td class= "{ LEDToggleState === false ? 'red led' : 'black led' }"> </td>
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
                                <td class="red blink led"> </td>
                                <td class="red blink led"> </td>
                                <td>Driving in Reverse, Rate = DutyCycle</td>
                            </tr>
                            <tr>
                                <td class="green blink led"> </td>
                                <td class="green blink led"> </td>
                                <td>Driving in Forward, Rate = DutyCycle</td>
                            </tr>
                            <tr>
                                <td class="{(LEDOffsetToggleState === 0) ? "red led": (LEDOffsetToggleState === 1) ? "black led" : (LEDOffsetToggleState === 2) ? "black led" : "black led"}"> </td>
                                <td class="{(LEDOffsetToggleState === 0) ? "black led": (LEDOffsetToggleState === 1) ? "red led" : (LEDOffsetToggleState === 2) ? "black led" : "black led"}"> </td>
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
                                <td class="{(LEDOffsetToggleState === 0) ? "orange led": (LEDOffsetToggleState === 1) ? "black led" : (LEDOffsetToggleState === 2) ? "black led" : "black led"}"> </td>
                                <td class="{(LEDOffsetToggleState === 0) ? "black led": (LEDOffsetToggleState === 1) ? "orange led" : (LEDOffsetToggleState === 2) ? "black led" : "black led"}"> </td>
                                <td>Thermal Cutoff Warning</td>
                            </tr>
                            <tr>
                                <td class= "{ LEDToggleState === true ? 'red led' : 'green led' }"> </td>
                                <td class= "{ LEDToggleState === false ? 'green led' : 'red led' }"> </td>
                                <td>Using Pro Command without License</td>
                            </tr>
                            <tr>
                                <td class= "{ LEDToggleState === true ? 'red led' : 'orange led' }"> </td>
                                <td class= "{ LEDToggleState === false ? 'orange led' : 'red led' }"> </td>
                                <td>Damaged Hardware</td>
                            </tr>
                            <tr>
                                <td class="black led"> </td>
                                <td class= "{ LEDToggleState === false ? 'green led' : 'orange led' }"> </td>
                                <td>Limit Switch/Soft Limit</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header">CTRE TalonSRX</span>
            <table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
                <tr>
                    <td>
                        <table class="section-table">
                            <tr>
                                <td colspan="3" class="bold">Calibration Codes</td>
                            </tr>
                            <tr>
                                <td class= "{ LEDToggleState === true ? 'red led' : 'green led' }"> </td>
                                <td class= "{ LEDToggleState === true ? 'green led' : 'red led' }"> </td>
                                <td>Calibration in Progress</td>
                            </tr>
                            <tr>
                                <td class= "green blink led"> </td>
                                <td class= "green blink led"> </td>
                                <td>Successful Calibration</td>
                            </tr>
                            <tr>
                                <td class= "red blink led"> </td>
                                <td class= "red blink led"> </td>
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
                                <td class="green blink led"> </td>
                                <td class="green blink led"> </td>
                                <td>Driving in Forward, Rate = DutyCycle</td>
                            </tr>
                            <tr>
                                <td class="red blink led"> </td>
                                <td class="red blink led"> </td>
                                <td>Driving in Reverse, Rate = DutyCycle</td>
                            </tr>
                            <tr>
                                <td class= "{ LEDToggleState === true ? 'black led' : 'orange led' }"> </td>
                                <td class= "{ LEDToggleState === false ? 'black led' : 'orange led' }"> </td>
                                <td>CAN/PWM Detected, Robot Disabled</td>
                            </tr>
                            <tr>
                                <td class= "{ LEDToggleState === true ? 'black led' : 'red led' }"> </td>
                                <td class= "{ LEDToggleState === false ? 'black led' : 'red led' }"> </td>
                                <td>CAN/PWM Not Detected</td>
                            </tr>
                            <tr>
                                <td class= "{ LEDToggleState === true ? 'orange led' : 'red led' }"> </td>
                                <td class= "{ LEDToggleState === false ? 'orange led' : 'red led' }"> </td>
                                <td>Damaged Hardware</td>
                            </tr>
                            <tr>
                                <td class="{(LEDFastOffsetToggleState === 0) ? "red led": (LEDFastOffsetToggleState === 1) ? "black led" : (LEDFastOffsetToggleState === 2) ? "black led" : "black led"}"> </td>
                                <td class="{(LEDFastOffsetToggleState === 0) ? "black led": (LEDFastOffsetToggleState === 1) ? "red led" : (LEDFastOffsetToggleState === 2) ? "black led" : "black led"}"> </td>
                                <td>Forward Soft/Hard Limit Triggered</td>
                            </tr>
                            <tr>
                                <td class="{(LEDFastOffsetToggleState === 0) ? "black led": (LEDFastOffsetToggleState === 1) ? "red led" : (LEDFastOffsetToggleState === 2) ? "black led" : "black led"}"> </td>
                                <td class="{(LEDFastOffsetToggleState === 0) ? "red led": (LEDFastOffsetToggleState === 1) ? "black led" : (LEDFastOffsetToggleState === 2) ? "black led" : "black led"}"> </td>
                                <td>Reverse Soft/Hard Limit Triggered</td>
                            </tr>
                            <tr>
                                <td class= "black led"> </td>
                                <td class= "{ LEDToggleState === false ? 'orange led' : 'green led' }"> </td>
                                <td>In Boot Loader</td>
                            </tr>
                            <tr>
                                <td class= "orange led"> </td>
                                <td class= "orange led"> </td>
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
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header">CTRE VictorSPX</span>
            <table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
                <tr>
                    <td>
                        <table class="section-table">
                            <tr>
                                <td colspan="3" class="bold">Calibration Codes</td>
                            </tr>
                            <tr>
                                <td class= "{ LEDToggleState === true ? 'red led' : 'green led' }"> </td>
                                <td class= "{ LEDToggleState === true ? 'green led' : 'red led' }"> </td>
                                <td>Calibration in Progress</td>
                            </tr>
                            <tr>
                                <td class= "green blink led"> </td>
                                <td class= "green blink led"> </td>
                                <td>Successful Calibration</td>
                            </tr>
                            <tr>
                                <td class= "red blink led"> </td>
                                <td class= "red blink led"> </td>
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
                                <td class="green blink led"> </td>
                                <td class="green blink led"> </td>
                                <td>Driving in Forward, Rate = DutyCycle</td>
                            </tr>
                            <tr>
                                <td class="red blink led"> </td>
                                <td class="red blink led"> </td>
                                <td>Driving in Reverse, Rate = DutyCycle</td>
                            </tr>
                            <tr>
                                <td class= "{ LEDToggleState === true ? 'black led' : 'orange led' }"> </td>
                                <td class= "{ LEDToggleState === false ? 'black led' : 'orange led' }"> </td>
                                <td>CAN/PWM Detected, Robot Disabled</td>
                            </tr>
                            <tr>
                                <td class= "{ LEDLongToggleState === true ? 'black led' : 'red led' }"> </td>
                                <td class= "{ LEDLongToggleState === false ? 'black led' : 'red led' }"> </td>
                                <td>CAN/PWM Not Detected</td>
                            </tr>
                            <tr>
                                <td class= "{ LEDToggleState === true ? 'black led' : 'red led' }"> </td>
                                <td class= "{ LEDToggleState === false ? 'black led' : 'red led' }"> </td>
                                <td>Fault Detected</td>
                            </tr>
                            <tr>
                                <td class= "{ LEDToggleState === true ? 'orange led' : 'red led' }"> </td>
                                <td class= "{ LEDToggleState === false ? 'orange led' : 'red led' }"> </td>
                                <td>Damaged Hardware</td>
                            </tr>
                            <tr>
                                <td class="{(LEDFastOffsetToggleState === 0) ? "red led": (LEDFastOffsetToggleState === 1) ? "black led" : (LEDFastOffsetToggleState === 2) ? "black led" : "black led"}"> </td>
                                <td class="{(LEDFastOffsetToggleState === 0) ? "black led": (LEDFastOffsetToggleState === 1) ? "red led" : (LEDFastOffsetToggleState === 2) ? "black led" : "black led"}"> </td>
                                <td>Forward Soft/Hard Limit Triggered</td>
                            </tr>
                            <tr>
                                <td class="{(LEDFastOffsetToggleState === 0) ? "black led": (LEDFastOffsetToggleState === 1) ? "red led" : (LEDFastOffsetToggleState === 2) ? "black led" : "black led"}"> </td>
                                <td class="{(LEDFastOffsetToggleState === 0) ? "red led": (LEDFastOffsetToggleState === 1) ? "black led" : (LEDFastOffsetToggleState === 2) ? "black led" : "black led"}"> </td>
                                <td>Reverse Soft/Hard Limit Triggered</td>
                            </tr>
                            <tr>
                                <td class= "black led"> </td>
                                <td class= "{ LEDToggleState === false ? 'orange led' : 'green led' }"> </td>
                                <td>In Boot Loader</td>
                            </tr>
                            <tr>
                                <td class= "orange led"> </td>
                                <td class= "orange led"> </td>
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
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header">CTRE CANivore</span>

            <table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
                <tr>
                    <td>
                        <table class="section-table">
                            <tr>
                                <td colspan="2" class="bold">STAT</td>
                            </tr>
                            <tr>
                                <td class="red double-blink led"> </td>
                                <td>Powered but USB not plugged in</td>
                            </tr>
                            <tr>
                                <td class="red fast led"> </td>
                                <td>USB plugged in but no comms</td>
                            </tr>
                            <tr>
                                <td class="orange double-blink-orange led"> </td>
                                <td>CAN disabled, no power</td>
                            </tr>
                            <tr>
                                <td class="orange blink led"> </td>
                                <td>CAN disabled</td>
                            </tr>
                            <tr>
                                <td class="green double-blink-green led"> </td>
                                <td>CAN enabled, no power</td>
                            </tr>
                            <tr>
                                <td class="green blink led"> </td>
                                <td>CAN enabled</td>
                            </tr>
                            <tr>
                                <td class="green blink-orange led"> </td>
                                <td>Bootloader</td>
                            </tr>
                            <tr>
                                <td class="red blink-orange led"> </td>
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
                                <td class="green blink led"> </td>
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
                                <td class="green blink led"> </td>
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
                                <td class="red fast led"> </td>
                                <td>No CAN comms, Termination Enabled</td>
                            </tr>
                            <tr>
                                <td class="red double-blink led"> </td>
                                <td>No CAN comms, Termination Disabled</td>
                            </tr>
                            <tr>
                                <td class="orange fast led"> </td>
                                <td>CAN 2.0b Legacy Mode, Termination Enabled</td>
                            </tr>
                            <tr>
                                <td class="orange double-blink led"> </td>
                                <td>CAN 2.0b Legacy Mode, Termination Disabled</td>
                            </tr>
                            <tr>
                                <td class="green fast led"> </td>
                                <td>CAN FD Active, Termination Enabled</td>
                            </tr>
                            <tr>
                                <td class="green double-blink led"> </td>
                                <td>CAN FD Active, Termination Disabled</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </AccordionItem>

        <AccordionItem class="text-black dark:text-white">
            <span slot="header">CTRE Pigeon 2.0 Lights</span>

            <table cellpadding="5" cellspacing="0" class="led-table text-black dark:text-white">
                <tr>
                    <td>
                        <table class="section-table">
                            <tr>
                                <td class="black led"> </td>
                                <td class="black led"> </td>
                                <td>No Power</td>
                            </tr>
                            <tr>
                                <td class="black led"> </td>
                                <td class= "{ LEDToggleState === true ? 'green led' : 'yellow led' }"> </td>
                                <td>Bootloader Mode</td>
                            </tr>
                            <tr>
                                <td class= "{ LEDToggleState === true ? 'red led' : 'yellow led' }"> </td>
                                <td class= "{ LEDToggleState === true ? 'yellow led' : 'red led' }"> </td>
                                <td>Damaged Hardware</td>
                            </tr>
                            <tr>
                                <td class= "{ LEDToggleState === true ? 'red led' : 'green led' }"> </td>
                                <td class= "{ LEDToggleState === true ? 'green led' : 'red led' }"> </td>
                                <td>Unlicensed Phoenix Pro</td>
                            </tr>
                            <tr>
                                <td class="red blink led"> </td>
                                <td class="red blink led"> </td>
                                <td>Poor CAN Health/No Connection</td>
                            </tr>
                            <tr>
                                <td class= "{ LEDToggleState === true ? 'yellow led' : 'black led' }"> </td>
                                <td class= "{ LEDToggleState === true ? 'black led' : 'yellow led' }"> </td>
                                <td>CAN Detected, No Software</td>
                            </tr>
                            <tr>
                                <td class="yellow blink led"> </td>
                                <td class="yellow blink led"> </td>
                                <td>CAN Detected, Robot Disabled</td>
                            </tr>
                            <tr>
                                <td class="green blink led"> </td>
                                <td class="green blink led"> </td>
                                <td>CAN Detected, Robot Enabled</td>
                            </tr>
                        </table>
                    </td>
                </tr>
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
        border: 2px solid #b0bec5;
        width: 400px;
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
    .blink {
        animation: blink 1000ms infinite;
        animation-timing-function: steps(2, jump-none);
    }
    .fast {
        animation: blink 500ms infinite;
        animation-timing-function: steps(2, jump-none);
    }
    .hz-20-fast {
        animation: blink 100ms infinite;
        animation-timing-function: steps(2, jump-none);
    }
    .double-blink-orange {
        animation: double-blink-orange 1000ms infinite;
        animation-timing-function: steps(3, jump-none);
    }
    .double-blink-green {
        animation: double-blink-green 1000ms infinite;
        animation-timing-function: steps(3, jump-none);
    }
    .blink-white {
        animation: blink-white 1000ms infinite;
        animation-timing-function: steps(2, jump-none);
    }
    .blink-orange {
        animation: blink-orange 1000ms infinite;
        animation-timing-function: steps(2, jump-none);
    }
    .slow-orange {
        animation: blink-orange 2000ms infinite;
        animation-timing-function: steps(2, jump-none);
    }
    @keyframes blink {
        100% {
            background-color: black;
        }
    }
    @keyframes double-blink-red {
        0% {
            background-color: red;
        }
        59% {
            background-color: red;
        }
        60% {
            background-color: black;
        }
        80% {
            background-color: red;
        }
        100% {
            background-color: black;
        }
    }
    @keyframes double-blink-orange {
        0% {
            background-color: orange;
        }
        59% {
            background-color: orange;
        }
        60% {
            background-color: black;
        }
        80% {
            background-color: orange;
        }
        100% {
            background-color: black;
        }
    }
    @keyframes double-blink-green {
        0% {
            background-color: green;
        }
        59% {
            background-color: green;
        }
        60% {
            background-color: black;
        }
        80% {
            background-color: green;
        }
        100% {
            background-color: black;
        }
    }
    @keyframes blink-white {
        100% {
            background-color: white;
        }
    }
    @keyframes blink-orange {
        100% {
            background-color: orange;
        }
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
