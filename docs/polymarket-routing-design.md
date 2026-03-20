# Polymarket Routing Design

This document defines a staged redesign for the n8n analysis workflow so we stop treating every Polymarket market as the same problem.

## Why This Exists

The current workflow is strongest on generic yes/no markets with obvious recent news. It is weaker on:

- deadline-driven procedural markets, where the real question is whether a formal step completes before the cutoff
- numeric threshold markets, where path dependency and event calendars matter more than narrative search
- multi-outcome winner markets, where the task is ranking correlated outcomes instead of deciding a single binary event
- rule-sensitive markets, where wording and oracle mechanics matter more than the underlying thesis

The goal is not "more RAG" in the abstract. The goal is:

1. classify the market by settlement mechanics
2. apply a source policy that matches that mechanic
3. run the right analysis playbook
4. calibrate the final probability before report writing

## Design Principles

- Classify by settlement mechanics first, topic second.
- Prefer deterministic routing from raw Polymarket event fields before using an LLM router.
- Keep a safe generic fallback path for anything the router cannot classify confidently.
- Start with one specialized branch that addresses the biggest current failure mode: deadline procedural markets.
- Preserve the current progressive `<!--STEP:...-->` update format.

## Router Output Schema

The router should output structured metadata alongside the original event payload.

```json
{
  "market_type": "deadline_procedural",
  "analysis_path": "deadline_procedural",
  "route_confidence": 0.92,
  "market_shape": "single_binary",
  "deadline_sensitivity": "high",
  "domain": "politics",
  "source_policy": [
    "official",
    "local_major_media",
    "wire"
  ],
  "reasons": [
    "single yes/no market",
    "title contains a deadline pattern",
    "description requires a formal official act"
  ]
}
```

The router must always return an `analysis_path`. If classification is weak, use `generic_fallback`.

## Planned Taxonomy

### 1. `deadline_procedural`

Use when the market resolves on a formal step, official act, institutional vote, approval, appointment, filing, call, or launch before a deadline.

Examples:

- "Next Thai Prime Minister chosen by March 31?"
- "UK election called by ___?"
- "Kraken IPO by ___?"
- "Will OpenAI launch a consumer hardware product by ___?"

Key questions:

- What exact act resolves the market?
- Who must do it?
- Which steps remain?
- Is there enough time left to complete them before the deadline?

Source priority:

- official institutions, regulators, exchanges, government sites
- local high-quality media
- Reuters, AP, Bloomberg-equivalent wires

### 2. `deadline_occurrence`

Use when the market is still binary and deadline-driven, but the event is not mainly institutional.

Examples:

- "Taylor Swift pregnant in 2025?"
- "Will any country leave NATO by ___?"
- "China x India military clash by ___?"

Key questions:

- What factual evidence would confirm the event?
- What is the base rate and current trajectory?
- Is the deadline the main constraint?

### 3. `numeric_threshold`

Use when the event resolves on a measurable threshold or ranking.

Examples:

- "When will Bitcoin hit $150k?"
- "Will USDT market cap hit $200B by ___?"
- "OpenAI IPO Closing Market Cap"

Key questions:

- What metric decides settlement?
- How far is the target from current state?
- Which catalysts or releases matter before the deadline?

### 4. `linked_binary_ladder`

Use when one Polymarket event contains multiple correlated yes/no submarkets that differ mainly by date bucket or threshold bucket.

Examples:

- "Kraken IPO by ___ ?"
- "UK election called by...?"
- "MicroStrategy sells any Bitcoin by ___ ?"

Key questions:

- Are the submarkets nested or monotonic?
- Which bucket is the real edge?
- Is the workflow mistakenly treating correlated buckets as mutually exclusive outcomes?

### 5. `competitive_multi_outcome`

Use when the event has many mutually exclusive linked outcomes.

Examples:

- "2026 NBA Champion"
- "Who will Trump endorse?"
- "Which party will win the Senate in 2026?"

Key questions:

- Which outcomes are live contenders?
- What is the ranking, not just the headline favorite?
- Are probabilities internally coherent across outcomes?

### 6. `sports_competition`

Use when the market is sports-specific and requires domain data that generic web search handles poorly.

Examples:

- champions, winners, awards, qualification markets
- single-game or series result markets

