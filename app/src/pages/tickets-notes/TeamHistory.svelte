<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Badge, Button } from "flowbite-svelte";
	import type { ComponentProps } from "svelte";
	import { formatTimeNoAgoHourMins } from "../../../../shared/formatTime";
	import type { Note } from "../../../../shared/types";
	import Spinner from "../../components/Spinner.svelte";
	import { trpc } from "../../main";
	import { navigate, route } from "../../router";

	const { team } = route.getParams("/support/team/:team");
	const teamNumber = parseInt(team, 10);

	let notesPromise: Promise<Note[]> = $state(trpc.notes.getAllByTeam.query({ team_number: teamNumber }));

	const noteTypeLabel: Record<Note["note_type"], string> = {
		TeamIssue: "Team Note",
		EventNote: "Event Note",
		MatchNote: "Match Note",
	};

	const noteTypeColor: Record<Note["note_type"], ComponentProps<typeof Badge>["color"]> = {
		TeamIssue: "blue",
		EventNote: "yellow",
		MatchNote: "green",
	};

	const ISSUE_TYPE_LABELS: Record<string, string> = {
		RoboRioIssue: "RoboRIO Issue",
		DSIssue: "Driver Station Issue",
		NoRobot: "No Robot",
		RadioIssue: "Radio Issue",
		RobotPwrIssue: "Robot Power Issue",
		OtherRobotIssue: "Other Robot Issue",
		VenueIssue: "Venue Issue",
		ElectricalIssue: "Electrical Issue",
		MechanicalIssue: "Mechanical Issue",
		VolunteerIssue: "Volunteer Issue",
		Other: "Other",
	};

	function groupByEvent(notes: Note[]): { eventCode: string; notes: Note[] }[] {
		const map = new Map<string, Note[]>();
		for (const note of notes) {
			const key = note.event_code;
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(note);
		}
		// Sort each group newest-first
		for (const [, arr] of map) {
			arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
		}
		// Sort groups newest-event first (by the most recent note in each group)
		return Array.from(map.entries())
			.map(([eventCode, notes]) => ({ eventCode, notes }))
			.sort((a, b) => new Date(b.notes[0].created_at).getTime() - new Date(a.notes[0].created_at).getTime());
	}

	function back() {
		navigate("/support");
	}
</script>

