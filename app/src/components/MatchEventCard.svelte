<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Badge, Button } from "flowbite-svelte";
	import { formatTimeNoAgoHourMins } from "../../../shared/formatTime";
	import type { MatchEvent } from "../../../shared/types";
	import { trpc } from "../main";
	import { navigate } from "../router";
	import { toast } from "../util/toast";
	import type { ComponentProps } from "svelte";

	interface Props {
		matchEvent: MatchEvent;
		onDismiss?: (id: string) => void;
		onConvert?: (id: string, noteId: string) => void;
		compact?: boolean;
	}

	let { matchEvent, onDismiss, onConvert, compact = false }: Props = $props();

	let time = $derived(formatTimeNoAgoHourMins(matchEvent.created_at));
	let dismissing = $state(false);
	let converting = $state(false);

	const ISSUE_COLORS: Record<string, ComponentProps<typeof Badge>["color"]> = {
		"Code disconnect": "red",
		"RIO disconnect": "red",
		"Radio disconnect": "yellow",
		"DS disconnect": "purple",
		Brownout: "gray",
		"Large spike in ping": "yellow",
		"Sustained high ping": "yellow",
		"Low signal": "indigo",
		"High BWU": "indigo",
	};

	async function dismiss() {
		const id = matchEvent.id;
		dismissing = true;
		try {
			await trpc.matchEvents.dismiss.mutate({ id });
			onDismiss?.(id);
		} catch (err: any) {
			toast("Error dismissing event", err.message);
			console.error(err);
		} finally {
			dismissing = false;
		}
	}

	async function convertToNote() {
		const id = matchEvent.id;
		converting = true;
		try {
			const res = await trpc.matchEvents.convertToNote.mutate({ id });
			toast("Converted to note", "", "green-500");
			onConvert?.(id, res.noteId);
			navigate('/notepad/view/:id', { params: { id: res.noteId } });
		} catch (err: any) {
			toast("Error converting to note", err.message);
			console.error(err);
		} finally {
			converting = false;
		}
	}

	let viewingLog = $state(false);

	async function viewLog() {
		viewingLog = true;
		try {
			const match = await trpc.match.getMatch.query({ id: matchEvent.match_id });
			const stations = ["blue1", "blue2", "blue3", "red1", "red2", "red3"] as const;
			const station = stations.find((s) => match[s] === matchEvent.team);
			if (station) {
				navigate('/logs/:matchid/:station', { params: { matchid: matchEvent.match_id, station } });
			} else {
				navigate('/logs/:matchid', { params: { matchid: matchEvent.match_id } });
			}
		} catch (err: any) {
			toast("Error loading match log", err.message);
			console.error(err);
		} finally {
			viewingLog = false;
		}
	}

	let durationStr = $derived.by(() => {
		const dur = Math.abs(matchEvent.duration ?? 0);
		if (dur >= 60) return `${(dur / 60).toFixed(1)}m`;
		return `${dur.toFixed(0)}s`;
	});

	let levelLabel = $derived(
		matchEvent.level === "Qualification" ? "Qual" : matchEvent.level === "Playoff" ? "Playoff" : (matchEvent.level ?? ""),
	);
</script>

{#if compact}
	<div class="flex items-center gap-1 text-xs py-0.5">
		<Badge color={ISSUE_COLORS[matchEvent.issue] ?? "gray"} class="text-[10px]">{matchEvent.issue}</Badge>
		<span class="text-gray-400">M{matchEvent.match_number}</span>
		<span class="text-gray-500">{durationStr}</span>
		<button
			class="ml-auto text-gray-400 hover:text-red-400 transition-colors p-0.5"
			onclick={(e) => { e.stopPropagation(); dismiss(); }}
			disabled={dismissing}
			title="Dismiss"
		>
			<Icon icon="mdi:close" class="size-3" />
		</button>
		<button
			class="text-gray-400 hover:text-blue-400 transition-colors p-0.5"
			onclick={(e) => { e.stopPropagation(); convertToNote(); }}
			disabled={converting}
			title="Convert to note"
		>
			<Icon icon="mdi:note-plus-outline" class="size-3" />
		</button>
	</div>
{:else}
	<div
		class="block w-full rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 shadow-sm p-4 text-black dark:text-white"
	>
		<div class="flex flex-col gap-2">
			<div class="flex items-start justify-between gap-3">
				<div class="flex items-center flex-wrap gap-1.5 min-w-0">
					{#if matchEvent.team !== null}
						<span class="font-bold text-base">#{matchEvent.team}</span>
					{/if}
					<Badge color={ISSUE_COLORS[matchEvent.issue] ?? "gray"}>{matchEvent.issue}</Badge>
					{#if matchEvent.match_number !== null}
						<Badge>
							{levelLabel} M{matchEvent.match_number}{matchEvent.play_number && matchEvent.play_number > 1
								? ` P${matchEvent.play_number}`
								: ""}
						</Badge>
					{/if}
				</div>
				<div class="shrink-0 text-right text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
					<p class="font-medium">{matchEvent.event_code}</p>
					<p>{time}</p>
				</div>
			</div>

			<p class="text-sm text-black dark:text-white leading-snug">
				{matchEvent.issue} for {durationStr} total
				{#if matchEvent.start_time !== null && matchEvent.end_time !== null}
					({matchEvent.start_time.toFixed(0)}s → {matchEvent.end_time.toFixed(0)}s match time)
				{/if}
			</p>

			<div class="flex items-center justify-between gap-2">
				<p class="text-xs text-gray-400 dark:text-gray-500">
					{matchEvent.alliance} alliance
				</p>
				{#if matchEvent.status === "dismissed"}
					<Badge color="gray">Dismissed</Badge>
				{:else if matchEvent.status === "converted"}
					<Badge color="green">Converted to Note</Badge>
				{/if}
			</div>

			{#if matchEvent.status === "active"}
				<div class="flex flex-wrap gap-1 pt-1">
					<Button size="xs" color="blue" onclick={convertToNote} disabled={converting}>
						<Icon icon="mdi:note-plus-outline" class="size-3.5 mr-1" />
						{converting ? "Converting…" : "Make Note"}
					</Button>
					<Button size="xs" color="green" onclick={viewLog} disabled={viewingLog}>
						<Icon icon="mdi:file-document-outline" class="size-3.5 mr-1" />
						{viewingLog ? "Loading…" : "View Log"}
					</Button>
					<Button size="xs" color="alternative" onclick={dismiss} disabled={dismissing}>
						<Icon icon="mdi:close" class="size-3.5 mr-1" />
						{dismissing ? "Dismissing…" : "Dismiss"}
					</Button>
				</div>
			{:else}
				<div class="flex flex-wrap gap-1 pt-1">
					<Button size="xs" color="green" onclick={viewLog} disabled={viewingLog}>
						<Icon icon="mdi:file-document-outline" class="size-3.5 mr-1" />
						{viewingLog ? "Loading…" : "View Log"}
					</Button>
				</div>
			{/if}
		</div>
	</div>
{/if}
