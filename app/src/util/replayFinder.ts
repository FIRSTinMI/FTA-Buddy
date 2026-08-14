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
	/** Match the replay would follow (null = before the first remaining match). */
	afterMatch: number | null;
	/** Match the replay would precede (null = after the last match). */
	beforeMatch: number | null;
	/** Approx time the replay would run (the following match's scheduled start). */
	atTime: Date | null;
	/** True when this slot sits right after a schedule break (>= breakMinutes gap). */
	afterBreak: boolean;
	/** Smallest match-spacing any replay team gets here (Infinity = fully unconstrained). */
	minGap: number;
	/** The replay teams that hit that smallest spacing (the tightest ones). */
	tightTeams: number[];
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
		let minGap = Infinity;
		let valid = true;
		const gaps: { team: number; gap: number }[] = [];
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
			const beforeGap = prevIdx < 0 ? Infinity : i - prevIdx - 1;
			const afterGap = nextIdx < 0 ? Infinity : nextIdx - i;
			const g = Math.min(beforeGap, afterGap);
			if (g <= 0) valid = false;
			if (g < minGap) minGap = g;
			if (Number.isFinite(g)) gaps.push({ team: t, gap: g });
		}
		if (!valid) continue;
		const tightest = gaps.length ? Math.min(...gaps.map((x) => x.gap)) : Infinity;
		out.push({
			index: i,
			afterMatch: i > 0 ? schedule[i - 1].matchNumber : null,
			beforeMatch: i < schedule.length ? schedule[i].matchNumber : null,
			atTime: (i < schedule.length ? schedule[i].timestamp : schedule[i - 1]?.timestamp) ?? null,
			afterBreak: afterBreak(i),
			minGap,
			tightTeams: gaps.filter((x) => x.gap === tightest).map((x) => x.team),
		});
	}

	// Rank: most spacing first, then earliest slot (breaks surface as a badge).
	out.sort((a, b) => b.minGap - a.minGap || a.index - b.index);
	return out.slice(0, topN);
}
