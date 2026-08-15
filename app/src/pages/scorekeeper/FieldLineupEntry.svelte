<script lang="ts">
	import { Button } from "flowbite-svelte";
	import Icon from "@iconify/svelte";
	import { onDestroy, onMount } from "svelte";
	import { frameHandler, subscribeToFieldMonitor } from "../../field-monitor";
	import { trpc } from "../../main";
	import { eventStore } from "../../stores/event";

	// Live match from the field monitor.
	let monitorFrame = $state(frameHandler.getFrame());
	function onFrame(evt: Event) {
		monitorFrame = (evt as CustomEvent).detail.frame;
	}

	// Manual "test match" override for entering a lineup before FMS prestarts it.
	let testMode = $state(false);

	// The match we're entering a lineup for. Test = Practice / match 999.
	const target = $derived.by(() => {
		if (testMode) return { level: "Practice" as const, match: 999, play: 1 };
		const f = monitorFrame;
		if (f && f.level === "Practice" && f.match) return { level: "Practice" as const, match: f.match, play: f.play || 1 };
		return null;
	});
	const isTest = $derived(target?.match === 999);

	// Team name lookup.
	let teamNames = $derived.by(() => {
		const map: Record<string, string> = {};
		for (const t of $eventStore.teams ?? []) map[String(t.number)] = t.name ?? "";
		return map;
	});
	function teamName(v: string): string {
		const n = parseInt(v, 10);
		if (!Number.isFinite(n) || n <= 0) return "";
		return (teamNames[String(n)] ?? "").slice(0, 18);
	}

	// Six station inputs (blank = no robot in that station).
	let b1 = $state("");
	let b2 = $state("");
	let b3 = $state("");
	let r1 = $state("");
	let r2 = $state("");
	let r3 = $state("");
	function toTeam(v: string): number | null {
		const n = parseInt(v, 10);
		return Number.isFinite(n) && n > 0 ? n : null;
	}

	let syncState = $state<"idle" | "saving" | "saved" | "error">("idle");
	let loadedKey = $state<string | null>(null);

	// Load the stored lineup (or prefill from the schedule for a scheduled practice
	// match) whenever the target match changes.
	async function loadTarget() {
		const t = target;
		if (!t) {
			loadedKey = null;
			return;
		}
		const key = `${t.level}:${t.match}:${t.play}`;
		if (key === loadedKey) return;
		loadedKey = key;
		try {
			const stored = await trpc.scorekeeper.fieldLineup.forMatch.query({
				level: t.level,
				matchNumber: t.match,
				playNumber: t.play,
			});
			if (stored) {
				b1 = String(stored.blue1_team ?? "");
				b2 = String(stored.blue2_team ?? "");
				b3 = String(stored.blue3_team ?? "");
				r1 = String(stored.red1_team ?? "");
				r2 = String(stored.red2_team ?? "");
				r3 = String(stored.red3_team ?? "");
				return;
			}
			// No stored lineup: prefill a scheduled practice match from the schedule.
			if (!isTest) {
				const cycle = await trpc.cycles.getCycleData.query({ eventCode: $eventStore.code });
				const sched = cycle?.scheduleDetails?.matches?.find(
					(m) => m.level === t.level && m.match === t.match,
				);
				b1 = String(sched?.blue?.[0] ?? "");
				b2 = String(sched?.blue?.[1] ?? "");
				b3 = String(sched?.blue?.[2] ?? "");
				r1 = String(sched?.red?.[0] ?? "");
				r2 = String(sched?.red?.[1] ?? "");
				r3 = String(sched?.red?.[2] ?? "");
			} else {
				b1 = b2 = b3 = r1 = r2 = r3 = "";
			}
		} catch (err) {
			console.error("[field-lineup] load failed:", err);
		}
	}
	$effect(() => {
		target;
		loadTarget();
	});

	// Each station saves on its own column (fieldLineup.setStation) so a red-side
	// and a blue-side volunteer can enter at the same time without clobbering each
	// other. Debounce per station, and track which cells have an unsaved edit in
	// flight so a live update from the other person can't stomp them.
	const cellKey = (color: "red" | "blue", station: 1 | 2 | 3) => `${color}${station}`;
	let saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
	const pending = new Set<string>();
	function editStation(color: "red" | "blue", station: 1 | 2 | 3, value: string) {
		const key = cellKey(color, station);
		pending.add(key);
		syncState = "saving";
		clearTimeout(saveTimers[key]);
		saveTimers[key] = setTimeout(() => saveStation(color, station, value), 500);
	}
	async function saveStation(color: "red" | "blue", station: 1 | 2 | 3, value: string) {
		const t = target;
		if (!t) return;
		const key = cellKey(color, station);
		try {
			await trpc.scorekeeper.fieldLineup.setStation.mutate({
				level: t.level,
				matchNumber: t.match,
				playNumber: t.play,
				color,
				station,
				team: toTeam(value),
			});
			pending.delete(key);
			syncState = pending.size === 0 ? "saved" : "saving";
		} catch (err) {
			console.error("[field-lineup] save failed:", err);
			syncState = "error";
		}
	}

	// Live-merge the other volunteer's entries. Pull the stored row and update any
	// cell the local user is not actively editing (not focused, no save in flight),
	// so red sees blue fill in and vice versa.
	function applyIfIdle(id: string, key: string, get: () => string, set: (v: string) => void, team: number | null) {
		if (pending.has(key)) return;
		if (document.activeElement === document.getElementById(id)) return;
		const next = String(team ?? "");
		if (get() !== next) set(next);
	}
	async function mergeRemote() {
		const t = target;
		if (!t) return;
		try {
			const stored = await trpc.scorekeeper.fieldLineup.forMatch.query({
				level: t.level,
				matchNumber: t.match,
				playNumber: t.play,
			});
			if (!stored) return;
			applyIfIdle("fl-b1", "blue1", () => b1, (v) => (b1 = v), stored.blue1_team);
			applyIfIdle("fl-b2", "blue2", () => b2, (v) => (b2 = v), stored.blue2_team);
			applyIfIdle("fl-b3", "blue3", () => b3, (v) => (b3 = v), stored.blue3_team);
			applyIfIdle("fl-r1", "red1", () => r1, (v) => (r1 = v), stored.red1_team);
			applyIfIdle("fl-r2", "red2", () => r2, (v) => (r2 = v), stored.red2_team);
			applyIfIdle("fl-r3", "red3", () => r3, (v) => (r3 = v), stored.red3_team);
		} catch (err) {
			console.error("[field-lineup] merge failed:", err);
		}
	}

	let fieldSub: { unsubscribe: () => void } | undefined;
	onMount(() => {
		if (!frameHandler.getFrame()) subscribeToFieldMonitor();
		frameHandler.addEventListener("frame", onFrame);
		fieldSub = trpc.scorekeeper.fieldLineup.subscribe.subscribe(undefined, {
			onData: (u) => {
				const t = target;
				if (!t || u.level !== t.level || u.matchNumber !== t.match || u.playNumber !== t.play) return;
				mergeRemote();
			},
			onError: (err) => console.warn("[field-lineup] sub error:", err),
		});
	});
	onDestroy(() => {
		frameHandler.removeEventListener("frame", onFrame);
		for (const timer of Object.values(saveTimers)) clearTimeout(timer);
		fieldSub?.unsubscribe();
	});

	const bigInput =
		"w-full rounded-lg border-2 bg-white dark:bg-neutral-800 px-2 py-4 text-center text-4xl font-bold text-gray-900 dark:text-white outline-none focus:ring-2";
