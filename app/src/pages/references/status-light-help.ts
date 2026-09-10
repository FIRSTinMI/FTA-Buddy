// Help content for the Status Lights reference page. One entry per tappable row, keyed by a stable id.
// Wording is for phones on an FRC field: short, direct, most likely fix first.

export interface StatusLightHelp {
	readonly device: string;
	readonly led: string;
	readonly state: string;
	readonly meaning: string;
	/** Omit when there is nothing to do. The dialog then shows no "What to do" section. */
	readonly steps?: readonly string[];
	readonly source?: string;
	/** Tabs inside the dialog, for one pattern that means different things on different hardware revisions. */
	readonly variants?: readonly StatusLightHelpVariant[];
	/** Index into `variants` that opens first. */
	readonly defaultVariant?: number;
}

export interface StatusLightHelpVariant {
	readonly label: string;
	readonly meaning: string;
	readonly steps?: readonly string[];
	readonly source?: string;
}

const WPILIB = "https://docs.wpilib.org/en/stable/docs/hardware/hardware-basics/status-lights-ref.html";
const NI_FLASHING = "https://knowledge.ni.com/KnowledgeArticleDetails?id=kA03q000000kOHkCAM&l=en-US";
const NI_RED = "https://knowledge.ni.com/KnowledgeArticleDetails?id=kA00Z0000019NlbSAE&l=en-US";
const WPILIB_BROWNOUT = "https://docs.wpilib.org/en/stable/docs/software/roborio-info/roborio-brownouts.html";
const WPILIB_IMAGING = "https://docs.wpilib.org/en/stable/docs/zero-to-robot/step-3/imaging-your-roborio.html";
const WPILIB_RIO2 = "https://docs.wpilib.org/en/stable/docs/zero-to-robot/step-3/roborio2-imaging.html";
const VIVID = "https://frc-radio.vivid-hosting.net/overview/led-status-indications";
const VIVID_BOOTLOOP =
	"https://frc-radio.vivid-hosting.net/overview/support/known-issues/1-flash-memory-corruption-causes-bootloop";
const SC_SPEC = "https://downloads.limelightvision.io/documents/systemcore_specifications_june15_2025_alpha.pdf";
const SC_OS = "https://github.com/LimelightVision/systemcore-os-public";
const REV_MAX = "https://docs.revrobotics.com/brushless/spark-max/status-led";
const REV_FLEX = "https://docs.revrobotics.com/brushless/spark-flex/status-led";
const REV_PDH = "https://docs.revrobotics.com/ion-control/pdh/status-led";
const REV_PH = "https://docs.revrobotics.com/ion-control/ph/status-led";
const CTRE_FX = "https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/talonfx/index.html";
const CTRE_FXS = "https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/talonfxs/index.html";
const CTRE_SRX = "https://ctre.download/files/user-manual/Talon%20SRX%20User's%20Guide.pdf";
const CTRE_VSPX = "https://ctre.download/files/user-manual/Victor%20SPX%20User's%20Guide.pdf";
const CTRE_CANIVORE = "https://v6.docs.ctr-electronics.com/en/stable/docs/canivore/canivore-intro.html";
const CTRE_PIGEON = "https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/pigeon2/index.html";
const CTRE_CANCODER = "https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/cancoder/index.html";
const CTRE_CANRANGE = "https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/canrange/index.html";
const CTRE_CANDLE = "https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/candle/index.html";
const CTRE_PDP = "https://ctre.download/files/user-manual/PDP%20User's%20Guide.pdf";
const CTRE_PCM = "https://ctre.download/files/user-manual/PCM%20User's%20Guide.pdf";

// Shared step lists for patterns that repeat across devices.
const CAN_WIRING_STEPS = [
	"Check the CAN wires (yellow CANH, green CANL) at this device and at its neighbours. Wiggle the connectors.",
	"Check the bus is terminated at both ends with 120 ohm: the roboRIO or CANivore at one end, the PDP or PDH terminator at the other.",
	"Confirm the roboRIO is powered and booted.",
	"If only this device shows the fault while its neighbours are fine, its CAN pigtail or connector is bad. Swap the device.",
];

const PHOENIX_NOT_RUNNING_STEPS = [
	"Look at the roboRIO Comm LED. Solid red means no robot code is running. Wait for boot, then have the team redeploy.",
	"Check the code uses Phoenix and that the CAN ID and bus name match this device (Phoenix Tuner X shows what is on the bus).",
	"If the device is on a CANivore, confirm the CANivore STAT LED is green.",
];

const CTRE_DAMAGED_STEPS = [
	"Confirm with Self Test in Phoenix Tuner X.",
	"Do not run the device. Reverse power or a short on the output is the usual cause.",
	"Swap the device and check the wiring polarity before powering the replacement.",
];

const CTRE_BOOTLOADER_STEPS = [
	"The device is waiting for firmware. Field-upgrade it in Phoenix Tuner X.",
	"If the upgrade fails, power cycle and try again over USB from the roboRIO.",
	"If it will not take firmware, swap the device.",
];

const RIO_REIMAGE_STEPS = [
	"roboRIO 1: reimage over USB with the roboRIO Imaging Tool (Format Target).",
	"roboRIO 2: reimage the microSD card on a laptop with balenaEtcher or Raspberry Pi Imager, put it back, then set the team number with the Imaging Tool over USB.",
];

