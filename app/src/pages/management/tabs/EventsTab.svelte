<script lang="ts">
	import { Badge, Button, Card, Modal } from "flowbite-svelte";
	import { onMount, type ComponentProps } from "svelte";
	import type { EventState } from "../../../../../src/router/field-monitor";
	import type { AdminExtensionEntry, EventIntegrationStatus } from "../../../../../shared/types";
	import EventIntegrations from "../../../components/management/EventIntegrations.svelte";
	import EventExtensionSwitch from "../../../components/management/EventExtensionSwitch.svelte";
	import ExtensionConfigModal from "../../../components/management/ExtensionConfigModal.svelte";
	import ExtensionRow from "../../../components/management/ExtensionRow.svelte";
	import { trpc } from "../../../main";
	import { userStore } from "../../../stores/user";

	let subscription: ReturnType<typeof trpc.field.management.subscribe> | null = null;

	let events: EventState[] = $state([]);
	let hearts: { [k: string]: boolean } = $state({});

	type EventUserEntry = { id: number; username: string; role: string };
	let eventUsers: Record<string, EventUserEntry[]> = $state({});
	let eventNoteCount: Record<string, number> = $state({});

	let extensions: AdminExtensionEntry[] = $state([]);
	let extensionsLoaded = $state(false);
	let offEvents: { code: string; name: string }[] = $state([]);
	let integrations: Record<string, EventIntegrationStatus> = $state({});
	let seasonEvents: { code: string; name: string }[] = $state([]);
	let error = $state("");
	let busy: Record<string, boolean> = $state({});

	let configExt: AdminExtensionEntry | null = $state(null);

	type Confirm =
		| { kind: "event-off"; code: string; name: string }
		| { kind: "ext-disable"; ext: AdminExtensionEntry; where: string; name: string };
	let confirm: Confirm | null = $state(null);
	let confirmOpen = $state(false);

	function fail(what: string, err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("[Management]", what, err);
		error = `${what}: ${msg}`;
	}

	async function loadExtensions() {
		try {
			extensions = await trpc.admin.listExtensions.query();
			error = "";
		} catch (err) {
			fail("Extensions failed", err);
		} finally {
			extensionsLoaded = true;
		}
	}

	async function loadIntegrations() {
		try {
			integrations = await trpc.admin.getEventIntegrations.query();
		} catch (err) {
			fail("Integrations failed", err);
		}
	}

	async function loadOffEvents() {
		try {
			offEvents = await trpc.admin.listEventsWithExtensionsOff.query();
		} catch (err) {
			fail("Switches failed", err);
		}
	}

	onMount(() => {
		// The server refuses the live-events feed to non-admins; do not show an empty list as if nothing is live.
		if (!$userStore.admin) return;
		subscription = trpc.field.management.subscribe(
			{ token: $userStore.token },
			{
				onData: (data) => {
					hearts[data.code] = true;
					setTimeout(() => {
						hearts[data.code] = false;
					}, 250);
					let idx = events.findIndex((e) => e.code === data.code);
					if (idx >= 0) {
						events[idx] = { ...events[idx], ...data };
					} else {
						events.push(data);
					}
					events = events.sort((a, b) => {
						if (b.match !== a.match) return b.match - a.match;
						return a.code.localeCompare(b.code);
					});
				},
				onError: (err) => fail("Live events failed", err),
			},
		);

		let timer: ReturnType<typeof setInterval> | null = null;
		if ($userStore.admin) {
			trpc.event.getAllWithUsers
				.query()
				.then((users) => {
					eventUsers = Object.fromEntries(users.map((e) => [e.code, e.users]));
					eventNoteCount = Object.fromEntries(users.map((e) => [e.code, e.noteCount]));
				})
				.catch((err) => fail("Users failed", err));
			trpc.admin.getSeasonEventCodes
				.query()
				.then((rows) => (seasonEvents = rows))
				.catch((err) => fail("Events failed", err));
			loadOffEvents();
			loadExtensions();
			loadIntegrations();
			timer = setInterval(() => {
				loadExtensions();
				loadIntegrations();
			}, 15_000);
		}

		return () => {
			repollTimers.forEach(clearTimeout);
			subscription?.unsubscribe();
			subscription = null;
			if (timer) clearInterval(timer);
		};
	});

	const FieldStates: Record<number, string> = {
		0: "Unknown",
		1: "Match Running Teleop",
		2: "Match Transitioning",
		3: "Match Running Auto",
		4: "Match Ready",
		5: "Prestart Completed",
		6: "Prestart Initiated",
		7: "Ready to Prestart",
		8: "Match Aborted",
		9: "Match Over",
		10: "Ready for Post Result",
		11: "Match Not Ready",
	};

	const fieldStateBadgeColor: Record<number, ComponentProps<typeof Badge>["color"]> = {
		1: "green",
		3: "green",
		4: "blue",
		5: "blue",
		6: "yellow",
		7: "yellow",
		8: "red",
		9: "purple",
		10: "indigo",
	};

	const roleColors: Record<string, ComponentProps<typeof Badge>["color"]> = {
		FTA: "blue",
		FTAA: "green",
		CSA: "yellow",
		RI: "purple",
	};

	const key = (code: string) => code.toLowerCase();

	let offCodes = $derived(new Set(offEvents.map((e) => key(e.code))));
	let liveCodes = $derived(new Set(events.map((e) => key(e.code))));

	function byPresence(a: AdminExtensionEntry, b: AdminExtensionEntry) {
		if (a.online !== b.online) return a.online ? -1 : 1;
		return b.lastSeen - a.lastSeen;
	}

	function forEvent(code: string) {
		return extensions.filter((x) => x.eventCode && key(x.eventCode) === key(code)).sort(byPresence);
	}

	let otherExtensions = $derived(
		extensions.filter((x) => !(x.eventCode && liveCodes.has(key(x.eventCode)))).sort(byPresence),
	);
	let otherOffEvents = $derived(offEvents.filter((e) => !liveCodes.has(key(e.code))));

	// #region Actions

	// After a change the extension picks it up on its next heartbeat, so look again
	// at 2 s and 5 s instead of waiting for the 15 s poll.
	let repollTimers: ReturnType<typeof setTimeout>[] = [];
	function repoll() {
		repollTimers.forEach(clearTimeout);
		repollTimers = [2000, 5000].map((ms) => setTimeout(loadExtensions, ms));
	}

	function eventName(code: string): string {
		const k = key(code);
		return (
			events.find((e) => key(e.code) === k)?.name ||
			offEvents.find((e) => key(e.code) === k)?.name ||
			seasonEvents.find((e) => key(e.code) === k)?.name ||
			""
		);
	}

	async function setEventEnabled(code: string, enabled: boolean) {
		const k = `event:${key(code)}`;
		busy[k] = true;
		try {
			await trpc.admin.setEventExtensionEnabled.mutate({ eventCode: key(code), enabled });
			await Promise.all([loadOffEvents(), loadExtensions()]);
			repoll();
		} catch (err) {
			fail(`Switch ${code.toUpperCase()} failed`, err);
		} finally {
			busy[k] = false;
		}
	}

	function requestEventSwitch(code: string, name: string, next: boolean) {
		if (next) {
			setEventEnabled(code, true);
			return;
		}
		confirm = { kind: "event-off", code, name };
		confirmOpen = true;
	}

	async function setExtEnabled(ext: AdminExtensionEntry, enabled: boolean) {
		busy[ext.id] = true;
		try {
			await trpc.admin.setExtensionConfig.mutate({ extensionId: ext.id, config: { enabled } });
			await loadExtensions();
			repoll();
		} catch (err) {
			fail("Extension change failed", err);
		} finally {
			busy[ext.id] = false;
		}
	}

	function requestExtToggle(ext: AdminExtensionEntry, enable: boolean) {
		if (enable) {
			setExtEnabled(ext, true);
			return;
		}
		const code = ext.eventCode ?? ext.reportedEventCode ?? "";
		confirm = { kind: "ext-disable", ext, where: code.toUpperCase(), name: code ? eventName(code) : "" };
		confirmOpen = true;
	}

	function runConfirm() {
		const c = confirm;
		confirmOpen = false;
		if (!c) return;
		if (c.kind === "event-off") setEventEnabled(c.code, false);
		else setExtEnabled(c.ext, false);
	}

	// #endregion
