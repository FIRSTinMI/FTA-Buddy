<script lang="ts">
	import { navigate } from "../../router";
	import { displayTeam } from "../../util/team-name";
	import type { Note } from "../../../../shared/types";

	type TBANextMatch = {
		comp_level: string;
		match_number: number;
		set_number: number;
		predicted_time?: number | null;
		time?: number | null;
		alliances: {
			red: { team_keys: string[] };
			blue: { team_keys: string[] };
		};
	} | null;

	type PlayedMatch = {
		id: string;
		match_number: number;
		play_number: number;
		level: string;
		blue1: number | null;
		blue2: number | null;
		blue3: number | null;
		red1: number | null;
		red2: number | null;
		red3: number | null;
	};

	interface Props {
		note: Note;
		nextMatch: TBANextMatch;
		playedMatchesSince: PlayedMatch[];
	}

	let { note, nextMatch, playedMatchesSince }: Props = $props();

	function formatMatchLabel(m: PlayedMatch): string {
		const prefix =
			m.level === "Qualification" ? "Q" : m.level === "Playoff" ? "PO" : m.level === "Practice" ? "P" : "M";
		const suffix = m.play_number > 1 ? `/${m.play_number}` : "";
		return `${prefix}${m.match_number}${suffix}`;
	}

	function formatNextMatch(m: NonNullable<TBANextMatch>): string {
		const levelMap: Record<string, string> = { qm: "Qual", qf: "QF", sf: "SF", f: "Final", ef: "EF" };
		const level = levelMap[m.comp_level] ?? m.comp_level.toUpperCase();
		if (m.comp_level === "qm") return `${level} ${m.match_number}`;
		return `${level} ${m.set_number}-${m.match_number}`;
	}

	function nextMatchAlliance(m: NonNullable<TBANextMatch>, teamNumber: number): "red" | "blue" | null {
		const key = `frc${teamNumber}`;
		if (m.alliances.red.team_keys.includes(key)) return "red";
		if (m.alliances.blue.team_keys.includes(key)) return "blue";
		return null;
	}

	function formatMatchTime(m: NonNullable<TBANextMatch>): string {
		const epoch = m.predicted_time ?? m.time;
		if (!epoch) return "";
		return new Date(epoch * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	}
</script>

<!-- Note type header row with played-since -->
<div class="flex items-start justify-between gap-4">
	<span class="font-bold text-xl text-black dark:text-white">
		{note.note_type === "TeamIssue" ? "Team Issue" : note.note_type === "EventNote" ? "Event Note" : "Match Note"}
	</span>
	{#if note.note_type === "TeamIssue" && playedMatchesSince.length > 0}
		<div class="flex flex-col items-end gap-0.5 shrink-0 mt-1">
			<span class="text-xs text-gray-400 dark:text-gray-500">Played since:</span>
			{#each playedMatchesSince as pm}
				{@const pmStation =
					note.team === pm.blue1
						? "blue1"
						: note.team === pm.blue2
							? "blue2"
							: note.team === pm.blue3
								? "blue3"
								: note.team === pm.red1
									? "red1"
									: note.team === pm.red2
										? "red2"
										: note.team === pm.red3
											? "red3"
											: undefined}
				<button
					class="text-xs text-blue-500 hover:underline"
					onclick={() =>
						pmStation
							? navigate("/logs/:matchid/:station", {
									params: { matchid: pm.id, station: pmStation },
								})
							: navigate("/logs/:matchid", { params: { matchid: pm.id } })}>{formatMatchLabel(pm)}</button
				>
			{/each}
		</div>
	{/if}
</div>

<!-- Team name link -->
{#if note.team}
	<div class="justify-center text-center sm:justify-start sm:text-left">
		<button
			class="font-semibold hover:underline"
			onclick={() => note && navigate("/notepad/team/:team", { params: { team: String(note.team) } })}
			>Team {displayTeam(note.team)}</button
		>
	</div>

	<!-- Next match -->
	{#if nextMatch}
		{@const alliance = nextMatchAlliance(nextMatch, note.team)}
		<p class="text-xs">
			<span
				class="font-semibold {alliance === 'red'
					? 'text-red-600 dark:text-red-400'
					: alliance === 'blue'
						? 'text-blue-600 dark:text-blue-400'
						: 'text-gray-500 dark:text-gray-400'}"
			>
				Next: {formatNextMatch(nextMatch)}{#if alliance}<span class="capitalize"> {alliance}</span>{/if}
			</span>
			{#if formatMatchTime(nextMatch)}
				<span class="text-gray-400 dark:text-gray-500"> {formatMatchTime(nextMatch)}</span>
			{/if}
		</p>
	{/if}
{/if}
