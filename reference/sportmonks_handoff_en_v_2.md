# SportMonks Football API 3.0 — English Handoff for the Windsurf Agent

This document is the implementation reference for adding and correcting SportMonks endpoints inside the match-analysis bot.

It is written for an agent that does **not** have direct web access, so every rule below is meant to be explicit, practical, and safe to implement.

---

## Locked project constraints

These are intentional and must be followed exactly:

- Plan: **highest SportMonks plan** with all features available.
- Odds scope: **keep Standard Odds only**.
- Bookmaker scope: **bookmaker `35` only** for now.
- Do **not** add Premium Odds into this workflow, because the current betting pipeline is built around bookmaker `35`, and that is the only bookmaker the user wants to consume right now.
- Keep the current bookmaker tables and sync logic centered on bookmaker `35`.

---

## Current project review (`sync-direct.js`)

### What is already correct

The current project already has a strong base:

- fixture snapshot
- H2H
- team season stats
- referee season stats
- standings by season
- predictions
- news
- expected lineups
- transfer rumours
- standard pre-match odds for bookmaker 35
- standard inplay odds for bookmaker 35

### What must be corrected

#### 1) `syncXG` is not aligned with the current official docs

The current file calls:

- `expected/fixtures/${fixtureId}`
- `expected/lineups/${fixtureId}`

The current API 3.0 docs now expose xG through the collection endpoints:

- `/v3/football/expected/fixtures`
- `/v3/football/expected/lineups`

So the safe implementation is:

1. request the official collection endpoint
2. enrich with the required `include`
3. optionally use `filters` if you have an official supported filter for your use case
4. otherwise filter locally by `fixture_id`

Do **not** build the new integration around undocumented single-fixture xG paths.

#### 2) `syncExpectedLineups` is conceptually correct

The current logic uses:

- `expected-lineups/teams/{teamId}`

then filters locally by `fixture_id`.

That is the correct pattern for now because the official docs expose team-based and player-based expected lineup endpoints, not a dedicated fixture-based expected lineup endpoint.

#### 3) `syncNews` is correct in direction, but should be tightened

Keep:

- season-specific pre-match news first
- upcoming pre-match news as fallback

But add:

- `order=desc`
- `per_page=50`
- dedupe by article `id`
- always keep `fixture_id`, `league_id`, and `lines`

#### 4) standings coverage is incomplete

The current project uses season standings only.

Add these missing standings endpoints:

- standings by round
- standing corrections by season
- live standings by league

#### 5) odds layer should stay exactly as requested

Keep using:

- Standard Odds
- bookmaker `35`

Do not add Premium Odds in this version of the handoff.

---

## Global implementation rules

### 1) Treat the Base URL shown on the endpoint page as the source of truth

If a page contains an older code snippet that uses a slightly different path format, use the **Base URL block at the top of the endpoint page** as the canonical path.

This matters especially for some News pages where the page may show mixed `pre-match` vs `prematch` examples.

### 2) Use `include` only when it adds analysis value

Do not pull huge payloads blindly.

### 3) Use `select` to reduce payload whenever your SDK/helper supports it cleanly

Only select fields that the bot truly needs.

### 4) Respect pagination whenever the endpoint says `Pagination: Yes`

Never assume one page is enough.

### 5) Use `filters` only if they are officially supported for the included entity

SportMonks exposes entity filter discovery. When the agent needs exact filter names, it should consult the official filter catalog endpoint:

`/v3/my/filters/entity`

---

# 1) Expected (xG)

## 1.1 GET Expected by Team

### Official path

`GET /v3/football/expected/fixtures`

### Purpose

Returns xG values at the **team level**.

### Available query params

- `api_token` (required)
- `include`
- `select`
- `filters`

### Include options

- `type`
- `fixture`
- `participant`

### Pagination

- Yes

### Include depth

- 3 nested includes

### Required include for best analysis

`type;fixture;participant`

### Recommended request

`/v3/football/expected/fixtures?include=type;fixture;participant`