Key questions:

- schedule, injuries, rosters, standings, bracket path

### 7. `rule_sensitive`

Use when wording, oracle interpretation, or ambiguous definitions dominate the trade.

Examples:

- subjective status claims
- wording-heavy legal or relationship markets
- markets where "what counts" is the real edge

Key questions:

- what exactly counts as Yes
- whether comparable precedent exists
- whether a correct real-world thesis could still lose on settlement

### 8. `generic_fallback`

Use when none of the above is matched with enough confidence.

This path remains required. It should be safe, calibrated, and explicit about uncertainty.

## Deterministic Router Heuristics

The first router should operate on the raw Polymarket event payload from `gamma-api /events?slug=...`.

Signals to use:

- `title`
- `description`
- `resolutionSource`
- `tags[].slug`
- `markets.length`
- `markets[].groupItemTitle`
- `markets[].outcomes`

Suggested decision order:

1. If sports tags are present, route to `sports_competition`.
2. Else if the event has multiple linked yes/no submarkets and the `groupItemTitle` values look like dates or deadline buckets, route to `linked_binary_ladder`.
3. Else if `markets.length > 1` or multiple non-empty `groupItemTitle` values exist, route to `competitive_multi_outcome`.
4. Else if a single yes/no market contains numeric or threshold language, route to `numeric_threshold`.
5. Else if a single yes/no market contains deadline language plus formal/process language, route to `deadline_procedural`.
6. Else if a single yes/no market is deadline-driven but not clearly procedural, route to `deadline_occurrence`.
7. Else if wording/oracle ambiguity is likely the main risk, route to `rule_sensitive`.
8. Else route to `generic_fallback`.

## Phase 1 Scope

Phase 1 should not split the whole workflow into many live branches at once.

Instead:

1. add a deterministic router node
2. expose router context to Step3, Step4, and Step5
3. add a specialized playbook for `deadline_procedural`
4. keep the current generic playbook as fallback for every other path

This is the minimum change that addresses the current failure mode without destabilizing the workflow.

## Phase 2 Scope

Phase 2 adds a deterministic planning layer so specialized prompts do not have to infer market structure from raw text alone.

Current live shape:

1. `Route Market Type`
2. `Build Analysis Plan`
3. `Step2: Event Info Extraction`
4. `Step3: Probability Analysis`
5. `Step4: Risk Control Audit`
6. `Step5: Report Writer`

Phase 2 specializes two paths:

- `deadline_procedural`
- `linked_binary_ladder`

The `Build Analysis Plan` node provides:

- normalized market snapshot
- sorted bucket list
- monotonicity check for ladder markets
- prompt instructions derived from the selected path

This means the workflow no longer relies only on the LLM to recognize that:

- a single institutional deadline market is about a formal act before a cutoff
- a top-level event like "Kraken IPO by ___ ?" is a correlated deadline ladder, not a mutually exclusive winner market

## Phase 3 Scope

Phase 3 adds a dedicated `numeric_market` analysis path so numeric markets stop borrowing prompts built for procedural or generic narrative markets.

Current live numeric subtypes:

- `numeric_timing_curve`
- `numeric_bucket_distribution`
- `numeric_threshold`

Examples:

- `numeric_timing_curve`
  - "When will Bitcoin hit $150k?"
  - "Will USDT market cap hit $200B by ___?"

- `numeric_bucket_distribution`
  - "OpenAI IPO Closing Market Cap"

- `numeric_threshold`
  - a single yes/no threshold market tied to a measurable value by a deadline

### What Phase 3 Changed

`Route Market Type` now distinguishes:

- procedural timing ladders
- generic linked binary ladders
- numeric timing curves
- numeric bucket distributions
- single numeric thresholds

`Build Analysis Plan` now also provides:

- numeric structure kind
- ordered numeric buckets
- monotonicity checks for timing curves
- distribution-sum checks for bucket distributions

### Prompt Intent

The numeric prompts are designed to force the model to reason from:

- current level
- distance to threshold or bucket boundary
- time remaining
- catalyst calendar
- measurement convention
- settlement/oracle ambiguity

rather than relying on generic news narratives.

## Phase 4 Scope

Phase 4 adds a dedicated `competitive_multi_outcome` path for mutually exclusive fields.

