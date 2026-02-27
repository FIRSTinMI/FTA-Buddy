<script lang="ts">
	import { Badge, Button, Card, Input, Label, Select, Textarea } from "flowbite-svelte";
	import { onMount } from "svelte";
	import type { NoteContext, NotificationContext } from "../../../../shared/notifications";
	import { buildNotification } from "../../../../shared/notifications";
	import type { TournamentLevel } from "../../../../shared/types";
	import { trpc } from "../../main";
	import { navigate } from "../../router";
	import { settingsStore } from "../../stores/settings";
	import { userStore } from "../../stores/user";
	import { toast } from "../../util/toast";

	// ── Guard: dev mode + admin only ──────────────────────────────────────────
	onMount(() => {
		if (!$settingsStore.developerMode || !$userStore.admin) {
			navigate("/manage");
		}
	});

	// ── Notification kind selector ────────────────────────────────────────────
	const ALL_KINDS: NotificationContext["kind"][] = [
		"note.created",
		"note.message",
		"note.statusChanged",
		"note.assigned",
		"note.assignedToYou",
		"note.unassigned",
		"note.unassignedFromYou",
		"event.general",
		"robot.warning",
	];

	const KIND_LABELS: Record<NotificationContext["kind"], string> = {
		"note.created": "Note Created",
		"note.message": "Note Message",
		"note.statusChanged": "Note Status Changed",
		"note.assigned": "Note Assigned (broadcast)",
		"note.assignedToYou": "Note Assigned (to you)",
		"note.unassigned": "Note Unassigned (broadcast)",
		"note.unassignedFromYou": "Note Unassigned (from you)",
		"event.general": "Event General",
		"robot.warning": "Robot Warning",
	};

	const URGENCY_COLOR: Record<string, string> = {
		low: "green",
		normal: "blue",
		high: "red",
	};

	// ── Shared note fields ────────────────────────────────────────────────────
	let kind = $state<NotificationContext["kind"]>("note.created");
	let team = $state("226");
	let noteType = $state<NoteContext["noteType"]>("TeamIssue");
	let text = $state("Radio link drops after enable; check radio programming");
	let matchNum = $state("32");
	let playNum = $state("");
	let level = $state<string>("Qualification");
	let noteId = $state("preview-note-id-demo");

	// ── Kind-specific fields ──────────────────────────────────────────────────
	let author = $state("Filip");
	let actor = $state("Filip");
	let assignee = $state("Jordan");
	let newStatus = $state<"Open" | "Resolved">("Resolved");
	let messageText = $state("Looks like a DHCP issue, rebooting radio now");
	let station = $state("R2");
	let robotTeam = $state("3655");
	let warning = $state("Packet loss 18% • RSSI -72dBm");
	let generalTitle = $state("Event Update");
	let generalBody = $state("FTA meeting in 5 minutes at scoring table");

	// ── State display ─────────────────────────────────────────────────────────
	let sendingPush = $state(false);
	let pushResult = $state<string | null>(null);

	// ── Computed ──────────────────────────────────────────────────────────────
	function noteCtx(): NoteContext {
		return {
			noteId,
			team: team ? parseInt(team) : null,
			noteType,
			text,
			matchNumber: matchNum ? parseInt(matchNum) : null,
			playNumber: playNum ? parseInt(playNum) : null,
			tournamentLevel: (level || null) as TournamentLevel | null,
		};
	}

	function buildCtx(): NotificationContext {
		switch (kind) {
			case "note.created":
				return { kind, note: noteCtx(), author };
			case "note.message":
				return { kind, note: noteCtx(), author, messageText };
			case "note.statusChanged":
				return { kind, note: noteCtx(), newStatus, actor };
			case "note.assigned":
				return { kind, note: noteCtx(), assignee, actor };
			case "note.assignedToYou":
				return { kind, note: noteCtx(), actor };
			case "note.unassigned":
				return { kind, note: noteCtx(), actor };
			case "note.unassignedFromYou":
				return { kind, note: noteCtx(), actor };
			case "event.general":
				return { kind, title: generalTitle, body: generalBody };
			case "robot.warning":
				return { kind, station, team: robotTeam ? parseInt(robotTeam) : null, warning };
			default:
				return { kind: "event.general", title: "Unknown", body: "" };
		}
	}

	let payload = $derived(buildNotification(buildCtx()));

	const noteKinds = ALL_KINDS.filter((k) => k.startsWith("note."));
	const otherKinds = ALL_KINDS.filter((k) => !k.startsWith("note."));

	function triggerToast() {
		toast(payload.title, payload.body ?? "(no body)", "blue-500");
	}

	async function triggerPush() {
		sendingPush = true;
		pushResult = null;
		try {
			const result = await trpc.event.notification.query({
				eventToken: $userStore.eventToken ?? "",
				notification: {
					title: payload.title,
					body: payload.body,
					topic: payload.topic,
					tag: payload.tag,
					kind: payload.kind,
					urgency: payload.urgency,
					data: payload.data,
				},
			});
			pushResult = `Sent to ${(result as any)?.sent ?? "?"} device(s)`;
		} catch (e: any) {
			pushResult = `Error: ${e.message}`;
		} finally {
			sendingPush = false;
		}
	}
