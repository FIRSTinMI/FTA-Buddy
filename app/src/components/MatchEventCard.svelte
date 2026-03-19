<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Badge, Button } from "flowbite-svelte";
	import { formatTimeNoAgoHourMins } from "../../../shared/formatTime";
	import type { MatchEvent, MatchEventIssueDetail } from "../../../shared/types";
	import { trpc } from "../main";
	import { navigate } from "../router";
	import { toast } from "../util/toast";
	import type { ComponentProps } from "svelte";
	import { displayTeam } from "../util/team-name";

	interface Props {
		matchEvent: MatchEvent;
		bypassGroup?: MatchEvent[];
		onDismiss?: (id: string) => void;
		onConvert?: (id: string, noteId: string) => void;
		compact?: boolean;
	}

	let { matchEvent, bypassGroup, onDismiss, onConvert, compact = false }: Props = $props();

	let isBypass = $derived(matchEvent.issue === "Bypassed");
	let bypassCount = $derived(bypassGroup ? bypassGroup.length : isBypass ? 1 : 0);

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
		Bypassed: "pink",
	};

	async function dismiss() {
		dismissing = true;
		try {
			const eventIds =
				bypassGroup && bypassGroup.length > 1
					? bypassGroup.map((evt) => evt?.id).filter((id): id is string => Boolean(id))
					: [matchEvent?.id].filter((id): id is string => Boolean(id));

			if (eventIds.length === 0) {
				throw new Error("Missing match event id");
			}

			for (const id of eventIds) {
				await trpc.matchEvents.dismiss.mutate({ id });
				onDismiss?.(id);
			}
		} catch (err: any) {
			toast("Error dismissing event", err.message);
			console.error(err);
		} finally {
			dismissing = false;
		}
	}

	async function convertToNote() {
		const id = matchEvent?.id;
		if (!id) {
			toast("Error converting to note", "Missing match event id");
			return;
		}
		converting = true;
		try {
			const res = await trpc.matchEvents.convertToNote.mutate({ id });
			toast("Converted to note", "", "green-500");
			onConvert?.(id, res.noteId);
			// If consolidated bypass, dismiss the other events
			if (bypassGroup && bypassGroup.length > 1) {
				for (const evt of bypassGroup) {
					const evtId = evt?.id;
					if (evtId && evtId !== id) {
						await trpc.matchEvents.dismiss.mutate({ id: evtId });
						onDismiss?.(evtId);
					}
				}
			}
			navigate("/notepad/view/:id", { params: { id: res.noteId } });
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
				navigate("/logs/:matchid/:station", { params: { matchid: matchEvent.match_id, station } });
			} else {
				navigate("/logs/:matchid", { params: { matchid: matchEvent.match_id } });
			}
		} catch (err: any) {
			toast("Error loading match log", err.message);
			console.error(err);
		} finally {
			viewingLog = false;
		}
	}

	/** Resolved list of issue details – uses `issues` array if present, otherwise falls back to the single issue. */
	let issueList: MatchEventIssueDetail[] = $derived(
		matchEvent.issues && matchEvent.issues.length > 0
			? matchEvent.issues
			: [
					{
						issue: matchEvent.issue,
						start_time: matchEvent.start_time,
						end_time: matchEvent.end_time,
						duration: matchEvent.duration,
					},
				],
	);

	function formatDuration(dur: number | null) {
		const d = Math.abs(dur ?? 0);
		if (d >= 60) return `${(d / 60).toFixed(1)}m`;
		return `${d.toFixed(0)}s`;
	}

	let durationStr = $derived.by(() => {
		const dur = Math.abs(matchEvent.duration ?? 0);
		if (dur >= 60) return `${(dur / 60).toFixed(1)}m`;
		return `${dur.toFixed(0)}s`;
	});

	let levelLabel = $derived(
		matchEvent.level === "Qualification"
			? "Qual"
			: matchEvent.level === "Playoff"
				? "Playoff"
				: (matchEvent.level ?? ""),
	);
</script>