Current live coverage:

- election and nomination winner fields
- balance-of-power scenario fields
- large candidate or scenario fields with meaningful hidden tail

### What Phase 4 Changed

`Route Market Type` now distinguishes:

- `exclusive_field_distribution`
- `event_bundle`

`Build Analysis Plan` now also provides:

- ordered contender or scenario fields
- reportable contender sets for large markets
- synthetic field-tail aggregation for hidden probability mass
- field-sum checks so prompts do not mistake underround or overround for real multi-winner probability

### Prompt Intent

The competitive prompts are designed to force the model to reason about:

- frontrunner concentration
- challenger viability
- hidden-tail risk
- mutual exclusivity
- coherent field distributions that sum close to 100

rather than narrating only the headline favorite.

## Phase 5 Scope

Phase 5 adds a dedicated `sports_competition` path so sports markets no longer fall through to the generic path.

Current live sports subtypes:

- `sports_winner_field`
- `sports_binary_outcome`
- `sports_qualification_bundle`
- `sports_generic_multi`

Examples:

- `sports_winner_field`
  - "2026 NBA Champion"
  - "NBA MVP"
  - "UEFA Champions League Winner"

- `sports_binary_outcome`
  - "Will Wrexham be promoted to the EPL?"
  - single-team playoff, promotion, relegation, or qualification binaries

- `sports_qualification_bundle`
  - "2026 FIFA World Cup: Which countries qualify?"
  - "Which teams will make the NBA Playoffs?"
  - league relegation bundles

### What Phase 5 Changed

`Route Market Type` now maps sports-tagged events to:

- `market_type = sports_competition`
- `analysis_path = sports_competition`

`Build Analysis Plan` now also provides:

- a `sports_profile` object
- sports subtype detection
- reportable contender sets for large winner fields
- compact reportable sets for very large qualification bundles
- sports-aware special instructions for downstream prompts

### Prompt Intent

The sports prompts are designed to force the model to reason from:

- official standings and schedule
- injury and availability reports
- roster and lineup context
- playoff, promotion, qualification, or relegation mechanics
- bracket or seeding path
- major sports reporting and projection-based calibration

rather than generic momentum narratives or raw market anchoring.

## Phase 6 Scope

Phase 6 converts the workflow from logical branching inside long prompts into visible workflow branching on the n8n canvas.

Current live shape:

1. `Route Market Type`
2. `Build Analysis Plan`
3. `Step2: Event Info Extraction`
4. `Route Step3 Path`
5. branch-specific `Step3` nodes
6. unified `Step3: Probability Analysis` pass-through node
7. `Update a row2`
8. `Route Step4 Path`
9. branch-specific `Step4` nodes
10. unified `Step4: Risk Control Audit` pass-through node
11. `Update a row3`
12. `Step5: Report Writer`

### What Phase 6 Changed

`Step3` is no longer one giant conditional prompt. It is now split into:

- `Step3: Procedural Analysis`
- `Step3: Ladder Analysis`
- `Step3: Numeric Analysis`
- `Step3: Competitive Analysis`
- `Step3: Sports Analysis`
- `Step3: Generic Analysis`

`Step4` is now split in the same way:

- `Step4: Procedural Audit`
- `Step4: Ladder Audit`
- `Step4: Numeric Audit`
- `Step4: Competitive Audit`
- `Step4: Sports Audit`
- `Step4: Generic Audit`

Two switch nodes route by `analysis_path`:

- `Route Step3 Path`
- `Route Step4 Path`

Two pass-through bridge nodes preserve the old downstream interface:

- `Step3: Probability Analysis`
- `Step4: Risk Control Audit`

This keeps:

- partial database writes
- downstream report-writing contracts
- existing frontend progressive rendering

while eliminating the worst prompt-bloat problem in the analysis and audit stages.

### Why This Matters

Before Phase 6, the workflow was already logically specialized, but the actual `Step3` and `Step4` prompts had become long enough that each execution still forced the model to read a lot of irrelevant instructions.

Phase 6 fixes that by making the model read only the playbook for the selected path.

That improves:

- prompt focus
- maintainability
- canvas readability in n8n
- room for deeper path-specific prompts later

without forcing a full sub-workflow explosion yet.