### Implementation rule

Use this endpoint as the source of team xG. Then narrow the result to the target match by `fixture_id`.

### #example-response

```json
{
  "data": [
    {
      "id": 26898369,
      "fixture_id": 18898173,
      "type_id": 5304,
      "participant_id": 10010,
      "data": { "value": 1.0674 },
      "location": "home",
      "type": { "id": 5304, "name": "Expected Goals" },
      "fixture": { "id": 18898173, "name": "Team A vs Team B" },
      "participant": { "id": 10010, "name": "Team A" }
    },
    {
      "id": 26898370,
      "fixture_id": 18898173,
      "type_id": 5304,
      "participant_id": 7011,
      "data": { "value": 1.8234 },
      "location": "away",
      "type": { "id": 5304, "name": "Expected Goals" },
      "fixture": { "id": 18898173, "name": "Team A vs Team B" },
      "participant": { "id": 7011, "name": "Team B" }
    }
  ]
}
```

---

## 1.2 GET Expected by Player

### Official path

`GET /v3/football/expected/lineups`

### Purpose

Returns xG values at the **player / lineup level**.

### Available query params

- `api_token` (required)
- `include`
- `select`
- `filters`

### Include options

- `type`
- `fixture`
- `player`
- `team`

### Pagination

- Yes

### Include depth

- 3 nested includes

### Required include for best analysis

`type;fixture;player;team`

### Recommended request

`/v3/football/expected/lineups?include=type;fixture;player;team`

### Implementation rule

Use this endpoint for per-player xG contribution. Then keep only rows matching the target `fixture_id`.

### #example-response

```json
{
  "data": [
    {
      "id": 1064853093,
      "fixture_id": 19076535,
      "player_id": 77908,
      "team_id": 238626,
      "lineup_id": 8076889919,
      "type_id": 5304,
      "data": { "value": 0.0295 },
      "type": { "id": 5304, "name": "Expected Goals" },
      "fixture": { "id": 19076535, "name": "Team A vs Team B" },
      "player": { "id": 77908, "display_name": "Player A" },
      "team": { "id": 238626, "name": "Team A" }
    }
  ]
}
```

---

# 2) Premium Expected Lineups

## 2.1 GET Expected Lineup by Team

### Official path

`GET /v3/football/expected-lineups/teams/{TEAM_ID}`

### Purpose

Returns expected lineup rows for a specific team.

### Available query params

- `api_token` (required)
- `include`
- `select`
- `filters`

### Include options

- `type`
- `fixture`
- `participant`

### Pagination

- Yes

### Include depth

- 3 nested includes

### Required include for best analysis

`type;fixture;participant`

### Recommended request

`/v3/football/expected-lineups/teams/{TEAM_ID}?include=type;fixture;participant&per_page=50`

### Implementation rule

Call this once for the home team and once for the away team, then keep only entries where `fixture_id === targetFixtureId`.

### #example-response

```json
{
  "data": [
    {
      "id": 1,
      "sport_id": 1,
      "fixture_id": 19347797,
      "player_id": 37526530,
      "team_id": 3285,
      "formation_field": null,
      "position_id": null,
      "detailed_position_id": null,
      "type_id": 77615,
      "formation_position": null,
      "player_name": "Player A",
      "jersey_number": 2,
      "type": { "id": 77615, "name": "Starting XI" },
      "fixture": { "id": 19347797, "name": "Team A vs Team B" },
      "participant": { "id": 3285, "name": "Team A" }
    }
  ]
}
```

---

## 2.2 GET Expected Lineups by Player

### Official path

`GET /v3/football/expected-lineups/players/{PLAYER_ID}`

### Purpose

Returns expected lineup rows for one player across fixtures.

### Available query params

- `api_token` (required)
- `include`
- `select`
- `filters`

### Include options

- `type`
- `fixture`
- `player`
- `team`

### Pagination

- Yes

### Include depth

- 3 nested includes

### Required include for best analysis

`type;fixture;player;team`

