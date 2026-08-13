# Scorekeeper View

A playoff aid for the scorekeeper (and head referee / FTA sitting at the scoring
table). It digitizes the paper lineup cards that the eight alliances hand in
during double elimination, enforces the rule based submission deadline with a
warn plus override flow, and keeps a full versioned history of every lineup an
alliance submits. A secondary qualification panel reuses FTA-Buddy's existing
cycle time and schedule data to show how far ahead or behind the event is
running and the recently completed matches.

---

## Phase 1: 2026 REBUILT playoff and lineup rules

All rules cited below are from the official 2026 *REBUILT* Game Manual, current
through Team Update 22 (TU22). Tournament rules live in **Section 10
"Tournaments (T)"**, and the lineup rules specifically in **10.6 Playoff
MATCHES**. Robot placement (which alliance sets up last) is in **6.3.3 ROBOTS**.
Team Updates changed only Table 10-2 (playoff schedule gap timings, in TU12);
none of the lineup, backup, color, or placement rules were altered.

### Playoff structure (10.6.1 to 10.6.2)

- **8 alliances, double elimination.** "In the Playoffs, teams play on set
  ALLIANCES, chosen during ALLIANCE selection, and advance through a double
  elimination bracket. Teams do not earn Ranking Points." (10.6)
- **Alliance numbering by rank.** "At the end of the Qualification MATCHES, the
  top 8 ranked teams become the ALLIANCE Leads. The ranked ALLIANCES are
  designated, in order, ALLIANCE 1, ALLIANCE 2, etc., down to ALLIANCE 8."
  (10.6.1) Each lead picks 2 teams, producing "8 ALLIANCES of 3 teams," which
  can become 4 teams if a backup coupon is used.
- **Selection order** (T603 to T605): round 1 picks descend ALLIANCE 1 to 8,
  round 2 picks ascend ALLIANCE 8 to 1.
- **Bracket:** an Upper and Lower bracket, 6 rounds (Figure 10-2 / Table 10-2).

### Alliance color per match (10.6.2)

Color is **not fixed per alliance**; it varies by round per the bracket.

> "In Round 1, the higher ranked ALLIANCE is assigned to the red ALLIANCE. For
> subsequent rounds, ALLIANCE color is assigned as shown in Figure 10-2,
> regardless of ALLIANCE rank at the start of the Playoff tournament." (10.6.2,
> Figure 10-2: "Red ALLIANCE tops each pairing.")

Robot **placement order** (who sets up last), from 6.3.3:

> "In an intra-Division Playoff MATCH... the higher seeded ALLIANCE (regardless
> of color) places last. For inter-Division Playoff MATCHES, the ALLIANCE that
> places last is determined by a (real or virtual) coin flip facilitated by the
> Head REFEREE where a heads result invites the red ALLIANCE to place last."

Consequence for this feature: color must be resolved **per match**, not stored
once per alliance. We derive it from the match's actual red/blue team
assignments (see Design).

### Lineups (10.6.4)

> "Each ALLIANCE competing in a Playoff MATCH has the option to submit a LINEUP,
> which lists the 3 teams participating in the MATCH and their selected DRIVER
> STATIONS. The LINEUP is kept confidential until the FIELD is set for the MATCH
> at which point each ALLIANCE'S LINEUP appears on the Team Signs." (10.6.4)

**Default lineup** (10.6.4.2, when no lineup is submitted): "the ALLIANCE Lead is
assigned DRIVER STATION 2, 1st team selected is assigned DRIVER STATION 1, and
the 2nd team selected is assigned DRIVER STATION 3." If any of those robots
cannot play, the alliance plays with 2 (or 1) robots.

For 4-team alliances (10.6.4.1), the team not in the lineup may supply one extra
member as a DRIVE COACH only.

### The deadline rule: T613 (the key rule for this feature)

> **T613** *LINEUPS due 2 minutes before the MATCH.* "The ALLIANCE CAPTAIN must
> submit their LINEUP in writing to the Head REFEREE (or their designee) 2
> minutes before their expected MATCH start time.
> Violation: Late LINEUPS are denied, and the ALLIANCE'S most recent LINEUP is
> applied.
> If the Head REFEREE is busy, and there is no designee, the ALLIANCE CAPTAIN
> remains in the Question Box to report the LINEUP."

So the deadline is **expected match start time minus 2 minutes**, and it is a
*written* submission to the Head Referee or designee (the manual does not use
the phrase "lineup card," but that is the paper artifact). A late lineup is, per
the rule, denied and the previous lineup stands. This feature relaxes that into
a **warn plus explicit "Accept Anyway" override** for the scorekeeper, and
records every override, because in practice the head referee has discretion and
the tool should document what actually happened rather than hard-blocking.