## Phase 7 Scope

Phase 7 adds a hybrid retrieval layer so each analysis path can start from a path-aware source pack without pretending that fixed-source retrieval is sufficient on its own.

Current live shape:

1. `Route Market Type`
2. `Build Analysis Plan`
3. `Step2: Event Info Extraction`
4. `Build Retrieval Plan`
5. `Retrieve: News Pack`
6. `Route Structured Retrieval`
7. one structured-source branch:
   - `Retrieve: Sports Source Pack`
   - `Retrieve: Numeric Source Pack`
   - `Retrieve: No Structured Pack`
8. `Assemble Retrieval Pack`
9. `Route Step3 Path`
10. branch-specific `Step3` nodes
11. `Update a row2`
12. branch-specific `Step4` nodes
13. `Update a row3`
14. `Step5: Report Writer`

### What Phase 7 Changed

`Build Retrieval Plan` now derives:

- a compact `news_query`
- path-aware `search_queries`
- a `structured_provider`
- a `structured_label`
- a `source_policy`
- a `coverage_warning`

The live workflow currently uses:

- `GDELT` for a lightweight recent-news pack
- `CoinGecko` for crypto numeric snapshots
- `TheSportsDB` for sports team or league lookups
- built-in model `webSearch` as the supplement and cross-check layer

This is intentionally hybrid:

- fixed-source packs are the anchor
- model search is the coverage backstop
- downstream prompts are explicitly told not to stop at the fixed-source pack when it is thin, stale, or contradictory

### Why This Matters

The point of Phase 7 is not to replace model search with a brittle source whitelist.

The point is to give each path:

- a better starting context
- a better calibration anchor
- a path-specific source policy

## Phase 8 Scope

Phase 8 hardens the retrieval layer so the workflow does not depend on a single weak news source and can attach richer structured packs to sports and numeric paths.

Current live shape:

1. `Build Retrieval Plan`
2. `Retrieve: GDELT News Pack`
3. `Retrieve: Google News Pack`
4. `Retrieve: News Pack`
5. `Route Structured Retrieval`
6. one structured-source branch:
   - `Retrieve: Sports Team Pack`
   - `Retrieve: Sports Standings Pack`
   - `Retrieve: Sports Fixtures Pack`
   - `Retrieve: Sports Source Pack`
   - `Retrieve: Numeric Source Pack`
   - `Retrieve: No Structured Pack`
7. `Assemble Retrieval Pack`

### What Phase 8 Changed

`Build Retrieval Plan` now emits:

- a `news_url` for `GDELT`
- a `news_url_secondary` for `Google News RSS` via `rss2json`
- sports secondary URLs for standings and upcoming fixtures when a league can be inferred
- richer `sports_context`

`Assemble Retrieval Pack` now produces a normalized hybrid pack:

- merged recent-news articles from `GDELT` and `Google News RSS`
- a normalized `structured_pack` for:
  - `CoinGecko` numeric snapshots
  - `TheSportsDB` team lookup, standings, and fixtures
- explicit `coverage_warning` text reminding downstream prompts that fixed-source retrieval is only an anchor

### Why This Matters

This phase is the first real move away from "web search only" without falling into the opposite mistake of pretending that a small whitelist is complete.

The live retrieval design is now:

- deterministic enough to give the model a better starting point
- cheap enough to run on every analysis
- incomplete on purpose, so model search still has room to verify, expand, and override weak fixed-source evidence

## Phase 9 Scope

Phase 9 fixes a sports-specific retrieval bug exposed by promotion and relegation markets.

The original Phase 8 sports branch could misread the title and use the target league named in the market, rather than the team's current league, when fetching standings and fixtures.

That is wrong for markets like:

- "Will Wrexham be promoted to the EPL?"

The analysis needs:

- Wrexham's current league table
- Wrexham's current-league fixtures

not the EPL table, which is the destination league if promotion succeeds.

### What Phase 9 Changed

A new `Build Sports Secondary URLs` node now sits between:

- `Retrieve: Sports Team Pack`
- `Retrieve: Sports Standings Pack`

It uses the `TheSportsDB` team lookup response to derive:

- the team's current league name
- the mapped current league id
- the resolved standings URL
- the resolved fixtures URL