export const statusLightHelp = {
	// #region VH-109 radio
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
	// #endregion

	// #region roboRIO 1 and 2
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
				meaning: "The controller cannot read the microSD card. The card is missing, not clicked in, not imaged, or corrupt. New cards ship blank.",
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
	// #endregion

	// #region SystemCore
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
	// #endregion

	// #region REV SPARK MAX
	"revsparkmax.brushless-mode.brake-no-signal": {
		device: "SPARK MAX",
		led: "Status",
		state: "Cyan blink",
		meaning:
			"Brushless motor type, brake mode, no valid control signal. Powered, but nothing is commanding it: robot disabled, no CAN or PWM frames, or no code.",
		steps: [
			"Normal while the robot is disabled.",
			"If enabled and still blinking: check the CAN chain (yellow, green) or the PWM cable to this controller.",
			"Confirm the code creates this motor with the right CAN ID. The REV Hardware Client lists what the bus sees.",
			"Look for a CAN fault (orange and yellow blink) on another controller in the chain.",
		],
		source: REV_MAX,
	},
	"revsparkmax.brushless-mode.brake-valid-signal": {
		device: "SPARK MAX",
		led: "Status",
		state: "Cyan solid",
		meaning: "Brushless motor type, brake mode, valid signal. Normal when enabled with zero output.",
		steps: [
			"If the motor does not move when commanded, check the three phase wires and the encoder cable. A brushless motor will not run without its sensor.",
		],
		source: REV_MAX,
	},
	"revsparkmax.brushless-mode.coast-no-signal": {
		device: "SPARK MAX",
		led: "Status",
		state: "Magenta blink",
		meaning:
			"Brushless motor type, coast mode, no valid control signal. Powered, but nothing is commanding it: robot disabled, no CAN or PWM frames, or no code.",
		steps: [
			"Normal while the robot is disabled.",
			"If enabled and still blinking: check the CAN chain (yellow, green) or the PWM cable to this controller.",
			"Confirm the code creates this motor with the right CAN ID. The REV Hardware Client lists what the bus sees.",
		],
		source: REV_MAX,
	},
	"revsparkmax.brushless-mode.coast-valid-signal": {
		device: "SPARK MAX",
		led: "Status",
		state: "Magenta solid",
		meaning: "Brushless motor type, coast mode, valid signal. Normal when enabled with zero output.",
		steps: [
			"If the motor does not move when commanded, check the phase wires and the encoder cable.",
		],
		source: REV_MAX,
	},
	"revsparkmax.brushed-mode.brake-no-signal": {
		device: "SPARK MAX",
		led: "Status",
		state: "Blue blink",
		meaning:
			"Brushed motor type, brake mode, no valid control signal. If a NEO or other brushless motor is attached, the motor type is wrong.",
		steps: [
			"Normal while disabled if a brushed motor is attached.",
			"If a brushless motor is attached: stop. Running a brushless motor in brushed mode damages it. Set the motor type to brushless in code or the REV Hardware Client.",
			"If enabled and still blinking: check the CAN chain or PWM cable and the CAN ID in code.",
		],
		source: REV_MAX,
	},
	"revsparkmax.brushed-mode.brake-valid-signal": {
		device: "SPARK MAX",
		led: "Status",
		state: "Blue solid",
		meaning: "Brushed motor type, brake mode, valid signal.",
		steps: [
			"If a brushless motor is attached, do not enable. Set the motor type to brushless first.",
		],
		source: REV_MAX,
	},
	"revsparkmax.brushed-mode.coast-no-signal": {
		device: "SPARK MAX",
		led: "Status",
		state: "Yellow blink",
		meaning:
			"Brushed motor type, coast mode, no valid control signal. If a brushless motor is attached, the motor type is wrong.",
		steps: [
			"Normal while disabled if a brushed motor is attached.",
			"If a brushless motor is attached: stop. Set the motor type to brushless before enabling.",
			"If enabled and still blinking: check the CAN chain or PWM cable and the CAN ID in code.",
		],
		source: REV_MAX,
	},
	"revsparkmax.brushed-mode.coast-valid-signal": {
		device: "SPARK MAX",
		led: "Status",
		state: "Yellow solid",
		meaning: "Brushed motor type, coast mode, valid signal.",
		steps: [
			"If a brushless motor is attached, do not enable. Set the motor type to brushless first.",
		],
		source: REV_MAX,
	},
	"revsparkmax.fault-conditions.sensor-fault": {
		device: "SPARK MAX",
		led: "Status",
		state: "Orange and magenta slow blink",
		meaning:
			"Sensor fault. Wrong sensor type configured, encoder cable unplugged or damaged, or the wrong sensor connected.",
		steps: [
			"Reseat the encoder cable at the SPARK MAX data port and at the motor.",
			"Check the cable for damage. Swap it.",
			"In the REV Hardware Client, confirm the sensor type matches the motor (hall sensor for NEO).",
			"Power cycle.",
			"If it persists with a known good cable and motor, swap the controller.",
		],
		source: REV_MAX,
	},
	"revsparkmax.fault-conditions.12v-missing": {
		device: "SPARK MAX",
		led: "Status",
		state: "Orange and blue slow blink",
		meaning: "No 12 V on the power input. The controller is powered only by USB and will not drive the motor.",
		steps: [
			"Check the power leads at the PDP or PDH and the breaker.",
			"Check the crimp or connector at the controller.",
			"On the bench over USB this is expected.",
		],
		source: REV_MAX,
	},
	"revsparkmax.fault-conditions.gate-driver-fault": {
		device: "SPARK MAX",
		led: "Status",
		state: "Orange and cyan slow blink",
		meaning: "Internal motor drive circuit fault.",
		steps: ["Power cycle.", "If it comes back, swap the controller. REV asks you to contact them if it persists."],
		source: REV_MAX,
	},
	"revsparkmax.fault-conditions.can-fault": {
		device: "SPARK MAX",
		led: "Status",
		state: "Orange and yellow slow blink",
		meaning: "The controller sees a problem on the CAN bus.",
		steps: [
			"Check the CAN wires at this controller and its neighbours.",
			"Check termination at the end of the bus.",
			"Look for a duplicate CAN ID in the REV Hardware Client.",
			"Power cycle.",
		],
		source: REV_MAX,
	},
	"revsparkmax.fault-conditions.corrupt-firmware": {
		device: "SPARK MAX",
		led: "Status",
		state: "Dark",
		meaning: "Firmware failed to load. The LED stays dark even with power.",
		steps: [
			"Confirm 12 V is present. A dark LED is also just no power.",
			"Enter Recovery Mode: hold the Mode button while plugging in USB, then reflash firmware in the REV Hardware Client.",
			"If it will not take firmware, swap the controller.",
		],
		source: REV_MAX,
	},
	"revsparkmax.identification-updating-and-recovery.identify": {
		device: "SPARK MAX",
		led: "Status",
		state: "White and magenta fast blink",
		meaning: "Someone pressed Identify in the REV Hardware Client. Cosmetic.",
		source: REV_MAX,
	},
	"revsparkmax.identification-updating-and-recovery.can-firmware-updating-v1-5-0": {
		device: "SPARK MAX",
		led: "Status",
		state: "White and yellow blink",
		meaning: "Firmware is being written over CAN.",
		steps: [
			"Do not power off. Wait for it to finish.",
			"If it sits there for minutes, power cycle and update over USB instead.",
		],
		source: REV_MAX,
	},
	"revsparkmax.identification-updating-and-recovery.can-firmware-updating-v1-4-0": {
		device: "SPARK MAX",
		led: "Status",
		state: "Green and magenta blink",
		meaning: "Firmware is being written over CAN (older bootloader).",
		steps: [
			"Do not power off. Wait for it to finish.",
			"If it sits there for minutes, power cycle and update over USB instead.",
		],
		source: REV_MAX,
	},
	"revsparkmax.identification-updating-and-recovery.can-firmware-retry": {
		device: "SPARK MAX",
		led: "Status",
		state: "White and blue blink",
		meaning: "A CAN firmware update failed and the controller is retrying.",
		steps: ["Keep power on and let it retry.", "If it stays here, update over USB with the REV Hardware Client."],
		source: REV_MAX,
	},
	"revsparkmax.identification-updating-and-recovery.usb-device-firmware-update": {
		device: "SPARK MAX",
		led: "Status",
		state: "Dark",
		meaning: "USB firmware update mode. The REV Hardware Client is flashing it.",
		steps: ["Finish the update in the Hardware Client, then power cycle."],
		source: REV_MAX,
	},
	"revsparkmax.identification-updating-and-recovery.recovery-mode": {
		device: "SPARK MAX",
		led: "Status",
		state: "Dark",
		meaning: "Recovery mode. Used to reflash a controller whose firmware is corrupt.",
		steps: ["Connect USB and flash firmware in the REV Hardware Client.", "Power cycle when done."],
		source: REV_MAX,
	},
	"revsparkmax.movement.partial-forward": {
		device: "SPARK MAX",
		led: "Status",
		state: "Green blink",
		meaning: "Driving forward at partial output.",
		source: REV_MAX,
	},
	"revsparkmax.movement.full-forward": {
		device: "SPARK MAX",
		led: "Status",
		state: "Green solid",
		meaning: "Driving forward at full output.",
		source: REV_MAX,
	},
	"revsparkmax.movement.partial-reverse": {
		device: "SPARK MAX",
		led: "Status",
		state: "Red blink",
		meaning: "Driving reverse at partial output.",
		source: REV_MAX,
	},
	"revsparkmax.movement.full-reverse": {
		device: "SPARK MAX",
		led: "Status",
		state: "Red solid",
		meaning: "Driving reverse at full output.",
		source: REV_MAX,
	},
	"revsparkmax.movement.forward-limit": {
		device: "SPARK MAX",
		led: "Status",
		state: "Green and white blink",
		meaning: "The forward limit switch or soft limit is active. Forward output is blocked.",
		steps: [
			"Check the limit switch and its wiring at the data port. A disconnected normally closed switch reads as pressed.",
			"In the REV Hardware Client, check the limit switch polarity setting.",
			"Move the mechanism off the limit.",
		],
		source: REV_MAX,
	},
	"revsparkmax.movement.reverse-limit": {
		device: "SPARK MAX",
		led: "Status",
		state: "Red and white blink",
		meaning: "The reverse limit switch or soft limit is active. Reverse output is blocked.",
		steps: [
			"Check the limit switch and its wiring at the data port. A disconnected normally closed switch reads as pressed.",
			"In the REV Hardware Client, check the limit switch polarity setting.",
			"Move the mechanism off the limit.",
		],
		source: REV_MAX,
	},
	// #endregion

	// #region REV SPARK Flex
	"revsparkflex.brushless-mode.brake-no-signal": {
		device: "SPARK Flex",
		led: "Status",
		state: "Cyan blink",
		meaning:
			"Brushless motor type, brake mode, no valid control signal. Powered, but nothing is commanding it: robot disabled, no CAN or PWM frames, or no code.",
		steps: [
			"Normal while the robot is disabled.",
			"If enabled and still blinking: check the CAN chain (yellow, green) or the PWM cable to this controller.",
			"Confirm the code creates this motor with the right CAN ID. The REV Hardware Client lists what the bus sees.",
		],
		source: REV_FLEX,
	},
	"revsparkflex.brushless-mode.brake-valid-signal": {
		device: "SPARK Flex",
		led: "Status",
		state: "Cyan solid",
		meaning: "Brushless motor type, brake mode, valid signal. Normal when enabled with zero output.",
		steps: [
			"If the motor does not move when commanded, check the motor is seated on the Flex and the dock connector is clean.",
		],
		source: REV_FLEX,
	},
	"revsparkflex.brushless-mode.coast-no-signal": {
		device: "SPARK Flex",
		led: "Status",
		state: "Magenta blink",
		meaning:
			"Brushless motor type, coast mode, no valid control signal. Powered, but nothing is commanding it: robot disabled, no CAN or PWM frames, or no code.",
		steps: [
			"Normal while the robot is disabled.",
			"If enabled and still blinking: check the CAN chain (yellow, green) or the PWM cable to this controller.",
			"Confirm the code creates this motor with the right CAN ID.",
		],
		source: REV_FLEX,
	},
	"revsparkflex.brushless-mode.coast-valid-signal": {
		device: "SPARK Flex",
		led: "Status",
		state: "Magenta solid",
		meaning: "Brushless motor type, coast mode, valid signal. Normal when enabled with zero output.",
		source: REV_FLEX,
	},
	"revsparkflex.brushed-mode.brake-no-signal": {
		device: "SPARK Flex",
		led: "Status",
		state: "Blue blink",
		meaning:
			"Brushed motor type, brake mode, no valid control signal. If a Vortex or NEO is attached, the motor type is wrong.",
		steps: [
			"If a brushless motor is attached: stop. Running a brushless motor in brushed mode damages it. Set the motor type to brushless.",
			"Normal while disabled if a brushed motor is attached.",
			"If enabled and still blinking: check the CAN chain or PWM cable and the CAN ID in code.",
		],
		source: REV_FLEX,
	},
	"revsparkflex.brushed-mode.brake-valid-signal": {
		device: "SPARK Flex",
		led: "Status",
		state: "Blue solid",
		meaning: "Brushed motor type, brake mode, valid signal.",
		steps: [
			"If a brushless motor is attached, do not enable. Set the motor type to brushless first.",
		],
		source: REV_FLEX,
	},
	"revsparkflex.brushed-mode.coast-no-signal": {
		device: "SPARK Flex",
		led: "Status",
		state: "Yellow blink",
		meaning:
			"Brushed motor type, coast mode, no valid control signal. If a brushless motor is attached, the motor type is wrong.",
		steps: [
			"If a brushless motor is attached: stop. Set the motor type to brushless before enabling.",
			"Normal while disabled if a brushed motor is attached.",
			"If enabled and still blinking: check the CAN chain or PWM cable and the CAN ID in code.",
		],
		source: REV_FLEX,
	},
	"revsparkflex.brushed-mode.coast-valid-signal": {
		device: "SPARK Flex",
		led: "Status",
		state: "Yellow solid",
		meaning: "Brushed motor type, coast mode, valid signal.",
		steps: [
			"If a brushless motor is attached, do not enable. Set the motor type to brushless first.",
		],
		source: REV_FLEX,
	},
	"revsparkflex.fault-modes.sensor-fault": {
		device: "SPARK Flex",
		led: "Status",
		state: "Orange and magenta slow blink",
		meaning:
			"Sensor fault. Wrong sensor type configured, sensor cable unplugged or damaged, or the wrong sensor connected.",
		steps: [
			"Reseat the motor on the Flex dock, or the sensor cable if an external motor is used.",
			"Check the cable for damage. Swap it.",
			"In the REV Hardware Client, confirm the sensor type matches the motor.",
			"Power cycle.",
			"If it persists with a known good motor, swap the controller.",
		],
		source: REV_FLEX,
	},
	"revsparkflex.fault-modes.12v-missing": {
		device: "SPARK Flex",
		led: "Status",
		state: "Orange and blue slow blink",
		meaning: "No 12 V on the power input. The controller is powered only by USB and will not drive the motor.",
		steps: [
			"Check the power leads at the PDP or PDH and the breaker.",
			"Check the connector at the controller.",
			"On the bench over USB this is expected.",
		],
		source: REV_FLEX,
	},
	"revsparkflex.fault-modes.gate-driver-fault": {
		device: "SPARK Flex",
		led: "Status",
		state: "Orange and cyan slow blink",
		meaning: "Internal motor drive circuit fault.",
		steps: ["Power cycle.", "If it comes back, swap the controller. REV asks you to contact them if it persists."],
		source: REV_FLEX,
	},
	"revsparkflex.fault-modes.can-fault": {
		device: "SPARK Flex",
		led: "Status",
		state: "Orange and yellow slow blink",
		meaning: "The controller sees a problem on the CAN bus.",
		steps: [
			"Check the CAN wires at this controller and its neighbours.",
			"Check termination at the end of the bus.",
			"Look for a duplicate CAN ID in the REV Hardware Client.",
			"Power cycle.",
		],
		source: REV_FLEX,
	},
	"revsparkflex.fault-modes.temperature-fault": {
		device: "SPARK Flex",
		led: "Status",
		state: "Orange and green slow blink",
		meaning:
			"Temperature cutoff. The controller or motor overheated and output is cut. It clears on its own after cooling.",
		steps: [
			"Let it cool. Do not enable until the blink stops.",
			"Check for a stalled or binding mechanism.",
			"Have the team add or lower current limits in code.",
			"Check airflow around the motor and controller.",
		],
		source: REV_FLEX,
	},
	"revsparkflex.fault-modes.corrupt-firmware": {
		device: "SPARK Flex",
		led: "Status",
		state: "Dark",
		meaning: "Firmware failed to load. The LED stays dark even with power.",
		steps: [
			"Confirm 12 V is present. A dark LED is also just no power.",
			"Enter Recovery Mode: hold the Mode button while plugging in USB, then reflash firmware in the REV Hardware Client.",
			"If it will not take firmware, swap the controller.",
		],
		source: REV_FLEX,
	},
	"revsparkflex.identification-updating-and-recovery.identify": {
		device: "SPARK Flex",
		led: "Status",
		state: "White and magenta fast blink",
		meaning: "Someone pressed Identify in the REV Hardware Client. Cosmetic.",
		source: REV_FLEX,
	},
	"revsparkflex.identification-updating-and-recovery.can-firmware-updating": {
		device: "SPARK Flex",
		led: "Status",
		state: "White and yellow blink",
		meaning: "Firmware is being written over CAN.",
		steps: [
			"Do not power off. Wait for it to finish.",
			"If it sits there for minutes, power cycle and update over USB instead.",
		],
		source: REV_FLEX,
	},
	"revsparkflex.identification-updating-and-recovery.can-firmware-retry": {
		device: "SPARK Flex",
		led: "Status",
		state: "White and blue blink",
		meaning: "A CAN firmware update failed and the controller is retrying.",
		steps: ["Keep power on and let it retry.", "If it stays here, update over USB with the REV Hardware Client."],
		source: REV_FLEX,
	},
	"revsparkflex.identification-updating-and-recovery.usb-device-firmware-update": {
		device: "SPARK Flex",
		led: "Status",
		state: "Dark",
		meaning: "USB firmware update mode. The REV Hardware Client is flashing it.",
		steps: ["Finish the update in the Hardware Client, then power cycle."],
		source: REV_FLEX,
	},
	"revsparkflex.identification-updating-and-recovery.recovery-mode": {
		device: "SPARK Flex",
		led: "Status",
		state: "Dark",
		meaning: "Recovery mode. Used to reflash a controller whose firmware is corrupt.",
		steps: ["Connect USB and flash firmware in the REV Hardware Client.", "Power cycle when done."],
		source: REV_FLEX,
	},
	"revsparkflex.movement.partial-forward": {
		device: "SPARK Flex",
		led: "Status",
		state: "Green blink",
		meaning: "Driving forward at partial output.",
		source: REV_FLEX,
	},
	"revsparkflex.movement.full-forward": {
		device: "SPARK Flex",
		led: "Status",
		state: "Green solid",
		meaning: "Driving forward at full output.",
		source: REV_FLEX,
	},
	"revsparkflex.movement.partial-reverse": {
		device: "SPARK Flex",
		led: "Status",
		state: "Red blink",
		meaning: "Driving reverse at partial output.",
		source: REV_FLEX,
	},
	"revsparkflex.movement.full-reverse": {
		device: "SPARK Flex",
		led: "Status",
		state: "Red solid",
		meaning: "Driving reverse at full output.",
		source: REV_FLEX,
	},
	"revsparkflex.movement.forward-limit": {
		device: "SPARK Flex",
		led: "Status",
		state: "Green and white blink",
		meaning: "The forward limit switch or soft limit is active. Forward output is blocked.",
		steps: [
			"Check the limit switch and its wiring at the data port. A disconnected normally closed switch reads as pressed.",
			"In the REV Hardware Client, check the limit switch polarity setting.",
			"Move the mechanism off the limit.",
		],
		source: REV_FLEX,
	},
	"revsparkflex.movement.reverse-limit": {
		device: "SPARK Flex",
		led: "Status",
		state: "Red and white blink",
		meaning: "The reverse limit switch or soft limit is active. Reverse output is blocked.",
		steps: [
			"Check the limit switch and its wiring at the data port. A disconnected normally closed switch reads as pressed.",
			"In the REV Hardware Client, check the limit switch polarity setting.",
			"Move the mechanism off the limit.",
		],
		source: REV_FLEX,
	},
	// #endregion

	// #region REV Power Distribution Hub
	"revpowerdistributionhub.general-status.no-communication-established": {
		device: "Power Distribution Hub",
		led: "Status",
		state: "Blue solid",
		meaning: "Powered, no CAN communication yet. Normal for the first seconds after boot.",
		steps: [
			"Wait for the roboRIO to boot and code to start.",
			"If it stays blue: check the CAN wiring to the PDH and the termination switch on the PDH.",
			"Confirm robot code is running (roboRIO Comm LED green).",
		],
		source: REV_PDH,
	},
	"revpowerdistributionhub.general-status.roborio-communication-established": {
		device: "Power Distribution Hub",
		led: "Status",
		state: "Green solid",
		meaning: "Communicating with the roboRIO. Normal.",
		source: REV_PDH,
	},
	"revpowerdistributionhub.general-status.connected-to-rev-hardware-client": {
		device: "Power Distribution Hub",
		led: "Status",
		state: "Cyan solid",
		meaning: "A laptop running the REV Hardware Client is connected over USB-C. Fine in the pit.",
		steps: ["Unplug the USB cable before the robot goes to the field."],
		source: REV_PDH,
	},
	"revpowerdistributionhub.general-status.keep-alive-timeout": {
		device: "Power Distribution Hub",
		led: "Status",
		state: "Magenta blink",
		meaning:
			"The PDH had communication with the roboRIO and lost it. The roboRIO stopped sending heartbeat frames.",
		steps: [
			"Check whether the roboRIO rebooted or code crashed (Comm LED).",
			"Check the CAN wiring between the roboRIO and the PDH.",
			"Power cycle.",
		],
		source: REV_PDH,
	},
	"revpowerdistributionhub.general-status.low-battery": {
		device: "Power Distribution Hub",
		led: "Status",
		state: "Orange and blue blink",
		meaning: "Battery voltage is low.",
		steps: ["Swap the battery.", "Check the main battery connections and main breaker for heat or looseness."],
		source: REV_PDH,
	},
	"revpowerdistributionhub.general-status.can-fault": {
		device: "Power Distribution Hub",
		led: "Status",
		state: "Orange and yellow blink",
		meaning: "The PDH sees a problem on the CAN bus.",
		steps: [
			"Check the CAN wiring at the PDH and its neighbours.",
			"Check the termination switch on the PDH. It must be on if the PDH is the end of the bus, off if not.",
			"Look for a duplicate CAN ID in the REV Hardware Client.",
			"Power cycle.",
		],
		source: REV_PDH,
	},
	"revpowerdistributionhub.general-status.hardware-fault": {
		device: "Power Distribution Hub",
		led: "Status",
		state: "Orange and cyan blink",
		meaning: "The PDH detected an internal hardware fault.",
		steps: ["Power cycle.", "Inspect for metal debris and damage.", "If it comes back, swap the PDH."],
		source: REV_PDH,
	},
	"revpowerdistributionhub.general-status.device-over-current": {
		device: "Power Distribution Hub",
		led: "Status",
		state: "Orange and magenta blink",
		meaning: "The PDH itself is over its current limit.",
		steps: [
			"Look for a shorted channel or a stalled motor.",
			"Reduce load.",
			"Check the main breaker and battery leads.",
		],
		source: REV_PDH,
	},
	"revpowerdistributionhub.channel-status.has-voltage-and-normal-operation": {
		device: "Power Distribution Hub",
		led: "Channel",
		state: "Off",
		meaning: "The channel has voltage and no fault. Normal.",
		source: REV_PDH,
	},
	"revpowerdistributionhub.channel-status.no-voltage-and-active-fault": {
		device: "Power Distribution Hub",
		led: "Channel",
		state: "Red solid",
		meaning: "The channel has no output voltage. The breaker is tripped, missing, or not seated.",
		steps: [
			"Press the breaker back in and check it is seated.",
			"Swap the breaker.",
			"Check the load on that channel for a short.",
		],
		source: REV_PDH,
	},
	"revpowerdistributionhub.channel-status.sticky-fault": {
		device: "Power Distribution Hub",
		led: "Channel",
		state: "Red blink",
		meaning: "A fault happened earlier on this channel and has not been cleared. The channel may be working now.",
		steps: [
			"Check the breaker is seated.",
			"Clear sticky faults from the REV Hardware Client or from code.",
			"If it comes back, find the intermittent short or the tripping breaker on that channel.",
		],
		source: REV_PDH,
	},
	"revpowerdistributionhub.switched-channel.has-voltage-and-normal-operation": {
		device: "Power Distribution Hub",
		led: "Switched channel",
		state: "Off",
		meaning: "The switched channel has voltage and no fault. Normal.",
		source: REV_PDH,
	},
	"revpowerdistributionhub.switched-channel.no-voltage-and-active-fault": {
		device: "Power Distribution Hub",
		led: "Switched channel",
		state: "Red solid",
		meaning: "The switched channel has no output voltage. The fuse is blown or missing.",
		steps: [
			"Check the fuse is present and seated.",
			"Replace the fuse.",
			"Check the load for a short before replacing again.",
		],
		source: REV_PDH,
	},
	"revpowerdistributionhub.switched-channel.sticky-fault": {
		device: "Power Distribution Hub",
		led: "Switched channel",
		state: "Red blink",
		meaning: "A fault happened earlier on the switched channel and has not been cleared.",
		steps: ["Check the fuse.", "Clear sticky faults from the REV Hardware Client or from code."],
		source: REV_PDH,
	},
	// #endregion

	// #region REV Pneumatic Hub
	"revpneumaticshub.general-status.no-communication-established": {
		device: "Pneumatic Hub",
		led: "Status",
		state: "Blue solid",
		meaning: "Powered, no CAN communication yet. Normal for the first seconds after boot.",
		steps: [
			"Wait for the roboRIO to boot and code to start.",
			"If it stays blue: check the CAN wiring to the hub and the termination switch.",
			"Confirm the code creates a pneumatics object for the REV hub type.",
		],
		source: REV_PH,
	},
	"revpneumaticshub.general-status.roborio-communication-established": {
		device: "Pneumatic Hub",
		led: "Status",
		state: "Green solid",
		meaning: "Communicating with the roboRIO. Normal.",
		source: REV_PH,
	},
	"revpneumaticshub.general-status.secondary-heartbeat": {
		device: "Pneumatic Hub",
		led: "Status",
		state: "Cyan solid",
		meaning: "A laptop running the REV Hardware Client is connected over USB-C. Fine in the pit.",
		steps: ["Unplug the USB cable before the robot goes to the field."],
		source: REV_PH,
	},
	"revpneumaticshub.general-status.keep-alive-timeout": {
		device: "Pneumatic Hub",
		led: "Status",
		state: "Magenta blink",
		meaning: "The hub had communication with the roboRIO and lost it.",
		steps: [
			"Check whether the roboRIO rebooted or code crashed (Comm LED).",
			"Check the CAN wiring to the hub.",
			"Power cycle.",
		],
		source: REV_PH,
	},
	"revpneumaticshub.general-status.hardware-fault": {
		device: "Pneumatic Hub",
		led: "Status",
		state: "Orange and cyan blink",
		meaning: "The hub detected an internal hardware fault.",
		steps: ["Power cycle.", "Inspect for metal debris and damage.", "If it comes back, swap the hub."],
		source: REV_PH,
	},
	"revpneumaticshub.general-status.can-fault": {
		device: "Pneumatic Hub",
		led: "Status",
		state: "Orange and yellow blink",
		meaning: "The hub sees a problem on the CAN bus.",
		steps: [
			"Check the CAN wiring at the hub and its neighbours.",
			"Check the termination switch.",
			"Look for a duplicate CAN ID.",
			"Power cycle.",
		],
		source: REV_PH,
	},
	"revpneumaticshub.general-status.compressor-over-current": {
		device: "Pneumatic Hub",
		led: "Status",
		state: "Orange and green blink",
		meaning: "The compressor output is drawing too much current.",
		steps: [
			"Check the compressor wiring for a short.",
			"Check the compressor turns freely and is not seized.",
			"Let it cool, then power cycle.",
		],
		source: REV_PH,
	},
	"revpneumaticshub.general-status.device-over-current": {
		device: "Pneumatic Hub",
		led: "Status",
		state: "Orange and magenta blink",
		meaning: "The hub is over its current limit, usually on a solenoid output.",
		steps: [
			"Unplug solenoids one at a time to find the shorted one.",
			"Check solenoid voltage setting matches the solenoids (12 V or 24 V).",
			"Power cycle.",
		],
		source: REV_PH,
	},
	"revpneumaticshub.compressor-status.compressor-off": {
		device: "Pneumatic Hub",
		led: "Compressor",
		state: "Off",
		meaning: "The compressor output is off.",
		steps: [
			"Normal when the system is at pressure or the robot is disabled.",
			"If the compressor should run: check the pressure switch wiring and that code enables the compressor.",
		],
		source: REV_PH,
	},
	"revpneumaticshub.compressor-status.compressor-on": {
		device: "Pneumatic Hub",
		led: "Compressor",
		state: "Green solid",
		meaning: "The compressor output is on.",
		steps: [
			"If the compressor is not running with this on, check the compressor wiring and the compressor itself.",
		],
		source: REV_PH,
	},
	"revpneumaticshub.solenoid-status.solenoid-off": {
		device: "Pneumatic Hub",
		led: "Solenoid",
		state: "Off",
		meaning: "That solenoid channel is not energized.",
		steps: [
			"Normal when the solenoid is commanded off.",
			"If it should be on, the problem is in code or the channel number.",
		],
		source: REV_PH,
	},
	"revpneumaticshub.solenoid-status.solenoid-on": {
		device: "Pneumatic Hub",
		led: "Solenoid",
		state: "Green solid",
		meaning: "That solenoid channel is energized.",
		steps: [
			"If the cylinder does not move: check air pressure, the solenoid wiring, and the solenoid voltage setting.",
		],
		source: REV_PH,
	},
	// #endregion

	// #region CTRE Talon FX
	"ctretalonfx.disabled-codes.no-power": {
		device: "Talon FX",
		led: "Status",
		state: "Both off",
		meaning: "No 12 V on the V+ and V- leads.",
		steps: [
			"Check the breaker on that PDP or PDH channel.",
			"Check the crimp or connector at the PDP or PDH and at the device.",
			"Swap the power leads if damaged.",
		],
		source: CTRE_FX,
	},
	"ctretalonfx.disabled-codes.valid-can-pwm-signal-robot-is-disabled-phoenix-is-running": {
		device: "Talon FX",
		led: "Status",
		state: "Both blink orange together",
		meaning: "CAN is good, Phoenix is running, and the robot is disabled. Normal.",
		source: CTRE_FX,
	},
	"ctretalonfx.disabled-codes.valid-can-pwm-phoenix-is-not-detected": {
		device: "Talon FX",
		led: "Status",
		state: "Alternating orange",
		meaning:
			"The CAN bus is fine but no Phoenix based robot program is talking to it. Code is not running, crashed, or does not create this device.",
		steps: PHOENIX_NOT_RUNNING_STEPS,
		source: CTRE_FX,
	},
	"ctretalonfx.disabled-codes.invalid-can-pwm-signal": {
		device: "Talon FX",
		led: "Status",
		state: "Alternating red",
		meaning: "No valid CAN or PWM signal.",
		steps: CAN_WIRING_STEPS,
		source: CTRE_FX,
	},
	"ctretalonfx.enabled-codes.enabled-with-neutral-output": {
		device: "Talon FX",
		led: "Status",
		state: "Both solid orange",
		meaning: "Enabled with zero output. Normal.",
		steps: [
			"If it should be moving, the command is zero. Check the joystick in the DS and the code.",
		],
		source: CTRE_FX,
	},
	"ctretalonfx.enabled-codes.driving-in-reverse-rate-dutycycle": {
		device: "Talon FX",
		led: "Status",
		state: "Both blink red together",
		meaning: "Driving in reverse. Blink rate follows duty cycle.",
		source: CTRE_FX,
	},
	"ctretalonfx.enabled-codes.driving-in-forward-rate-dutycycle": {
		device: "Talon FX",
		led: "Status",
		state: "Both blink green together",
		meaning: "Driving forward. Blink rate follows duty cycle.",
		source: CTRE_FX,
	},
	"ctretalonfx.enabled-codes.talon-limited-offset-direction-forward-reverse": {
		device: "Talon FX",
		led: "Status",
		state: "Offset red and off",
		meaning:
			"A hard or soft limit is engaged. The offset direction shows which one. Output in that direction is blocked.",
		steps: [
			"Check the limit switch wiring. A disconnected normally closed switch reads as pressed.",
			"Check the soft limit and limit switch config in Phoenix Tuner X.",
			"Move the mechanism off the limit.",
		],
		source: CTRE_FX,
	},
	"ctretalonfx.special-codes.thermal-cutoff-warning": {
		device: "Talon FX",
		led: "Status",
		state: "Offset orange and off",
		meaning: "The motor or controller is too hot. Output is reduced or cut.",
		steps: [
			"Let it cool.",
			"Check for a stalled or binding mechanism.",
			"Have the team add stator current limits.",
		],
		source: CTRE_FX,
	},
	"ctretalonfx.special-codes.using-pro-command-without-license": {
		device: "Talon FX",
		led: "Status",
		state: "Alternating red and green",
		meaning: "Code sent a Phoenix Pro only control request to an unlicensed device. The request is ignored.",
		steps: ["License the device in Phoenix Tuner X, or change the code to a non-Pro control request."],
		source: CTRE_FX,
	},
	"ctretalonfx.special-codes.damaged-hardware": {
		device: "Talon FX",
		led: "Status",
		state: "Alternating red and orange",
		meaning: "The device detected hardware damage.",
		steps: CTRE_DAMAGED_STEPS,
		source: CTRE_FX,
	},
	"ctretalonfx.special-codes.in-bootloader-field-upgrade-in-tuner-x": {
		device: "Talon FX",
		led: "Status",
		state: "One LED alternates green and orange",
		meaning:
			"The device is in its bootloader with no application firmware. It will not respond to control until firmware is loaded.",
		steps: CTRE_BOOTLOADER_STEPS,
		source: CTRE_FX,
	},
	// #endregion

	// #region CTRE Talon FXS
	"ctretalonfxs.disabled-codes.no-power": {
		device: "Talon FXS",
		led: "Status",
		state: "Both off",
		meaning: "No 12 V on the V+ and V- leads.",
		steps: [
			"Check the breaker on that PDP or PDH channel.",
			"Check the crimp or connector at the PDP or PDH and at the device.",
			"Swap the power leads if damaged.",
		],
		source: CTRE_FXS,
	},
	"ctretalonfxs.disabled-codes.valid-can-pwm-signal-robot-is-disabled-phoenix-is-running": {
		device: "Talon FXS",
		led: "Status",
		state: "Both blink orange together",
		meaning: "CAN is good, Phoenix is running, and the robot is disabled. Normal.",
		source: CTRE_FXS,
	},
	"ctretalonfxs.disabled-codes.valid-can-pwm-phoenix-is-not-detected": {
		device: "Talon FXS",
		led: "Status",
		state: "Alternating orange",
		meaning:
			"The CAN bus is fine but no Phoenix based robot program is talking to it. Code is not running, crashed, or does not create this device.",
		steps: PHOENIX_NOT_RUNNING_STEPS,
		source: CTRE_FXS,
	},
	"ctretalonfxs.disabled-codes.invalid-can-pwm-signal": {
		device: "Talon FXS",
		led: "Status",
		state: "Alternating red",
		meaning: "No valid CAN or PWM signal.",
		steps: CAN_WIRING_STEPS,
		source: CTRE_FXS,
	},
	"ctretalonfxs.enabled-codes.enabled-with-neutral-output": {
		device: "Talon FXS",
		led: "Status",
		state: "Both solid orange",
		meaning: "Enabled with zero output. Normal.",
		steps: [
			"If it should be moving, the command is zero. Check the joystick in the DS and the code.",
		],
		source: CTRE_FXS,
	},
	"ctretalonfxs.enabled-codes.driving-in-reverse-rate-dutycycle": {
		device: "Talon FXS",
		led: "Status",
		state: "Both blink red together",
		meaning: "Driving in reverse. Blink rate follows duty cycle.",
		source: CTRE_FXS,
	},
	"ctretalonfxs.enabled-codes.driving-in-forward-rate-dutycycle": {
		device: "Talon FXS",
		led: "Status",
		state: "Both blink green together",
		meaning: "Driving forward. Blink rate follows duty cycle.",
		source: CTRE_FXS,
	},
	"ctretalonfxs.enabled-codes.talon-limited-offset-direction-forward-reverse": {
		device: "Talon FXS",
		led: "Status",
		state: "Offset red and off",
		meaning:
			"A hard or soft limit is engaged. The offset direction shows which one. Output in that direction is blocked.",
		steps: [
			"Check the limit switch wiring. A disconnected normally closed switch reads as pressed.",
			"Check the soft limit and limit switch config in Phoenix Tuner X.",
			"Move the mechanism off the limit.",
		],
		source: CTRE_FXS,
	},
	"ctretalonfxs.special-codes.thermal-cutoff-warning": {
		device: "Talon FXS",
		led: "Status",
		state: "Offset orange and off",
		meaning: "Thermal cutoff, or the temperature sensor is missing. Output is reduced or cut.",
		steps: [
			"Brushless motor: reseat the JST sensor cable and check it for damage. Confirm the motor type in Tuner X matches the motor.",
			"Brushed motor: confirm the brushed motor option is selected in Tuner X.",
			"Let it cool. Have the team add stator current limits.",
		],
		source: CTRE_FXS,
	},
	"ctretalonfxs.special-codes.using-pro-command-without-license": {
		device: "Talon FXS",
		led: "Status",
		state: "Alternating red and green",
		meaning: "Code sent a Phoenix Pro only control request to an unlicensed device. The request is ignored.",
		steps: ["License the device in Phoenix Tuner X, or change the code to a non-Pro control request."],
		source: CTRE_FXS,
	},
	"ctretalonfxs.special-codes.damaged-hardware": {
		device: "Talon FXS",
		led: "Status",
		state: "Alternating red and orange",
		meaning: "The device detected hardware damage.",
		steps: CTRE_DAMAGED_STEPS,
		source: CTRE_FXS,
	},
	"ctretalonfxs.special-codes.in-bootloader-field-upgrade-in-tuner-x": {
		device: "Talon FXS",
		led: "Status",
		state: "One LED alternates green and orange",
		meaning:
			"The device is in its bootloader with no application firmware. It will not respond to control until firmware is loaded.",
		steps: CTRE_BOOTLOADER_STEPS,
		source: CTRE_FXS,
	},
	// #endregion

	// #region CTRE Talon SRX
	"ctretalonsrx.calibration-codes.calibration-in-progress": {
		device: "Talon SRX",
		led: "Status",
		state: "Flashing red and green",
		meaning: "PWM calibration mode. Someone held the B/C CAL button. Only matters for PWM control.",
		steps: [
			"Release the button.",
			"If it stays in calibration, power cycle.",
			"On a CAN robot, ignore calibration; it has no effect.",
		],
		source: CTRE_SRX,
	},
	"ctretalonsrx.calibration-codes.successful-calibration": {
		device: "Talon SRX",
		led: "Status",
		state: "Blinking green",
		meaning: "PWM calibration succeeded.",
		source: CTRE_SRX,
	},
	"ctretalonsrx.calibration-codes.failed-calibration": {
		device: "Talon SRX",
		led: "Status",
		state: "Blinking red",
		meaning: "PWM calibration failed. The previous calibration is kept.",
		steps: ["Power cycle.", "If PWM control is needed, repeat calibration with full stick travel."],
		source: CTRE_SRX,
	},
	"ctretalonsrx.normal-operation-codes.no-power": {
		device: "Talon SRX",
		led: "Status",
		state: "Both off",
		meaning: "No 12 V on the V+ and V- leads.",
		steps: [
			"Check the breaker on that PDP or PDH channel.",
			"Check the crimp or connector at the PDP or PDH and at the device.",
		],
		source: CTRE_SRX,
	},
	"ctretalonsrx.normal-operation-codes.driving-in-forward-rate-dutycycle": {
		device: "Talon SRX",
		led: "Status",
		state: "Both blink green",
		meaning: "Driving forward. Blink rate follows duty cycle.",
		source: CTRE_SRX,
	},
	"ctretalonsrx.normal-operation-codes.driving-in-reverse-rate-dutycycle": {
		device: "Talon SRX",
		led: "Status",
		state: "Both blink red",
		meaning: "Driving in reverse. Blink rate follows duty cycle.",
		source: CTRE_SRX,
	},
	"ctretalonsrx.normal-operation-codes.can-pwm-detected-robot-disabled": {
		device: "Talon SRX",
		led: "Status",
		state: "Alternating off and orange",
		meaning: "CAN or PWM signal present, robot disabled. Normal.",
		source: CTRE_SRX,
	},
	"ctretalonsrx.normal-operation-codes.can-pwm-not-detected": {
		device: "Talon SRX",
		led: "Status",
		state: "Alternating off and red",
		meaning: "No CAN bus or PWM signal detected.",
		steps: CAN_WIRING_STEPS,
		source: CTRE_SRX,
	},
	"ctretalonsrx.normal-operation-codes.damaged-hardware": {
		device: "Talon SRX",
		led: "Status",
		state: "Alternating red and orange",
		meaning: "The device detected hardware damage.",
		steps: CTRE_DAMAGED_STEPS,
		source: CTRE_SRX,
	},
	"ctretalonsrx.normal-operation-codes.forward-soft-hard-limit-triggered": {
		device: "Talon SRX",
		led: "Status",
		state: "Red strobe towards M+",
		meaning: "The forward limit switch or soft limit is active. Forward output is blocked.",
		steps: [
			"Check the limit switch wiring at the data port. A disconnected normally closed switch reads as pressed.",
			"Check the limit switch and soft limit config in Phoenix Tuner.",
			"Move the mechanism off the limit.",
		],
		source: CTRE_SRX,
	},
	"ctretalonsrx.normal-operation-codes.reverse-soft-hard-limit-triggered": {
		device: "Talon SRX",
		led: "Status",
		state: "Red strobe towards M-",
		meaning: "The reverse limit switch or soft limit is active. Reverse output is blocked.",
		steps: [
			"Check the limit switch wiring at the data port. A disconnected normally closed switch reads as pressed.",
			"Check the limit switch and soft limit config in Phoenix Tuner.",
			"Move the mechanism off the limit.",
		],
		source: CTRE_SRX,
	},
	"ctretalonsrx.normal-operation-codes.in-boot-loader": {
		device: "Talon SRX",
		led: "Status",
		state: "One LED alternates green and orange",
		meaning: "The device is in its bootloader with no application firmware.",
		steps: ["Field-upgrade the firmware in Phoenix Tuner.", "If it will not take firmware, swap the device."],
		source: CTRE_SRX,
	},
	"ctretalonsrx.normal-operation-codes.neutral-signal-applied-within-deadband": {
		device: "Talon SRX",
		led: "Status",
		state: "Both solid orange",
		meaning: "Enabled with zero output, or the command is inside the deadband. Normal.",
		steps: [
			"If it should be moving, the command is zero. Check the joystick and the code.",
		],
		source: CTRE_SRX,
	},
	"ctretalonsrx.b-c-cal-button-color-codes.brake-mode": {
		device: "Talon SRX",
		led: "B/C CAL button",
		state: "Solid red",
		meaning: "Brake mode. The motor shorts its leads when the output is neutral.",
		source: CTRE_SRX,
	},
	"ctretalonsrx.b-c-cal-button-color-codes.coast-mode": {
		device: "Talon SRX",
		led: "B/C CAL button",
		state: "Off",
		meaning: "Coast mode. The motor spins freely when the output is neutral.",
		source: CTRE_SRX,
	},
	// #endregion

	// #region CTRE Victor SPX
	"ctrevictorspx.calibration-codes.calibration-in-progress": {
		device: "Victor SPX",
		led: "Status",
		state: "Flashing red and green",
		meaning: "PWM calibration mode. Someone held the B/C CAL button. Only matters for PWM control.",
		steps: [
			"Release the button.",
			"If it stays in calibration, power cycle.",
			"On a CAN robot, ignore calibration; it has no effect.",
		],
		source: CTRE_VSPX,
	},
	"ctrevictorspx.calibration-codes.successful-calibration": {
		device: "Victor SPX",
		led: "Status",
		state: "Blinking green",
		meaning: "PWM calibration succeeded.",
		source: CTRE_VSPX,
	},
	"ctrevictorspx.calibration-codes.failed-calibration": {
		device: "Victor SPX",
		led: "Status",
		state: "Blinking red",
		meaning: "PWM calibration failed. The previous calibration is kept.",
		steps: ["Power cycle.", "If PWM control is needed, repeat calibration with full stick travel."],
		source: CTRE_VSPX,
	},
	"ctrevictorspx.normal-operation-codes.no-power": {
		device: "Victor SPX",
		led: "Status",
		state: "Both off",
		meaning: "No 12 V on the V+ and V- leads.",
		steps: [
			"Check the breaker on that PDP or PDH channel.",
			"Check the crimp or connector at the PDP or PDH and at the device.",
		],
		source: CTRE_VSPX,
	},
	"ctrevictorspx.normal-operation-codes.driving-in-forward-rate-dutycycle": {
		device: "Victor SPX",
		led: "Status",
		state: "Both blink green",
		meaning: "Driving forward. Blink rate follows duty cycle.",
		source: CTRE_VSPX,
	},
	"ctrevictorspx.normal-operation-codes.driving-in-reverse-rate-dutycycle": {
		device: "Victor SPX",
		led: "Status",
		state: "Both blink red",
		meaning: "Driving in reverse. Blink rate follows duty cycle.",
		source: CTRE_VSPX,
	},
	"ctrevictorspx.normal-operation-codes.can-pwm-detected-robot-disabled": {
		device: "Victor SPX",
		led: "Status",
		state: "Alternating off and orange",
		meaning: "CAN or PWM signal present, robot disabled. Normal.",
		source: CTRE_VSPX,
	},
	"ctrevictorspx.normal-operation-codes.can-pwm-not-detected": {
		device: "Victor SPX",
		led: "Status",
		state: "Alternating off and slow red",
		meaning: "No CAN bus or PWM signal detected.",
		steps: CAN_WIRING_STEPS,
		source: CTRE_VSPX,
	},
	"ctrevictorspx.normal-operation-codes.fault-detected": {
		device: "Victor SPX",
		led: "Status",
		state: "Alternating off and fast red",
		meaning: "A fault is active on the controller.",
		steps: [
			"Run Self Test in Phoenix Tuner to read the fault.",
			"Check supply voltage at the controller and let it cool if it is hot.",
			"Power cycle.",
			"If it comes back with good power and no load, swap the controller.",
		],
		source: CTRE_VSPX,
	},
	"ctrevictorspx.normal-operation-codes.damaged-hardware": {
		device: "Victor SPX",
		led: "Status",
		state: "Alternating red and orange",
		meaning: "The device detected hardware damage.",
		steps: CTRE_DAMAGED_STEPS,
		source: CTRE_VSPX,
	},
	"ctrevictorspx.normal-operation-codes.forward-soft-hard-limit-triggered": {
		device: "Victor SPX",
		led: "Status",
		state: "Red strobe towards M+",
		meaning:
			"The forward limit switch or soft limit is active. Forward output is blocked. The Victor SPX has no data port, so the limit comes from a remote sensor or a soft limit in code.",
		steps: [
			"Check the remote limit source and soft limit config in Phoenix Tuner.",
			"Move the mechanism off the limit.",
		],
		source: CTRE_VSPX,
	},
	"ctrevictorspx.normal-operation-codes.reverse-soft-hard-limit-triggered": {
		device: "Victor SPX",
		led: "Status",
		state: "Red strobe towards M-",
		meaning:
			"The reverse limit switch or soft limit is active. Reverse output is blocked. The Victor SPX has no data port, so the limit comes from a remote sensor or a soft limit in code.",
		steps: [
			"Check the remote limit source and soft limit config in Phoenix Tuner.",
			"Move the mechanism off the limit.",
		],
		source: CTRE_VSPX,
	},
	"ctrevictorspx.normal-operation-codes.in-boot-loader": {
		device: "Victor SPX",
		led: "Status",
		state: "One LED alternates green and orange",
		meaning: "The device is in its bootloader with no application firmware.",
		steps: ["Field-upgrade the firmware in Phoenix Tuner.", "If it will not take firmware, swap the device."],
		source: CTRE_VSPX,
	},
	"ctrevictorspx.normal-operation-codes.neutral-signal-applied-within-deadband": {
		device: "Victor SPX",
		led: "Status",
		state: "Both solid orange",
		meaning: "Enabled with zero output, or the command is inside the deadband. Normal.",
		steps: [
			"If it should be moving, the command is zero. Check the joystick and the code.",
		],
		source: CTRE_VSPX,
	},
	"ctrevictorspx.b-c-cal-button-color-codes.brake-mode": {
		device: "Victor SPX",
		led: "B/C CAL button",
		state: "Solid red",
		meaning: "Brake mode. The motor shorts its leads when the output is neutral.",
		source: CTRE_VSPX,
	},
	"ctrevictorspx.b-c-cal-button-color-codes.coast-mode": {
		device: "Victor SPX",
		led: "B/C CAL button",
		state: "Off",
		meaning: "Coast mode. The motor spins freely when the output is neutral.",
		source: CTRE_VSPX,
	},
	// #endregion

	// #region CTRE CANivore
	"ctrecanivore.stat.powered-but-usb-not-plugged-in": {
		device: "CANivore",
		led: "STAT",
		state: "Red double blink",
		meaning: "12 V is present on V+ and V- but there is no USB connection.",
		steps: ["Plug the USB cable into the roboRIO.", "Confirm the roboRIO is powered."],
		source: CTRE_CANIVORE,
	},
	"ctrecanivore.stat.usb-plugged-in-but-no-comms": {
		device: "CANivore",
		led: "STAT",
		state: "Red fast strobe",
		meaning:
			"USB is connected but there is no USB communication. The roboRIO is still booting, or the cable or port is bad.",
		steps: [
			"Wait for the roboRIO to finish booting.",
			"Swap the USB cable.",
			"Try the other roboRIO USB port.",
			"Check Phoenix Tuner X sees the CANivore. If not, swap the CANivore.",
		],
		source: CTRE_CANIVORE,
	},
	"ctrecanivore.stat.can-disabled-no-power": {
		device: "CANivore",
		led: "STAT",
		state: "Orange double blink",
		meaning:
			"USB is good but CAN streaming is disabled, and V+ and V- are not powered. No Phoenix program is running.",
		steps: [...PHOENIX_NOT_RUNNING_STEPS.slice(0, 2), "Wire V+ and V- to 12 V for use on a robot."],
		source: CTRE_CANIVORE,
	},
	"ctrecanivore.stat.can-disabled": {
		device: "CANivore",
		led: "STAT",
		state: "Orange fast strobe",
		meaning: "USB is good but CAN streaming is disabled. No Phoenix program is running.",
		steps: PHOENIX_NOT_RUNNING_STEPS.slice(0, 2),
		source: CTRE_CANIVORE,
	},
	"ctrecanivore.stat.can-enabled-no-power": {
		device: "CANivore",
		led: "STAT",
		state: "Green double blink",
		meaning: "USB is good and CAN streaming is enabled. V+ and V- are not powered.",
		steps: ["Normal on a bench over USB.", "On a robot, wire V+ and V- to 12 V."],
		source: CTRE_CANIVORE,
	},
	"ctrecanivore.stat.can-enabled": {
		device: "CANivore",
		led: "STAT",
		state: "Green fast strobe",
		meaning: "USB is good, CAN streaming is enabled, and V+ and V- are powered. Normal.",
		source: CTRE_CANIVORE,
	},
	"ctrecanivore.stat.bootloader": {
		device: "CANivore",
		led: "STAT",
		state: "Alternating green and orange",
		meaning: "The CANivore is in its bootloader with no application firmware.",
		steps: CTRE_BOOTLOADER_STEPS,
		source: CTRE_CANIVORE,
	},
	"ctrecanivore.stat.hardware-damage": {
		device: "CANivore",
		led: "STAT",
		state: "Alternating red and orange",
		meaning: "The device detected hardware damage.",
		steps: CTRE_DAMAGED_STEPS,
		source: CTRE_CANIVORE,
	},
	"ctrecanivore.wi-fi.wi-fi-enabled": {
		device: "CANivore",
		led: "Wi-Fi",
		state: "Blinking green",
		meaning: "The CANivore's Wi-Fi is on, for wireless Phoenix Tuner X.",
		steps: [
			"Turn Wi-Fi off before the robot goes to the field. Robot wireless devices other than the radio are not allowed.",
		],
		source: CTRE_CANIVORE,
	},
	"ctrecanivore.wi-fi.wi-fi-disabled": {
		device: "CANivore",
		led: "Wi-Fi",
		state: "Off",
		meaning: "Wi-Fi is off. This is the state you want on the field.",
		source: CTRE_CANIVORE,
	},
	"ctrecanivore.bluetooth.bluetooth-enabled": {
		device: "CANivore",
		led: "Bluetooth",
		state: "Blinking green",
		meaning: "Bluetooth is on.",
		steps: [
			"Turn Bluetooth off before the robot goes to the field. Robot wireless devices other than the radio are not allowed.",
		],
		source: CTRE_CANIVORE,
	},
	"ctrecanivore.bluetooth.bluetooth-disabled": {
		device: "CANivore",
		led: "Bluetooth",
		state: "Off",
		meaning: "Bluetooth is off. This is the state you want on the field.",
		source: CTRE_CANIVORE,
	},
	"ctrecanivore.can.no-power": {
		device: "CANivore",
		led: "CAN",
		state: "Off",
		meaning: "No power. No 5 V from USB and no 12 V on V+ and V-.",
		steps: ["Plug in USB or wire V+ and V- to 12 V."],
		source: CTRE_CANIVORE,
	},
	"ctrecanivore.can.voltage-too-low-for-can-bus": {
		device: "CANivore",
		led: "CAN",
		state: "Solid red",
		meaning: "Supply voltage is too low to run the CAN transceiver.",
		steps: [
			"Confirm 5 V over USB, and 12 V on V+ and V- if wired.",
			"Swap the USB cable.",
			"Check the V+ and V- crimps.",
		],
		source: CTRE_CANIVORE,
	},
	"ctrecanivore.can.no-can-comms-termination-enabled": {
		device: "CANivore",
		led: "CAN",
		state: "Red fast strobe",
		meaning: "No CAN communication. The CANivore's own termination is on.",
		steps: [
			"Check CANH and CANL (yellow, green) at the CANivore and the first device.",
			"Confirm every device on this bus supports CAN FD.",
			"Confirm the far end of the bus has a 120 ohm terminator.",
		],
		source: CTRE_CANIVORE,
	},
	"ctrecanivore.can.no-can-comms-termination-disabled": {
		device: "CANivore",
		led: "CAN",
		state: "Red double blink",
		meaning: "No CAN communication. The CANivore's own termination is off.",
		steps: [
			"Check CANH and CANL (yellow, green) at the CANivore and the first device.",
			"Confirm every device on this bus supports CAN FD.",
			"The bus needs two 120 ohm terminators, one at each end. Turn the CANivore's termination on if it is at the end.",
		],
		source: CTRE_CANIVORE,
	},
	"ctrecanivore.can.can-2-0b-legacy-mode-termination-enabled": {
		device: "CANivore",
		led: "CAN",
		state: "Orange fast strobe",
		meaning: "The bus is running as CAN 2.0B, not CAN FD. A device on this bus does not support CAN FD.",
		steps: [
			"Find the non-FD device (Talon SRX, Victor SPX, older devices) and move it to the roboRIO bus.",
			"If legacy mode is intended, nothing to do.",
		],
		source: CTRE_CANIVORE,
	},
	"ctrecanivore.can.can-2-0b-legacy-mode-termination-disabled": {
		device: "CANivore",
		led: "CAN",
		state: "Orange double blink",
		meaning: "The bus is running as CAN 2.0B, not CAN FD, and the CANivore's termination is off.",
		steps: ["Find the non-FD device and move it to the roboRIO bus.", "Check the bus has two 120 ohm terminators."],
		source: CTRE_CANIVORE,
	},
	"ctrecanivore.can.can-fd-active-termination-enabled": {
		device: "CANivore",
		led: "CAN",
		state: "Green fast strobe",
		meaning: "CAN FD is active and the CANivore is terminating. Normal.",
		source: CTRE_CANIVORE,
	},
	"ctrecanivore.can.can-fd-active-termination-disabled": {
		device: "CANivore",
		led: "CAN",
		state: "Green double blink",
		meaning: "CAN FD is active. The CANivore's termination is off, so something else must terminate that end.",
		steps: [
			"If devices drop out, check both ends of the bus have a 120 ohm terminator.",
		],
		source: CTRE_CANIVORE,
	},
	// #endregion

	// #region CTRE Pigeon 2.0
	"ctrepigeon.no-power": {
		device: "Pigeon 2.0",
		led: "Status",
		state: "Both off",
		meaning: "No 12 V on the red and black leads.",
		steps: ["Check the power source and breaker.", "Check the crimps at both ends."],
		source: CTRE_PIGEON,
	},
	"ctrepigeon.invalid-can-signal": {
		device: "Pigeon 2.0",
		led: "Status",
		state: "Alternating red",
		meaning: "No valid CAN connection.",
		steps: CAN_WIRING_STEPS,
		source: CTRE_PIGEON,
	},
	"ctrepigeon.valid-can-phoenix-is-not-detected": {
		device: "Pigeon 2.0",
		led: "Status",
		state: "Alternating orange",
		meaning: "CAN is fine but no Phoenix based robot program is talking to it.",
		steps: PHOENIX_NOT_RUNNING_STEPS,
		source: CTRE_PIGEON,
	},
	"ctrepigeon.valid-can-phoenix-detected-robot-disabled": {
		device: "Pigeon 2.0",
		led: "Status",
		state: "Both blink orange together",
		meaning: "CAN and Phoenix detected, robot disabled. Normal.",
		source: CTRE_PIGEON,
	},
	"ctrepigeon.valid-can-phoenix-detected-robot-enabled": {
		device: "Pigeon 2.0",
		led: "Status",
		state: "Alternating green",
		meaning: "CAN and Phoenix detected, robot enabled. Normal.",
		steps: [
			"If heading drifts, run mount calibration in Phoenix Tuner X with the robot still.",
		],
		source: CTRE_PIGEON,
	},
	"ctrepigeon.hardware-fault-detected-confirm-with-tunerx-self-test": {
		device: "Pigeon 2.0",
		led: "Status",
		state: "Alternating red and orange",
		meaning: "The device detected hardware damage.",
		steps: CTRE_DAMAGED_STEPS,
		source: CTRE_PIGEON,
	},
	"ctrepigeon.device-in-bootloader-field-upgrade-device-in-tunerx": {
		device: "Pigeon 2.0",
		led: "Status",
		state: "One LED alternates green and orange",
		meaning: "The device is in its bootloader with no application firmware.",
		steps: CTRE_BOOTLOADER_STEPS,
		source: CTRE_PIGEON,
	},
	// #endregion

	// #region CTRE CANcoder
	"ctrecancoder.no-power": {
		device: "CANcoder",
		led: "Status",
		state: "Off",
		meaning: "No 12 V on the red and black leads.",
		steps: ["Check the power source and breaker.", "Check the crimps at both ends."],
		source: CTRE_CANCODER,
	},
	"ctrecancoder.bootloader": {
		device: "CANcoder",
		led: "Status",
		state: "Alternating green and orange",
		meaning: "The device is in its bootloader with no application firmware.",
		steps: CTRE_BOOTLOADER_STEPS,
		source: CTRE_CANCODER,
	},
	"ctrecancoder.unlicensed-phoenix-pro": {
		device: "CANcoder",
		led: "Status",
		state: "Alternating red and green",
		meaning: "Code used a Phoenix Pro only feature on an unlicensed device.",
		steps: ["License the device in Phoenix Tuner X, or change the code to non-Pro features."],
		source: CTRE_CANCODER,
	},
	"ctrecancoder.can-bus-has-been-lost": {
		device: "CANcoder",
		led: "Status",
		state: "Slow bright red blink",
		meaning: "The CANcoder had CAN and lost it.",
		steps: CAN_WIRING_STEPS,
		source: CTRE_CANCODER,
	},
	"ctrecancoder.dim-no-can-and-magnet-out-of-range": {
		device: "CANcoder",
		led: "Status",
		state: "Rapid dim red",
		meaning: "No CAN since boot, and the magnet is out of range (too far, too close, or missing).",
		steps: [
			"Fix CAN first: check CANH and CANL wiring and that the roboRIO is on.",
			"Check the magnet is present, centered on the sensor axis, and at the distance in the CANcoder user guide.",
		],
		source: CTRE_CANCODER,
	},
	"ctrecancoder.dim-no-can-and-reduced-magnet-accuracy": {
		device: "CANcoder",
		led: "Status",
		state: "Rapid dim orange",
		meaning: "No CAN since boot. The magnet is in range but with reduced accuracy.",
		steps: [
			"Fix CAN first: check CANH and CANL wiring and that the roboRIO is on.",
			"Adjust the magnet distance and centering until the LED is green.",
		],
		source: CTRE_CANCODER,
	},
	"ctrecancoder.dim-no-can-and-magnet-present": {
		device: "CANcoder",
		led: "Status",
		state: "Rapid dim green",
		meaning: "No CAN since boot. The magnet is good.",
		steps: CAN_WIRING_STEPS,
		source: CTRE_CANCODER,
	},
	"ctrecancoder.bright-can-and-magnet-out-of-range": {
		device: "CANcoder",
		led: "Status",
		state: "Rapid bright red",
		meaning:
			"CAN is good. The magnet is out of range (too far, too close, or missing). Position readings are not valid.",
		steps: [
			"Check the magnet is present and has not fallen out of the shaft.",
			"Center the magnet on the sensor axis and set the distance per the CANcoder user guide.",
			"If a correct magnet still reads red, swap the CANcoder.",
		],
		source: CTRE_CANCODER,
	},
	"ctrecancoder.bright-can-and-reduced-magnet-accuracy": {
		device: "CANcoder",
		led: "Status",
		state: "Rapid bright orange",
		meaning: "CAN is good. The magnet is in range but with reduced accuracy.",
		steps: [
			"Adjust the magnet distance and centering until the LED is green.",
			"Usable in a pinch. Fix it before the next match.",
		],
		source: CTRE_CANCODER,
	},
	"ctrecancoder.bright-can-and-magnet-present": {
		device: "CANcoder",
		led: "Status",
		state: "Rapid bright green",
		meaning: "CAN is good and the magnet is in range. Normal.",
		source: CTRE_CANCODER,
	},
	// #endregion

	// #region CTRE Throughbore CANcoder
	"ctretbcancoder.no-power": {
		device: "Throughbore CANcoder",
		led: "Status",
		state: "Off",
		meaning: "No 12 V on the red and black leads.",
		steps: ["Check the power source and breaker.", "Check the crimps at both ends."],
		source: CTRE_CANCODER,
	},
	"ctretbcancoder.bootloader": {
		device: "Throughbore CANcoder",
		led: "Status",
		state: "Alternating green and orange",
		meaning: "The device is in its bootloader with no application firmware.",
		steps: CTRE_BOOTLOADER_STEPS,
		source: CTRE_CANCODER,
	},
	"ctretbcancoder.unlicensed-phoenix-pro": {
		device: "Throughbore CANcoder",
		led: "Status",
		state: "Alternating red and green",
		meaning: "Code used a Phoenix Pro only feature on an unlicensed device.",
		steps: ["License the device in Phoenix Tuner X, or change the code to non-Pro features."],
		source: CTRE_CANCODER,
	},
	"ctretbcancoder.can-bus-has-been-lost": {
		device: "Throughbore CANcoder",
		led: "Status",
		state: "Slow bright red blink",
		meaning: "The CANcoder had CAN and lost it.",
		steps: CAN_WIRING_STEPS,
		source: CTRE_CANCODER,
	},
	"ctretbcancoder.dim-no-can-and-magnet-out-of-range": {
		device: "Throughbore CANcoder",
		led: "Status",
		state: "Rapid dim red",
		meaning: "No CAN since boot, and the magnet is out of range.",
		steps: [
			"Fix CAN first: check CANH and CANL wiring and that the roboRIO is on.",
			"Check the magnet ring is seated on the shaft and centered in the bore.",
		],
		source: CTRE_CANCODER,
	},
	"ctretbcancoder.dim-no-can-and-reduced-magnet-accuracy": {
		device: "Throughbore CANcoder",
		led: "Status",
		state: "Rapid dim orange",
		meaning: "No CAN since boot. The magnet is in range but with reduced accuracy.",
		steps: [
			"Fix CAN first: check CANH and CANL wiring and that the roboRIO is on.",
			"Adjust the magnet seating until the LED is green.",
		],
		source: CTRE_CANCODER,
	},
	"ctretbcancoder.dim-no-can-and-magnet-present": {
		device: "Throughbore CANcoder",
		led: "Status",
		state: "Rapid dim green",
		meaning: "No CAN since boot. The magnet is good.",
		steps: CAN_WIRING_STEPS,
		source: CTRE_CANCODER,
	},
	"ctretbcancoder.bright-can-and-magnet-out-of-range": {
		device: "Throughbore CANcoder",
		led: "Status",
		state: "Rapid bright red",
		meaning: "CAN is good. The magnet is out of range. Position readings are not valid.",
		steps: [
			"Check the magnet ring is on the shaft and has not slipped.",
			"Center it in the bore and set the distance per the user guide.",
			"If a correct magnet still reads red, swap the CANcoder.",
		],
		source: CTRE_CANCODER,
	},
	"ctretbcancoder.bright-can-and-reduced-magnet-accuracy": {
		device: "Throughbore CANcoder",
		led: "Status",
		state: "Rapid bright orange",
		meaning: "CAN is good. The magnet is in range but with reduced accuracy.",
		steps: [
			"Adjust the magnet seating until the LED is green.",
			"Usable in a pinch. Fix it before the next match.",
		],
		source: CTRE_CANCODER,
	},
	"ctretbcancoder.bright-can-and-magnet-present": {
		device: "Throughbore CANcoder",
		led: "Status",
		state: "Rapid bright green",
		meaning: "CAN is good and the magnet is in range. Normal.",
		source: CTRE_CANCODER,
	},
	// #endregion

	// #region CTRE CANrange
	"ctrecanrange.no-power": {
		device: "CANrange",
		led: "Status",
		state: "Off",
		meaning: "No 12 V on V+ and V-.",
		steps: ["Check the power source and breaker.", "Check the crimps at both ends."],
		source: CTRE_CANRANGE,
	},
	"ctrecanrange.bootloader": {
		device: "CANrange",
		led: "Status",
		state: "One LED alternates green and orange",
		meaning: "The device is in its bootloader with no application firmware.",
		steps: CTRE_BOOTLOADER_STEPS,
		source: CTRE_CANRANGE,
	},
	"ctrecanrange.can-bus-has-been-lost": {
		device: "CANrange",
		led: "Status",
		state: "Blinking red",
		meaning: "No valid CAN.",
		steps: CAN_WIRING_STEPS,
		source: CTRE_CANRANGE,
	},
	"ctrecanrange.can-present-distance-not-detected": {
		device: "CANrange",
		led: "Status",
		state: "Blinking orange",
		meaning: "CAN is good. Nothing is inside the detection threshold.",
		steps: [
			"Normal if nothing is in front of the sensor.",
			"If it should detect: check the sensor has a clear line of sight and the target is inside the threshold set in Phoenix Tuner X.",
			"Wipe the lens.",
		],
		source: CTRE_CANRANGE,
	},
	"ctrecanrange.can-present-distance-detected-any-speed": {
		device: "CANrange",
		led: "Status",
		state: "Blinking green",
		meaning: "CAN is good and something is inside the detection threshold. Faster blink means closer.",
		source: CTRE_CANRANGE,
	},
	"ctrecanrange.damaged-hardware": {
		device: "CANrange",
		led: "Status",
		state: "Alternating red and orange",
		meaning: "The device detected hardware damage.",
		steps: CTRE_DAMAGED_STEPS,
		source: CTRE_CANRANGE,
	},
	// #endregion

	// #region CTRE CANdle
	"ctrecandle.no-power-or-statusledwhenactive-config-is-set-to-disabled": {
		device: "CANdle",
		led: "Status",
		state: "Off",
		meaning:
			"No power, or the StatusLedWhenActive config is set to Disabled, which turns the status LED off while the device is controlled.",
		steps: [
			"If the strip is lit and code is running, this is the config. Nothing to do.",
			"Otherwise check 12 V on the +Vin and -Vin leads and the breaker or fuse.",
		],
		source: CTRE_CANDLE,
	},
	"ctrecandle.can-present-not-being-controlled": {
		device: "CANdle",
		led: "Status",
		state: "Blinking orange",
		meaning: "CAN is good but no robot program is sending it commands.",
		steps: PHOENIX_NOT_RUNNING_STEPS,
		source: CTRE_CANDLE,
	},
	"ctrecandle.can-present-actively-being-controlled": {
		device: "CANdle",
		led: "Status",
		state: "Blinking green",
		meaning: "CAN is good and the robot program is controlling it. Normal.",
		steps: [
			"If the strip is dark, check the strip wiring and the 5 V or 12 V output selection.",
		],
		source: CTRE_CANDLE,
	},
	"ctrecandle.bootloader": {
		device: "CANdle",
		led: "Status",
		state: "Alternating green and orange",
		meaning: "The device is in its bootloader with no application firmware.",
		steps: CTRE_BOOTLOADER_STEPS,
		source: CTRE_CANDLE,
	},
	"ctrecandle.no-can-detected": {
		device: "CANdle",
		led: "Status",
		state: "Blinking red",
		meaning: "No valid CAN, and no pixel pulse train.",
		steps: CAN_WIRING_STEPS,
		source: CTRE_CANDLE,
	},
	"ctrecandle.5v-too-high-fault": {
		device: "CANdle",
		led: "Status",
		state: "Rapid red",
		meaning: "The 5 V output is too high.",
		steps: [
			"Check for a short between +Vout and the 5 V output.",
			"Unplug the LED strip and power cycle. If the fault stays, swap the CANdle.",
		],
		source: CTRE_CANDLE,
	},
	"ctrecandle.short-circuit-or-software-fuse-fault": {
		device: "CANdle",
		led: "Status",
		state: "Red blip",
		meaning: "Short circuit on the output, or the strip draws more than the 6 A software fuse allows.",
		steps: [
			"Unplug the LED strip. If the fault clears, the strip or its cable is shorted.",
			"Reduce the number of LEDs or the brightness. The limit is 6 A.",
			"Read the fault in Phoenix Tuner X, then power cycle.",
		],
		source: CTRE_CANDLE,
	},
	"ctrecandle.thermal-fault": {
		device: "CANdle",
		led: "Status",
		state: "Orange blip",
		meaning: "The CANdle is too hot.",
		steps: [
			"Let it cool.",
			"Lower the brightness or LED count, or disable the onboard LEDs.",
			"Mount it where air can move.",
		],
		source: CTRE_CANDLE,
	},
	"ctrecandle.damaged-hardware": {
		device: "CANdle",
		led: "Status",
		state: "Alternating red and orange",
		meaning: "The device detected hardware damage.",
		steps: CTRE_DAMAGED_STEPS,
		source: CTRE_CANDLE,
	},
	// #endregion

	// #region CTRE Power Distribution Panel
	"ctrepowerdistributionpanel.no-power": {
		device: "Power Distribution Panel",
		led: "STAT / COMM",
		state: "Off",
		meaning: "No power to the PDP logic, or the battery is connected backwards.",
		steps: [
			"Check the main breaker is on and the battery is connected.",
			"Check battery polarity at the PDP.",
			"Check the main battery lugs are tight.",
		],
		source: CTRE_PDP,
	},
	"ctrepowerdistributionpanel.robot-enabled": {
		device: "Power Distribution Panel",
		led: "STAT / COMM",
		state: "Green fast blink",
		meaning: "CAN is good, no fault, robot enabled. Normal.",
		source: CTRE_PDP,
	},
	"ctrepowerdistributionpanel.robot-disabled": {
		device: "Power Distribution Panel",
		led: "STAT / COMM",
		state: "Green slow blink",
		meaning: "CAN is good, no fault, robot disabled. Normal.",
		source: CTRE_PDP,
	},
	"ctrepowerdistributionpanel.disabled-sticky-fault-present": {
		device: "Power Distribution Panel",
		led: "STAT / COMM",
		state: "Orange slow blink",
		meaning: "A sticky fault was recorded earlier, such as a brownout. It does not block anything.",
		steps: [
			"Read the fault in the DS or Phoenix Tuner.",
			"Clear sticky faults from code or Tuner.",
			"If it is a brownout, check the battery.",
		],
		source: CTRE_PDP,
	},
	"ctrepowerdistributionpanel.no-can": {
		device: "Power Distribution Panel",
		led: "STAT / COMM",
		state: "Red slow blink",
		meaning: "No CAN communication with the roboRIO. The PDP still delivers power; only current logging is lost.",
		steps: [
			"Check the CAN wires at the PDP.",
			"Check the termination jumper on the PDP. It must be on if the PDP is the end of the bus.",
			"Confirm robot code is running.",
		],
		source: CTRE_PDP,
	},
	"ctrepowerdistributionpanel.comm-only-in-boot-loader-field-upgrade-necessary": {
		device: "Power Distribution Panel",
		led: "COMM",
		state: "Alternating green and orange",
		meaning: "The PDP is in its bootloader. Power still flows, but it needs firmware.",
		steps: [
			"Field-upgrade the firmware in Phoenix Tuner.",
			"If it will not take firmware, it still works as a power panel; swap it when you can.",
		],
		source: CTRE_PDP,
	},
	"ctrepowerdistributionpanel.hardware-damaged-do-not-attempt-to-use": {
		device: "Power Distribution Panel",
		led: "STAT / COMM",
		state: "Alternating red and orange",
		meaning: "The PDP detected hardware damage. CTRE says do not use it.",
		steps: ["Swap the PDP.", "Check battery polarity and look for metal debris before powering the replacement."],
		source: CTRE_PDP,
	},
	// #endregion

	// #region CTRE Pneumatics Control Module
	"ctrepneumaticscontrolmodule.status.no-power": {
		device: "Pneumatics Control Module",
		led: "Status",
		state: "Off",
		meaning: "No power, or the power leads are reversed. The Status LED should always be lit.",
		steps: [
			"Check the Vin leads to the PDP and their polarity.",
			"Check the breaker or fuse on that channel.",
			"Check for broken wires.",
		],
		source: CTRE_PCM,
	},
	"ctrepneumaticscontrolmodule.status.robot-enabled": {
		device: "Pneumatics Control Module",
		led: "Status",
		state: "Green fast blink",
		meaning: "CAN is good, no fault, robot enabled. Solenoids and compressor are live.",
		source: CTRE_PCM,
	},
	"ctrepneumaticscontrolmodule.status.robot-disabled": {
		device: "Pneumatics Control Module",
		led: "Status",
		state: "Green slow blink",
		meaning: "CAN is good, no fault, robot disabled. Normal.",
		source: CTRE_PCM,
	},
	"ctrepneumaticscontrolmodule.status.disabled-sticky-fault-present": {
		device: "Pneumatics Control Module",
		led: "Status",
		state: "Orange slow blink",
		meaning:
			"A solenoid or compressor fault happened earlier and has not been cleared. Sticky faults survive power cycles.",
		steps: [
			"Read the most recent fault in the DS or Phoenix Tuner.",
			"Fix the cause (see the solenoid or compressor fault rows).",
			"Clear the sticky fault from code or Tuner.",
		],
		source: CTRE_PCM,
	},
	"ctrepneumaticscontrolmodule.status.no-can-or-solenoid-fault-will-blink-of-faulted-solenoid-followed-by-pause": {
		device: "Pneumatics Control Module",
		led: "Status",
		state: "Red blinks",
		meaning:
			"Red strobe with no pattern: no CAN communication. Red blinks counted then a pause: that solenoid channel is faulted (shorted or damaged solenoid).",
		steps: [
			"No CAN: check the CAN wires, termination, and that the roboRIO is on.",
			"Solenoid fault: count the blinks to find the channel. Unplug that solenoid and check its wiring for a short.",
			"Remove any metal debris at the solenoid terminals.",
			"Power cycle, then clear the sticky fault.",
		],
		source: CTRE_PCM,
	},
	"ctrepneumaticscontrolmodule.status.compressor-fault": {
		device: "Pneumatics Control Module",
		led: "Status",
		state: "Red long blink every 2 s",
		meaning: "Compressor current too high. The PCM retries the compressor every 5 seconds.",
		steps: [
			"Check for a short across the compressor terminals and along the compressor wiring.",
			"Check the compressor turns freely.",
			"Remove any metal debris.",
			"Power cycle, then clear the sticky fault.",
		],
		source: CTRE_PCM,
	},
	"ctrepneumaticscontrolmodule.status.in-boot-loader-field-upgrade-necessary": {
		device: "Pneumatics Control Module",
		led: "Status",
		state: "Alternating green and orange",
		meaning: "The PCM is in its bootloader with no application firmware. Solenoids and compressor will not run.",
		steps: ["Field-upgrade the firmware in Phoenix Tuner.", "If it will not take firmware, swap the PCM."],
		source: CTRE_PCM,
	},
	"ctrepneumaticscontrolmodule.status.hardware-damaged-do-not-attempt-to-use": {
		device: "Pneumatics Control Module",
		led: "Status",
		state: "Alternating red and orange",
		meaning: "The PCM detected hardware damage. CTRE says do not use it.",
		steps: ["Swap the PCM.", "Check power polarity and solenoid wiring before powering the replacement."],
		source: CTRE_PCM,
	},
	"ctrepneumaticscontrolmodule.compressor-led-comp.compressor-off": {
		device: "Pneumatics Control Module",
		led: "COMP",
		state: "Off",
		meaning: "The compressor output is off.",
		steps: [
			"Normal when the system is at pressure or the robot is disabled.",
			"If the compressor should run: the robot must be enabled, code must create a pneumatics object, and the pressure switch must be wired and open.",
		],
		source: CTRE_PCM,
	},
	"ctrepneumaticscontrolmodule.compressor-led-comp.compressor-on": {
		device: "Pneumatics Control Module",
		led: "COMP",
		state: "Green solid",
		meaning: "The compressor output is on.",
		steps: [
			"If the compressor is not running with this on, check the compressor wiring and the compressor itself.",
		],
		source: CTRE_PCM,
	},
	"ctrepneumaticscontrolmodule.solenoid-status-led.solenoid-off": {
		device: "Pneumatics Control Module",
		led: "Solenoid",
		state: "Off",
		meaning: "That solenoid channel is not energized.",
		steps: [
			"Normal when the solenoid is commanded off.",
			"If it should be on, the problem is in code or the channel number.",
		],
		source: CTRE_PCM,
	},
	"ctrepneumaticscontrolmodule.solenoid-status-led.solenoid-on": {
		device: "Pneumatics Control Module",
		led: "Solenoid",
		state: "Red solid",
		meaning: "That solenoid channel is energized.",
		steps: [
			"If the cylinder does not move: check air pressure, the solenoid wiring, and the PCM voltage jumper (12 V or 24 V).",
		],
		source: CTRE_PCM,
	},
	// #endregion
} as const satisfies Record<string, StatusLightHelp>;

export type StatusLightHelpId = keyof typeof statusLightHelp;