</script>

<div class="flex flex-col gap-4 p-4 max-w-md mx-auto w-full">
	<div class="flex items-center justify-between">
		<h1 class="text-xl font-bold text-gray-900 dark:text-white">Lineup Entry</h1>
		{#if syncState === "saving"}
			<span class="text-xs text-gray-400">Saving…</span>
		{:else if syncState === "saved"}
			<span class="text-xs text-green-600 inline-flex items-center gap-1"><Icon icon="mdi:check" class="size-4" /> Synced</span>
		{:else if syncState === "error"}
			<span class="text-xs text-red-600">Save failed</span>
		{/if}
	</div>

	{#if target}
		<div class="rounded-lg border border-gray-200 dark:border-neutral-700 p-2 text-center">
			<div class="text-xs uppercase text-gray-500">{isTest ? "Test match" : "Practice match"}</div>
			<div class="text-2xl font-bold text-gray-900 dark:text-white">
				{isTest ? "Test" : `Practice ${target.match}`}
			</div>
		</div>

		<div class="flex gap-3">
			<!-- Blue column: b1, b2, b3 -->
			<div class="flex flex-1 flex-col gap-3">
				<div class="text-center text-sm font-bold uppercase text-blue-600 dark:text-blue-400">Blue</div>
				{#each [{ id: "fl-b1", label: "Blue 1", station: 1 as const, get: () => b1, set: (v: string) => (b1 = v) }, { id: "fl-b2", label: "Blue 2", station: 2 as const, get: () => b2, set: (v: string) => (b2 = v) }, { id: "fl-b3", label: "Blue 3", station: 3 as const, get: () => b3, set: (v: string) => (b3 = v) }] as box (box.id)}
					<div>
						<div class="text-xs uppercase text-gray-400 text-center">{box.label}</div>
						<input
							id={box.id}
							type="number"
							inputmode="numeric"
							value={box.get()}
							oninput={(e) => {
								const v = (e.target as HTMLInputElement).value;
								box.set(v);
								editStation("blue", box.station, v);
							}}
							class="{bigInput} border-blue-300 dark:border-blue-700 focus:ring-blue-500"
						/>
						<div class="text-[11px] text-center text-gray-400 truncate h-4">{teamName(box.get())}</div>
					</div>
				{/each}
			</div>
			<!-- Red column: r3, r2, r1 -->
			<div class="flex flex-1 flex-col gap-3">
				<div class="text-center text-sm font-bold uppercase text-red-600 dark:text-red-400">Red</div>
				{#each [{ id: "fl-r3", label: "Red 3", station: 3 as const, get: () => r3, set: (v: string) => (r3 = v) }, { id: "fl-r2", label: "Red 2", station: 2 as const, get: () => r2, set: (v: string) => (r2 = v) }, { id: "fl-r1", label: "Red 1", station: 1 as const, get: () => r1, set: (v: string) => (r1 = v) }] as box (box.id)}
					<div>
						<div class="text-xs uppercase text-gray-400 text-center">{box.label}</div>
						<input
							id={box.id}
							type="number"
							inputmode="numeric"
							value={box.get()}
							oninput={(e) => {
								const v = (e.target as HTMLInputElement).value;
								box.set(v);
								editStation("red", box.station, v);
							}}
							class="{bigInput} border-red-300 dark:border-red-700 focus:ring-red-500"
						/>
						<div class="text-[11px] text-center text-gray-400 truncate h-4">{teamName(box.get())}</div>
					</div>
				{/each}
			</div>
		</div>

		{#if testMode}
			<Button color="alternative" onclick={() => (testMode = false)}>Back to live match</Button>
		{/if}
	{:else}
		<div class="rounded-lg border border-gray-200 dark:border-neutral-700 p-4 text-center text-sm text-gray-500">
			Waiting for a practice match on the field. For a test match you can start now:
		</div>
		<Button color="primary" onclick={() => (testMode = true)}>
			<Icon icon="mdi:flask-outline" class="size-4 mr-1" /> Enter a test match lineup
		</Button>
	{/if}
</div>
