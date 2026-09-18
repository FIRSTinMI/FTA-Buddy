// Shared types, source URLs and repeated step lists for the Status Lights help content.
// Entries live in general.ts (roboRIO, SystemCore, radio), rev.ts and ctre.ts; index.ts merges them.
// Wording is for phones on an FRC field: short, direct, most likely fix first.

import type { GuideRef } from "../../../../../shared/troubleshooting";
import type { FlowStep } from "../../../../../shared/troubleshooting/steps";

export interface StatusLightHelp {
	readonly device: string;
	readonly led: string;
	readonly state: string;
	readonly meaning: string;
	/**
	 * Omit when there is nothing to do. Plain sentences are "do" steps; use FlowStep objects for
	 * check questions: { kind: "check", text: "Still flashing?", yes: "Continue.", no: "Problem solved." }.
	 */
	readonly steps?: readonly (string | FlowStep)[];
	/** The guide leaf that owns this procedure. When set, its steps are shown instead of `steps`. */
	readonly ref?: GuideRef;
	readonly source?: string;
	/** Tabs inside the dialog, for one pattern that means different things on different hardware revisions. */
	readonly variants?: readonly StatusLightHelpVariant[];
	/** Index into `variants` that opens first. */
	readonly defaultVariant?: number;
}

export interface StatusLightHelpVariant {
	readonly label: string;
	readonly meaning: string;
	readonly steps?: readonly (string | FlowStep)[];
	/** The guide leaf that owns this procedure. */
	readonly ref?: GuideRef;
	readonly source?: string;
}

export const WPILIB_2024 = "https://docs.wpilib.org/en/2024/docs/hardware/hardware-basics/status-lights-ref.html";
export const WPILIB = "https://docs.wpilib.org/en/stable/docs/hardware/hardware-basics/status-lights-ref.html";
export const NI_FLASHING = "https://knowledge.ni.com/KnowledgeArticleDetails?id=kA03q000000kOHkCAM&l=en-US";
export const NI_RED = "https://knowledge.ni.com/KnowledgeArticleDetails?id=kA00Z0000019NlbSAE&l=en-US";
export const WPILIB_BROWNOUT = "https://docs.wpilib.org/en/stable/docs/software/roborio-info/roborio-brownouts.html";
export const WPILIB_IMAGING = "https://docs.wpilib.org/en/stable/docs/zero-to-robot/step-3/imaging-your-roborio.html";
export const WPILIB_RIO2 = "https://docs.wpilib.org/en/stable/docs/zero-to-robot/step-3/roborio2-imaging.html";
export const VIVID = "https://frc-radio.vivid-hosting.net/overview/led-status-indications";
export const VIVID_BOOTLOOP =
	"https://frc-radio.vivid-hosting.net/overview/support/known-issues/1-flash-memory-corruption-causes-bootloop";
export const SC_SPEC = "https://downloads.limelightvision.io/documents/systemcore_specifications_june15_2025_alpha.pdf";
export const SC_OS = "https://github.com/LimelightVision/systemcore-os-public";
export const REV_MAX = "https://docs.revrobotics.com/brushless/spark-max/status-led";
export const REV_FLEX = "https://docs.revrobotics.com/brushless/spark-flex/status-led";
export const REV_PDH = "https://docs.revrobotics.com/ion-control/pdh/status-led";
export const REV_PH = "https://docs.revrobotics.com/ion-control/ph/status-led";
export const CTRE_FX = "https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/talonfx/index.html";
export const CTRE_FXS = "https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/talonfxs/index.html";
export const CTRE_SRX = "https://ctre.download/files/user-manual/Talon%20SRX%20User's%20Guide.pdf";
export const CTRE_VSPX = "https://ctre.download/files/user-manual/Victor%20SPX%20User's%20Guide.pdf";
export const CTRE_CANIVORE = "https://v6.docs.ctr-electronics.com/en/stable/docs/canivore/canivore-intro.html";
export const CTRE_PIGEON = "https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/pigeon2/index.html";
export const CTRE_CANCODER =
	"https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/cancoder/index.html";
export const CTRE_CANRANGE =
	"https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/canrange/index.html";
export const CTRE_CANDLE = "https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/candle/index.html";
export const CTRE_PDP = "https://ctre.download/files/user-manual/PDP%20User's%20Guide.pdf";
export const CTRE_PCM = "https://ctre.download/files/user-manual/PCM%20User's%20Guide.pdf";

// Shared step lists for patterns that repeat across devices.
export const CAN_WIRING_STEPS: (string | FlowStep)[] = [
	"Check the CAN wires (yellow CANH, green CANL) at this device and at its neighbours. Wiggle the connectors.",
	"Check the bus is terminated at both ends with 120 ohm: the roboRIO or CANivore at one end, the PDP or PDH terminator at the other.",
	"Confirm the roboRIO is powered and booted.",
	{
		kind: "check",
		text: "Is only this device faulted, with its neighbours fine?",
		yes: "Swap the device.",
		no: "Continue.",
	},
];

export const PHOENIX_NOT_RUNNING_STEPS: (string | FlowStep)[] = [
	"Look at the roboRIO Comm LED. Solid red means no robot code is running.",
	"Have the team redeploy code once the roboRIO has booted.",
	{ kind: "check", text: "Is the device still missing from code?", yes: "Continue.", no: "Problem solved." },
	"Check the code uses Phoenix and that the CAN ID and bus name match this device. Phoenix Tuner X shows what is on the bus.",
	{ kind: "check", text: "Is the device on a CANivore?", yes: "Continue.", no: "Problem solved." },
	"Confirm the CANivore STAT LED is green.",
];

export const CTRE_DAMAGED_STEPS = [
	"Confirm with Self Test in Phoenix Tuner X.",
	"Do not run the device. Reverse power or a short on the output is the usual cause.",
	"Swap the device and check the wiring polarity before powering the replacement.",
];

export const CTRE_BOOTLOADER_STEPS: (string | FlowStep)[] = [
	"Field-upgrade the firmware in Phoenix Tuner X.",
	{ kind: "check", text: "Did the upgrade fail?", yes: "Continue.", no: "Problem solved." },
	"Power cycle and try again over USB from the roboRIO.",
	{ kind: "check", text: "Still stuck without firmware?", yes: "Swap the device.", no: "Problem solved." },
];

export const RIO_REIMAGE_STEPS = [
	"roboRIO 1: reimage over USB with the roboRIO Imaging Tool (Format Target).",
	"roboRIO 2: reimage the microSD card on a laptop with balenaEtcher or Raspberry Pi Imager, put it back, then set the team number with the Imaging Tool over USB.",
];