and only falls back to title-derived league context if the team lookup does not expose a mappable current league.

`Retrieve: Sports Source Pack` now carries that resolution metadata forward, and `Assemble Retrieval Pack` exposes it in `structured_pack.market_context`.

### Why This Matters

Without this fix, team-specific sports markets can be fed the wrong competitive context and then produce polished but fundamentally misframed analysis.

With this fix, the sports path now distinguishes:

- the team's current competition
- the destination or target competition implied by the market title

which is required for promotion, relegation, and qualification binaries.

## Phase 10 Scope

Phase 10 adds a second sports-specific source layer so team-specific markets can pull reliable upcoming fixtures without relying on weak league-wide fixture dumps.

This phase keeps:

- `TheSportsDB` for team lookup
- `TheSportsDB` standings for a lightweight table snapshot

and adds:

- `ESPN` league team resolution
- `ESPN` team-specific next-event retrieval

### What Phase 10 Changed

The sports branch now includes:

1. `Build Sports Secondary URLs`
2. `Retrieve: ESPN League Teams Pack`
3. `Build ESPN Team Plan`
4. `Retrieve: ESPN Team Schedule Pack`
5. `Retrieve: Sports Standings Pack`
6. `Retrieve: Sports Fixtures Pack`
7. `Retrieve: Sports Source Pack`

`Build Sports Secondary URLs` now derives ESPN routing metadata when the resolved league maps cleanly to an ESPN sport and league slug.

`Build ESPN Team Plan` resolves:

- `espn_team_id`
- `espn_team_name`
- `espn_league_slug`

from the ESPN league teams feed.

`Retrieve: ESPN Team Schedule Pack` then pulls the team endpoint and exposes:

- record summary
- standing summary
- `nextEvent`

for the resolved team.

`Assemble Retrieval Pack` now prefers ESPN for team-specific fixtures:

- if ESPN yields a usable next event, `fixtures_provider = espn`
- otherwise the workflow falls back to filtered `TheSportsDB` fixtures

### Why This Matters

Before this phase, the workflow could tell which league a team currently played in, but still fail to attach a trustworthy upcoming fixture.

That meant promotion and qualification markets often had:

- a decent standings snapshot
- correct current-league context
- but no reliable next match

Phase 10 closes that gap by adding a path-aware fixture source that is:

- team-specific instead of league-wide
- safer for promotion and relegation markets
- still small enough to fit the current retrieval architecture without replacing the existing sports branch

## Phase 11 Scope

Phase 11 changes the workflow from "analyze every market attached to the event payload" to "analyze only the active or currently tradable market set."

This phase addresses a real Polymarket pattern:

- the event stays active
- old deadline buckets or historical markets remain attached
- some attached markets are already closed
- only a subset is still tradeable

If those closed markets are left in the prompt, they waste tokens and can distort routing and calibration.

### What Phase 11 Changed

`Route Market Type` now classifies the event using a filtered market set instead of the raw full event market list.

The filtering rule is:

1. prefer markets where:
   - `closed != true`
   - `archived != true`
   - `acceptingOrders == true`
   - `enableOrderBook != false`
2. if no such markets exist, fall back to open non-archived active markets
3. if that still fails, fall back to any open non-archived markets

`Build Analysis Plan` now also records:

- `total_market_count`
- `filtered_out_market_count`
- `filtered_out_closed_count`
- `filtered_out_archived_count`
- `filtered_out_non_tradable_count`
- `market_filter_mode`

and exposes:

- `decision_option_rows`

which is a deterministic flattened option list for the active analysis set.

Examples:

- one active binary market:
  - `Yes`
  - `No`
- two active deadline buckets:
  - `March 31, 2026 — Yes`
  - `March 31, 2026 — No`
  - `December 31, 2026 — Yes`
  - `December 31, 2026 — No`

This preserves compatibility with the current one-layer frontend card while preparing the workflow for richer per-market option output later.

### Sports Extension

Phase 11 also introduces a new sports subtype:

- `sports_multi_option_market`

This is intended for a single active market with three or more mutually exclusive outcomes, such as:

- home win / draw / away win
- player A / player B / other

The workflow does not need a nested `markets[].options[]` JSON shape for this case yet, because a single active multi-option market still fits cleanly into the existing flat `options[]` UI.