### Replays: T614

> **T614** *For replays, no changing LINEUPS (mostly).* "If a MATCH must be
> replayed due to an ARENA FAULT, the LINEUP for the replayed MATCH is the same
> as the original MATCH. The sole exception is if, in the opinion of the Head
> REFEREE, the ARENA FAULT rendered a ROBOT inoperable, in which case the LINEUP
> can be changed."

### Backup teams (10.6.3, T607 to T612)

- Each alliance gets **1 backup coupon**; it "must list the number of the team
  whose ROBOT is being replaced and is initialed by the ALLIANCE CAPTAIN," and
  once accepted "may not be withdrawn." The alliance becomes 4 teams.
- **T607** no backup for a replayed match (except arena-fault inoperability).
- **T608** no backup until after the alliance's first playoff match.
- **T609** a recruited backup "must be included in the LINEUP for the ALLIANCE'S
  next MATCH." (Violation: lineup denied.)
- **T610** *BACKUP TEAMS due 2 minutes before the MATCH start time* (the coupon
  is submitted to the Head Referee/designee no later than 2 minutes before the
  expected match start, same deadline as T613).
- **T611 / T612** the top backup pool teams must be present and staff a
  designated area.

### Rule citation quick reference

| Rule | Topic |
|------|-------|
| 10.6 / 10.6.1 | 8 alliances, double elim, ALLIANCE 1 to 8 by rank |
| 10.6.2, Fig 10-2 | Alliance color per round (round 1: higher seed = red) |
| 6.3.3 | Robot placement / who sets up last (higher seed; inter-division coin flip) |
| 10.6.4 | Lineup = 3 teams + their driver stations; confidential until field set |
| 10.6.4.2 **T613** | **Lineup deadline: 2 min before expected match start, in writing; late = previous lineup applied. Default: Lead DS2, pick1 DS1, pick2 DS3** |
| **T614** | Replay keeps the same lineup unless arena fault made a robot inoperable |
| 10.6.3, T607 to T612 | Backup team: 1 coupon, deadline 2 min before start, in next lineup |

---

## Phase 2: Feature design

### Actors and where lineups come from

Per T613 the alliance captain hands a written lineup to the head referee or
designee. Alliance captains are not FTA-Buddy users, so the **primary actor is
the scorekeeper / head-ref designee at the scoring table**, who enters each
alliance's lineup (and later changes) into the app as the paper cards arrive.
Every card records who entered it and a free-text submitter name (the alliance
rep who handed it in), so the audit trail survives even though the captain has
no account. An alliance self-service submission link is called out as a future
extension, not built now.

### Data model (drizzle, `src/db/schema.ts`)

Three new tables plus one new enum value. Migration generated with
`bun run generate-migration`.

**1. `roleEnum` gains `"Scorekeeper"`** so the scoring-table volunteer has a
first-class role (see Auth below). Existing values unchanged.

**2. `playoffAlliances`** one row per alliance per event.

```
playoff_alliances
  id            uuid pk
  event_code    varchar -> events.code   (notNull)
  number        integer                  (1..8, notNull)
  captain_team  integer                  (ALLIANCE Lead, notNull)
  pick1_team    integer                  (1st selected, notNull)
  pick2_team    integer                  (2nd selected, nullable for 2-team edge cases)
  backup_team   integer                  (nullable; set when a backup coupon is accepted)
  created_at    timestamp default now
  updated_at    timestamp default now
  unique(event_code, number)
  index(event_code)
```

Rosters can be typed in by the scorekeeper or imported from The Blue Alliance
(reusing the `TBA_API_KEY` + `fetch` pattern already in
`event.getCurrentMatchFromTBA`). The roster is the pool a lineup draws from; the
default lineup (T613) is computed from `captain_team` (DS2), `pick1_team` (DS1),
`pick2_team` (DS3).

**3. `lineupCards`** the versioned lineup submissions. This is the core table.

```
lineup_cards
  id                 uuid pk
  event_code         varchar -> events.code (notNull)
  alliance_number    integer                (notNull; the alliance this lineup is for)
  match_number       integer                (notNull; target playoff match this lineup applies to)
  play_number        integer default 1
  version            integer                (notNull; per (event, alliance, match), 1-based)
  station1_team      integer                (nullable; team at DRIVER STATION 1)
  station2_team      integer                (nullable; DS2)
  station3_team      integer                (nullable; DS3)
  uses_backup        boolean default false  (true if a station holds backup_team)
  status             lineup_status enum      ("accepted" | "superseded" | "rejected")
  source             lineup_source enum      ("scorekeeper" | "alliance")
  submitted_by_id    integer -> users.id    (nullable; the app user who entered it)
  submitted_by_name  varchar                (nullable; free-text alliance rep name)
  submitted_at       timestamp default now
  deadline_at        timestamp              (nullable; computed T613 deadline at submit time)
  is_late            boolean default false  (submitted_at > deadline_at)
  accepted_anyway    boolean default false  (scorekeeper used the override on a late card)
  accepted_anyway_by_id integer -> users.id (nullable)
  accepted_anyway_at timestamp              (nullable)
  note               varchar                (nullable; e.g. "arena fault replay, T614")
  created_at         timestamp default now
  index(event_code)
  index(event_code, alliance_number)
  index(event_code, match_number)
```