### Recommended request

`/v3/football/expected-lineups/players/{PLAYER_ID}?include=type;fixture;player;team&per_page=50`

### Best use case

Use this when the agent wants to verify whether a key player is expected to start.

### #example-response

```json
{
  "data": [
    {
      "id": 1,
      "sport_id": 1,
      "fixture_id": 19347797,
      "player_id": 37526530,
      "team_id": 3285,
      "formation_field": null,
      "position_id": null,
      "detailed_position_id": null,
      "type_id": 77615,
      "formation_position": null,
      "player_name": "Player A",
      "jersey_number": 2,
      "type": { "id": 77615, "name": "Starting XI" },
      "fixture": { "id": 19347797, "name": "Team A vs Team B" },
      "player": { "id": 37526530, "display_name": "Player A" },
      "team": { "id": 3285, "name": "Team A" }
    }
  ]
}
```

---

# 3) News

## 3.1 GET Pre-Match News by Season ID

### Official path

`GET /v3/football/news/pre-match/seasons/{ID}`

### Purpose

Returns pre-match news articles for one season.

### Available query params

- `api_token` (required)
- `include`
- `filters`
- `order`
- `per_page`
- `page`

### Include options

- `fixture`
- `league`
- `lines`

### Pagination

- Yes

### Include depth

- 1 nested include

### Required include for best analysis

`fixture;league;lines`

### Recommended request

`/v3/football/news/pre-match/seasons/{ID}?include=fixture;league;lines&order=desc&per_page=50`

### Implementation rule

This should be the primary news endpoint when `season_id` is known.

### #example-response

```json
{
  "data": [
    {
      "id": 1376,
      "fixture_id": 18535041,
      "league_id": 8,
      "title": "Team A vs Team B",
      "type": "prematch",
      "fixture": { "id": 18535041, "name": "Team A vs Team B" },
      "league": { "id": 8, "name": "Premier League" },
      "lines": [
        { "id": 1, "content": "Key injury update..." },
        { "id": 2, "content": "Manager comments..." }
      ]
    }
  ]
}
```

---

## 3.2 GET Pre-Match News for Upcoming Fixtures

### Official path

`GET /v3/football/news/pre-match/upcoming`

### Purpose

Returns pre-match news articles for upcoming fixtures inside the subscription scope.

### Available query params

- `api_token` (required)
- `include`
- `filters`
- `order`
- `per_page`
- `page`

### Include options

- `fixture`
- `league`
- `lines`

### Pagination

- Yes

### Include depth

- 1 nested include

### Required include for best analysis

`fixture;league;lines`

### Recommended request

`/v3/football/news/pre-match/upcoming?include=fixture;league;lines&order=desc&per_page=50`

### Implementation rule

Use this only as a fallback when the season-specific route is unavailable or when you intentionally want a wider upcoming-news sweep.

### #example-response

```json
{
  "data": [
    {
      "id": 2274,
      "fixture_id": 18535339,
      "league_id": 8,
      "title": "Manager update before Team A vs Team B",
      "type": "prematch",
      "fixture": { "id": 18535339, "name": "Team A vs Team B" },
      "league": { "id": 8, "name": "Premier League" },
      "lines": [
        { "id": 10, "content": "Expected tactical setup..." }
      ]
    }
  ]
}
```

---

# 4) Standings

## 4.1 GET Standings by Season ID

### Official path

`GET /v3/football/standings/seasons/{ID}`

### Purpose

Returns the full standing table for one season.

### Available query params

- `api_token` (required)
- `include`
- `select`
- `filters`
- `locale`

### Include options

- `participant`
- `season`
- `league`
- `stage`
- `group`
- `round`
- `rule`
- `details`
- `form`
- `sport`

### Pagination

- No

### Include depth

- 2 nested includes

### Required include for best analysis

`participant;season;league;stage;round;group;rule;details.type;form`

### Recommended request

`/v3/football/standings/seasons/{ID}?include=participant;season;league;stage;round;group;rule;details.type;form`

