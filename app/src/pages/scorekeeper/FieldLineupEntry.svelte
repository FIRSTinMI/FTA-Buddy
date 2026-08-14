<script lang="ts">
	import { Button } from "flowbite-svelte";
	import Icon from "@iconify/svelte";
	import { onDestroy, onMount } from "svelte";
	import { frameHandler, subscribeToFieldMonitor } from "../../field-monitor";
	import { trpc } from "../../main";
	import { eventStore } from "../../stores/event";
	import { userStore } from "../../stores/user";

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

	// Debounced save on any edit.
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	function edited() {
		syncState = "saving";
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, 500);
	}
	async function save() {
		const t = target;
		if (!t || !$userStore.username) return;
		try {
			await trpc.scorekeeper.fieldLineup.set.mutate({
				level: t.level,
				matchNumber: t.match,
				playNumber: t.play,
				blue: { station1: toTeam(b1), station2: toTeam(b2), station3: toTeam(b3) },
				red: { station1: toTeam(r1), station2: toTeam(r2), station3: toTeam(r3) },
			});
			syncState = "saved";
		} catch (err) {
			console.error("[field-lineup] save failed:", err);
			syncState = "error";
		}
	}

	onMount(() => {
		if (!frameHandler.getFrame()) subscribeToFieldMonitor();
		frameHandler.addEventListener("frame", onFrame);
	});
	onDestroy(() => {
		frameHandler.removeEventListener("frame", onFrame);
		clearTimeout(saveTimer);
	});

	const bigInput =
		"w-full rounded-lg border-2 bg-white dark:bg-neutral-800 px-2 py-4 text-center text-4xl font-bold text-gray-900 dark:text-white outline-none focus:ring-2";
</script>

<div class="flex flex-col gap-4 p-4 max-w-md mx-auto w-full">
	<div class="flex items-center justify-between">
		<h1 class="text-xl font-bold text-gray-900 dark:text-white">Field lineup</h1>
		{#if syncState === "saving"}
			<span class="text-xs text-gray-400">Saving…</span>
		{:else if syncState === "saved"}
			<span class="text-xs text-green-600 inline-flex items-center gap-1"><Icon icon="mdi:check" class="size-4" /> Synced</span>
		{:else if syncState === "error"}
			<span class="text-xs text-red-600">Save failed</span>
		{/if}
	</div>

	{#if !$userStore.username}
		<div class="rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-700">
			Sign in to enter and sync field lineups.
		</div>
	{/if}

	{#if target}
		<div class="rounded-lg border border-gray-200 dark:border-neutral-700 p-2 text-center">
			<div class="text-xs uppercase text-gray-500">{isTest ? "Test match" : "Practice match"}</div>
			<div class="text-2xl font-bold text-gray-900 dark:text-white">
				{isTest ? "Test" : `Practice ${target.match}`}
			</div>
			<div class="text-xs text-gray-400">Enter who's in each station. Leave a box blank if no robot is there.</div>
		</div>

		<div class="flex gap-3">
			<!-- Blue column: b1, b2, b3 -->
			<div class="flex flex-1 flex-col gap-3">
				<div class="text-center text-sm font-bold uppercase text-blue-600 dark:text-blue-400">Blue</div>
				{#each [{ id: "fl-b1", label: "Blue 1", get: () => b1, set: (v: string) => (b1 = v) }, { id: "fl-b2", label: "Blue 2", get: () => b2, set: (v: string) => (b2 = v) }, { id: "fl-b3", label: "Blue 3", get: () => b3, set: (v: string) => (b3 = v) }] as box (box.id)}
					<div>
						<div class="text-xs uppercase text-gray-400 text-center">{box.label}</div>
						<input
							id={box.id}
							type="number"
							inputmode="numeric"
							value={box.get()}
							oninput={(e) => {
								box.set((e.target as HTMLInputElement).value);
								edited();
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
				{#each [{ id: "fl-r3", label: "Red 3", get: () => r3, set: (v: string) => (r3 = v) }, { id: "fl-r2", label: "Red 2", get: () => r2, set: (v: string) => (r2 = v) }, { id: "fl-r1", label: "Red 1", get: () => r1, set: (v: string) => (r1 = v) }] as box (box.id)}
					<div>
						<div class="text-xs uppercase text-gray-400 text-center">{box.label}</div>
						<input
							id={box.id}
							type="number"
							inputmode="numeric"
							value={box.get()}
							oninput={(e) => {
								box.set((e.target as HTMLInputElement).value);
								edited();
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
