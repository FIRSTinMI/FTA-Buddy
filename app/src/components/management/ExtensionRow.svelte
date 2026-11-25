<script lang="ts">
	import { Badge, Button } from "flowbite-svelte";
	import type { ComponentProps } from "svelte";
	import { formatTimeAgoHourMins, formatTimeShortNoAgo } from "../../../../shared/formatTime";
	import type { AdminExtensionEntry, ExtensionRunState } from "../../../../shared/types";

	let {
		ext,
		busy = false,
		showEvent = false,
		onconfig,
		ontoggle,
	}: {
		ext: AdminExtensionEntry;
		busy?: boolean;
		showEvent?: boolean;
		onconfig: (ext: AdminExtensionEntry) => void;
		ontoggle: (ext: AdminExtensionEntry, enable: boolean) => void;
	} = $props();

	const stateLabel: Record<ExtensionRunState, string> = {
		running: "Running",
		disabled: "Disabled",
		"remote-disabled": "Remote disabled",
		expired: "Expired",
		"no-event": "No event",
	};

	const stateColor: Record<ExtensionRunState, ComponentProps<typeof Badge>["color"]> = {
		running: "green",
		disabled: "red",
		"remote-disabled": "red",
		expired: "yellow",
		"no-event": "gray",
	};

	const ago = (ms: number) => formatTimeAgoHourMins(new Date(ms));

	// Legacy entries report no state; their own Enable setting is the only signal.
	let isEnabled = $derived(ext.state ? ext.state !== "disabled" : ext.config.enabled !== false);
	let remoteDisabled = $derived(ext.state === "remote-disabled");
	let canEnable = $derived(!ext.legacy && !isEnabled);
	let frames = $derived(ext.legacy ? ext.legacyFrames : (ext.stats.framesSent ?? null));
	let pendingKeys = $derived(ext.pendingConfig ? Object.keys(ext.pendingConfig) : []);

	let facts = $derived.by(() => {
		const s = ext.stats;
		const out: { label: string; value: string; tone?: "bad" }[] = [];
		if (ext.version) out.push({ label: "Version", value: ext.version });
		if (ext.ip) out.push({ label: "IP", value: ext.ip });
		out.push({ label: "Last seen", value: ago(ext.lastSeen) });
		if (s.workerStartedAt) {
			out.push({ label: "Uptime", value: formatTimeShortNoAgo(new Date(s.workerStartedAt)) });
		}
		if (s.fmsReachable !== undefined) {
			out.push({
				label: "FMS",
				value: (s.fmsReachable ? "Reachable" : "Unreachable") + (s.fmsPingAt ? `, ${ago(s.fmsPingAt)}` : ""),
				tone: s.fmsReachable ? undefined : "bad",
			});
		}
		const mode = s.sourceMode ?? ext.config.sourceMode;
		if (mode) out.push({ label: "Source", value: mode === "fms" ? "FMS" : "Cheesy Arena" });
		if (s.realtimeFeed) {
			out.push({
				label: "Feed",
				value: s.realtimeStatus ? `${s.realtimeFeed}, ${s.realtimeStatus}` : s.realtimeFeed,
			});
		}
		if (frames !== null) out.push({ label: "Frames", value: frames.toLocaleString() });
		if (s.lastFrameAt) out.push({ label: "Last frame", value: ago(s.lastFrameAt) });
		return out;
	});
</script>

<div class="rounded-lg border border-gray-200 dark:border-neutral-700 p-3 flex flex-col gap-2">
	<div class="flex flex-wrap items-center gap-2">
		<span class="inline-block w-2 h-2 rounded-full {ext.online ? 'bg-green-500' : 'bg-gray-400'}"></span>
		<span class="text-sm font-medium text-gray-800 dark:text-gray-100">{ext.online ? "Online" : "Offline"}</span>
		{#if ext.state}
			<Badge color={stateColor[ext.state]} class="text-xs">{stateLabel[ext.state]}</Badge>
		{/if}
		{#if ext.legacy}
			<Badge color="purple" class="text-xs">Legacy</Badge>
		{/if}
		{#if ext.pendingConfig}
			<Badge color="yellow" class="text-xs"
				>Pending config{pendingKeys.length ? `: ${pendingKeys.join(", ")}` : ""}</Badge
			>
		{/if}
		{#if showEvent}
			<span class="text-xs text-gray-500 font-mono">
				{(ext.eventCode ?? ext.reportedEventCode ?? "").toUpperCase()}
			</span>
		{/if}
		<span class="text-xs text-gray-400 font-mono truncate max-w-full" title={ext.id}>{ext.id}</span>
	</div>

	<dl class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-1 text-xs">
		{#each facts as f}
			<div class="min-w-0">
				<dt class="text-gray-500">{f.label}</dt>
				<dd
					class="truncate {f.tone === 'bad'
						? 'text-red-600 dark:text-red-400'
						: 'text-gray-800 dark:text-gray-200'}"
					title={f.value}
				>
					{f.value}
				</dd>
			</div>
		{/each}
	</dl>

	{#if ext.stats.lastError}
		<p class="text-xs text-red-600 dark:text-red-400 break-words">
			{ext.stats.lastError}{ext.stats.lastErrorAt ? ` (${ago(ext.stats.lastErrorAt)})` : ""}
		</p>
	{/if}

	<div class="flex flex-wrap gap-2">
		<Button size="xs" color="alternative" onclick={() => onconfig(ext)}>Config</Button>
		{#if remoteDisabled}
			<!-- Controlled by the event switch -->
		{:else if isEnabled}
			<Button size="xs" color="red" disabled={busy} onclick={() => ontoggle(ext, false)}>Disable</Button>
		{:else if canEnable}
			<Button size="xs" color="green" disabled={busy} onclick={() => ontoggle(ext, true)}>Enable</Button>
		{/if}
	</div>
</div>