</script>

<div class="container max-w-4xl mx-auto px-4 pt-4 pb-8 flex flex-col gap-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Notification Preview</h1>
		<Button size="sm" color="light" onclick={() => navigate("/manage")}>← Back</Button>
	</div>

	<!-- Kind selector -->
	<Card>
		<h2 class="text-lg font-semibold mb-3">Notification Kind</h2>
		<div class="flex flex-wrap gap-2">
			{#each ALL_KINDS as k}
				<button
					class="px-3 py-1.5 rounded text-sm font-medium border transition-colors
						{kind === k
						? 'bg-blue-600 text-white border-blue-600'
						: 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-blue-400'}"
					onclick={() => (kind = k)}
				>
					{KIND_LABELS[k]}
				</button>
			{/each}
		</div>
	</Card>

	<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
		<!-- Context inputs -->
		<Card>
			<h2 class="text-lg font-semibold mb-3">Context</h2>
			<div class="flex flex-col gap-3">
				<!-- Note fields (shown for all note.* kinds) -->
				{#if kind.startsWith("note.")}
					<div class="grid grid-cols-2 gap-3">
						<div>
							<Label class="mb-1 text-xs">Team # (blank = event/match note)</Label>
							<Input size="sm" bind:value={team} placeholder="226" />
						</div>
						<div>
							<Label class="mb-1 text-xs">Note Type</Label>
							<Select
								size="sm"
								bind:value={noteType}
								items={[
									{ value: "TeamIssue", name: "TeamIssue" },
									{ value: "EventNote", name: "EventNote" },
									{ value: "MatchNote", name: "MatchNote" },
								]}
							/>
						</div>
					</div>

					<div>
						<Label class="mb-1 text-xs">Note Text</Label>
						<Textarea rows={2} bind:value={text} />
					</div>

					<div class="grid grid-cols-3 gap-3">
						<div>
							<Label class="mb-1 text-xs">Level</Label>
							<Select
								size="sm"
								bind:value={level}
								items={[
									{ value: "", name: "(none)" },
									{ value: "Practice", name: "Practice" },
									{ value: "Qualification", name: "Qual" },
									{ value: "Playoff", name: "Playoff" },
								]}
							/>
						</div>
						<div>
							<Label class="mb-1 text-xs">Match #</Label>
							<Input size="sm" bind:value={matchNum} placeholder="32" />
						</div>
						<div>
							<Label class="mb-1 text-xs">Play #</Label>
							<Input size="sm" bind:value={playNum} placeholder="1" />
						</div>
					</div>

					<div>
						<Label class="mb-1 text-xs">Note ID (for deep link)</Label>
						<Input size="sm" bind:value={noteId} />
					</div>
				{/if}

				<!-- note.created / note.message: author -->
				{#if kind === "note.created" || kind === "note.message"}
					<div>
						<Label class="mb-1 text-xs">Author</Label>
						<Input size="sm" bind:value={author} placeholder="Filip" />
					</div>
				{/if}

				<!-- note.message: message text -->
				{#if kind === "note.message"}
					<div>
						<Label class="mb-1 text-xs">Message Text</Label>
						<Textarea rows={2} bind:value={messageText} />
					</div>
				{/if}

				<!-- statusChanged -->
				{#if kind === "note.statusChanged"}
					<div class="grid grid-cols-2 gap-3">
						<div>
							<Label class="mb-1 text-xs">New Status</Label>
							<Select
								size="sm"
								bind:value={newStatus}
								items={[
									{ value: "Open", name: "Open (Reopened)" },
									{ value: "Resolved", name: "Resolved" },
								]}
							/>
						</div>
						<div>
							<Label class="mb-1 text-xs">Actor (who changed it)</Label>
							<Input size="sm" bind:value={actor} placeholder="Filip" />
						</div>
					</div>
				{/if}

				<!-- assigned (broadcast) -->
				{#if kind === "note.assigned"}
					<div class="grid grid-cols-2 gap-3">
						<div>
							<Label class="mb-1 text-xs">Assignee</Label>
							<Input size="sm" bind:value={assignee} placeholder="Jordan" />
						</div>
						<div>
							<Label class="mb-1 text-xs">Actor (who assigned)</Label>
							<Input size="sm" bind:value={actor} placeholder="Filip" />
						</div>
					</div>
				{/if}

				<!-- assignedToYou / unassigned / unassignedFromYou -->
				{#if kind === "note.assignedToYou" || kind === "note.unassigned" || kind === "note.unassignedFromYou"}
					<div>
						<Label class="mb-1 text-xs">Actor</Label>
						<Input size="sm" bind:value={actor} placeholder="Filip" />
					</div>
				{/if}

				<!-- event.general -->
				{#if kind === "event.general"}
					<div>
						<Label class="mb-1 text-xs">Title</Label>
						<Input size="sm" bind:value={generalTitle} />
					</div>
					<div>
						<Label class="mb-1 text-xs">Body</Label>
						<Textarea rows={2} bind:value={generalBody} />
					</div>
				{/if}

				<!-- robot.warning -->
				{#if kind === "robot.warning"}
					<div class="grid grid-cols-2 gap-3">
						<div>
							<Label class="mb-1 text-xs">Station (e.g. R2)</Label>
							<Input size="sm" bind:value={station} placeholder="R2" />
						</div>
						<div>
							<Label class="mb-1 text-xs">Team # (blank for station only)</Label>
							<Input size="sm" bind:value={robotTeam} placeholder="3655" />
						</div>
					</div>
					<div>
						<Label class="mb-1 text-xs">Warning message</Label>
						<Textarea rows={2} bind:value={warning} />
					</div>
				{/if}
			</div>
		</Card>

		<!-- Rendered preview -->
		<div class="flex flex-col gap-4">
			<Card class="flex flex-col gap-3">
				<div class="flex items-center justify-between">
					<h2 class="text-lg font-semibold">Rendered Payload</h2>
					<Badge color={URGENCY_COLOR[payload.urgency ?? "normal"] as any}>
						{payload.urgency ?? "normal"}
					</Badge>
				</div>

				<!-- Browser notification mock -->
				<div class="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900">
					<div class="flex items-start gap-2">
						<img src="/icon192_rounded.png" alt="icon" class="w-8 h-8 rounded mt-0.5 shrink-0" />
						<div class="min-w-0">
							<p class="font-semibold text-sm leading-tight truncate">{payload.title}</p>
							{#if payload.body}
								<p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug line-clamp-2">
									{payload.body}
								</p>
							{/if}
							<p class="text-xs text-gray-400 mt-1">FTA Buddy</p>
						</div>
					</div>
				</div>

				<!-- Field table -->
				<table class="w-full text-xs">
					<tbody>
						{#each [["title", payload.title], ["body", payload.body ?? "—"], ["tag", payload.tag ?? "—"], ["topic", payload.topic], ["id", payload.id], ["url", payload.data?.page || "(root)"], ["note_id", payload.data?.note_id ?? "—"]] as [label, val]}
							<tr class="border-b border-gray-100 dark:border-gray-700">
								<td class="py-1.5 pr-3 font-mono text-gray-500 font-medium whitespace-nowrap"
									>{label}</td
								>
								<td class="py-1.5 font-mono break-all text-gray-800 dark:text-gray-200">{val}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</Card>

			<!-- Actions -->
			<Card>
				<h2 class="text-lg font-semibold mb-3">Actions</h2>
				<div class="flex flex-col gap-2">
					<Button color="blue" onclick={triggerToast}>Show as In-App Toast</Button>

					<Button color="purple" disabled={sendingPush} onclick={triggerPush}>
						{sendingPush ? "Sending…" : "Send Test Push (all event users)"}
					</Button>

					{#if pushResult}
						<p
							class="text-sm text-center {pushResult.startsWith('Error')
								? 'text-red-500'
								: 'text-green-600'}"
						>
							{pushResult}
						</p>
					{/if}

					<p class="text-xs text-gray-400 text-center mt-1">
						The toast shows this payload exactly. The push sends a test push via the server (current event
						users).
					</p>
				</div>
			</Card>
		</div>
	</div>

	<!-- Raw JSON -->
	<Card>
		<details>
			<summary class="cursor-pointer text-sm font-medium text-gray-600 dark:text-gray-400">
				Raw JSON payload
			</summary>
			<pre class="mt-2 text-xs overflow-auto bg-gray-50 dark:bg-gray-900 rounded p-3 max-h-64">{JSON.stringify(
					payload,
					null,
					2,
				)}</pre>
		</details>
	</Card>
</div>
