import { EventEmitter } from "events";
import { TypedEmitter } from "tiny-typed-emitter";
import { NotificationEvents, ServerEvent } from "../shared/types";

export const events: { [key: string]: ServerEvent } = {};
export const eventCodes: { [key: string]: string } = {};

export const notificationEmitter = new TypedEmitter<NotificationEvents>();
export const newEventEmitter = new EventEmitter();