### #example-response

```json
{
  "data": [
    {
      "id": 2588673,
      "sport_id": 1,
      "league_id": 501,
      "season_id": 19735,
      "stage_id": 77457866,
      "group_id": null,
      "round_id": 275092,
      "participant_id": 53,
      "standing_rule_id": 13224,
      "position": 1,
      "result": "up",
      "points": 78,
      "participant": { "id": 53, "name": "Team A" },
      "season": { "id": 19735, "name": "2025/2026" },
      "league": { "id": 501, "name": "League" },
      "stage": { "id": 77457866, "name": "Regular Season" },
      "round": { "id": 275092, "name": "Round 30" },
      "group": null,
      "rule": { "id": 13224, "name": "League Table" },
      "details": [
        { "type": { "id": 1, "name": "wins" }, "value": 24 },
        { "type": { "id": 2, "name": "goals_for" }, "value": 70 }
      ],
      "form": ["W", "W", "D", "W", "L"]
    }
  ]
}
```

---

## 4.2 GET Standings by Round ID

### Official path

`GET /v3/football/standings/rounds/{ID}`

### Purpose

Returns the standing table for a specific round.

### Available query params

- `api_token` (required)
- `include`
- `select`
- `filters`
- `locale`

### Include options

- `participant`
- `season`
- `league`
- `stage`
- `group`
- `round`
- `rule`
- `details`
- `form`
- `sport`

### Pagination

- No

### Include depth

- 2 nested includes

### Required include for best analysis

`participant;season;league;stage;round;group;rule;details.type;form`

### Recommended request

`/v3/football/standings/rounds/{ID}?include=participant;season;league;stage;round;group;rule;details.type;form`

### #example-response

```json
{
  "data": [
    {
      "id": 2588673,
      "league_id": 501,
      "season_id": 19735,
      "round_id": 275092,
      "participant_id": 53,
      "position": 1,
      "points": 78,
      "participant": { "id": 53, "name": "Team A" },
      "round": { "id": 275092, "name": "Round 30" },
      "details": [
        { "type": { "id": 1, "name": "wins" }, "value": 24 }
      ],
      "form": ["W", "W", "D", "W", "L"]
    }
  ]
}
```

---

## 4.3 GET Standing Correction by Season ID

### Official path

`GET /v3/football/standings/corrections/seasons/{ID}`

### Purpose

Returns point corrections, deductions, or additions applied officially in the season.

### Available query params

- `api_token` (required)
- `include`
- `select`
- `filters`
- `locale`

### Include options

- `participant`
- `season`
- `league`
- `stage`
- `group`

### Pagination

- No

### Include depth

- 2 nested includes

### Required include for best analysis

`participant;season;league;stage;group`

### Recommended request

`/v3/football/standings/corrections/seasons/{ID}?include=participant;season;league;stage;group`

### #example-response

```json
{
  "data": [
    {
      "id": 6398,
      "season_id": 19790,
      "stage_id": 77457999,
      "group_id": null,
      "type_id": 173,
      "value": 3,
      "calc_type": "-",
      "participant_type": "team",
      "participant_id": 3630,
      "active": true,
      "participant": { "id": 3630, "name": "Team A" },
      "season": { "id": 19790, "name": "2025/2026" },
      "league": { "id": 8, "name": "League" },
      "stage": { "id": 77457999, "name": "Regular Season" },
      "group": null
    }
  ]
}
```

---

## 4.4 GET Live Standings by League ID

### Official path

`GET /v3/football/standings/live/leagues/{ID}`

### Purpose

Returns the live standings table for the active stage of a league.

### Available query params

- `api_token` (required)
- `include`
- `select`
- `filters`
- `locale`

### Include options

- `participant`
- `season`
- `league`
- `stage`
- `group`
- `round`
- `rule`
- `details`
- `form`
- `sport`

### Pagination

- No

### Include depth

- 2 nested includes

### Required include for best analysis

`participant;season;league;stage;round;group;rule;details.type;form`