{#if compact}
	<div class="flex items-center gap-1 text-xs py-0.5">
		{#each issueList as detail}
			<Badge color={ISSUE_COLORS[detail.issue] ?? "gray"} class="text-[10px]">{detail.issue}</Badge>
		{/each}
		{#if isBypass && bypassGroup && bypassGroup.length > 1}
			<span class="text-gray-400">{bypassGroup.length} matches</span>
		{:else}
			<span class="text-gray-400">M{matchEvent.match_number}</span>
			{#if !isBypass}
				<span class="text-gray-500">{durationStr}</span>
			{/if}
		{/if}
		<button
			class="ml-auto text-gray-400 hover:text-red-400 transition-colors p-0.5"
			onclick={(e) => {
				e.stopPropagation();
				dismiss();
			}}
			disabled={dismissing}
			title="Dismiss"
		>
			<Icon icon="mdi:close" class="size-3" />
		</button>
		<button
			class="text-gray-400 hover:text-blue-400 transition-colors p-0.5"
			onclick={(e) => {
				e.stopPropagation();
				convertToNote();
			}}
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
						<button
							class="font-bold text-base hover:underline"
							onclick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								navigate("/notepad/team/:team", { params: { team: String(matchEvent.team) } });
							}}>{displayTeam(matchEvent.team)}</button
						>
					{/if}
					{#each issueList as detail}
						<Badge color={ISSUE_COLORS[detail.issue] ?? "gray"}>{detail.issue}</Badge>
					{/each}
					{#if bypassGroup && bypassGroup.length > 1}
						{#each bypassGroup as bp}
							<Badge color="teal">
								{bp.level === "Qualification"
									? "Qual"
									: bp.level === "Playoff"
										? "Playoff"
										: (bp.level ?? "")} M{bp.match_number}{bp.play_number && bp.play_number > 1
									? ` P${bp.play_number}`
									: ""}
							</Badge>
						{/each}
					{:else if matchEvent.match_number !== null}
						<Badge color="teal">
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

			<div class="text-sm text-black dark:text-white leading-snug">
				{#if isBypass}
					<p>
						{#if bypassCount > 1}
							Team was Bypassed for {bypassCount} Matches
						{:else}
							Team was Bypassed
						{/if}
					</p>
				{:else}
					{#each issueList as detail}
						<p>
							{detail.issue} for {formatDuration(detail.duration)} total
							{#if detail.start_time !== null && detail.end_time !== null}
								({detail.start_time.toFixed(0)}s → {detail.end_time.toFixed(0)}s match time)
							{/if}
						</p>
					{/each}
				{/if}
			</div>

			<div class="flex items-center justify-between gap-2">
				{#if !isBypass}
					<Badge
						color={matchEvent.alliance === "blue" ? "blue" : matchEvent.alliance === "red" ? "red" : "gray"}
						class="ml-1 text-[10px]">{matchEvent.alliance} alliance</Badge
					>
				{/if}
				{#if matchEvent.status === "dismissed"}
					<Badge color="gray">Dismissed</Badge>
				{:else if matchEvent.status === "converted"}
					<Badge color="green">Converted to Note</Badge>
				{/if}
			</div>

			{#if matchEvent.status === "active"}
				<div class="flex flex-wrap justify-between sm:justify-end gap-1 pt-1">
					<div class="gap-1">
						<Button size="xs" color="blue" onclick={convertToNote} disabled={converting}>
							<Icon icon="akar-icons:plus" class="size-3.5 mr-1" />
							{converting ? "Converting…" : "Note"}
						</Button>
						{#if !isBypass}
							<Button size="xs" color="green" onclick={viewLog} disabled={viewingLog}>
								<Icon icon="mdi:chart-line" class="size-3.5 mr-1" />
								{viewingLog ? "Loading…" : "Log"}
							</Button>
						{/if}
					</div>
					<Button size="xs" color="alternative" onclick={dismiss} disabled={dismissing}>
						<Icon icon="mdi:close" class="size-3.5 mr-1" />
						{dismissing ? "Dismissing…" : "Dismiss for All"}
					</Button>
				</div>
			{:else}
				<div class="flex flex-wrap gap-1 pt-1">
					{#if !isBypass}
						<Button size="xs" color="green" onclick={viewLog} disabled={viewingLog}>
							<Icon icon="mdi:chart-line" class="size-3.5 mr-1" />
							{viewingLog ? "Loading…" : "View Log"}
						</Button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}
