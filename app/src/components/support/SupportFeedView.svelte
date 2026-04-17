<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Button, Input, Label, Modal, Select, Textarea } from "flowbite-svelte";
	import { onDestroy, onMount, tick } from "svelte";
	import type {
		MatchEvent,
		MatchEventUpdateEventData,
		Note,
		NoteUpdateEventData,
		TournamentLevel,
	} from "../../../../shared/types";
	import { trpc } from "../../main";
	import { trpcForTeam } from "../../util/sub-event-trpc";
	import { navigate } from "../../router";
	import { eventStore } from "../../stores/event";
	import { settingsStore } from "../../stores/settings";
	import { userStore } from "../../stores/user";
	import { toast } from "../../util/toast";
	import { getReadableTextColor } from "../../util/colorContrast";
	import MatchEventCard from "../MatchEventCard.svelte";
	import NoteCard from "../NoteCard.svelte";
	import NotesPolicy from "../NotesPolicy.svelte";
	import Spinner from "../Spinner.svelte";

	interface Props {
		teamParam?: string | undefined;
	}

	let { teamParam }: Props = $props();

	const teamNames = Object.fromEntries($eventStore.teams.map((team) => [team.number, team.name]));

	let search: string = $state("");

	$effect(() => {
		if (teamParam) search = teamParam;
	});
	let typeFilter: string = $state($settingsStore.supportFeedTypeFilter ?? "all");
	let statusFilter: string = $state($settingsStore.supportFeedStatusFilter ?? "all");
	let feedFilter: string = $state($settingsStore.supportFeedFilter ?? "all");

	$effect(() => {
		$settingsStore.supportFeedFilter = feedFilter as "all" | "notes" | "events";
	});
	$effect(() => {
		$settingsStore.supportFeedTypeFilter = typeFilter as "all" | "TeamIssue" | "EventNote" | "MatchNote";
	});
	$effect(() => {
		$settingsStore.supportFeedStatusFilter = statusFilter as "all" | "Open" | "Resolved";
	});

	// Sub-event field filter for meshed events (hidden in inter-divisional playoffs mode)
	const availableSubEvents = $derived($eventStore.subEvents ?? []);
	const hasMeshedFields = $derived(
		availableSubEvents.length > 1 &&
			!$eventStore.playoffMode &&
			$userStore.eventToken === $userStore.meshedEventToken,
	);
	let selectedFields: string[] = $state(
		(() => {
			const subs = $eventStore.subEvents;
			if (!subs?.length) return [];
			const saved = $settingsStore.supportFeedSelectedFields;
			if (saved != null) {
				// Filter to only codes that still exist in this event's sub-events
				const valid = saved.filter((c) => subs.some((s) => s.code === c));
				if (valid.length > 0) return valid;
			}
			const isCombined = $userStore.eventToken === $userStore.meshedEventToken;
			return isCombined ? subs.map((e) => e.code) : [$eventStore.code];
		})(),
	);

	$effect(() => {
		$settingsStore.supportFeedSelectedFields = hasMeshedFields ? selectedFields : null;
	});

	let notes: Note[] = $state([]);
	let matchEvents: MatchEvent[] = $state([]);
	type FeedItem =
		| { kind: "note"; note: Note; date: Date }
		| { kind: "event"; matchEvent: MatchEvent; date: Date; bypassGroup?: MatchEvent[] };
	let filteredFeed: FeedItem[] = $state([]);

	let loading = $state(true);

	function buildFeed() {
		let items: FeedItem[] = [];

		// Add notes (unless filtering to events only)
		if (feedFilter !== "events") {
			let feed: Note[] = [...notes];

			// Type filter
			if (typeFilter !== "all") {
				feed = feed.filter((n) => n.note_type === typeFilter);
			}

			// Status filter
			if (statusFilter === "Open") {
				feed = feed.filter((n) => n.resolution_status === "Open");
			} else if (statusFilter === "Resolved") {
				feed = feed.filter((n) => n.resolution_status === "Resolved");
			}

			// Field filter
			if (hasMeshedFields && selectedFields.length > 0 && selectedFields.length < availableSubEvents.length) {
				feed = feed.filter((n) => selectedFields.includes(n.event_code));
			}

			// Search filter
			if (search.length > 0) {
				const tokenized = search.toLowerCase().split(" ");
				feed = feed.filter((n) => {
					const teamStr = n.team?.toString() ?? "";
					const teamName = n.team !== null ? (teamNames[n.team]?.toLowerCase() ?? "") : "";
					const assignedName = n.assigned_to?.username?.toLowerCase() ?? "";
					return tokenized.every(
						(tok) =>
							teamStr.includes(tok) ||
							teamName.includes(tok) ||
							n.text.toLowerCase().includes(tok) ||
							assignedName.includes(tok),
					);
				});
			}

			items.push(...feed.map((n) => ({ kind: "note" as const, note: n, date: n.updated_at })));
		}

		// Add match events (unless filtering to notes only)
		if (feedFilter !== "notes") {
			let evts = [...matchEvents].filter((e) => e.status === "active");

			// Field filter
			if (hasMeshedFields && selectedFields.length > 0 && selectedFields.length < availableSubEvents.length) {
				evts = evts.filter((e) => selectedFields.includes(e.event_code));
			}

			if (search.length > 0) {
				const tokenized = search.toLowerCase().split(" ");
				evts = evts.filter((e) => {
					const teamStr = e.team?.toString() ?? "";
					const teamName = e.team !== null ? (teamNames[e.team]?.toLowerCase() ?? "") : "";
					return tokenized.every(
						(tok) => teamStr.includes(tok) || teamName.includes(tok) || e.issue.toLowerCase().includes(tok),
					);
				});
			}

			items.push(
				...evts
					.filter((e) => e.issue !== "Bypassed")
					.map((e) => ({ kind: "event" as const, matchEvent: e, date: new Date(e.created_at) })),
			);

			// Consolidate bypass events by team into single cards
			const bypassByTeam = new Map<number, MatchEvent[]>();
			for (const evt of evts.filter((e) => e.issue === "Bypassed")) {
				if (evt.team !== null) {
					if (!bypassByTeam.has(evt.team)) bypassByTeam.set(evt.team, []);
					bypassByTeam.get(evt.team)!.push(evt);
				}
			}
			for (const [, teamBypasses] of bypassByTeam) {
				const sorted = [...teamBypasses].sort(
					(a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
				);
				items.push({
					kind: "event" as const,
					matchEvent: sorted[0],
					date: new Date(sorted[0].created_at),
					bypassGroup: teamBypasses.length > 1 ? teamBypasses : undefined,
				});
			}
		}

		// Sort all items together by date (most recent activity first)
		filteredFeed = items.sort((a, b) => b.date.getTime() - a.date.getTime());
	}

	$effect(() => {
		buildFeed();
	});

	async function fetchAll() {
		loading = true;
		try {
			const [fetchedNotes, fetchedEvents] = await Promise.all([
				trpc.notes.getAllWithMessages.query(),
				trpc.matchEvents.getAll.query({ status: "active" }),
			]);
			notes = fetchedNotes;
			matchEvents = fetchedEvents;
		} catch (err) {
			console.error("Failed to fetch support data:", err);
		} finally {
			loading = false;
		}
	}

	// Live updates subscription
	// How long without data before the connection is considered stale.
	// Heartbeat arrives every 30s, so 35s without data means the connection is dead.
	const STALE_THRESHOLD_MS = 35_000;
	let lastReceivedAt = 0;
	let subscriptionGeneration = 0;
	type NoteSubscription = ReturnType<typeof trpc.notes.updateSubscription.subscribe>;
	type MatchEventSubscription = ReturnType<typeof trpc.matchEvents.updateSubscription.subscribe>;
	let subscription: NoteSubscription | undefined;
	let matchEventSubscription: MatchEventSubscription | undefined;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let watchdogInterval: ReturnType<typeof setInterval> | null = null;

	async function reconnect() {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		// Claim a generation before the first await to prevent overlapping reconnects
		// (visibilitychange, onError, and watchdog can all fire simultaneously).
		const generation = ++subscriptionGeneration;
		await fetchAll();
		if (generation !== subscriptionGeneration) return; // superseded
		startSubscription();
		startMatchEventSubscription();
	}

	function startSubscription() {
		subscription?.unsubscribe();
		subscription = trpc.notes.updateSubscription.subscribe(
			{ eventToken: $userStore.eventToken, source: `${$userStore.username}.feed` },
			{
				onError: (err) => {
					console.error("Notes subscription lost, reconnecting in 5s…", err);
					reconnectTimer = setTimeout(() => reconnect(), 5000);
				},
				onData: (data: NoteUpdateEventData) => {
					lastReceivedAt = Date.now();
					if (data.kind === "heartbeat") return;
					switch (data.kind) {
						case "create":
							notes = [...notes, data.note];
							break;
						case "edit": {
							const idx = notes.findIndex((n) => n.id === data.note.id);
							if (idx !== -1) notes[idx] = data.note;
							notes = [...notes];
							break;
						}
						case "delete":
							notes = notes.filter((n) => n.id !== data.note.id);
							break;
						case "status": {
							const note = notes.find((n) => n.id === data.note_id);
							if (note) {
								note.resolution_status = data.resolution_status;
								note.resolved_by = data.resolved_by;
								note.updated_at = new Date();
							}
							notes = [...notes];
							break;
						}
						case "assign": {
							const note = notes.find((n) => n.id === data.note_id);
							if (note) {
								note.assigned_to = data.assigned_to;
								note.assigned_to_id = data.assigned_to_id;
								note.updated_at = new Date();
							}
							notes = [...notes];
							break;
						}
						case "follow": {
							const note = notes.find((n) => n.id === data.note_id);
							if (note) {
								note.followers = data.followers;
								note.updated_at = new Date();
							}
							notes = [...notes];
							break;
						}
						case "add_message": {
							const note = notes.find((n) => n.id === data.note_id);
							if (note) {
								if (!note.messages) note.messages = [];
								note.messages.push(data.message);
								note.updated_at = new Date();
							}
							notes = [...notes];
							break;
						}
						case "edit_message": {
							const note = notes.find((n) => n.id === data.note_id);
							if (note?.messages) {
								const msg = note.messages.find((m) => m.id === data.message.id);
								if (msg) {
									msg.text = data.message.text;
									msg.updated_at = data.message.updated_at;
								}
								note.updated_at = new Date();
							}
							notes = [...notes];
							break;
						}
						case "delete_message": {
							const note = notes.find((n) => n.id === data.note_id);
							if (note?.messages) {
								note.messages = note.messages.filter((m) => m.id !== data.message_id);
								note.updated_at = new Date();
							}
							notes = [...notes];
							break;
						}
					}
				},
			},
		);
	}

	function startMatchEventSubscription() {
		matchEventSubscription?.unsubscribe();
		matchEventSubscription = trpc.matchEvents.updateSubscription.subscribe(
			{ eventToken: $userStore.eventToken },
			{
				onError: (err) => {
					console.error("Match events subscription lost, reconnecting in 5s…", err);
					reconnectTimer = setTimeout(() => reconnect(), 5000);
				},
				onData: (data: MatchEventUpdateEventData) => {
					lastReceivedAt = Date.now();
					if (data.kind === "heartbeat") return;
					switch (data.kind) {
						case "match_event_create":
							matchEvents = [...matchEvents, data.matchEvent];
							break;
						case "match_event_dismiss":
							matchEvents = matchEvents.filter((e) => e.id !== data.id);
							break;
						case "match_event_convert":
							matchEvents = matchEvents.filter((e) => e.id !== data.id);
							break;
					}
				},
			},
		);
	}

	// Re-subscribe on eventToken change
	let eventToken = $userStore.eventToken;
	userStore.subscribe((value) => {
		if (value.eventToken !== eventToken) {
			eventToken = value.eventToken;
			const subs = $eventStore.subEvents;
			if (subs && subs.length > 1) {
				const isCombined = value.eventToken === value.meshedEventToken;
				if (isCombined) {
					selectedFields = subs.map((e) => e.code);
				} else {
					const matchingSub = subs.find((s) => s.token === value.eventToken);
					selectedFields = matchingSub ? [matchingSub.code] : [];
				}
			}
			fetchAll();
			startSubscription();
			startMatchEventSubscription();
		}
	});

	onMount(() => {
		fetchAll();
		startSubscription();
		startMatchEventSubscription();

		// Watchdog: detect silent SSE disconnections while the page is open.
		// The server sends a heartbeat every 30s; if >35s pass without any data, reconnect.
		watchdogInterval = setInterval(() => {
			if (document.visibilityState !== "visible") return;
			if (lastReceivedAt === 0) return; // never received data yet
			if (Date.now() - lastReceivedAt > STALE_THRESHOLD_MS) {
				console.warn("SupportFeed watchdog: connection stale, reconnecting…");
				reconnect();
			}
		}, 10_000);

		function handleVisibility() {
			if (document.visibilityState !== "visible") return;
			if (lastReceivedAt === 0) return;
			if (Date.now() - lastReceivedAt > STALE_THRESHOLD_MS) reconnect();
		}
		function handleOnline() {
			reconnect();
		}

		document.addEventListener("visibilitychange", handleVisibility);
		window.addEventListener("online", handleOnline);

		return () => {
			document.removeEventListener("visibilitychange", handleVisibility);
			window.removeEventListener("online", handleOnline);
		};
	});

	onDestroy(() => {
		subscription?.unsubscribe();
		matchEventSubscription?.unsubscribe();
		if (reconnectTimer) clearTimeout(reconnectTimer);
		if (watchdogInterval) clearInterval(watchdogInterval);
	});

	// ── Pull-to-refresh ──────────────────────────────────────────────────────
	let feedContainer: HTMLDivElement | undefined = $state();
	let pullDelta = $state(0);
	const PULL_THRESHOLD = 65;
	const MAX_PULL = 100;

	onMount(() => {
		let startY = 0;
		let pulling = false;

		function handleTouchStart(e: TouchEvent) {
			if (feedContainer && feedContainer.scrollTop === 0) {
				startY = e.touches[0].clientY;
				pulling = true;
			}
		}

		function handleTouchMove(e: TouchEvent) {
			if (!pulling) return;
			if (feedContainer && feedContainer.scrollTop > 0) {
				pulling = false;
				pullDelta = 0;
				return;
			}
			const delta = e.touches[0].clientY - startY;
			if (delta > 0) {
				pullDelta = Math.min(delta, MAX_PULL);
				e.preventDefault();
			}
		}

		function handleTouchEnd() {
			if (pullDelta >= PULL_THRESHOLD && !loading) {
				fetchAll();
			}
			pulling = false;
			pullDelta = 0;
		}

		feedContainer?.addEventListener("touchstart", handleTouchStart, { passive: true });
		feedContainer?.addEventListener("touchmove", handleTouchMove, { passive: false });
		feedContainer?.addEventListener("touchend", handleTouchEnd, { passive: true });

		return () => {
			feedContainer?.removeEventListener("touchstart", handleTouchStart);
			feedContainer?.removeEventListener("touchmove", handleTouchMove);
			feedContainer?.removeEventListener("touchend", handleTouchEnd);
		};
	});

	let filterModalOpen = $state(false);

	const activeFilterCount = $derived(
		(feedFilter !== "all" ? 1 : 0) +
			(feedFilter !== "events" && typeFilter !== "all" ? 1 : 0) +
			(feedFilter !== "events" && statusFilter !== "all" ? 1 : 0) +
			(hasMeshedFields && selectedFields.length > 0 && selectedFields.length < availableSubEvents.length ? 1 : 0),
	);

	let createModalOpen = $state(false);

	const teamOptions = $derived(
		[...$eventStore.teams]
			.sort((a, b) => parseInt(a.number) - parseInt(b.number))
			.map((v) => ({ value: parseInt(v.number), name: `${v.number} – ${v.name}` })),
	);

	let newNoteType: "TeamIssue" | "EventNote" | "MatchNote" = $state("TeamIssue");
	let newTeam: number | undefined = $state();
	let matchId: string | undefined = $state();
	let allMatchOptions: { value: string; name: string; match_number: number; play_number: number; level: string }[] =
		$state([]);
	let matchOptions: { value: string; name: string; hasLog?: boolean }[] = $state([]);
	let issueType: string | undefined = $state();
	let selectedLabel: string | undefined = $state();
	let newNoteText: string = $state("");
	let newRequestType: "CSA" | "RI" | null = $state(null);

	const ISSUE_TYPE_OPTIONS = [
		{ value: "RoboRioIssue", name: "RoboRIO Issue" },
		{ value: "DSIssue", name: "Driver Station Issue" },
		{ value: "NoRobot", name: "No Robot" },
		{ value: "RadioIssue", name: "Radio Issue" },
		{ value: "RobotPwrIssue", name: "Robot Power Issue" },
		{ value: "OtherRobotIssue", name: "Other Robot Issue" },
		{ value: "VenueIssue", name: "Venue Issue" },
		{ value: "ElectricalIssue", name: "Electrical Issue" },
		{ value: "MechanicalIssue", name: "Mechanical Issue" },
		{ value: "VolunteerIssue", name: "Volunteer Issue" },
		{ value: "Other", name: "Other" },
	];

	const QUICK_LABELS: { label: string; issueType: string }[] = [
		{ label: "Radio reboot", issueType: "RadioIssue" },
		{ label: "RIO reboot", issueType: "RoboRioIssue" },
		{ label: "Lost comms", issueType: "RadioIssue" },
		{ label: "Lost power", issueType: "RobotPwrIssue" },
		{ label: "Driver station issues", issueType: "DSIssue" },
		{ label: "Controller issues", issueType: "DSIssue" },
		{ label: "Code issues", issueType: "RoboRioIssue" },
		{ label: "CAN issues", issueType: "RoboRioIssue" },
		{ label: "Unable to drive", issueType: "OtherRobotIssue" },
		{ label: "BYPASSED - no connection", issueType: "RadioIssue" },
		{ label: "BYPASSED - no code", issueType: "RoboRioIssue" },
		{ label: "BYPASSED - no robot", issueType: "NoRobot" },
	];

	let disableSubmit = $derived.by(() => {
		if (newNoteText.length < 1) return true;
		if (newNoteType === "TeamIssue") return newTeam === undefined || newTeam === -1;
		if (newNoteType === "MatchNote") return matchId === undefined;
		return false;
	});

	async function loadAllMatches() {
		try {
			const matches = await trpc.match.getMatches.query({});
			allMatchOptions = matches.map((m: any) => {
				const levelLabel = m.level === "Qualification" ? "Qual" : m.level === "Playoff" ? "Playoff" : m.level;
				return {
					value: m.id,
					name: `${levelLabel} M${m.match_number}/${m.play_number}`,
					match_number: m.match_number,
					play_number: m.play_number,
					level: m.level,
				};
			});
		} catch {
			allMatchOptions = [];
		}
	}

	async function loadMatchesForTeam(t: number) {
		try {
			const client = trpcForTeam(t);
			const matches = await client.matchEvents.getCompletedMatchesForTeam.query({ team_number: t });
			matchOptions = matches.map((m) => ({
				value: m.match_log_id ?? `tba-${m.level}-${m.match_number}-${m.play_number}`,
				name: `${m.level} ${m.match_number}/${m.play_number}`,
				hasLog: !!m.match_log_id,
			}));
		} catch {
			matchOptions = [];
		}
	}

	$effect(() => {
		if (newNoteType === "MatchNote" && newTeam !== undefined && newTeam !== -1) {
			loadMatchesForTeam(newTeam);
		} else if (newNoteType === "TeamIssue" && newTeam !== undefined && newTeam !== -1) {
			loadMatchesForTeam(newTeam);
		} else if (newNoteType !== "MatchNote" && newNoteType !== "TeamIssue") {
			matchOptions = [];
			matchId = undefined;
			newRequestType = null;
		}
	});

	let notesPolicyElm: NotesPolicy | undefined = $state();

	function openCreateModal() {
		loadAllMatches();
		createModalOpen = true;
	}

	async function createNote(evt: SubmitEvent) {
		evt.preventDefault();
		try {
			if (!$settingsStore.acknowledgedNotesPolicy) {
				await notesPolicyElm?.confirmPolicy();
			}

			let matchDetails: { match_number?: number; play_number?: number; tournament_level?: TournamentLevel } = {};
			if (newNoteType === "MatchNote" && matchId) {
				const match = allMatchOptions.find((m) => m.value === matchId);
				if (match) {
					matchDetails = {
						match_number: match.match_number,
						play_number: match.play_number,
						tournament_level: match.level as TournamentLevel,
					};
				}
			} else if (newNoteType === "TeamIssue" && matchId) {
				const match = matchOptions.find((m) => m.value === matchId);
				if (match) {
					const parts = match.name.split(" ");
					const level = parts[0] as TournamentLevel;
					const nums = parts[1]?.split("/");
					matchDetails = {
						match_number: nums ? parseInt(nums[0]) : undefined,
						play_number: nums ? parseInt(nums[1]) : undefined,
						tournament_level: level,
					};
				}
			}

			const client = newNoteType === "TeamIssue" && newTeam != null ? trpcForTeam(newTeam) : trpc;
			const createdNote = await client.notes.create.mutate({
				team: newNoteType === "TeamIssue" ? (newTeam ?? null) : null,
				text: newNoteText,
				note_type: newNoteType,
				issue_type: newNoteType === "TeamIssue" ? (issueType ?? null) : null,
				request_type: newRequestType,
				...matchDetails,
			});
			createModalOpen = false;
			newNoteText = "";
			issueType = undefined;
			selectedLabel = undefined;
			matchId = undefined;
			newRequestType = "CSA";
			await tick();
			navigate("/notepad/view/:id", { params: { id: createdNote.id } });
		} catch (err: any) {
			toast("Error creating note", err.message);
			console.error(err);
		}
	}
</script>

<NotesPolicy bind:this={notesPolicyElm} />

<Modal bind:open={createModalOpen} size="lg" outsideclose>
	{#snippet header()}
		<h2 class="text-xl font-bold text-black dark:text-white">Create Note</h2>
	{/snippet}
	<form class="text-left flex flex-col gap-4" onsubmit={createNote}>
		<Label class="w-full text-left">
			Note Type:
			<Select
				class="mt-2"
				items={[
					{ value: "TeamIssue", name: "Team Note" },
					{ value: "EventNote", name: "Event Note" },
					{ value: "MatchNote", name: "Match Note" },
				]}
				bind:value={newNoteType}
			/>
		</Label>

		{#if newNoteType === "TeamIssue"}
			<Label class="w-full text-left">
				Select Team:
				<Select class="mt-2" items={teamOptions} bind:value={newTeam} />
			</Label>
			{#if newTeam !== undefined && newTeam !== -1 && matchOptions.length > 0}
				<Label class="w-full text-left">
					Match (optional):
					<Select
						class="mt-2"
						items={[{ value: undefined, name: "- None -" }, ...matchOptions]}
						bind:value={matchId}
					/>
				</Label>
			{/if}
		{/if}

		{#if newNoteType === "MatchNote"}
			<Label class="w-full text-left">
				Select Match:
				{#if allMatchOptions.length > 0}
					<Select class="mt-2" items={allMatchOptions} bind:value={matchId} />
				{:else}
					<p class="mt-2 text-sm text-gray-500">No matches have been played yet.</p>
				{/if}
			</Label>
		{/if}

		<Label for="new-note-text">Text:</Label>
		{#if newNoteType === "TeamIssue"}
			<div class="flex flex-wrap gap-1.5">
				{#each QUICK_LABELS as { label, issueType: itemType }}
					<button
						type="button"
						class="text-xs px-2 py-1 rounded border transition-colors
					{selectedLabel === label
							? 'border-blue-500 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
							: 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-700 dark:text-gray-300'}"
						onclick={() => {
							issueType = itemType;
							selectedLabel = label;
							const current = newNoteText.trim();
							if (!current) newNoteText = label;
							else if (!current.endsWith(label)) newNoteText = current + "\n" + label;
						}}
					>
						{label}
					</button>
				{/each}
			</div>
		{/if}
		<Textarea id="new-note-text" class="w-full" rows={5} bind:value={newNoteText} autofocus />

		{#if newNoteType === "TeamIssue"}
			<div class="flex flex-col gap-1 text-sm">
				{#each [{ value: "CSA", label: "CSA Request" }, { value: "RI", label: "RI Request" }] as opt}
					<button
						type="button"
						class="flex items-center gap-2 px-3 py-1.5 rounded border text-left transition-colors
						{newRequestType === opt.value
							? 'border-blue-500 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
							: 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-700 dark:text-gray-300'}"
						onclick={() =>
							(newRequestType = newRequestType === opt.value ? null : (opt.value as "CSA" | "RI"))}
					>
						<span
							class="size-3 rounded-full border-2 shrink-0
						{newRequestType === opt.value ? 'border-blue-500 bg-blue-500' : 'border-gray-400'}"
						></span>
						{opt.label}
					</button>
				{/each}
			</div>
		{/if}

		<Button type="submit" disabled={disableSubmit}>Create Note</Button>
	</form>
</Modal>

<div class="flex flex-col gap-2 px-1 h-full">
	<div class="flex items-center gap-2 max-w-4xl w-full mx-auto">
		<Button size="sm" color="primary" class="shrink-0 px-3" onclick={openCreateModal}>
			<Icon icon="mdi:plus" class="size-4 mr-1" />New Note
		</Button>

		<div class="relative grow">
			<Input
				class="ps-8 pe-2.5 py-1.5 h-9"
				type="text"
				placeholder="Search by Team #, Name, Text"
				bind:value={search}
			>
				{#snippet left()}
					<Icon icon="mdi:magnify" />
				{/snippet}
			</Input>
		</div>

		{#if /^\d+$/.test(search.trim())}
			<Button
				size="sm"
				color="alternative"
				class="shrink-0"
				onclick={() => navigate("/notepad/team/:team", { params: { team: search.trim() } })}
				title="View team history"
			>
				<Icon icon="mdi:history" class="size-4 mr-1" />#{search.trim()}
			</Button>
		{/if}

		<Button
			size="sm"
			color={activeFilterCount > 0 ? "primary" : "alternative"}
			class="shrink-0"
			onclick={() => (filterModalOpen = true)}
			title="Filters"
		>
			<Icon icon="mdi:filter-variant" class="size-4" />{#if activeFilterCount > 0}<span class="ml-1"
					>{activeFilterCount}</span
				>{/if}
		</Button>
	</div>

	<Modal bind:open={filterModalOpen} size="sm" outsideclose>
		{#snippet header()}
			<h2 class="text-lg font-bold text-black dark:text-white">Filters</h2>
		{/snippet}
		<div class="flex flex-col gap-4">
			<Label>
				Show
				<Select
					class="mt-1"
					bind:value={feedFilter}
					items={[
						{ value: "all", name: "Notes & Events" },
						{ value: "notes", name: "Notes only" },
						{ value: "events", name: "Auto Events only" },
					]}
				/>
			</Label>
			{#if feedFilter !== "events"}
				<Label>
					Note type
					<Select
						class="mt-1"
						bind:value={typeFilter}
						items={[
							{ value: "all", name: "All types" },
							{ value: "TeamIssue", name: "Team Notes" },
							{ value: "EventNote", name: "Event Notes" },
							{ value: "MatchNote", name: "Match Notes" },
						]}
					/>
				</Label>
				<Label>
					Status
					<Select
						class="mt-1"
						bind:value={statusFilter}
						items={[
							{ value: "all", name: "All statuses" },
							{ value: "Open", name: "Open" },
							{ value: "Resolved", name: "Resolved" },
						]}
					/>
				</Label>
			{/if}
			{#if hasMeshedFields}
				<div>
					<div class="flex items-center justify-between">
						<Label>Fields</Label>
						<button
							type="button"
							class="text-xs text-blue-400 hover:underline"
							onclick={() => {
								selectedFields =
									selectedFields.length === availableSubEvents.length
										? []
										: availableSubEvents.map((s) => s.code);
							}}
						>
							{selectedFields.length === availableSubEvents.length ? "Deselect all" : "Select all"}
						</button>
					</div>
					<div class="flex flex-wrap gap-1.5 mt-1">
						{#each availableSubEvents as sub}
							{@const isSelected = selectedFields.includes(sub.code)}
							{@const color = sub.color ?? "#6b7280"}
							{@const textColor = getReadableTextColor(color, $settingsStore.darkMode)}
							<button
								type="button"
								class="text-xs px-2 py-1 rounded border transition-colors"
								style={isSelected
									? `border-color: ${color}; background-color: ${color}1a; color: ${textColor}`
									: ""}
								class:border-gray-300={!isSelected}
								class:dark:border-gray-600={!isSelected}
								class:hover:bg-gray-100={!isSelected}
								class:dark:hover:bg-neutral-700={!isSelected}
								class:text-gray-700={!isSelected}
								class:dark:text-gray-300={!isSelected}
								onclick={() => {
									if (selectedFields.includes(sub.code)) {
										selectedFields = selectedFields.filter((s) => s !== sub.code);
									} else {
										selectedFields = [...selectedFields, sub.code];
									}
								}}
							>
								{sub.label}
							</button>
						{/each}
					</div>
					<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Also filters notifications.</p>
				</div>
			{/if}
			<Button color="primary" onclick={() => (filterModalOpen = false)}>Done</Button>
		</div>
	</Modal>

	<div class="flex flex-col grow gap-2 overflow-y-auto mt-2 pb-2" bind:this={feedContainer}>
		<!-- Pull-to-refresh indicator -->
		{#if pullDelta > 8 || loading}
			<div
				class="flex justify-center items-center transition-all duration-150 overflow-hidden"
				style="height: {loading ? 36 : Math.min(pullDelta * 0.55, 36)}px; opacity: {loading
					? 1
					: Math.min(pullDelta / PULL_THRESHOLD, 1)}"
			>
				<div class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
					<Icon
						icon="charm:refresh"
						class="size-4 {loading ? 'animate-spin' : ''}"
						style={loading ? "" : `transform: rotate(${(pullDelta / PULL_THRESHOLD) * 180}deg)`}
					/>
					<span
						>{loading
							? "Refreshing…"
							: pullDelta >= PULL_THRESHOLD
								? "Release to refresh"
								: "Pull to refresh"}</span
					>
				</div>
			</div>
		{/if}
		{#if loading}
			<Spinner />
		{:else if filteredFeed.length === 0}
			<div class="text-center text-gray-500 dark:text-gray-400 mt-8">No items found</div>
		{:else}
			{#each filteredFeed as item}
				{#if item.kind === "note"}
					<NoteCard note={item.note} />
				{:else}
					<MatchEventCard
						matchEvent={item.matchEvent}
						bypassGroup={item.bypassGroup}
						onDismiss={(id) => {
							matchEvents = matchEvents.filter((e) => e.id !== id);
						}}
						onConvert={(id) => {
							matchEvents = matchEvents.filter((e) => e.id !== id);
						}}
					/>
				{/if}
			{/each}
		{/if}
	</div>
</div>