### Recommended request

`/v3/football/standings/live/leagues/{ID}?include=participant;season;league;stage;round;group;rule;details.type;form`

### Important note

This endpoint may return no data when there is no active stage in the league.

### #example-response

```json
{
  "data": [
    {
      "id": 2588673,
      "league_id": 501,
      "season_id": 19735,
      "participant_id": 53,
      "position": 1,
      "points": 78,
      "result": "up",
      "participant": { "id": 53, "name": "Team A" },
      "season": { "id": 19735, "name": "2025/2026" },
      "league": { "id": 501, "name": "League" },
      "stage": { "id": 77457866, "name": "Regular Season" },
      "details": [
        { "type": { "id": 1, "name": "wins" }, "value": 24 }
      ],
      "form": ["W", "W", "D", "W", "L"]
    }
  ]
}
```

---

# 5) Bookmaker / Odds policy for this project

## Keep this exactly as-is

Use only:

- `odds/pre-match/fixtures/{fixtureId}/bookmakers/35`
- `odds/inplay/fixtures/{fixtureId}/bookmakers/35`

with:

- `include=market;bookmaker`

## Do not add Premium Odds in this handoff

Reason:

- the user wants bookmaker `35` only
- this workflow is already built around bookmaker `35`
- Premium Odds is intentionally out of scope for this version

---

# 6) Missing endpoints that should still be added for stronger analysis

These are the highest-value missing additions from the current project, but they are **supporting endpoints**, not replacements for the core stack above.

## 6.1 `GET /v3/football/livescores/latest`

Use as the live change trigger.

Why it matters:

- detects fixtures updated in the last 10 seconds
- ideal for polling every 5–8 seconds
- prevents unnecessary heavy refreshes

Recommended include for a rich live refresh layer:

`state;participants;scores;events;statistics;periods;inplayOdds;xGFixture;expectedLineups;matchfacts`

## 6.2 `GET /v3/football/livescores/inplay`

Use as the lightweight live fixture feed.

Why it matters:

- fast live discovery
- same fixture-style structure
- better than re-pulling full fixture pages too often

## 6.3 `GET /v3/football/schedules/seasons/{seasonId}/teams/{teamId}`

Use to calculate:

- rest days
- fixture congestion
- travel / sequence stress
- short-turnaround risk

## 6.4 `GET /v3/football/squads/seasons/{seasonId}/teams/{teamId}`

Use to model:

- squad depth
- backup quality
- positional coverage
- expected lineup fallback strength

Recommended include:

`player;team;season;details;position`

## 6.5 `GET /v3/football/commentaries/fixtures/{fixtureId}`

Use for live pressure, momentum, and dangerous-phase interpretation.

Recommended include:

`fixture;player;relatedPlayer`

## 6.6 `GET /v3/football/match-facts/{fixtureId}`

Use as a structured narrative support layer.

It is valuable for:

- contextual facts
- pattern reinforcement
- human-readable support for the final AI explanation

---

# 7) Final implementation priorities

## Priority 1

Fix `syncXG` to use the official xG collection endpoints.

## Priority 2

Add the three missing standings endpoints:

- by round
- corrections
- live standings

## Priority 3

Keep bookmaker `35` Standard Odds exactly as-is.

## Priority 4

Tighten news sync with:

- `order=desc`
- `per_page=50`
- dedupe by article `id`

## Priority 5

Add live trigger and context endpoints:

- `livescores/latest`
- `livescores/inplay`
- schedules by season + team
- squads by season + team
- commentaries by fixture
- match facts by fixture

---

# 8) Short conclusion for the agent

If the goal is a stronger football analysis engine without changing the bookmaker policy, the correct path is:

1. fix xG integration
2. complete standings coverage
3. enrich pre-match context with news + squads + schedules
4. enrich live context with latest/inplay/commentaries/match facts
5. keep odds strictly on Standard Odds + bookmaker `35`

That combination produces a much more professional analysis stack without breaking the current betting workflow.

