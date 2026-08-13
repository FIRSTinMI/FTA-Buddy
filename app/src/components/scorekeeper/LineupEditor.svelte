<script lang="ts">
	import { Alert, Button, Input, Label, Modal, Select } from "flowbite-svelte";
	import { untrack } from "svelte";
	import type { LineupStations } from "../../../../shared/types";
	import { trpc } from "../../main";
	import type { Alliance } from "../../util/scorekeeperTypes";

	interface Props {
		open: boolean;
		alliance: Alliance;
		matchNumber: number;
		playNumber: number;
		initial: LineupStations | null;
		teamName: (team: number | null) => string;
		onClose: () => void;
		onSubmitted: () => void;
	}

	let { open = $bindable(), alliance, matchNumber, playNumber, initial, teamName, onClose, onSubmitted }: Props =
		$props();

	// Roster teams that can be placed at a station, plus an "empty" option.
	const rosterOptions = $derived(
		[
			{ value: 0, name: "Empty (robot can't play)" },
			...[alliance.captain_team, alliance.pick1_team, alliance.pick2_team, alliance.backup_team]
				.filter((t): t is number => t != null)
				.map((t) => ({ value: t, name: `${t} ${teamName(t)}`.trim() })),
		],
	);

	// Seeded once on mount; the parent remounts this editor per open ({#key}).
	let station1 = $state<number>(untrack(() => initial?.station1 ?? alliance.pick1_team ?? 0));
	let station2 = $state<number>(untrack(() => initial?.station2 ?? alliance.captain_team ?? 0));
	let station3 = $state<number>(untrack(() => initial?.station3 ?? alliance.pick2_team ?? 0));
	let submittedByName = $state("");
	let note = $state("");

	let submitting = $state(false);
	let error = $state("");
	let warning = $state<{ secondsLate: number; deadlineAt: Date | null } | null>(null);

	function toTeam(v: number): number | null {
		return v === 0 ? null : v;
	}

	async function doSubmit(opts: { acceptAnyway?: boolean; deny?: boolean } = {}) {
		submitting = true;
		error = "";
		try {
			const res = await trpc.scorekeeper.lineups.submit.mutate({
				allianceNumber: alliance.number,
				matchNumber,
				playNumber,
				stations: { station1: toTeam(station1), station2: toTeam(station2), station3: toTeam(station3) },
				submittedByName: submittedByName.trim() || undefined,
				note: note.trim() || undefined,
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
			// Surface the real reason to the scorekeeper and the console (never swallow).
			const message = err instanceof Error ? err.message : "Failed to submit lineup";
			console.error("[scorekeeper] lineup submit failed:", err);
			error = message;
		} finally {
			submitting = false;
		}
	}

	function formatLate(seconds: number): string {
		if (seconds < 60) return `${seconds}s`;
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${m}m ${s}s`;
	}
</script>

<Modal bind:open title={`Lineup: Alliance ${alliance.number}, Match ${matchNumber}`} onclose={onClose} outsideclose>
	<div class="flex flex-col gap-3">
		<div class="grid grid-cols-3 gap-2">
			<Label class="flex flex-col gap-1 text-sm">
				DS1
				<Select items={rosterOptions} bind:value={station1} />
			</Label>
			<Label class="flex flex-col gap-1 text-sm">
				DS2
				<Select items={rosterOptions} bind:value={station2} />
			</Label>
			<Label class="flex flex-col gap-1 text-sm">
				DS3
				<Select items={rosterOptions} bind:value={station3} />
			</Label>
		</div>

		<Label class="flex flex-col gap-1 text-sm">
			Submitted by (alliance rep, optional)
			<Input bind:value={submittedByName} placeholder="e.g. Captain of Alliance {alliance.number}" />
		</Label>
		<Label class="flex flex-col gap-1 text-sm">
			Note (optional)
			<Input bind:value={note} placeholder="e.g. backup coupon accepted, arena-fault replay" />
		</Label>

		{#if warning}
			<Alert color="red">
				<span class="font-semibold">Late lineup (T613).</span>
				This lineup is {formatLate(warning.secondsLate)} past the deadline
				{#if warning.deadlineAt}(due {new Date(warning.deadlineAt).toLocaleTimeString()}){/if}. Per the rules the
				previous lineup stands, but the head referee can accept it. Accept anyway or deny?
			</Alert>
		{/if}

		{#if error}
			<Alert color="red"><span class="font-semibold">Error:</span> {error}</Alert>
		{/if}
	</div>

	{#snippet footer()}
		<div class="flex w-full justify-end gap-2">
			<Button color="alternative" onclick={onClose} disabled={submitting}>Cancel</Button>
			{#if warning}
				<Button color="red" onclick={() => doSubmit({ deny: true })} disabled={submitting}>Deny (T613)</Button>
				<Button color="yellow" onclick={() => doSubmit({ acceptAnyway: true })} disabled={submitting}>
					Accept anyway
				</Button>
			{:else}
				<Button color="primary" onclick={() => doSubmit()} disabled={submitting}>
					{submitting ? "Submitting..." : "Submit lineup"}
				</Button>
			{/if}
		</div>
	{/snippet}
</Modal>
