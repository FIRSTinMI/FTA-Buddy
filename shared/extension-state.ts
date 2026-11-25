import type { ExtensionConfig, ExtensionRunState } from "./types";

/** Settings older than this stop the field-data side of the extension (popup must re-save). */
export const EXTENSION_EXPIRY_MS = 1000 * 60 * 60 * 24 * 4;

/**
 * The run state an extension reports in its heartbeat. Order matches the gates
 * in the extension's `start()`: the admin's per-event switch, then Enable, then
 * the four-day expiry, then whether it holds an event token at all. The admin
 * still sees the local Enable setting in `config.enabled`.
 */
export function deriveExtensionState(opts: {
	enabled: boolean;
	remoteDisabled: boolean;
	changed: number | undefined;
	eventToken: string | undefined;
	now: number;
}): ExtensionRunState {
	if (opts.remoteDisabled) return "remote-disabled";
	if (!opts.enabled) return "disabled";
	if (opts.changed && opts.changed + EXTENSION_EXPIRY_MS < opts.now) return "expired";
	if (!opts.eventToken) return "no-event";
	return "running";
}

/**
 * Turn a remote config (from the config subscription or a heartbeat reply) into
 * the chrome.storage.local writes that apply it. Unknown or out-of-range values
 * are normalised the same way the popup does. Returns an empty object when
 * nothing would change a key.
 */
export function remoteConfigToStorageUpdates(
	config: ExtensionConfig,
	sanitizePort: (value: unknown) => number,
): Partial<Record<keyof ExtensionConfig, boolean | string | number>> {
	const updates: Partial<Record<keyof ExtensionConfig, boolean | string | number>> = {};
	if (config.enabled !== undefined) updates.enabled = config.enabled;
	if (config.fieldMonitor !== undefined) updates.fieldMonitor = config.fieldMonitor;
	if (config.useSignalR !== undefined) updates.useSignalR = config.useSignalR;
	if (config.fmsApiEnabled !== undefined) updates.fmsApiEnabled = config.fmsApiEnabled;
	if (config.scoreAutofill !== undefined) updates.scoreAutofill = config.scoreAutofill;
	if (config.sourceMode !== undefined) updates.sourceMode = config.sourceMode === "cheesy" ? "cheesy" : "fms";
	if (config.cheesyPort !== undefined) updates.cheesyPort = sanitizePort(config.cheesyPort);
	return updates;
}
