<script lang="ts">
	import { Badge } from "flowbite-svelte";
	import type { ComponentProps } from "svelte";
	import type { EventIntegrationStatus, NexusPollState } from "../../../../shared/types";

	let { status }: { status: EventIntegrationStatus | undefined } = $props();

	type Color = ComponentProps<typeof Badge>["color"];
	type Chip = { label: string; color: Color; title?: string };

	const pad = (n: number) => String(n).padStart(2, "0");
	function clock(iso: string | undefined): string {
		if (!iso) return "";
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return "";
		return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
	}

	const pollLabel: Record<NexusPollState, string> = {
		not_configured: "not configured",
		polling: "polling",
		polling_slow: "polling slowly",
		unauthorized: "key rejected",
		error: "error",
		complete: "all inspected",
		event_over: "event over",
	};
	const pollColor: Record<NexusPollState, Color> = {
		not_configured: "gray",
		polling: "green",
		polling_slow: "green",
		unauthorized: "red",
		error: "red",
		complete: "green",
		event_over: "gray",
	};

	let nexus = $derived.by((): Chip => {
		const n = status?.nexus;
		if (!n || !n.configured) return { label: "Nexus: not configured", color: "gray" };
		// A key is stored but this instance has no poll for it (event not loaded here, or poller not started).
		const p = n.poll && n.poll.state !== "not_configured" ? n.poll : undefined;
		if (!p) return { label: "Nexus: configured", color: "blue" };
		const ok = clock(p.lastSuccessAt);
		return {
			label: `Nexus: ${pollLabel[p.state]}${ok ? `, ${ok}` : ""}`,
			color: pollColor[p.state],
			title: ok ? `Last success ${ok}` : "No success yet",
		};
	});

	let nexusError = $derived.by(() => {
		const p = status?.nexus.poll;
		if (!p?.lastErrorMessage) return null;
		const at = clock(p.lastErrorAt);
		return `Nexus: ${p.lastErrorMessage}${at ? ` (${at})` : ""}`;
	});

	let slack = $derived.by((): Chip => {
		const s = status?.slack;
		if (!s || !s.connected) return { label: "Slack: not connected", color: "gray" };
		const where = [s.workspaceInstalled ? s.teamName : null, s.channelId].filter(Boolean).join(" ");
		if (!s.workspaceInstalled) {
			return {
				label: `Slack: bot not installed${s.channelId ? ` ${s.channelId}` : ""}`,
				color: "red",
				title: `Team ${s.teamId}, channel ${s.channelId}`,
			};
		}
		return { label: `Slack: ${where}`, color: "green", title: `Team ${s.teamId}, channel ${s.channelId}` };
	});

	let fms = $derived.by(
		(): Chip =>
			status?.fms.passwordSet
				? { label: "FMS password: set", color: "blue" }
				: { label: "FMS password: not set", color: "gray" },
	);

	let modes = $derived.by((): Chip[] => {
		if (!status) return [];
		const out: Chip[] = [];
		if (status.notepadOnly) out.push({ label: "Notepad only", color: "yellow" });
		if (!status.publicTicketSubmit) out.push({ label: "Public tickets off", color: "yellow" });
		if (status.playoffMode) out.push({ label: "Playoff mode", color: "purple" });
		const m = status.meshed;
		if (m.subEvents.length > 0) {
			out.push({
				label: `Meshed: ${m.subEvents.length} sub-event${m.subEvents.length === 1 ? "" : "s"}`,
				color: "indigo",
				title: m.subEvents.map((s) => (s.label ? `${s.code} ${s.label}` : s.code)).join(", "),
			});
		}
		if (m.parentCode) out.push({ label: `Sub-event of ${m.parentCode.toUpperCase()}`, color: "indigo" });
		if (status.slowWarning.enabled) {
			out.push({ label: `Slow warning: ${status.slowWarning.mode.replace(/_/g, " ")}`, color: "yellow" });
		}
		const a = status.autoMatchEvents;
		if (a.enabledCount > 0) {
			out.push({
				label: `Auto events ${a.enabledCount}/${a.total}`,
				color: a.enabledCount === a.total ? "green" : "blue",
				title: a.enabled.join(", "),
			});
		}
		return out;
	});

	let dates = $derived.by(() => {
		if (!status) return "";
		const range = [status.startDate, status.endDate].filter(Boolean);
		const when = range.length === 2 && range[0] !== range[1] ? `${range[0]} to ${range[1]}` : (range[0] ?? "");
		return [when, status.timezone].filter(Boolean).join(", ");
	});

	let chips = $derived<Chip[]>([nexus, slack, fms, ...modes]);
</script>

{#if status}
	<div class="flex flex-col gap-1 min-w-0 text-left">
		<ul class="flex flex-wrap items-center gap-1 min-w-0" aria-label="Integrations">
			{#each chips as c}
				<li class="min-w-0 max-w-full">
					<Badge color={c.color} class="text-xs max-w-full" title={c.title ?? c.label}>
						<span class="truncate">{c.label}</span>
					</Badge>
				</li>
			{/each}
			{#if dates}
				<li class="text-xs text-gray-500 min-w-0 break-words">{dates}</li>
			{/if}
		</ul>
		{#if nexusError}
			<p class="text-xs text-left text-red-600 dark:text-red-400 truncate" title={nexusError}>{nexusError}</p>
		{/if}
	</div>
{/if}
