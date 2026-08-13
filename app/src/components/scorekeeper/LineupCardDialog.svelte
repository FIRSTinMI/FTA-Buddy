<script lang="ts">
	import { Alert, Button, Modal, Select } from "flowbite-svelte";
	import { tick, untrack } from "svelte";
	import { trpc } from "../../main";
	import type { Alliance } from "../../util/scorekeeperTypes";

	interface ScheduleMatch {
		match: number;
		level: string;
		redAllianceNumber?: number | null;
		blueAllianceNumber?: number | null;
	}

	interface Props {
		open: boolean;
		alliances: Alliance[];
		/** Playoff schedule entries (with per-match alliance numbers) to find the next match. */
		scheduleMatches: ScheduleMatch[];
		/** The live/current match number, so "next match" skips past matches already run. */
		liveMatchNumber: number;
		teamName: (team: number | null) => string;
		onClose: () => void;
		onSubmitted: () => void;
		/** Pre-selected alliance (e.g. when opened from a specific card). */
		initialAlliance?: number | null;
	}

	let {
		open = $bindable(),
		alliances,
		scheduleMatches,
		liveMatchNumber,
		teamName,
		onClose,
		onSubmitted,
		initialAlliance = null,
	}: Props = $props();

	let stage = $state<1 | 2>(1);
	let allianceNumber = $state<number>(untrack(() => initialAlliance ?? alliances[0]?.number ?? 1));
	let matchNumber = $state<number>(1);

	const allianceOptions = $derived(
		(alliances.length ? alliances : Array.from({ length: 8 }, (_, i) => ({ number: i + 1 }) as Alliance)).map(
			(a) => ({
				value: a.number,
				name: `Alliance ${a.number}${a.captain_team ? ` (${a.captain_team})` : ""}`,
			}),
		),
	);

	const roster = $derived(alliances.find((a) => a.number === allianceNumber) ?? null);

	/** The next playoff match this alliance is scheduled for, at or after the live match. */
	function nextMatchForAlliance(num: number): number {
		const mine = scheduleMatches
			.filter((m) => m.level === "Playoff" && (m.redAllianceNumber === num || m.blueAllianceNumber === num))
			.map((m) => m.match)
			.sort((a, b) => a - b);
		return mine.find((m) => m >= liveMatchNumber) ?? mine[0] ?? liveMatchNumber;
	}

	// Prefill the match number whenever the alliance changes (stage 1).
	$effect(() => {
		const n = allianceNumber;
		untrack(() => {
			if (stage === 1) matchNumber = nextMatchForAlliance(n);
		});
	});

	// Six team-number boxes: the alliance's blue-side trio and red-side trio.
	let b1 = $state<string>("");
	let b2 = $state<string>("");
	let b3 = $state<string>("");
	let r1 = $state<string>("");
	let r2 = $state<string>("");
	let r3 = $state<string>("");
	let submittedByName = $state("");

	let submitting = $state(false);
	let error = $state("");
	let warning = $state<{ secondsLate: number; deadlineAt: Date | null } | null>(null);

	function toTeam(v: string): number | null {
		const n = parseInt(v, 10);
		return Number.isFinite(n) && n > 0 ? n : null;
	}

	async function goToStage2() {
		error = "";
		warning = null;
		// Prefill both sides from the alliance's most recent card, if any.
		try {
			const history = await trpc.scorekeeper.lineups.history.query({ allianceNumber });
			const latest = history.find((c) => c.status === "accepted") ?? history[0];
			b1 = String(latest?.blue_station1_team ?? "");
			b2 = String(latest?.blue_station2_team ?? "");
			b3 = String(latest?.blue_station3_team ?? "");
			r1 = String(latest?.red_station1_team ?? "");
			r2 = String(latest?.red_station2_team ?? "");
			r3 = String(latest?.red_station3_team ?? "");
		} catch {
			b1 = b2 = b3 = r1 = r2 = r3 = "";
		}
		stage = 2;
		await tick();
		document.getElementById("lc-b1")?.focus();
	}

	async function doSubmit(opts: { acceptAnyway?: boolean; deny?: boolean } = {}) {
		submitting = true;
		error = "";
		try {
			const res = await trpc.scorekeeper.lineups.submit.mutate({
				allianceNumber,
				matchNumber,
				blue: { station1: toTeam(b1), station2: toTeam(b2), station3: toTeam(b3) },
				red: { station1: toTeam(r1), station2: toTeam(r2), station3: toTeam(r3) },
				submittedByName: submittedByName.trim() || undefined,
				acceptAnyway: opts.acceptAnyway,
				deny: opts.deny,
			});
			if (res.status === "needs_override") {
				warning = { secondsLate: res.secondsLate, deadlineAt: res.deadlineAt };
				return;
			}
			warning = null;
			onSubmitted();
			open = false;
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to file lineup card";
			console.error("[scorekeeper] lineup submit failed:", err);
			error = message;
		} finally {
			submitting = false;
		}
	}

	function formatLate(seconds: number): string {
		if (seconds < 60) return `${seconds}s`;
		return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
	}

	// A styled team-number box.
	const boxClass =
		"w-full rounded-md border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-3 text-center text-2xl font-bold text-gray-900 dark:text-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none";
</script>

