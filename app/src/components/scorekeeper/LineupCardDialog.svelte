<script lang="ts">
	import { Alert, Button, Modal } from "flowbite-svelte";
	import { onMount, tick } from "svelte";
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
		scheduleMatches: ScheduleMatch[];
		liveMatchNumber: number;
		teamName: (team: number | null) => string;
		onClose: () => void;
		onSubmitted: () => void;
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
	let allianceNumber = $state<number>(initialAlliance ?? alliances[0]?.number ?? 1);
	let matchNumber = $state(1);

	const allianceButtons = $derived(
		Array.from({ length: 8 }, (_, i) => ({
			number: i + 1,
			captain: alliances.find((a) => a.number === i + 1)?.captain_team ?? null,
		})),
	);
	const roster = $derived(alliances.find((a) => a.number === allianceNumber) ?? null);
	const rosterTeams = $derived(
		roster ? [roster.captain_team, roster.pick1_team, roster.pick2_team, roster.backup_team].filter((t): t is number => t != null) : [],
	);
	const rosterSet = $derived(new Set(rosterTeams));

	/** The next playoff match this alliance is scheduled for, at or after the live match. */
	function nextMatchForAlliance(num: number): number {
		const mine = scheduleMatches
			.filter((m) => m.level === "Playoff" && (m.redAllianceNumber === num || m.blueAllianceNumber === num))
			.map((m) => m.match)
			.sort((a, b) => a - b);
		return mine.find((m) => m >= liveMatchNumber) ?? mine[0] ?? liveMatchNumber;
	}

	function selectAlliance(num: number) {
		allianceNumber = num;
		matchNumber = nextMatchForAlliance(num);
	}
	onMount(() => (matchNumber = nextMatchForAlliance(allianceNumber)));

	// Six team-number boxes: the alliance's blue-side trio and red-side trio.
	let b1 = $state("");
	let b2 = $state("");
	let b3 = $state("");
	let r1 = $state("");
	let r2 = $state("");
	let r3 = $state("");
	let submittedByName = $state("");

	// The alliance's most recent on-file lineup, shown as a reference. Falls back to
	// the default lineup (REBUILT 10.6.4.2) when the alliance has never submitted one.
	let onFile = $state<{ blue: (number | null)[]; red: (number | null)[] } | null>(null);
	let currentIsDefault = $state(false);

	/** Default lineup from the roster: pick1 -> DS1, captain -> DS2, pick2 -> DS3. */
	function defaultTrio(): (number | null)[] | null {
		if (!roster) return null;
		return [roster.pick1_team ?? null, roster.captain_team ?? null, roster.pick2_team ?? null];
	}

	let submitting = $state(false);
	let error = $state("");
	let warning = $state<{ secondsLate: number; deadlineAt: Date | null } | null>(null);
	let validationWarn = $state(false);

	function toTeam(v: string): number | null {
		const n = parseInt(v, 10);
		return Number.isFinite(n) && n > 0 ? n : null;
	}

	const enteredTeams = $derived([b1, b2, b3, r3, r2, r1].map(toTeam));
	// Teams that were entered but are not on this alliance's FMS roster.
	const offRoster = $derived(
		rosterSet.size === 0
			? []
			: [...new Set(enteredTeams.filter((t): t is number => t != null && !rosterSet.has(t)))],
	);
	// Teams duplicated within one side (a team can't fill two stations on the same
	// side). The same team appearing once on blue and once on red is expected.
	function dupSet(vals: (number | null)[]): Set<number> {
		const counts = new Map<number, number>();
		for (const v of vals) if (v != null) counts.set(v, (counts.get(v) ?? 0) + 1);
		return new Set([...counts.entries()].filter(([, c]) => c > 1).map(([t]) => t));
	}
	const blueDups = $derived(dupSet([b1, b2, b3].map(toTeam)));
	const redDups = $derived(dupSet([r1, r2, r3].map(toTeam)));
	const hasDup = $derived(blueDups.size > 0 || redDups.size > 0);

	/** A box is invalid (amber) if its team is off-roster or duplicated on its own side. */
	function boxInvalid(side: "blue" | "red", v: string): boolean {
		const t = toTeam(v);
		if (t == null) return false;
		if (rosterSet.size > 0 && !rosterSet.has(t)) return true;
		return (side === "blue" ? blueDups : redDups).has(t);
	}

	// Clear the off-roster warning as soon as the teams are corrected.
	$effect(() => {
		if (offRoster.length === 0) validationWarn = false;
	});

	async function goToStage2() {
		error = "";
		warning = null;
		validationWarn = false;
		try {
			const history = await trpc.scorekeeper.lineups.history.query({ allianceNumber });
			const latest = history.find((c) => c.status === "accepted") ?? history[0];
			// Inputs start blank so the operator transcribes the card without erasing;
			// the current in-effect lineup (latest card, else the default) is shown as a
			// read-only reference flanking the inputs.
			b1 = b2 = b3 = r1 = r2 = r3 = "";
			if (latest) {
				currentIsDefault = false;
				onFile = {
					blue: [latest.blue_station1_team, latest.blue_station2_team, latest.blue_station3_team],
					red: [latest.red_station1_team, latest.red_station2_team, latest.red_station3_team],
				};
			} else {
				currentIsDefault = true;
				const d = defaultTrio();
				onFile = d ? { blue: d, red: d } : null;
			}
		} catch {
			b1 = b2 = b3 = r1 = r2 = r3 = "";
			onFile = null;
			currentIsDefault = false;
		}
		stage = 2;
		await tick();
		document.getElementById("lc-b1")?.focus();
	}

	async function doSubmit(opts: { acceptAnyway?: boolean; deny?: boolean; overrideValidation?: boolean } = {}) {
		// A team duplicated on one side is a hard error - never submittable.
		if (hasDup) return;
		// Client-side roster validation gate (overridable - e.g. a backup the
		// extension didn't pick up from FMS). Skipped once overridden or on the
		// late-accept / deny paths.
		if (!opts.overrideValidation && !opts.acceptAnyway && !opts.deny && offRoster.length > 0) {
			validationWarn = true;
			return;
		}
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

	const boxClass =
		"w-full rounded-md border bg-white dark:bg-neutral-800 px-1 py-3 text-center text-2xl font-bold text-gray-900 dark:text-white focus:ring-1 outline-none";

	/** Border/ring for an input: amber when off-roster, else its side colour. */
	function inpCls(side: "blue" | "red", v: string): string {
		if (boxInvalid(side, v)) return "border-amber-500 ring-1 ring-amber-500 focus:ring-amber-500";
		return side === "blue"
			? "border-blue-300 dark:border-blue-700 focus:border-blue-500 focus:ring-blue-500"
			: "border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-500";
	}
	const curCls = "text-center text-2xl font-bold tabular-nums";
</script>

<Modal bind:open title={stage === 1 ? "File a lineup card" : `Lineup card: Alliance ${allianceNumber}, Match ${matchNumber}`} onclose={onClose} size="md" outsideclose={false}>
	{#if stage === 1}
		<div class="flex flex-col gap-4">
			<div class="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
				Alliance
				<div class="grid grid-cols-4 gap-2">
					{#each allianceButtons as a (a.number)}
						<button
							type="button"
							onclick={() => selectAlliance(a.number)}
							class="rounded-md border py-2 text-center font-semibold transition {allianceNumber === a.number
								? 'border-primary-600 bg-primary-600 text-white'
								: 'border-gray-300 dark:border-neutral-600 text-gray-700 dark:text-gray-200 hover:border-primary-400'}"
						>
							<span class="text-lg leading-none">{a.number}</span>
							{#if a.captain}<span class="block text-[10px] font-normal opacity-70">{a.captain}</span>{/if}
						</button>
					{/each}
				</div>
			</div>
			<label class="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
				Match number
				<input
					type="number"
					min="1"
					bind:value={matchNumber}
					class="rounded-md border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-lg font-semibold text-gray-900 dark:text-white"
				/>
			</label>
			{#if roster}
				<div class="text-xs text-gray-500">
					Roster: <span class="font-bold">{roster.captain_team}</span>{#if roster.pick1_team}, {roster.pick1_team}{/if}{#if roster.pick2_team}, {roster.pick2_team}{/if}{#if roster.backup_team}, {roster.backup_team}{/if}
				</div>
			{/if}
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#if roster}
				<div class="rounded-md bg-gray-50 dark:bg-neutral-800/60 p-2 text-xs text-gray-600 dark:text-gray-300">
					<span class="font-semibold">Alliance {allianceNumber}:</span>
					<span class="font-bold">{roster.captain_team}</span>{#if roster.pick1_team}, {roster.pick1_team}{/if}{#if roster.pick2_team}, {roster.pick2_team}{/if}{#if roster.backup_team}, {roster.backup_team} (backup){/if}
				</div>
			{/if}
			<!-- Current lineup flanks the inputs; labels only at the top. -->
			<div class="grid grid-cols-4 gap-x-2 gap-y-2 items-center max-w-md mx-auto w-full">
				<div class="col-start-1 row-start-1 text-center text-[10px] uppercase text-gray-400">Current{currentIsDefault ? " (def)" : ""}</div>
				<div class="col-start-2 row-start-1 text-center text-xs font-bold uppercase text-blue-600 dark:text-blue-400">Blue</div>
				<div class="col-start-3 row-start-1 text-center text-xs font-bold uppercase text-red-600 dark:text-red-400">Red</div>
				<div class="col-start-4 row-start-1 text-center text-[10px] uppercase text-gray-400">Current{currentIsDefault ? " (def)" : ""}</div>

				<!-- current blue trio (left) -->
				<div class="col-start-1 row-start-2 {curCls} text-blue-500/70">{onFile?.blue[0] ?? "\u2014"}</div>
				<div class="col-start-1 row-start-3 {curCls} text-blue-500/70">{onFile?.blue[1] ?? "\u2014"}</div>
				<div class="col-start-1 row-start-4 {curCls} text-blue-500/70">{onFile?.blue[2] ?? "\u2014"}</div>
				<!-- current red trio (right; rows are r3, r2, r1) -->
				<div class="col-start-4 row-start-2 {curCls} text-red-500/70">{onFile?.red[2] ?? "\u2014"}</div>
				<div class="col-start-4 row-start-3 {curCls} text-red-500/70">{onFile?.red[1] ?? "\u2014"}</div>
				<div class="col-start-4 row-start-4 {curCls} text-red-500/70">{onFile?.red[0] ?? "\u2014"}</div>

				<!-- inputs in DOM order b1,b2,b3,r3,r2,r1 so Tab flows blue then red -->
				<input id="lc-b1" type="number" inputmode="numeric" value={b1} oninput={(e) => (b1 = (e.target as HTMLInputElement).value)} class="{boxClass} {inpCls('blue', b1)} col-start-2 row-start-2" />
				<input id="lc-b2" type="number" inputmode="numeric" value={b2} oninput={(e) => (b2 = (e.target as HTMLInputElement).value)} class="{boxClass} {inpCls('blue', b2)} col-start-2 row-start-3" />
				<input id="lc-b3" type="number" inputmode="numeric" value={b3} oninput={(e) => (b3 = (e.target as HTMLInputElement).value)} class="{boxClass} {inpCls('blue', b3)} col-start-2 row-start-4" />
				<input id="lc-r3" type="number" inputmode="numeric" value={r3} oninput={(e) => (r3 = (e.target as HTMLInputElement).value)} class="{boxClass} {inpCls('red', r3)} col-start-3 row-start-2" />
				<input id="lc-r2" type="number" inputmode="numeric" value={r2} oninput={(e) => (r2 = (e.target as HTMLInputElement).value)} class="{boxClass} {inpCls('red', r2)} col-start-3 row-start-3" />
				<input id="lc-r1" type="number" inputmode="numeric" value={r1} oninput={(e) => (r1 = (e.target as HTMLInputElement).value)} class="{boxClass} {inpCls('red', r1)} col-start-3 row-start-4" />
			</div>

			<input
				bind:value={submittedByName}
				placeholder="Handed in by (optional)"
				class="rounded-md border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
			/>

			{#if hasDup}
				<Alert color="yellow">
					<span class="font-semibold">Duplicate team.</span>
					A team can't fill two stations on the same side - fix the highlighted boxes.
				</Alert>
			{/if}
			{#if validationWarn && !hasDup}
				<Alert color="yellow">
					<span class="font-semibold">Off-roster team{offRoster.length > 1 ? "s" : ""}:</span>
					{offRoster.join(", ")} not on Alliance {allianceNumber}'s FMS roster. If this is a backup FMS missed,
					file anyway.
				</Alert>
			{/if}
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
						<Button color="yellow" onclick={() => doSubmit({ acceptAnyway: true })} disabled={submitting}>Accept anyway</Button>
					{:else if validationWarn && !hasDup}
						<Button color="yellow" onclick={() => doSubmit({ overrideValidation: true })} disabled={submitting}>File anyway</Button>
					{:else}
						<Button color="primary" onclick={() => doSubmit()} disabled={submitting || hasDup}>
							{submitting ? "Filing..." : "Submit card"}
						</Button>
					{/if}
				</div>
			</div>
		{/if}
	{/snippet}
</Modal>
