import type { ExtensionConfig, ExtensionRunState } from "./types";

/** Settings older than this stop the field-data side of the extension (popup must re-save). */
export const EXTENSION_EXPIRY_MS = 1000 * 60 * 60 * 24 * 4;

/** Settings last changed at `changed` are past the four-day expiry. No timestamp never expires. */
export function isExpired(changed: number | undefined, now: number): boolean {
	return Boolean(changed) && Number(changed) + EXTENSION_EXPIRY_MS < now;
}

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
	if (isExpired(opts.changed, opts.now)) return "expired";
	if (!opts.eventToken) return "no-event";
	return "running";
}

/** chrome.storage.local writes the extension makes from a remote config or switch. */
export type ExtensionStorageUpdates = Partial<
	Record<keyof ExtensionConfig | "changed" | "remoteDisabled", boolean | string | number>
>;

/**
 * Turn a remote config (from the config subscription or a heartbeat reply) into
 * the chrome.storage.local writes that apply it. Unknown or out-of-range values
 * are normalised the same way the popup does. A remote `enabled: true` also
 * writes `changed`, the way a local save does, so an extension enabled remotely
 * after four idle days runs instead of landing in "expired". Returns an empty
 * object when nothing would change a key.
 */
export function remoteConfigToStorageUpdates(
	config: ExtensionConfig,
	sanitizePort: (value: unknown) => number,
	now: number,
): ExtensionStorageUpdates {
	const updates: ExtensionStorageUpdates = {};
	if (config.enabled !== undefined) updates.enabled = config.enabled;
	if (config.enabled === true) updates.changed = now;
	if (config.fieldMonitor !== undefined) updates.fieldMonitor = config.fieldMonitor;
	if (config.useSignalR !== undefined) updates.useSignalR = config.useSignalR;
	if (config.fmsApiEnabled !== undefined) updates.fmsApiEnabled = config.fmsApiEnabled;
	if (config.scoreAutofill !== undefined) updates.scoreAutofill = config.scoreAutofill;
	if (config.sourceMode !== undefined) updates.sourceMode = config.sourceMode === "cheesy" ? "cheesy" : "fms";
	if (config.cheesyPort !== undefined) updates.cheesyPort = sanitizePort(config.cheesyPort);
	return updates;
}

/**
 * The writes for an admin switching extensions off or on for this extension's
 * event (heartbeat reply). Switching on restarts the four-day expiry only when
 * the host's own Enable setting is on, so an extension that sat switched off
 * for more than four days resumes instead of landing in "expired", and one the
 * host disabled stays disabled.
 */
export function remoteSwitchToStorageUpdates(
	remoteDisabled: boolean,
	enabled: boolean,
	now: number,
): ExtensionStorageUpdates {
	if (remoteDisabled || !enabled) return { remoteDisabled };
	return { remoteDisabled, changed: now };
}

/**
 * Whether opening the popup should clear Enable because the settings expired.
 * Not while an admin has the event switched off: that state wins over expiry,
 * and switching the event on restarts the expiry for an enabled extension.
 */
export function shouldDisableForExpiry(opts: {
	enabled: boolean;
	remoteDisabled: boolean;
	changed: number | undefined;
	now: number;
}): boolean {
	return opts.enabled && !opts.remoteDisabled && isExpired(opts.changed, opts.now);
}

/**
 * A `changed` write that takes the settings from expired to fresh. The worker
 * restarts on it even when no other key changed (a remote enable of an
 * extension whose Enable was still on, or a popup save of unchanged settings).
 */
export function expiryRenewed(oldChanged: unknown, newChanged: unknown, now: number): boolean {
	const next = Number(newChanged);
	return next > 0 && isExpired(Number(oldChanged) || undefined, now) && !isExpired(next, now);
}