</script>

{#snippet extList(list: AdminExtensionEntry[], showEvent: boolean)}
	<div class="flex flex-col gap-2">
		{#each list as ext (ext.id)}
			<ExtensionRow
				{ext}
				{showEvent}
				busy={busy[ext.id]}
				onconfig={(x) => (configExt = x)}
				ontoggle={requestExtToggle}
			/>
		{/each}
	</div>
{/snippet}

{#if !$userStore.admin}
	<p role="alert" class="text-sm text-gray-500 text-center py-8">Admins only</p>
{:else}
	<div class="flex flex-col gap-6">
		{#if error}
			<p role="alert" class="text-sm text-red-600 dark:text-red-400 break-words">{error}</p>
		{/if}

		<section>
			<h2 class="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3 text-left">
				Live events
				<span class="ml-2 text-sm font-normal text-gray-500">({events.length})</span>
			</h2>
			<div class="flex flex-col gap-3">
				{#each events as event (event.code)}
					{@const off = offCodes.has(key(event.code))}
					{@const exts = forEvent(event.code)}
					<Card
						class="p-4 flex flex-col gap-3 w-full max-w-none {off
							? 'border-red-400 dark:border-red-700'
							: ''}"
					>
						<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
							<div class="flex items-center gap-2">
								<div
									class="w-2 h-2 rounded-full {hearts[event.code]
										? 'bg-green-500'
										: 'bg-gray-300'} transition-colors"
								></div>
								<span class="font-semibold text-gray-800 dark:text-gray-100"
									>{event.code.toUpperCase()}</span
								>
							</div>
							{#if event.name}
								<span class="text-sm text-gray-500">{event.name}</span>
							{/if}
							<Badge color={fieldStateBadgeColor[event.field] ?? "gray"} class="text-xs">
								{FieldStates[event.field] ?? "Unknown"}
							</Badge>
							{#if event.level && event.match}
								<span class="text-xs text-gray-500">{event.level} Match {event.match}</span>
							{/if}
							<div class="sm:ml-auto">
								{#if $userStore.admin}
									<EventExtensionSwitch
										on={!off}
										busy={busy[`event:${key(event.code)}`]}
										label="Extensions {event.code.toUpperCase()}"
										ontoggle={(next) => requestEventSwitch(event.code, event.name, next)}
									/>
								{/if}
							</div>
						</div>

						<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
							{#if event.clients.length > 0}
								<span>{event.clients.length} client{event.clients.length !== 1 ? "s" : ""}</span>
							{/if}
							{#if eventNoteCount[event.code]}
								<span
									>{eventNoteCount[event.code]} note{eventNoteCount[event.code] !== 1
										? "s"
										: ""}</span
								>
							{/if}
							{#each eventUsers[event.code] ?? [] as u}
								<Badge color={roleColors[u.role] ?? "gray"} class="text-xs">{u.username}</Badge>
							{/each}
						</div>

						{#if $userStore.admin}
							<EventIntegrations status={integrations[key(event.code)]} />
							{#if exts.length > 0}
								{@render extList(exts, false)}
							{:else if extensionsLoaded}
								<p class="text-xs text-gray-400">No extensions</p>
							{/if}
						{/if}
					</Card>
				{/each}

				{#if events.length === 0}
					<p class="text-gray-500 text-center py-8">No live events</p>
				{/if}
			</div>
		</section>

		{#if $userStore.admin}
			{#if otherOffEvents.length > 0}
				<section>
					<h2 class="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3 text-left">
						Extensions off
					</h2>
					<div class="flex flex-col gap-2">
						{#each otherOffEvents as e (e.code)}
							<Card
								class="p-3 w-full max-w-none flex-row flex-wrap items-center gap-x-3 gap-y-2 border-red-400 dark:border-red-700"
							>
								<span class="font-semibold text-gray-800 dark:text-gray-100"
									>{e.code.toUpperCase()}</span
								>
								{#if e.name}<span class="text-sm text-gray-500">{e.name}</span>{/if}
								<div class="sm:ml-auto">
									<EventExtensionSwitch
										on={false}
										busy={busy[`event:${key(e.code)}`]}
										label="Extensions {e.code.toUpperCase()}"
										ontoggle={(next) => requestEventSwitch(e.code, e.name, next)}
									/>
								</div>
								<div class="w-full"><EventIntegrations status={integrations[key(e.code)]} /></div>
							</Card>
						{/each}
					</div>
				</section>
			{/if}

			<section>
				<h2 class="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3 text-left">
					Other extensions
					<span class="ml-2 text-sm font-normal text-gray-500">({otherExtensions.length})</span>
				</h2>
				{#if otherExtensions.length > 0}
					{@render extList(otherExtensions, true)}
				{:else if extensionsLoaded}
					<p class="text-gray-500 text-sm">No extensions</p>
				{/if}
			</section>
		{/if}
	</div>
{/if}

<ExtensionConfigModal bind:ext={configExt} />

<Modal
	title={confirm?.kind === "event-off" ? "Switch off extensions" : "Disable extension"}
	bind:open={confirmOpen}
	outsideclose
	size="sm"
>
	{#if confirm?.kind === "event-off"}
		<p class="text-sm text-gray-700 dark:text-gray-300">
			{confirm.code.toUpperCase()}{confirm.name ? `, ${confirm.name}` : ""}
		</p>
		<p class="text-sm text-red-600 dark:text-red-400">Field data stops</p>
	{:else if confirm?.kind === "ext-disable"}
		{#if confirm.where}
			<p class="text-sm text-gray-700 dark:text-gray-300">
				{confirm.where}{confirm.name ? `, ${confirm.name}` : ""}
			</p>
		{/if}
		<p class="text-sm text-gray-700 dark:text-gray-300 font-mono break-all">{confirm.ext.id}</p>
		{#if confirm.ext.legacy}
			<p class="text-sm text-red-600 dark:text-red-400">Local re-enable only</p>
		{/if}
	{/if}
	{#snippet footer()}
		<div class="flex gap-2">
			<Button color="red" onclick={runConfirm}>{confirm?.kind === "event-off" ? "Switch off" : "Disable"}</Button>
			<Button color="alternative" onclick={() => (confirmOpen = false)}>Cancel</Button>
		</div>
	{/snippet}
</Modal>
