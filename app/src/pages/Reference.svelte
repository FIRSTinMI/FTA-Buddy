<script lang="ts">
    import { Accordion, AccordionItem } from "flowbite-svelte";
    import QrCode from "svelte-qrcode";
</script>

<div class="container mx-auto p-2 pr-3 w-full">
    <Accordion flush>
        <AccordionItem>
            <span slot="header">Robot Radio Lights</span>

            <img src="/openmesh-radio-status-lights-1100.png" width="325px" alt="Radio with LEDs labeled" />

            <table cellpadding="5" cellspacing="0" class="led-table">
                <tr>
                    <td>
                        <table class="section-table">
                            <tr>
                                <td colspan="2" class="bold">Power</td>
                            </tr>
                            <tr>
                                <td class="blue blink led"> </td>
                                <td>Powering Up</td>
                            </tr>
                            <tr>
                                <td class="blue led"> </td>
                                <td>Powered Up</td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <tr>
                    <td>
                        <table class="section-table">
                            <tr>
                                <td colspan="2" class="bold">Wifi</td>
                            </tr>
                            <tr>
                                <td class="black led"> </td>
                                <td>Needs Programming</td>
                            </tr>
                            <tr>
                                <td class="red led"> </td>
                                <td>AP, unlinked</td>
                            </tr>
                            <tr>
                                <td class="orange led"> </td>
                                <td>AP, linked</td>
                            </tr>
                            <tr>
                                <td class="green led"> </td>
                                <td>Bridge mode, linked</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </AccordionItem>
        <AccordionItem>
            <span slot="header">RoboRIO Lights</span>

            <table cellpadding="5" cellspacing="0" class="led-table">
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
                                <td class="red blink led"> </td>
                                <td>Comms, no code</td>
                            </tr>
                            <tr>
                                <td class="red led"> </td>
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
        <AccordionItem>
            <span slot="header">REV Motor Controller Lights</span>

            <table cellpadding="5" cellspacing="0" class="led-table">
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
                                <td class="magenta fast-white led"> </td>
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

        <AccordionItem>
            <span slot="header">CTRE Motor Controller Lights</span>

            <table cellpadding="5" cellspacing="0" class="led-table">
                <tr>
                    <td>
                        <table class="section-table">
                            <tr>
                                <td colspan="3" class="bold">Lights alternate rather than blink</td>
                            </tr>
                            <tr>
                                <td class="black led"> </td>
                                <td>No Power</td>
                            </tr>
                            <tr>
                                <td class="orange blink led"> </td>
                                <td>CAN bus detected, robot disabled</td>
                            </tr>
                            <tr>
                                <td class="red slow led"> </td>
                                <td>CAN bus/PWM is not detected</td>
                            </tr>
                            <tr>
                                <td class="red fast led"> </td>
                                <td>Fault Detected</td>
                            </tr>
                            <tr>
                                <td class="red blink-orange led"> </td>
                                <td>Damaged Hardware</td>
                            </tr>
                            <tr>
                                <td class="green blink-orange led"> </td>
                                <td>In Boot-loader</td>
                            </tr>
                            <tr>
                                <td class="orange fast led"> </td>
                                <td>Thermal Shutoff (Falcon only)</td>
                            </tr>
                            <tr>
                                <td class="green fast led"> </td>
                                <td>Forward Movement</td>
                            </tr>
                            <tr>
                                <td class="red fast led"> </td>
                                <td>Reverse Movement</td>
                            </tr>
                            <tr>
                                <td class="red led"> </td>
                                <td>Limit Switch/Soft Limit</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </AccordionItem>

        <AccordionItem>
            <span slot="header">CANivore Lights</span>

            <table cellpadding="5" cellspacing="0" class="led-table">
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
                                <td class="green led"> </td>
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
                                <td colspan="2" class="bold">BT</td>
                            </tr>
                            <tr>
                                <td class="green led"> </td>
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
                                <td colspan="2" class="bold">CAN (double blink = termination disabled)</td>
                            </tr>
                            <tr>
                                <td class="red led"> </td>
                                <td>Voltage too low for CAN bus</td>
                            </tr>
                            <tr>
                                <td class="red fast led"> </td>
                                <td>No CAN comms</td>
                            </tr>
                            <tr>
                                <td class="orange fast led"> </td>
                                <td>CAN 2.0b legacy mode</td>
                            </tr>
                            <tr>
                                <td class="green fast led"> </td>
                                <td>CAN FD Active</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </AccordionItem>

        <AccordionItem>
            <span slot="header">Keyboard Shortcuts</span>

            <h3>Driver Station</h3>

            <table cellpadding="5" cellspacing="0" class="led-table">
                <tr>
                    <td>
                        <table class="section-table">
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
                        </table>
                    </td>
                </tr>
            </table>
        </AccordionItem>

        <AccordionItem>
            <span slot="header">Team IP Addresses</span>
            <h3>IP Address Subnets</h3>

            <table cellpadding="5" cellspacing="0" class="led-table">
                <tr>
                    <td>
                        <table class="section-table">
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
                        </table>
                    </td>
                </tr>
            </table>

            <h3>IP Addresses</h3>

            <table cellpadding="5" cellspacing="0" class="led-table">
                <tr>
                    <td>
                        <table class="section-table">
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
                            <tr>
                                <td>Field AP</td>
                                <td>10.TE.AM.4</td>
                            </tr>
                            <tr>
                                <td>Driver Station</td>
                                <td>10.TE.AM.5</td>
                            </tr>
                            <tr>
                                <td></td>
                                <td><span class="highlight">(subnet 255.0.0.0)</span></td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </AccordionItem>

        <AccordionItem>
            <span slot="header">Helpful Commands</span>

            <table cellpadding="5" cellspacing="0" class="led-table">
                <tr>
                    <td>
                        <table class="section-table">
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
                        </table>
                    </td>
                </tr>
            </table>
        </AccordionItem>
        <AccordionItem>
            <span slot="header">Field Manual QR Codes</span>
            <Accordion flush>
                <AccordionItem>
                    <span slot="header">Pack Case 23/24 Amp and Truss</span>
                    <QrCode value="https://roadcase.frc.tools/23" padding={5} />
                </AccordionItem>
                <AccordionItem>
                    <span slot="header">Pack Case 31 Speaker</span>
                    <QrCode value="https://roadcase.frc.tools/31" padding={5} />
                </AccordionItem>
                <AccordionItem>
                    <span slot="header">Pack Case 32 Practice Field</span>
                    <QrCode value="https://roadcase.frc.tools/32" padding={5} />
                </AccordionItem>
                <AccordionItem>
                    <span slot="header">Build Stage</span>
                    <QrCode value="https://usfirst.box.com/s/gtg2693z807lyl27cowy3shn80dg7bjn" padding={5} />
                </AccordionItem>
                <AccordionItem>
                    <span slot="header">Build Speaker</span>
                    <QrCode value="https://usfirst.box.com/s/xhae645948mtyvp22dqa7w0taabkuq7b" padding={5} />
                </AccordionItem>
                <AccordionItem>
                    <span slot="header">Build Amp</span>
                    <QrCode value="https://usfirst.box.com/s/dy0t42vpsdsb02bkppdajtimbpnn12b2" padding={5} />
                </AccordionItem>
                <AccordionItem>
                    <span slot="header">Build Source</span>
                    <QrCode value="https://usfirst.box.com/s/dy0t42vpsdsb02bkppdajtimbpnn12b2" padding={5} />
                </AccordionItem>
            </Accordion>
        </AccordionItem>
    </Accordion>
</div>

<style>
    AccordionItem {
        text-align: left;
    }
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
    .slow {
        animation: blink 2000ms infinite;
        animation-timing-function: steps(2, jump-none);
    }
    .double-blink-red {
        animation: double-blink-orange 1000ms infinite;
        animation-timing-function: steps(3, jump-none);
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
    .fast-white {
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
        border: 0.5px black solid !important;
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