<div class="container max-w-4xl mx-auto px-2 pt-2 h-full flex flex-col gap-3">
	<!-- Header -->
	<div class="flex items-center gap-3 px-2 pt-2">
		<Button size="sm" color="alternative" onclick={back}>
			<Icon icon="mdi:arrow-left" class="size-4 mr-1" />Back
		</Button>
		<h1 class="text-2xl font-bold text-black dark:text-white">
			Team {teamNumber} — Full History
		</h1>
	</div>

	<!-- Content -->
	<div class="flex-1 min-h-0 overflow-y-auto pb-6">
		{#await notesPromise}
			<div class="flex justify-center items-center py-16">
				<Spinner />
			</div>
		{:then notes}
			{@const groups = groupByEvent(notes)}

			<!-- Stats bar -->
			<div class="flex items-center gap-4 px-2 pb-4 text-sm text-gray-500 dark:text-gray-400">
				<div class="flex items-center gap-1.5">
					<Icon icon="mdi:note-multiple-outline" class="size-4" />
					<span>{notes.length} notes total</span>
				</div>
				<div class="flex items-center gap-1.5">
					<span class="inline-block size-2 rounded-full bg-green-500"></span>
					<span>{notes.filter((n) => n.resolution_status === "Open").length} open</span>
				</div>
				<div class="flex items-center gap-1.5">
					<span class="inline-block size-2 rounded-full bg-gray-400"></span>
					<span>{notes.filter((n) => n.resolution_status === "Resolved").length} resolved</span>
				</div>
				<div class="flex items-center gap-1.5">
					<Icon icon="mdi:calendar" class="size-4" />
					<span>{groups.length} event{groups.length !== 1 ? "s" : ""}</span>
				</div>
			</div>

			{#if notes.length === 0}
				<div class="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
					<Icon icon="mdi:note-off-outline" class="size-12" />
					<p class="text-lg font-medium">No notes found for team {teamNumber}</p>
					<p class="text-sm">Notes from all active events will appear here.</p>
				</div>
			{:else}
				<div class="flex flex-col gap-6">
					{#each groups as group}
						<!-- Event group -->
						<div class="flex flex-col gap-2">
							<!-- Event header -->
							<div class="flex items-center gap-2 px-1">
								<span
									class="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400"
								>
									{group.eventCode}
								</span>
								<div class="flex-1 h-px bg-gray-200 dark:bg-neutral-700"></div>
								<span class="text-xs text-gray-400 dark:text-gray-500">
									{group.notes.length} note{group.notes.length !== 1 ? "s" : ""}
								</span>
							</div>

							<!-- Note cards for this event -->
							<div class="flex flex-col gap-2">
								{#each group.notes as note}
									{@const isOpen = note.resolution_status === "Open"}
									{@const isApplicable = note.resolution_status !== "NotApplicable"}
									<a
										href="/support/view/{note.id}"
										class="block w-full rounded-xl bg-white dark:bg-neutral-800 shadow-sm hover:shadow-md transition-shadow p-4 text-black dark:text-white no-underline"
									>
										<div class="flex flex-col gap-2.5">
											<!-- Top row: badges + timestamp -->
											<div class="flex items-start justify-between gap-3">
												<div class="flex items-center flex-wrap gap-1.5 min-w-0">
													<Badge color={noteTypeColor[note.note_type]}>
														{noteTypeLabel[note.note_type]}
													</Badge>
													{#if note.match_number !== null}
														<Badge>
															{note.tournament_level === "Qualification"
																? "Qual"
																: note.tournament_level === "Playoff"
																	? "Playoff"
																	: (note.tournament_level ?? "")} M{note.match_number}{note.play_number &&
															note.play_number > 1
																? ` P${note.play_number}`
																: ""}
														</Badge>
													{/if}
													{#if note.issue_type && note.issue_type !== "Other"}
														<Badge color="purple">
															{ISSUE_TYPE_LABELS[note.issue_type] ?? note.issue_type}
														</Badge>
													{/if}
													{#if isApplicable}
														<span
															class="text-sm font-semibold {isOpen
																? 'text-green-500'
																: 'text-gray-400 dark:text-gray-500'}"
														>
															{isOpen ? "Open" : "Closed"}
														</span>
													{/if}
												</div>
												<div
													class="shrink-0 text-right text-xs text-gray-400 dark:text-gray-500 leading-relaxed"
												>
													<p>{formatTimeNoAgoHourMins(note.created_at)}</p>
													{#if note.closed_at}
														<p class="text-green-500">
															✓ {formatTimeNoAgoHourMins(note.closed_at)}
														</p>
													{/if}
												</div>
											</div>

											<!-- Note text -->
											<p class="text-sm text-black dark:text-white line-clamp-3 leading-snug">
												{note.text}
											</p>

											<!-- Footer: author + assignment -->
											<div class="flex items-center justify-between gap-2">
												<p class="text-xs text-gray-400 dark:text-gray-500">
													{note.author?.username ?? "Unknown"}{note.author?.username !==
													note.author?.role
														? ` · ${note.author?.role}`
														: ""}
													{#if note.author?.source === "FMS"}
														<Badge color="indigo" class="ml-1 text-[10px]">FMS</Badge>
													{:else if note.author?.source === "Slack"}
														<Badge color="purple" class="ml-1 text-[10px]">Slack</Badge>
													{/if}
												</p>
												{#if note.assigned_to}
													<span
														class="text-xs rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 shrink-0"
													>
														Assigned: {note.assigned_to.username}
													</span>
												{:else}
													<span class="text-xs text-gray-400 dark:text-gray-500 shrink-0"
														>Unassigned</span
													>
												{/if}
											</div>

											<!-- Reply preview if messages loaded -->
											{#if note.messages && note.messages.length > 0}
												{@const latestMsg = note.messages.reduce((a, b) =>
													new Date(a.created_at).getTime() > new Date(b.created_at).getTime()
														? a
														: b,
												)}
												<div
													class="rounded-lg bg-gray-50 dark:bg-neutral-700/50 px-3 py-2 flex items-start gap-2"
												>
													<Icon
														icon="mdi:reply"
														class="size-3.5 mt-0.5 text-gray-400 dark:text-gray-500 shrink-0"
													/>
													<div class="min-w-0">
														<span
															class="text-xs font-semibold text-gray-500 dark:text-gray-400"
														>
															{latestMsg.author?.username ?? "Unknown"}:
														</span>
														<span
															class="text-xs text-gray-500 dark:text-gray-400 ml-1 line-clamp-1"
															>{latestMsg.text}</span
														>
													</div>
													{#if note.messages.length > 1}
														<span
															class="ml-auto text-xs text-gray-400 dark:text-gray-500 shrink-0"
														>
															{note.messages.length} replies
														</span>
													{/if}
												</div>
											{/if}
										</div>
									</a>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{:catch err}
			<div class="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
				<Icon icon="mdi:alert-circle-outline" class="size-12 text-red-400" />
				<p class="text-lg font-medium text-red-400">Failed to load notes</p>
				<p class="text-sm">{err?.message ?? "Unknown error"}</p>
				<Button
					size="sm"
					color="alternative"
					onclick={() => {
						notesPromise = trpc.notes.getAllByTeam.query({ team_number: teamNumber });
					}}
				>
					<Icon icon="charm:refresh" class="size-4 mr-1" />Retry
				</Button>
			</div>
		{/await}
	</div>
</div>
