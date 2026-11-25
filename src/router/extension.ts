import { z } from "zod";
import { bus } from "../util/eventBus";
import type { ExtensionConfig, ExtensionConfigDelivery, ServerEvent } from "../../shared/types";
import { getEventExtensionsEnabled, REMOTE_DISABLE_PUSH } from "../util/event-extensions";
import { eventProcedure, publicProcedure, router } from "../trpc";
import {
	eventCodeForToken,
	extensionConfigSchema,
	heartbeatInputSchema,
	recordHeartbeat,
} from "../util/extension-presence";
import { subscriptionQueue } from "../util/subscription";

/** Bus payload for a config push from the web app to a connected extension. */
export interface ExtensionConfigPush {
	extensionId?: string;
	config: ExtensionConfigDelivery;
}

/** Public-facing view of a connected extension (no ip / user agent). */
interface ExtensionSummary {
	id: string;
	version?: string;
	config?: ExtensionConfig;
	fmsApi?: boolean;
	connected: Date;
	lastFrame: Date;
}

function summarize(extensions: ServerEvent["stats"]["extensions"]): ExtensionSummary[] {
	return extensions.map((e) => ({
		id: e.id,
		version: e.version,
		config: e.config,
		fmsApi: e.fmsApi,
		connected: e.connected,
		lastFrame: e.lastFrame,
	}));
}

/**
 * Remote extension configuration. The extension holds a live connection to the
 * server, so the web app can read a connected extension's settings and change
 * them from any device (rather than only through the browser the extension is
 * installed in). Flow: app -> setConfig -> bus -> configSubscription -> extension
 * applies to chrome.storage -> reportState -> app sees the confirmed state.
 */
export const extensionRouter = router({
	// Extension -> server, once a minute whatever its state (disabled, expired,
	// no event). Public because an extension without an event has no event token.
	// Records presence for the admin dashboard and returns, once, any config an
	// admin queued for this extension: that is how a disabled extension, which
	// holds no subscription, gets re-enabled remotely. `remoteDisabled` is true
	// while an admin has extensions switched off for the extension's event.
	heartbeat: publicProcedure
		.input(heartbeatInputSchema)
		.mutation(async ({ ctx, input }): Promise<{ config: ExtensionConfig | null; remoteDisabled: boolean }> => {
			const eventCode = await eventCodeForToken(ctx.eventToken);
			const [config, enabledForEvent] = await Promise.all([
				recordHeartbeat(input, { eventCode, ip: ctx.ip, userAgent: ctx.userAgent }),
				eventCode ? getEventExtensionsEnabled(eventCode) : Promise.resolve(true),
			]);
			return { config, remoteDisabled: !enabledForEvent };
		}),

	// Extension -> server: report its current config + version so any device can
	// see how it is set up and the management UI reflects live state.
	reportState: eventProcedure
		.input(
			z.object({
				extensionId: z.string(),
				version: z.string().optional(),
				fmsApi: z.boolean().optional(),
				config: extensionConfigSchema,
			}),
		)
		.mutation(({ ctx, input }) => {
			const { event } = ctx;
			let entry = event.stats.extensions.find((e) => e.id === input.extensionId);
			if (!entry) {
				entry = {
					id: input.extensionId,
					connected: new Date(),
					userAgent: ctx.userAgent,
					ip: ctx.ip,
					lastFrame: new Date(),
					frames: 0,
					checklistUpdates: 0,
				};
				event.stats.extensions.push(entry);
			}
			entry.version = input.version ?? entry.version;
			if (input.fmsApi !== undefined) entry.fmsApi = input.fmsApi;
			entry.config = { ...entry.config, ...input.config };
			entry.lastFrame = new Date();
			bus.publish(`event:${event.code}:extension-state`, event.stats.extensions);
			// Extensions switched off for this event: an old extension that is still
			// running (it was offline when the switch flipped, or the host turned it
			// back on) gets the stop again.
			if (event.extensionsEnabled === false && input.config.enabled !== false) {
				const payload: ExtensionConfigPush = { extensionId: input.extensionId, config: REMOTE_DISABLE_PUSH };
				bus.publish(`event:${event.code}:extension-config`, payload);
			}
			return { ok: true };
		}),

	// Web app -> server -> extension: push a config change. extensionId targets a
	// single extension; omit it to broadcast to every extension on the event.
	setConfig: eventProcedure
		.input(
			z.object({
				extensionId: z.string().optional(),
				config: extensionConfigSchema,
			}),
		)
		.mutation(({ ctx, input }) => {
			const { event } = ctx;
			const payload: ExtensionConfigPush = { extensionId: input.extensionId, config: input.config };
			bus.publish(`event:${event.code}:extension-config`, payload);
			// Optimistically reflect on stored state so the UI updates right away;
			// the extension confirms via reportState once it applies the change.
			for (const e of event.stats.extensions) {
				if (!input.extensionId || e.id === input.extensionId) e.config = { ...e.config, ...input.config };
			}
			bus.publish(`event:${event.code}:extension-state`, event.stats.extensions);
			return { ok: true };
		}),

	// Extension listens here for config pushes targeted at it.
	configSubscription: eventProcedure.input(z.object({ extensionId: z.string() })).subscription(async function* ({
		ctx,
		input,
		signal,
	}) {
		const { event } = ctx;
		const { push, drain } = subscriptionQueue<ExtensionConfigDelivery>(signal!);
		const unsub = bus.subscribe(`event:${event.code}:extension-config`, (data) => {
			const msg = data as ExtensionConfigPush;
			if (!msg.extensionId || msg.extensionId === input.extensionId) push(msg.config);
		});
		// (Re)subscribing while extensions are switched off for the event: stop it now.
		if (event.extensionsEnabled === false) push(REMOTE_DISABLE_PUSH);
		try {
			for await (const item of drain()) yield item;
		} finally {
			unsub();
		}
	}),

	// Web app: the extensions currently connected to this event, with their config.
	list: eventProcedure.query(({ ctx }) => summarize(ctx.event.stats.extensions)),

	// Web app: live updates of the connected extensions (config, version, FMS status).
	statusSubscription: eventProcedure.subscription(async function* ({ ctx, signal }) {
		const { event } = ctx;
		const { push, drain } = subscriptionQueue<ExtensionSummary[]>(signal!);
		push(summarize(event.stats.extensions));
		const unsub = bus.subscribe(`event:${event.code}:extension-state`, (data) =>
			push(summarize(data as ServerEvent["stats"]["extensions"])),
		);
		const heartbeat = setInterval(() => push(summarize(event.stats.extensions)), 15_000);
		try {
			for await (const item of drain()) yield item;
		} finally {
			unsub();
			clearInterval(heartbeat);
		}
	}),
});
