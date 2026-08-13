import { z } from "zod";
import { bus } from "../util/eventBus";
import type { ExtensionConfig, ServerEvent } from "../../shared/types";
import { eventProcedure, router } from "../trpc";
import { subscriptionQueue } from "../util/subscription";

const extensionConfigSchema = z.object({
	enabled: z.boolean().optional(),
	fieldMonitor: z.boolean().optional(),
	useSignalR: z.boolean().optional(),
	fmsApiEnabled: z.boolean().optional(),
	sourceMode: z.enum(["fms", "cheesy"]).optional(),
	cheesyPort: z.number().int().min(1).max(65535).optional(),
});

/** Bus payload for a config push from the web app to a connected extension. */
interface ExtensionConfigPush {
	extensionId?: string;
	config: ExtensionConfig;
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
	configSubscription: eventProcedure
		.input(z.object({ extensionId: z.string() }))
		.subscription(async function* ({ ctx, input, signal }) {
			const { event } = ctx;
			const { push, drain } = subscriptionQueue<ExtensionConfig>(signal!);
			const unsub = bus.subscribe(`event:${event.code}:extension-config`, (data) => {
				const msg = data as ExtensionConfigPush;
				if (!msg.extensionId || msg.extensionId === input.extensionId) push(msg.config);
			});
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
