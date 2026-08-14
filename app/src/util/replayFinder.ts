// Find the best slot(s) to insert a replayed match into the remaining schedule,
// so no team ends up in back-to-back matches and spacing stays comfortable.
// Port of the algorithm from https://github.com/rtfoley/frc-replay-finder.

export interface ReplayScheduleMatch {
	matchNumber: number;
	teams: number[];
	timestamp: Date | null;
	hasScore: boolean;
}

export interface ReplayCandidate {
	/** Insertion index: the replay goes between schedule[index-1] and schedule[index]. */
	index: number;
	/** True when this is the soonest slot - the replay runs as the very next match. */
	immediate: boolean;
	/** Match the replay would follow (null = before the first remaining match). */
	afterMatch: number | null;
	/** Match the replay would precede (null = after the last match). */
	beforeMatch: number | null;
	/** Approx time the replay would run (the following match's scheduled start). */
	atTime: Date | null;
	/** True when this slot sits right after a schedule break (>= breakMinutes gap). */
	afterBreak: boolean;
	/** Smallest matches-of-rest any replay team gets here (0 = tightest, Infinity = unconstrained). */
	minGap: number;
	/** The replay teams that hit that smallest rest (the tightest ones). */
	tightTeams: number[];
	/** Every replay team with the matches of rest it gets here, tightest first. */
	teamGaps: { team: number; gap: number }[];
	/** Total finite rest across all teams - used to break ties toward more overall rest. */
	sumRest: number;
}

export interface ReplayOptions {
	topN?: number;
	/** Only consider slots after the last scored match (don't touch the played part). */
	onlyFuture?: boolean;
	breakMinutes?: number;
}

/**
 * @param schedule ordered matches (by play order) for the level being replayed
 * @param replayTeams the 6 teams in the match that must be replayed
 */
export function findReplaySlots(
	schedule: ReplayScheduleMatch[],
	replayTeams: number[],
	opts: ReplayOptions = {},
): ReplayCandidate[] {
	const topN = opts.topN ?? 5;
	const breakMs = (opts.breakMinutes ?? 30) * 60_000;
	const teams = [...new Set(replayTeams.filter((t) => t > 0))];

	// Earliest slot: right after the last match that already has a score, so we only
	// slot the replay into the not-yet-played part of the schedule.
	let minIndex = 0;
	if (opts.onlyFuture !== false) {
		for (let i = 0; i < schedule.length; i++) if (schedule[i].hasScore) minIndex = i + 1;
	}

	const afterBreak = (i: number): boolean => {
		const prev = schedule[i - 1]?.timestamp;
		const cur = schedule[i]?.timestamp;
		return !!(i > 0 && i < schedule.length && prev && cur && cur.getTime() - prev.getTime() >= breakMs);
	};

	const out: ReplayCandidate[] = [];
	for (let i = minIndex; i <= schedule.length; i++) {
		let minRest = Infinity;
		let valid = true;
		let sumRest = 0;
		const teamGaps: { team: number; gap: number }[] = [];
		for (const t of teams) {
			let prevIdx = -1;
			for (let j = i - 1; j >= 0; j--)
				if (schedule[j].teams.includes(t)) {
					prevIdx = j;
					break;
				}
			let nextIdx = -1;
			for (let j = i; j < schedule.length; j++)
				if (schedule[j].teams.includes(t)) {
					nextIdx = j;
					break;
				}
			// Matches sitting between this team's nearest match and the replay slot.
			const beforeMatches = prevIdx < 0 ? Infinity : i - prevIdx - 1;
			const afterMatches = nextIdx < 0 ? Infinity : nextIdx - i;
			const between = Math.min(beforeMatches, afterMatches);
			// between === 0 means the team plays the match right beside the replay -> back-to-back.
			if (between <= 0) valid = false;
			// Matches of rest a team actually gets: the tightest playable slot (one match on
			// either side) is 0 rest; Infinity when the team has no other match this level.
			const rest = Number.isFinite(between) ? between - 1 : Infinity;
			if (rest < minRest) minRest = rest;
			if (Number.isFinite(rest)) sumRest += rest;
			teamGaps.push({ team: t, gap: rest });
		}
		if (!valid) continue;
		teamGaps.sort((a, b) => a.gap - b.gap);
		const finite = teamGaps.filter((x) => Number.isFinite(x.gap));
		const tightest = finite.length ? finite[0].gap : Infinity;
		out.push({
			index: i,
			immediate: i === minIndex,
			afterMatch: i > 0 ? schedule[i - 1].matchNumber : null,
			beforeMatch: i < schedule.length ? schedule[i].matchNumber : null,
			atTime: (i < schedule.length ? schedule[i].timestamp : schedule[i - 1]?.timestamp) ?? null,
			afterBreak: afterBreak(i),
			minGap: minRest,
			tightTeams: finite.filter((x) => x.gap === tightest).map((x) => x.team),
			teamGaps,
			sumRest,
		});
	}

	// Rank: highest minimum rest first, then the most total rest across teams, then soonest.
	out.sort((a, b) => b.minGap - a.minGap || b.sumRest - a.sumRest || a.index - b.index);
	return out.slice(0, topN);
}