### Why This Matters

This phase makes the workflow behave more like a trader and less like an archivist.

It now routes and plans based on the markets the user can actually trade now, while still preserving enough metadata to mention that older attached markets were filtered out.

while still letting the model discover missing official or high-quality sources through search.

In practice this means:

- procedural markets can start from a targeted news pack but still search for official votes, filings, or calendars
- numeric markets can start from a direct price snapshot instead of inferring the current level from prose
- sports markets can start from structured team or league context instead of only reading generic articles

## Phase 12 Scope

Phase 12 keeps the English and Chinese workflows structurally aligned.

The English workflow is still the canonical place to evolve routing, planning, retrieval, and market filtering logic first.
The Chinese workflow should mirror that structure rather than maintaining a separate simplified pipeline.

### What Phase 12 Changed

The Chinese workflow now matches the English live structure in these areas:

- active/tradable market filtering before routing and planning
- visible `Step3` and `Step4` physical branching on the canvas
- hybrid retrieval with fixed-source packs plus model web search
- sports retrieval hardening, including current-league resolution and ESPN team schedule lookup
- support for `sports_multi_option_market`

The Chinese workflow keeps its own:

- webhook path
- workflow name
- Chinese user-facing output requirements

### Synchronization Rule

Going forward, structural changes should be applied in this order:

1. evolve and validate the English workflow
2. port the structure to the Chinese workflow
3. keep language-specific prompt instructions localized while preserving the same routing and retrieval logic

This avoids a common failure mode where the English workflow becomes the real product and the Chinese workflow quietly regresses into an older architecture.

### Known Current Limits

Phase 7 is live, but it is still an early retrieval layer.

Current limits:

- `GDELT` query quality still depends on the quality of deterministic keyword construction
- `GDELT` can also be sparse or rate-limited, so the news pack should be treated as optional support, not guaranteed coverage
- sports coverage is stronger for team lookups than for full standings, schedule, and injury context
- non-crypto numeric markets still rely more heavily on model search than on structured APIs

That is acceptable for this phase because the workflow no longer assumes the fixed-source pack is complete.

## `deadline_procedural` Playbook

### Probability Analysis

The analyst should:

- identify the exact formal act that settles the market
- separate "likely eventual event" from "likely before-deadline completion"
- map remaining procedural steps
- estimate the earliest plausible completion path
- estimate the blocker path that forces a miss
- weight official schedules and local reporting above speculation
- avoid extreme probabilities without direct, recent, on-point evidence

### Risk Audit

The auditor should:

- check whether the analyst proved the formal act, not just the underlying narrative
- attack weak assumptions about speed, calendars, quorum, approvals, or sequencing
- check timezone and cutoff interpretation explicitly
- widen the range when the process is real but timing remains uncertain

### Final Report

The writer should:

- present the calibrated final probability, not the raw first pass
- explain the path to settlement in plain language
- highlight the one or two process blockers most likely to cause a miss
- keep the final recommendation conservative when the process is live but the timeline is uncertain

## Fallback Rules

If the router is uncertain:

- set `analysis_path = generic_fallback`
- include the uncertainty reason in router output
- instruct downstream prompts to avoid extreme probabilities

If the market contains conflicting signals, prefer the safer path:

- `rule_sensitive` over `deadline_occurrence`
- `generic_fallback` over a forced specialized route

## Current Live Paths

The live workflow now has specialized coverage for:

1. `deadline_procedural`
2. `linked_binary_ladder`
3. `numeric_market`
4. `competitive_multi_outcome`
5. `sports_competition`

Each path still preserves a safe `generic_fallback` when the router is weak or the structure is unusual.
The key difference now is that `Step3` and `Step4` are physically branched on the canvas instead of only being conditionally specialized inside one long node prompt.

## Next Candidates

After the current live sports phase is stable, the next branches worth adding are:

1. `rule_sensitive` hardening for wording-heavy settlement traps
2. deeper sports handling for slot-constrained qualification bundles and single-game or series markets
3. retrieval hardening by source policy instead of relying on one generic search layer
4. an offline regression harness so prompt changes can be replayed against fixed historical samples

The biggest lesson so far is that routing by settlement mechanics works better than treating every market as a generic narrative prediction problem.