<Modal bind:open title={stage === 1 ? "File a lineup card" : `Lineup card: Alliance ${allianceNumber}, Match ${matchNumber}`} onclose={onClose} size="md">
	{#if stage === 1}
		<div class="flex flex-col gap-4">
			<label class="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
				Alliance
				<Select
					items={allianceOptions}
					value={allianceNumber}
					onchange={(e) => (allianceNumber = parseInt((e.target as HTMLSelectElement).value))}
				/>
			</label>
			<label class="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
				Match number
				<input
					type="number"
					min="1"
					bind:value={matchNumber}
					class="rounded-md border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-lg font-semibold text-gray-900 dark:text-white"
				/>
				<span class="text-xs text-gray-400">Prefilled with Alliance {allianceNumber}'s next match.</span>
			</label>
			{#if roster}
				<div class="text-xs text-gray-500">
					Roster: {[roster.captain_team, roster.pick1_team, roster.pick2_team, roster.backup_team]
						.filter((t) => t != null)
						.join(", ")}
				</div>
			{/if}
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			<p class="text-xs text-gray-500">
				Enter the card exactly as written: blue stations on the left, red stations on the right. The same card
				applies whenever this alliance plays that colour.
			</p>
			<div class="flex gap-4 justify-center">
				<!-- Blue column: b1, b2, b3 (top to bottom) -->
				<div class="flex flex-col gap-2 flex-1 max-w-[10rem]">
					<div class="text-center text-xs font-bold uppercase text-blue-600 dark:text-blue-400">Blue</div>
					{#each [{ id: "lc-b1", label: "Blue 1", get: () => b1, set: (v: string) => (b1 = v) }, { id: "lc-b2", label: "Blue 2", get: () => b2, set: (v: string) => (b2 = v) }, { id: "lc-b3", label: "Blue 3", get: () => b3, set: (v: string) => (b3 = v) }] as box (box.id)}
						<div>
							<div class="text-[10px] uppercase text-gray-400 text-center">{box.label}</div>
							<input
								id={box.id}
								type="number"
								inputmode="numeric"
								value={box.get()}
								oninput={(e) => box.set((e.target as HTMLInputElement).value)}
								class={boxClass}
							/>
							<div class="text-[10px] text-gray-400 text-center truncate h-3">{teamName(toTeam(box.get()))}</div>
						</div>
					{/each}
				</div>
				<!-- Red column: r3, r2, r1 (top to bottom, mirroring the physical card) -->
				<div class="flex flex-col gap-2 flex-1 max-w-[10rem]">
					<div class="text-center text-xs font-bold uppercase text-red-600 dark:text-red-400">Red</div>
					{#each [{ id: "lc-r3", label: "Red 3", get: () => r3, set: (v: string) => (r3 = v) }, { id: "lc-r2", label: "Red 2", get: () => r2, set: (v: string) => (r2 = v) }, { id: "lc-r1", label: "Red 1", get: () => r1, set: (v: string) => (r1 = v) }] as box (box.id)}
						<div>
							<div class="text-[10px] uppercase text-gray-400 text-center">{box.label}</div>
							<input
								id={box.id}
								type="number"
								inputmode="numeric"
								value={box.get()}
								oninput={(e) => box.set((e.target as HTMLInputElement).value)}
								class={boxClass}
							/>
							<div class="text-[10px] text-gray-400 text-center truncate h-3">{teamName(toTeam(box.get()))}</div>
						</div>
					{/each}
				</div>
			</div>

			<input
				bind:value={submittedByName}
				placeholder="Handed in by (optional)"
				class="rounded-md border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
			/>

			{#if warning}
				<Alert color="red">
					<span class="font-semibold">Late card (T613):</span>
					{formatLate(warning.secondsLate)} past the deadline{#if warning.deadlineAt}
						(due {new Date(warning.deadlineAt).toLocaleTimeString()}){/if}. The previous lineup stands unless the
					head ref accepts it.
				</Alert>
			{/if}
			{#if error}
				<Alert color="red"><span class="font-semibold">Error:</span> {error}</Alert>
			{/if}
		</div>
	{/if}

	{#snippet footer()}
		{#if stage === 1}
			<div class="flex w-full flex-col items-end gap-1">
				<span class="text-xs text-gray-400">Check the captain's signature is on the card.</span>
				<div class="flex gap-2">
					<Button color="alternative" onclick={onClose}>Cancel</Button>
					<Button color="primary" onclick={goToStage2}>Next</Button>
				</div>
			</div>
		{:else}
			<div class="flex w-full justify-between gap-2">
				<Button color="alternative" onclick={() => (stage = 1)} disabled={submitting}>Back</Button>
				<div class="flex gap-2">
					{#if warning}
						<Button color="red" onclick={() => doSubmit({ deny: true })} disabled={submitting}>Deny (T613)</Button>
						<Button color="yellow" onclick={() => doSubmit({ acceptAnyway: true })} disabled={submitting}>
							Accept anyway
						</Button>
					{:else}
						<Button color="primary" onclick={() => doSubmit()} disabled={submitting}>
							{submitting ? "Filing..." : "Submit card"}
						</Button>
					{/if}
				</div>
			</div>
		{/if}
	{/snippet}
</Modal>
