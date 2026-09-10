import { ctreHelp } from "./ctre";
import { generalHelp } from "./general";
import { revHelp } from "./rev";

export type { StatusLightHelp, StatusLightHelpVariant } from "./shared";

export const statusLightHelp = { ...generalHelp, ...revHelp, ...ctreHelp } as const;

export type StatusLightHelpId = keyof typeof statusLightHelp;
