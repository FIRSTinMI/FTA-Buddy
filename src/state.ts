import type { ServerEvent } from "../shared/types";
export const events: { [key: string]: ServerEvent } = {};
export const eventCodes: { [key: string]: string } = {};
export const eventLastSeen: { [key: string]: Date } = {};
