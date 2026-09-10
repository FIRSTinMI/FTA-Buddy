# Troubleshooting corpus

The Troubleshooting assistant answers from a local full-text index in the `troubleshoot_chunks` table. Nothing is fetched at question time. This page covers what is in the index, how to refresh it, how to add field notes, and the redaction rule.

## What is indexed

| Source   | Content                                                                                                                                   | Pages                                 | How the page list is built                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `wpilib` | docs.wpilib.org (stable): hardware basics, status lights, wiring, CAN, networking, driver station, roboRIO, imaging, deploy, known issues | about 130                             | Sphinx `objects.inv` inventory filtered to the paths in `scripts/corpus/lib/sources.json` |
| `vivid`  | frc-radio.vivid-hosting.net, the VH-109 radio site                                                                                        | 35                                    | Sitemap, English pages only                                                               |
| `rev`    | docs.revrobotics.com: SPARK MAX, SPARK Flex, PDH, PH, status LEDs, troubleshooting, REV Hardware Client                                   | about 90                              | Sitemap index, only the spaces and paths in `sources.json`                                |
| `ctre`   | v6.docs.ctr-electronics.com (stable): Talon FX, CANivore, CANcoder, Pigeon, status lights, CAN bus, troubleshooting, Tuner                | about 65                              | Sphinx `objects.inv` filtered to `sources.json` paths                                     |
| `ni`     | NI Knowledge Base roboRIO articles                                                                                                        | 13 seeds plus linked roboRIO articles | Fixed ID list in `fetch-ni.ts`, verified live. Opt-in only, see below                     |
| `note`   | Field notes in `docs/troubleshooting/notes/*.md`                                                                                          | one chunk per file                    | The folder                                                                                |
| `ticket` | Resolved CSA tickets that have at least one reply                                                                                         | one chunk per ticket                  | The app database                                                                          |
| `slack`  | Slack support threads                                                                                                                     |                                       | Owned by the Slack poller, not by these scripts                                           |

Each web page is split on h1/h2/h3 into chunks of roughly 300 to 600 words. Short h3 sections fold into the previous chunk under the same h2, long sections split at paragraph boundaries. Table rows become `cell | cell` lines, list items stay on their own lines, code blocks are kept. Page chrome (sidebars, nav, footers, "Was this helpful") is dropped.

`source_key` is the dedupe key: `<url>#<heading slug>` for docs, `note:<file name>` for notes, `ticket:<note id>` for tickets. Re-running a loader updates rows in place.

`scripts/corpus/lib/sources.json` records, for each site, the robots.txt result, the license or terms found, and the crawl scope. Read it before widening a scope.

### NI is opt-in

NI's terms of use say site content may not be used "on any other Web site or networked computer environment for any purpose". robots.txt allows crawling, the terms do not allow reuse. `corpus:refresh` therefore skips `ni` unless you pass `--only ni` on purpose. The fetcher is complete and tested.

## How to refresh

All scripts read `.env` the same way the server does and need `DB_*` (and `REDIS_URL`, pulled in by imports).

```bash
bun run corpus:refresh                    # wpilib, vivid, rev, ctre
bun run corpus:refresh --only wpilib,rev  # a subset
bun run corpus:refresh --limit 15         # first 15 pages per source, for a test run
bun run corpus:refresh --no-cache         # ignore the on-disk page cache
bun run corpus:notes                      # reload docs/troubleshooting/notes/
bun run corpus:tickets                    # rebuild the ticket source from the DB
bun run corpus:search "rio unrecoverable error"   # print the top hits
```

Each fetcher (`scripts/corpus/fetch-*.ts`) also runs standalone: `bun run scripts/corpus/fetch-vivid.ts --limit 5`.

Fetching is polite: user agent `FTA-Buddy corpus (https://ftabuddy.com)`, robots.txt checked per host, one request per second per host, retry with backoff on 429 and 5xx. Pages are cached under `/tmp/ftabuddy-corpus-cache` (override with `CORPUS_CACHE_DIR`) keyed by URL, so a second run costs no requests. Delete the cache or pass `--no-cache` to pick up upstream changes. A full refresh is a few hundred requests, so allow several minutes.

A full run (no `--limit`) prunes rows the source no longer produces, so moved or deleted pages leave the index. A `--limit` run only upserts.

Run `corpus:refresh` before each season and after a major docs change (new control system year, new firmware). Run `corpus:tickets` after events, it is quick.

## How to add a note

Notes are field experience from FTAs and CSAs: what the symptom looked like, what it turned out to be, what fixed it. Write one file per lesson in `docs/troubleshooting/notes/`:

```markdown
---
title: Short problem statement, one line
date: 2026-03-14
url: https://optional.link/to/the/relevant/doc
---

Two to eight plain sentences. Symptom first, then the cause, then the fix,
then the pattern to look for next time.
```

Rules:

- No team numbers, event names or people. The redactor catches numbers, it cannot catch a venue name.
- Say what you saw, not what you assume. "The DS log showed voltage collapsing" beats "the battery was probably bad".
- Numbers with units are fine (70 A, 12 V, 20 ms). A bare three to five digit number will be redacted to `####`, so write `100%` rather than `100 percent`.

Then run `bun run corpus:notes`. The folder is the source of truth: the loader replaces the whole `note` source, so deleting a file removes it from search.

## The redaction rule

`upsertChunks()` runs `redactTeamNumbers()` over title, heading and body of every row before it is written, whatever the source. It replaces event codes (`2026micmp`), `team 1234` forms and bare 3 to 5 digit numbers not followed by a unit with `####`, and strips Slack user mentions. So a Slack thread or ticket that says "3641 had a CAN break" is stored as "#### had a CAN break".

That is the last line of defence, not the first. `load-tickets.ts` never selects `team`, `event_code`, `author_id`, `resolved_by_id` or display names, so they cannot reach the corpus at all. Keep it that way: if you add a field to a ticket chunk, ask whether it identifies a team, an event or a person before you add it.