New enums: `lineupStatusEnum` (`accepted`, `superseded`, `rejected`),
`lineupSourceEnum` (`scorekeeper`, `alliance`).

Versioning: submitting a new lineup for the same `(alliance_number,
match_number)` inserts a new row with `version = max+1` and flips the previous
`accepted` row for that key to `superseded`. `rejected` is used when the
scorekeeper explicitly denies a late card instead of overriding (records the
denial per T613's "late lineups are denied").

### Resolver: latest accepted lineup for alliance X at match Y

```
resolveLineup(eventCode, allianceNumber, matchNumber) -> ResolvedLineup
  1. Newest `accepted` card WHERE (alliance, match == Y).                -> use it
  2. else newest `accepted` card WHERE (alliance, match < Y).            -> "carried forward"
     (implements T613: "the ALLIANCE'S most recent LINEUP is applied")
  3. else the DEFAULT lineup from the roster:
        DS1 = pick1_team, DS2 = captain_team, DS3 = pick2_team.          -> "default"
  Returns { stations: {1,2,3}, source: "submitted"|"carried-forward"|"default",
            card?: lineupCards row, usesBackup }.
```

### Deadline computation (T613)

```
computePlayoffDeadline(event, matchNumber, playNumber) -> { deadlineAt, expectedStart, source }
```

The "expected match start time" uses the best signal FTA-Buddy already has,
in priority order:

1. The scheduled start for that Playoff match from
   `event.scheduleDetails.matches[]` (`{ match, level: "Playoff",
   scheduledStartTime }`), **adjusted by the live ahead/behind delta** from the
   monitor frame / cycle data (`getCycleData().exactAheadBehind`) so the
   deadline tracks the real running clock, not the paper schedule.
2. If the match is the one currently on the field (monitor frame match ==
   matchNumber) and a prestart/ready time exists, use that as a tighter anchor.
3. Fallback: no schedule data -> deadline unknown; the UI shows "no scheduled
   start, deadline cannot be enforced" (surfaced, never silently swallowed).

`deadlineAt = expectedStart - 2 minutes`. A card is late when `submitted_at >
deadlineAt`; the UI shows how late ("42s past the T613 deadline").

### tRPC routes (`src/router/scorekeeper.ts`, mounted as `scorekeeper`)

All are `eventProcedure` (event-token scoped) so they match the rest of the app;
writes additionally require an authenticated user (checked in-handler) and the
Scorekeeper/FTA/FTAA/admin role.

- `alliances.list` query -> all `playoffAlliances` for the event.
- `alliances.upsert` mutation `{ number, captainTeam, pick1Team, pick2Team?,
  backupTeam? }` -> create/update one alliance.
- `alliances.importFromTBA` mutation -> pull `/event/{code}/alliances` from TBA
  and upsert all 8 (reuses the TBA key pattern).
- `lineups.forMatch` query `{ matchNumber, playNumber? }` -> the scorekeeper's
  main payload: the two alliances in that match with `{ allianceNumber, color,
  resolvedLineup, teamNames }`, plus `deadlineAt` and whether the field is set.
  Color and alliance identity are resolved from the match's red/blue team
  numbers (from the schedule / `matchLogs` / FMS) mapped against rosters; if the
  match is not yet assigned, the scorekeeper manually picks the two alliances.
- `lineups.submit` mutation `{ allianceNumber, matchNumber, playNumber?,
  stations: {1,2,3}, submittedByName?, acceptAnyway?, note? }` ->
  computes deadline + lateness. If `is_late && !acceptAnyway`, it does **not**
  finalize; it throws a typed `LATE_LINEUP` error carrying `{ deadlineAt,
  secondsLate }` so the client can show the warning and re-call with
  `acceptAnyway: true`. On success it inserts the new version, supersedes the
  prior accepted card, and records the override fields when late.
- `lineups.reject` mutation `{ cardId }` -> mark a pending/late card `rejected`
  (the T613 "denied" path) without applying it.
- `lineups.history` query `{ allianceNumber }` -> every card the alliance
  submitted, newest first, with version, status, submitter, timestamps, late and
  accepted-anyway flags. Drives the history view.
- `lineups.subscribe` subscription (SSE, like `checklist.subscription`) ->
  pushes lineup changes so a second device at the table stays live.

### App UI (Svelte 5 runes, `app/src/pages/scorekeeper/`)

Route `/scorekeeper` -> `Scorekeeper.svelte`, a tabbed page:

- **Lineups tab (primary).** A match picker at the top defaulting to the live
  playoff match (from the monitor frame; the scorekeeper can step to any playoff
  match). Below it, the two alliances in that match rendered as
  `AllianceLineupCard.svelte`, each showing the alliance number, its **color for
  this match** (red/blue chip), the three driver stations with team number and
  name, a backup badge, the submitter and time, and a late/override badge if
  applicable. An "Enter / change lineup" button opens `LineupEditor.svelte`.
- **`LineupEditor.svelte`** a modal that lists the alliance roster and assigns
  each team to DS1/DS2/DS3 (dropdowns, pre-filled from the resolved current
  lineup or the default). On submit, if the server returns `LATE_LINEUP`, the
  modal shows a red warning ("This lineup is 47s past the T613 deadline") with
  **Accept Anyway** and **Deny (T613)** buttons; Accept Anyway re-submits with
  the override, Deny calls `lineups.reject`.
- **`LineupHistory.svelte`** the full versioned timeline for an alliance:
  version, stations, who submitted, when, accepted / superseded / rejected, and
  late / accepted-anyway markers.
- **Alliances tab.** `AllianceSetup.svelte` to enter the 8 alliances or import
  from TBA, and to record an accepted backup coupon (sets `backup_team`).
- **Qualification tab (secondary, reuses existing data).** Ahead/behind, last /
  average / best cycle time, and completed matches with cycle time. This tab
  does **not** reinvent anything: it reads `cycles.getCycleData` /
  `cycles.getEventCycles` (cycle times, ahead/behind, schedule) and lists
  completed matches from the schedule + `cycleLogs`, with scores pulled from TBA
  (same endpoint the app already uses). It is a read-only convenience view for
  the scoring table.

Shared components reused: `FormattedTime.svelte`, the flowbite `Modal`,
`Button`, `Badge`, and the existing team-name lookup from the event store.

### How the scorekeeper picks the current match

Default: the monitor frame already carries `match` and `level`; when
`level === "Playoff"` the Lineups tab opens on that match. The picker lets the
scorekeeper move to the next/previous playoff match (they typically prep the
upcoming match's lineups). Alliance-in-match resolution:

1. If the match's red/blue teams are known (schedule / `matchLogs` / FMS), map
   each side to an alliance number via rosters and set color directly.
2. Otherwise the scorekeeper manually selects the two alliances and the red/blue
   assignment (needed early in a round before FMS has set the field).

### Warn / accept-anyway UX (summary)

1. Scorekeeper enters or changes a lineup.
2. Server computes `deadlineAt = expectedStart - 2:00` and `is_late`.
3. On time -> saved as the new accepted version.
4. Late -> server refuses to finalize and returns `{ deadlineAt, secondsLate }`.
   The editor shows how late it is versus T613 and offers **Accept Anyway**
   (finalize with `accepted_anyway = true`, recording who and when) or **Deny**
   (record a `rejected` card; the previous lineup stands, per T613).
5. All overrides are visible in history and filterable, so the head referee can
   review every late acceptance.

### Navigation and auth

- **Role:** add `"Scorekeeper"` to `roleEnum`. The scoring-table volunteer signs
  in with this role. The `/scorekeeper` route and nav entry are shown to
  `Scorekeeper`, `FTA`, `FTAA`, and admins (the FTA often covers the table).
- **Route guard:** `/scorekeeper` requires a user token + event token (added to
  `App.svelte`'s auth handling alongside the other event-token paths). It is not
  a public path.
- **Nav:** a "Scorekeeper" sidebar item (icon `mdi:clipboard-list-outline`),
  visible for the roles above, plus a bottom-bar entry when the signed-in role
  is `Scorekeeper`.
- **Writes** additionally check the role in-handler and return `FORBIDDEN`
  otherwise, so an event token alone cannot mutate lineups.

### Out of scope for the first build (open questions for Filip)

- Alliance self-service submission links (a per-alliance token so a rep submits
  their own lineup). Designed for but not built; the scorekeeper enters cards.
- Pushing accepted lineups back to FMS / Team Signs (FTA-Buddy reads FMS, it
  does not write). This tool documents lineups; it does not drive the field.
- Whether qual-tab scores should come from TBA (simple, already wired) or FMS
  (authoritative but needs the FMS event password). First build uses TBA.
