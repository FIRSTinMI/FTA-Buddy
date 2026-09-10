// Status light help: roboRIO, SystemCore and Vivid radio. See shared.ts for the step rules.

import { type StatusLightHelp, NI_FLASHING, NI_RED, RIO_REIMAGE_STEPS, SC_OS, SC_SPEC, VIVID, VIVID_BOOTLOOP, WPILIB, WPILIB_BROWNOUT, WPILIB_IMAGING } from "./shared";

export const generalHelp = {
	"radio.no-power": {
		device: "VH-109 radio",
		led: "All LEDs",
		state: "Off",
		meaning: "The radio has no power. PWR is the first LED to light when power is present.",
		steps: [
			"Check the power lead at the radio and at its source (PDP or PDH channel, or PoE injector).",
			"Check the breaker or fuse on that channel.",
			"Swap the power cable. Crimps on radio leads fail often.",
			"If PWR stays off with known good 12 V at the radio, swap the radio.",
		],
		source: VIVID,
	},
	"radio.powered-booting": {
		device: "VH-109 radio",
		led: "PWR / SYS",
		state: "PWR solid, SYS off",
		meaning: "The radio has power and is booting. SYS stays off until boot completes.",
		steps: [
			"Wait for SYS to come on.",
			"If SYS never lights, power cycle the radio once.",
			"If it never boots, or reboots on its own in a loop, the flash memory may be corrupt (Vivid known issue 1). Swap the radio. Recovery needs Vivid remote support through WCP.",
		],
		source: VIVID_BOOTLOOP,
	},
	"radio.powered-unable-to-ping-field": {
		device: "VH-109 radio",
		led: "SYS",
		state: "Blinking 1 Hz",
		meaning:
			"The radio booted but cannot reach the field access point (10.TE.AM.4). The robot is not on the field network, or the radio is not programmed for this event.",
		steps: [
			"Confirm the radio was programmed at this event's kiosk with the correct team number.",
			"Confirm the team is in the current match. The field access point only accepts the six scheduled teams.",
			"Look at the 6G LED. No 6 GHz link means the wireless association failed.",
			"Power cycle the radio.",
			"Reprogram the radio at the kiosk.",
			"If it still cannot reach the field while other robots can, swap the radio.",
		],
		source: VIVID,
	},
	"radio.powered-flashing-firmware": {
		device: "VH-109 radio",
		led: "SYS",
		state: "Blinking 20 Hz",
		meaning: "Firmware is being written to the radio. This happens during a kiosk flash.",
		steps: [
			"Do not remove power. Wait for the flash to finish.",
			"When it completes, SYS changes to a 50 Hz blink for the first boot, then the radio reboots.",
			"If it sits in this state for several minutes, power cycle it and flash again at the kiosk.",
		],
		source: VIVID,
	},
	"radio.powered-firmware-flashed-in-first-boot": {
		device: "VH-109 radio",
		led: "SYS",
		state: "Blinking 50 Hz",
		meaning: "The firmware flash succeeded and the radio is running its first-boot setup.",
		steps: [
			"Wait. Do not remove power until SYS is solid or blinking at 1 Hz.",
			"If it never comes back, power cycle once, then reflash at the kiosk.",
		],
		source: VIVID,
	},
	"radio.radio-in-ap-mode-with-battery-detected": {
		device: "VH-109 radio",
		led: "SYS / 2.4G / 6G",
		state: "All blinking 20 Hz together",
		meaning:
			"The radio is programmed as an access point (home practice setup) but it is powered from a robot battery. Wireless is disabled until this is fixed.",
		steps: [
			"Reprogram the radio at the event kiosk as a robot radio.",
			"Power cycle the radio after programming. The lockout only clears on a power cycle.",
			"If the team needs a practice access point, use a second radio on a bench supply, not the robot.",
		],
		source: VIVID,
	},
	"radio.powered-able-to-ping-field": {
		device: "VH-109 radio",
		led: "SYS",
		state: "Solid",
		meaning: "Normal. The radio is linked to the field and can reach the field access point.",
		steps: [
			"If the Driver Station still shows no robot, look at the RIO LED and the roboRIO Comm LED. The problem is on the robot side of the radio.",
		],
		source: VIVID,
	},
	"radio.no-robot-radio-link": {
		device: "VH-109 radio",
		led: "2.4G / 6G / RIO",
		state: "Off",
		meaning:
			"Neither wireless band shows a link and the RIO port has no Ethernet link. The radio is up but nothing is connected through it.",
		steps: [
			"Check the Ethernet cable from the roboRIO to the radio's RIO port. Reseat both ends, then swap the cable.",
			"Confirm the roboRIO is powered and booted (Status LED off).",
			"If 6G stays off on the field, the radio is not associating. Reprogram at the kiosk, then power cycle.",
			"If the RIO LED never lights with a known good cable and roboRIO, swap the radio.",
		],
		source: VIVID,
	},
	"radio.2-4ghz-connection-enabled": {
		device: "VH-109 radio",
		led: "2.4G",
		state: "Solid",
		meaning:
			"The 2.4 GHz radio is active. The field uses 6 GHz for the robot link. 2.4 GHz is for a robot hosted practice network.",
		steps: [
			"If the Driver Station has no comms, check the 6G LED and the SYS LED first.",
			"If 2.4G is on at an event and the team did not expect it, reprogram the radio at the kiosk.",
		],
		source: WPILIB,
	},
	"radio.6ghz-connection-enabled": {
		device: "VH-109 radio",
		led: "6G",
		state: "Solid",
		meaning: "The 6 GHz link to the field access point is up. This is the normal field link.",
		steps: [
			"If the Driver Station has no comms with 6G lit, check the RIO LED and the roboRIO Comm LED.",
		],
		source: WPILIB,
	},
	"radio.valid-rio-connection": {
		device: "VH-109 radio",
		led: "RIO",
		state: "Solid",
		meaning: "Ethernet link on the RIO port. The cable to the roboRIO is connected and the roboRIO port is up.",
		steps: [
			"If the Driver Station still has no comms, look at the roboRIO Comm LED. Off means the roboRIO is not seeing the Driver Station; check team number on the roboRIO and the DS.",
		],
		source: VIVID,
	},
	"roborio.power.ok": {
		device: "roboRIO",
		led: "Power",
		state: "Solid green",
		meaning: "Input power is good and no rail fault is active.",
		steps: [
			"If the robot has no comms, move on to the Status and Comm LEDs.",
		],
		source: WPILIB,
	},
	"roborio.power.brownout": {
		device: "roboRIO",
		led: "Power",
		state: "Solid amber",
		meaning:
			"Battery voltage dropped below 6.3 V. The roboRIO disabled all outputs and the user rails until voltage recovers above 7.5 V. The Driver Station shows Voltage Brownout.",
		steps: [
			"Swap to a fresh, fully charged battery.",
			"Check the main battery connections and the main breaker for heat, corrosion, or loose lugs.",
			"Look for a stalled motor or a short pulling high current. The DS log and PDP or PDH channel currents show it.",
			"If it repeats on a good battery, the team needs current limits in code or less simultaneous load.",
		],
		source: WPILIB_BROWNOUT,
	},
	"roborio.power.fault-short": {
		device: "roboRIO",
		led: "Power",
		state: "Solid red",
		meaning:
			"One of the user voltage rails (3.3 V, 5 V, 6 V) is shorted or overloaded. Metal shavings inside the case are the usual cause.",
		steps: [
			"In the Driver Station, click the power (lightning) indicator. It shows which rail is faulted.",
			"Unplug everything from DIO, PWM, analog, I2C, SPI, MXP and USB. If the LED goes green, plug devices back one at a time to find the short.",
			"Open the case (4 screws on the back, 2 at the power port) and blow it out with compressed air. Look for metal shavings.",
			"If it stays red with nothing connected and a clean board, swap the roboRIO.",
		],
		source: NI_RED,
	},
	"roborio.power.input-too-high": {
		device: "roboRIO",
		led: "Power",
		state: "Flashing red",
		meaning: "Input voltage is above 16 V. All outputs are disabled, including the RSL.",
		steps: [
			"Check what powers the roboRIO. It must be on the dedicated roboRIO output of the PDP or PDH, from a 12 V FRC battery.",
			"Measure the battery. An overcharged or wrong battery reads high.",
			"Fix the supply, then power cycle.",
		],
		source: NI_RED,
	},
	"roborio.status.ok": {
		device: "roboRIO",
		led: "Status",
		state: "Off",
		meaning: "Off is normal. The Status LED only lights during boot and for error codes.",
		steps: [
			"If the robot has no comms, look at the Comm LED and the radio.",
		],
		source: WPILIB,
	},
	"roborio.status.booting": {
		device: "roboRIO",
		led: "Status",
		state: "Solid while booting",
		meaning: "Power-on self test. The LED turns off when boot completes.",
		steps: [
			"Wait for it to turn off.",
			"If it stays solid long after power-on and comms never come up, treat it as the unrecoverable error (continuous flash or solid).",
		],
		source: WPILIB,
	},
	"roborio.status.2-blinks": {
		device: "roboRIO",
		led: "Status",
		state: "2 blinks, pause",
		meaning: "Software error. Usually an image or firmware update that was interrupted.",
		steps: [
			"Power cycle once.",
			...RIO_REIMAGE_STEPS,
			"If reimaging fails or the code comes back, swap the roboRIO.",
		],
		source: NI_FLASHING,
	},
	"roborio.status.3-blinks": {
		device: "roboRIO",
		led: "Status",
		state: "3 blinks, pause",
		meaning:
			"Safe mode. Only the services needed to update software run. Robot code does not run. Someone held reset for 5 seconds or more, or the image failed to boot.",
		steps: [
			"Press reset briefly, or power cycle, to leave safe mode.",
			"If it boots back into safe mode on its own, reimage.",
			...RIO_REIMAGE_STEPS,
			"If it still lands in safe mode after a fresh image, swap the roboRIO.",
		],
		source: WPILIB_IMAGING,
	},
	"roborio.status.4-blinks": {
		device: "roboRIO",
		led: "Status",
		state: "4 blinks, pause",
		meaning:
			"Robot code crashed twice without a reboot in between. NI says this is usually the controller running out of memory. Counted flashes with a pause are not the same as a continuous flash.",
		steps: [
			"Reboot the roboRIO.",
			"Have the team redeploy code and read the DS console for the crash.",
			"If it repeats, reimage.",
			...RIO_REIMAGE_STEPS,
			"If it repeats after a reimage with known good code, swap the roboRIO.",
		],
		source: WPILIB,
	},
	"roborio.status.continuous": {
		device: "roboRIO",
		led: "Status",
		state: "Continuous flash, or solid after boot",
		meaning: "Unrecoverable error. The controller cannot boot its image. What that means depends on the model.",
		variants: [
			{
				label: "roboRIO 1",
				meaning: "The image on the internal flash is corrupt, or a software update was interrupted. The controller cannot boot.",
				steps: [
					"Power cycle once.",
					"Hold reset for 5 seconds to force safe mode. Safe mode shows 3 blinks with a pause.",
					"In safe mode, connect USB and reimage with the roboRIO Imaging Tool (Format Target).",
					"If it will not enter safe mode: put NI's recovery.cfg alone on a FAT32 USB stick, plug it in, hold reset while powering on, release when Status is solid, wait about 60 seconds, then reimage.",
					"If it still flashes after recovery and reimage, swap the roboRIO.",
				],
			},
			{
				label: "roboRIO 2",
				meaning: "The controller cannot read the microSD card. The card is missing, not clicked in, not imaged, or corrupt.",
				steps: [
					"Power off. Pull the microSD card and push it back in until it clicks and sits flush with the slot.",
					"Power on. If it still flashes, reimage the card on a laptop with balenaEtcher or Raspberry Pi Imager. Use a fresh card if you have one.",
					"Put the card back, connect USB, and set the team number with the roboRIO Imaging Tool.",
					"Open the case and blow out the SD slot with compressed air. Metal shavings in the slot cause this.",
					"If a freshly imaged card still fails, the card reader is damaged. Swap the roboRIO.",
				],
			},
		],
		defaultVariant: 1,
		source: WPILIB,
	},
	"roborio.radio.ignore": {
		device: "roboRIO",
		led: "Radio",
		state: "Any",
		meaning: "The FRC image does not drive this LED. It was for an NI USB radio that FRC never used.",
		steps: ["Ignore it. Radio state is on the radio's own LEDs."],
		source: WPILIB,
	},
	"roborio.comm.no-comms": {
		device: "roboRIO",
		led: "Comm",
		state: "Off",
		meaning: "No Driver Station heartbeat is reaching the roboRIO.",
		steps: [
			"On the radio, check SYS is solid (field link) and the RIO LED is lit (Ethernet link).",
			"Reseat, then swap, the Ethernet cable between roboRIO and radio.",
			"On the DS, check the team number. A radio ping with no roboRIO ping points at the roboRIO or its cable.",
			"Confirm the roboRIO finished booting (Status LED off).",
			"Reboot the roboRIO, then the radio.",
			"If it never gets comms with a known good cable and radio, reimage or swap the roboRIO.",
		],
		source: WPILIB,
	},
	"roborio.comm.no-code": {
		device: "roboRIO",
		led: "Comm",
		state: "Solid red",
		meaning:
			"The Driver Station is talking to the roboRIO but no robot program is running. Code may still be starting, may have crashed, or was never deployed.",
		steps: [
			"Wait. Code can take up to a minute to start after boot.",
			"Read the DS console for a crash or exception.",
			"Have the team redeploy code. LabVIEW must be deployed with Run as Startup.",
			"Reboot the roboRIO.",
			"If code deploys but never runs, check the image year matches the team's WPILib year. Reimage if not.",
		],
		source: NI_RED,
	},
	"roborio.comm.e-stop": {
		device: "roboRIO",
		led: "Comm",
		state: "Blinking red",
		meaning:
			"The Driver Station E-Stopped the robot (space bar, or the field E-Stop). Outputs stay disabled until the roboRIO reboots.",
		steps: [
			"Confirm the field is safe and the FTA has cleared the stop.",
			"Reboot the roboRIO: press reset or power cycle the robot. An E-Stop does not clear by disabling.",
			"If it E-Stops again with nobody pressing anything, check the DS laptop for a stuck space bar.",
		],
		source: NI_RED,
	},
	"roborio.comm.ok": {
		device: "roboRIO",
		led: "Comm",
		state: "Solid green",
		meaning: "Good communication with the Driver Station and robot code is running.",
		steps: [
			"If the robot does not move when enabled, look at the Mode LED and the Power LED.",
		],
		source: WPILIB,
	},
	"roborio.mode.disabled": {
		device: "roboRIO",
		led: "Mode",
		state: "Off",
		meaning: "Outputs are off. The robot is disabled, browned out, or E-Stopped.",
		steps: [
			"Normal between matches and before the match starts.",
			"If the DS says enabled and this stays off, check the Power LED (amber is brownout) and the Comm LED (blinking red is E-Stop).",
		],
		source: WPILIB,
	},
	"roborio.mode.auto": {
		device: "roboRIO",
		led: "Mode",
		state: "Solid orange",
		meaning: "Autonomous enabled. Outputs are live.",
		steps: [
			"If the robot does not move, the problem is in code or on the CAN bus, not the roboRIO.",
		],
		source: WPILIB,
	},
	"roborio.mode.teleop": {
		device: "roboRIO",
		led: "Mode",
		state: "Solid green",
		meaning: "Teleop enabled. Outputs are live.",
		steps: [
			"If the robot does not respond, check the joysticks in the DS USB tab and the motor controller LEDs.",
		],
		source: WPILIB,
	},
	"roborio.mode.test": {
		device: "roboRIO",
		led: "Mode",
		state: "Solid red",
		meaning: "Test mode enabled from the Driver Station. The field never sends Test.",
		steps: [
			"Disable in the DS and select Teleop or Autonomous.",
			"If it comes back on its own, reboot the roboRIO.",
		],
		source: WPILIB,
	},
	"roborio.rsl.disabled": {
		device: "roboRIO",
		led: "RSL",
		state: "Solid",
		meaning: "Robot is on and disabled. The onboard LED mirrors the RSL output.",
		steps: [
			"If the external RSL is dark while this is lit, the RSL wiring or bulb is the problem.",
		],
		source: WPILIB,
	},
	"roborio.rsl.enabled": {
		device: "roboRIO",
		led: "RSL",
		state: "Blinking",
		meaning: "Robot is enabled.",
		steps: [
			"Rapid or erratic blinking points at low or unstable power to the roboRIO. Check the battery.",
		],
		source: WPILIB,
	},
	"roborio.rsl.off": {
		device: "roboRIO",
		led: "RSL",
		state: "Off",
		meaning: "The roboRIO has no power, or the RSL output is not driven.",
		steps: [
			"Check the roboRIO Power LED. Off means no power to the roboRIO.",
			"Check the RSL is wired to the RSL port and its jumper is in place.",
			"If the roboRIO is powered and disabled but this stays off, reboot it.",
		],
		source: WPILIB,
	},
	"systemcore.power.ok": {
		device: "SystemCore",
		led: "Power",
		state: "Solid green",
		meaning: "Input power is good.",
		steps: [
			"If the robot has no comms, read the OLED screen for IP addresses and faults.",
		],
		source: SC_SPEC,
	},
	"systemcore.power.off": {
		device: "SystemCore",
		led: "Power",
		state: "Off",
		meaning:
			"No input power, or the power leads are reversed. The input has reverse polarity protection, so a reversed lead shows as off.",
		steps: [
			"Check polarity at the power connector.",
			"Check the power lead at the source and the breaker or fuse.",
			"Swap the power cable.",
			"If it stays off with known good 12 V at the connector, swap the controller.",
		],
		source: SC_SPEC,
	},
	"systemcore.mode.disabled": {
		device: "SystemCore",
		led: "Mode",
		state: "Solid yellow",
		meaning: "Robot is on and disabled.",
		steps: [
			"Normal between matches.",
			"If the DS says enabled and this stays solid, check the Status LED for a brownout.",
		],
		source: SC_SPEC,
	},
	"systemcore.mode.enabled": {
		device: "SystemCore",
		led: "Mode",
		state: "Blinking yellow",
		meaning: "Robot is on and enabled.",
		source: SC_SPEC,
	},
	"systemcore.mode.off": {
		device: "SystemCore",
		led: "Mode",
		state: "Off",
		meaning: "No power.",
		steps: ["See the Power LED. Check power leads, polarity, and the breaker."],
		source: SC_SPEC,
	},
	"systemcore.status.ok": {
		device: "SystemCore",
		led: "Status",
		state: "Off",
		meaning: "No active faults.",
		source: SC_SPEC,
	},
	"systemcore.status.solid": {
		device: "SystemCore",
		led: "Status",
		state: "Solid red",
		meaning:
			"An uncleared hardware fault is active (overcurrent on a port, IO, I2C, USB, or IMU), or the display has faulted. The spec sheet also lists brownout protection here; newer OS releases show brownout as a fast blink.",
		steps: [
			"Read the OLED screen. It names the fault.",
			"Open the web dashboard at robot.local (USB or Wi-Fi) and open the faults panel in the header for the fault name and count.",
			"Overcurrent on a port: unplug the device on that port, check its wiring for a short, plug it back in.",
			"Power cycle to clear.",
			"If it persists with nothing plugged in, swap the controller and report it in the SystemcoreTesting GitHub issues.",
		],
		source: SC_SPEC,
	},
	"systemcore.status.slow-blink": {
		device: "SystemCore",
		led: "Status",
		state: "Slow red blink",
		meaning: "Display hardware fault. The OLED screen is not responding.",
		steps: [
			"Power cycle.",
			"If the screen stays dark and the blink continues, swap the controller if you have a spare and report it in the SystemcoreTesting GitHub issues.",
		],
		source: SC_OS,
	},
	"systemcore.status.fast-blink": {
		device: "SystemCore",
		led: "Status",
		state: "Fast red blink",
		meaning:
			"A CAN bus is unavailable or down, or the controller is in brownout. The OLED shows a health box per CAN bus.",
		steps: [
			"Read the OLED. A single flashing pixel means that bus is unavailable, an empty box means the bus is up but down, a blinking box means it is healthy.",
			"For a down bus: check CANH and CANL wiring and termination on that bus, and look for a shorted device.",
			"Check battery voltage. The default brownout is 6.75 V, recovery 7.5 V. Swap the battery and check the main power connections.",
			"Power cycle.",
		],
		source: SC_OS,
	},
} as const satisfies Record<string, StatusLightHelp>;
