# SportMonks Football API 3.0 — Missing Endpoints Handoff (Professional Analysis Expansion)

This file is a **second companion handoff** for the Windsurf agent.

It is focused **only on the high-impact endpoints that are still missing from the current project** and that can materially improve:

- pre-match analysis quality
- live match interpretation
- contextual betting analysis
- squad depth evaluation
- schedule congestion modelling
- narrative evidence for the final AI explanation

It does **not** repeat the endpoints that already exist in `sync-direct.js` unless they need a related companion endpoint.

---

## Current project coverage already present

The current project already includes these areas:

- fixture by id snapshot
- head-to-head fixtures
- team season statistics
- referee season statistics
- standings by season
- xG
- predictions
- pre-match news
- expected lineups
- transfer rumours
- standard pre-match odds for bookmaker `35`
- standard inplay odds for bookmaker `35`

This handoff only covers what is still missing.

---

## Important implementation note

All `#example-response` blocks below are **schema-oriented examples** designed to help the agent understand the structure quickly.

They are intentionally:

- simplified
- partial
- safe to read
- not exhaustive copies of the official examples

The agent must still treat the official SportMonks documentation as the source of truth for live field availability.

---

# 1) GET Standings by Round ID

### Why this endpoint is missing-but-important

The current project already stores **season standings**, but that is not always enough.

`standings/rounds/{ID}` is useful when the analysis must be tied to a **specific round context**, especially when:

- the competition has multiple stages
- the round table differs from the global season picture
- you want exact round-linked league position context

### Official path

`GET /v3/football/standings/rounds/{ID}`

### Available query params

- `api_token` — required
- `include`
- `select`
- `filters`
- `locale`

### Include depth

- `2`

### Pagination

- `NO`

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

### Best include for analysis

`participant;season;league;stage;round;group;rule;details.type;form`

### Recommended request

```txt
/v3/football/standings/rounds/{ROUND_ID}?include=participant;season;league;stage;round;group;rule;details.type;form
```

### Best use inside the bot

Use it to enrich the analysis packet with:

- exact round-linked league table
- points separation before the fixture
- form sequence
- standing details such as wins / goals / tie-break context

### #example-response

```json
{
  "data": [
    {
      "id": 2588673,
      "league_id": 501,
      "season_id": 19735,
      "stage_id": 77457866,
      "round_id": 275092,
      "participant_id": 53,
      "position": 1,
      "points": 73,
      "result": "equal",
      "participant": {
        "id": 53,
        "name": "Team A"
      },
      "round": {
        "id": 275092,
        "name": "Round 30"
      },
      "details": [
        {
          "type": { "id": 1, "name": "wins" },
          "value": 23
        },
        {
          "type": { "id": 2, "name": "goals_for" },
          "value": 67
        }
      ],
      "form": ["W", "W", "D", "W", "L"]
    }
  ]
}
```

---

# 2) GET Standing Correction by Season ID

### Why this endpoint is missing-but-important

A season table can be misleading when a federation has applied:

- point deductions
- point awards
- disciplinary corrections

Without this endpoint, the AI may misread incentive, table pressure, or relegation risk.

### Official path

`GET /v3/football/standings/corrections/seasons/{ID}`

### Available query params

- `api_token` — required
- `include`
- `select`
- `filters`
- `locale`

### Include depth

- `2`

### Pagination

- `NO`

### Include options

- `participant`
- `season`
- `league`
- `stage`
- `group`

### Best include for analysis

`participant;season;league;stage;group`

### Recommended request

```txt
/v3/football/standings/corrections/seasons/{SEASON_ID}?include=participant;season;league;stage;group
```

### Best use inside the bot

Use it as a season-table correction layer:

- apply the correction context to motivation analysis
- detect if the current table is distorted by sanctions
- avoid misleading conclusions from raw points alone

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
      "participant": {
        "id": 3630,
        "name": "Team A"
      },
      "season": {
        "id": 19790,
        "name": "2025/2026"
      },
      "league": {
        "id": 8,
        "name": "League A"
      }
    }
  ]
}
```

---

# 3) GET Live Standings by League ID

### Why this endpoint is missing-but-important

This is one of the strongest missing live-analysis endpoints.

It tells the bot how the **table changes while matches are live**, which is critical for:

- motivation spikes
- must-score situations
- protecting a result vs chasing a result
- title / Europe / relegation pressure during live play

### Official path

`GET /v3/football/standings/live/leagues/{ID}`

### Available query params

- `api_token` — required
- `include`
- `select`
- `filters`
- `locale`

### Include depth

- `2`

### Pagination

- `NO`

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

### Best include for analysis

`participant;season;league;stage;round;group;rule;details.type;form`

### Recommended request

```txt
/v3/football/standings/live/leagues/{LEAGUE_ID}?include=participant;season;league;stage;round;group;rule;details.type;form
```

### Important note

If the league has **no active stage**, this endpoint may return no data.

### Best use inside the bot

During live analysis, use this endpoint to derive:

- what the current score means for the live table
- whether a draw is enough
- whether one more goal would change the live standing significantly

### #example-response

```json
{
  "data": [
    {
      "id": 6569,
      "league_id": 501,
      "season_id": 19735,
      "stage_id": 77457866,
      "round_id": 274730,
      "participant_id": 53,
      "position": 1,
      "points": 73,
      "result": "equal",
      "participant": {
        "id": 53,
        "name": "Team A"
      },
      "league": {
        "id": 501,
        "name": "League A"
      },
      "details": [
        {
          "type": { "id": 2, "name": "goals_for" },
          "value": 64
        }
      ],
      "form": ["W", "D", "W", "W", "L"]
    }
  ]
}
```

---

# 4) GET Schedules by Season ID and Team ID

### Why this endpoint is missing-but-important

This is one of the most practical missing **pre-match context** endpoints.

It helps the AI understand:

- rest days
- congestion
- fixture sequence stress
- short turnaround risk
- whether a team is inside a dense schedule window

### Official path

`GET /v3/football/schedules/seasons/{id}/teams/{id}`

### Available query params

- `api_token` — required
- `include`
- `select`
- `filters`
- `locale`

### Include depth

- `0`

### Pagination

- `NO`

### Include options

- `NONE`

### Recommended request

```txt
/v3/football/schedules/seasons/{SEASON_ID}/teams/{TEAM_ID}
```

### Best use inside the bot

Compute derived schedule signals:

- days since last match
- days until next match
- matches in the last 7 days
- matches in the next 7–14 days
- whether the fixture sits inside a high-load cluster

### #example-response

```json
{
  "data": [
    {
      "id": 77457866,
      "league_id": 501,
      "season_id": 19735,
      "name": "Regular Season",
      "is_current": true,
      "rounds": [
        {
          "id": 274733,
          "name": "Round 20",
          "fixtures": [
            {
              "id": 18535605,
              "league_id": 501,
              "season_id": 19735,
              "round_id": 274733,
              "state_id": 5,
              "name": "Team A vs Team B",
              "starting_at": "2026-03-01 18:00:00",
              "starting_at_timestamp": 1772388000,
              "result_info": "Game ended in draw.",
              "length": 90,
              "has_odds": true,
              "participants": [
                {
                  "id": 53,
                  "name": "Team A",
                  "meta": { "location": "home", "winner": false }
                },
                {
                  "id": 62,
                  "name": "Team B",
                  "meta": { "location": "away", "winner": false }
                }
              ],
              "scores": [
                {
                  "description": "CURRENT",
                  "participant_id": 53,
                  "score": { "goals": 2, "participant": "home" }
                },
                {
                  "description": "CURRENT",
                  "participant_id": 62,
                  "score": { "goals": 2, "participant": "away" }
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

---

# 5) GET Team Squad by Team and Season ID

### Why this endpoint is missing-but-important

Expected lineups alone are not enough.

The bot also needs the **season squad pool** to model:

- depth quality
- positional coverage
- bench strength
- injury impact severity
- replacement plausibility

### Official path

`GET /v3/football/squads/seasons/{seasonID}/teams/{teamID}`

### Available query params

- `api_token` — required
- `include`
- `select`
- `filters`
- `locale`

### Include depth

- `2`

### Pagination

- `NO`

### Include options

- `player`
- `team`
- `season`
- `details`
- `position`

### Best include for analysis

`player;team;season;details;position`

### Recommended request

```txt
/v3/football/squads/seasons/{SEASON_ID}/teams/{TEAM_ID}?include=player;team;season;details;position
```

### Best use inside the bot

Join this endpoint with:

- sidelined data from fixture snapshots
- expected lineups
- player xG

Then derive:

- who is available
- who is missing
- whether replacements are natural or weak
- whether absences damage finishing / creation / defensive structure

### #example-response

```json
{
  "data": [
    {
      "id": 81291,
      "player_id": 991122,
      "team_id": 53,
      "season_id": 19735,
      "position_id": 27,
      "jersey_number": 9,
      "player": {
        "id": 991122,
        "display_name": "Forward A"
      },
      "team": {
        "id": 53,
        "name": "Team A"
      },
      "season": {
        "id": 19735,
        "name": "2025/2026"
      },
      "position": {
        "id": 27,
        "name": "Attacker"
      },
      "details": [
        {
          "type_id": 100,
          "value": "first_team"
        }
      ]
    }
  ]
}
```

---

# 6) GET Team Squad by Team ID

### Why this endpoint is missing-but-important

This is a very useful companion endpoint.

Use it when:

- season id is not yet resolved
- you want the current domestic squad quickly
- you need a faster fallback than season-specific squad logic

### Official path

`GET /v3/football/squads/teams/{ID}`

### Available query params

- `api_token` — required
- `include`
- `select`
- `filters`
- `locale`

### Include depth

- `4`

### Pagination

- `NO`

### Include options

- `team`
- `player`
- `position`
- `detailedPosition`
- `transfer`

### Best include for analysis

`player;team;position;detailedPosition;transfer`

### Recommended request

```txt
/v3/football/squads/teams/{TEAM_ID}?include=player;team;position;detailedPosition;transfer
```

### Best use inside the bot

Use it as a fallback and current-squad layer:

- latest squad members
- role granularity via `detailedPosition`
- transfer timing context
- contract window hints via `start` / `end`

### #example-response

```json
{
  "data": [
    {
      "id": 6540,
      "transfer_id": 26785,
      "player_id": 78121,
      "team_id": 62,
      "position_id": 27,
      "detailed_position_id": 151,
      "jersey_number": 9,
      "start": "2024-07-01",
      "end": "2027-06-30",
      "player": {
        "id": 78121,
        "display_name": "Forward B"
      },
      "position": {
        "id": 27,
        "name": "Attacker"
      },
      "detailedPosition": {
        "id": 151,
        "name": "Centre Forward"
      },
      "transfer": {
        "id": 26785,
        "date": "2024-07-10"
      }
    }
  ]
}
```

---

# 7) GET Topscorers by Season ID

### Why this endpoint is missing-but-important

This endpoint adds a strong player-impact layer.

It helps the AI measure:

- attacking reliance on one player
- scoring distribution inside the team
- assist concentration
- card-risk context if filtered by type

### Official path

`GET /v3/football/topscorers/seasons/{ID}`

### Available query params

- `api_token` — required
- `include`
- `select`
- `filters`
- `locale`
- `order`
- `per_page`
- `page`

### Include depth

- `4`

### Pagination

- `YES`

### Include options

- `season`
- `stage`
- `player`
- `participant`
- `type`

### Best include for analysis

`season;stage;player;participant;type`

### Recommended request

```txt
/v3/football/topscorers/seasons/{SEASON_ID}?include=season;stage;player;participant;type&order=asc&per_page=50
```

### Best use inside the bot

Use this endpoint to build:

- team scoring dependency scores
- assist dependency scores
- card-risk profiles
- “missing star attacker” penalty if the key scorer is unavailable

### #example-response

```json
{
  "data": [
    {
      "id": 1540848,
      "season_id": 19735,
      "player_id": 20708316,
      "type_id": 83,
      "position": 1,
      "total": 19,
      "participant_id": 314,
      "season": {
        "id": 19735,
        "name": "2025/2026"
      },
      "stage": {
        "id": 77457866,
        "name": "Regular Season"
      },
      "player": {
        "id": 20708316,
        "display_name": "Striker A"
      },
      "participant": {
        "id": 314,
        "name": "Team A"
      },
      "type": {
        "id": 83,
        "name": "Goals"
      }
    }
  ],
  "pagination": {
    "has_more": false,
    "current_page": 1
  }
}
```

---

# 8) GET Commentaries by Fixture ID

### Why this endpoint is missing-but-important

This is one of the best missing **live narrative** endpoints.

Raw numbers do not fully explain a live match. Commentary helps interpret:

- pressure waves
- repeated dangerous attacks
- missed big chances
- tactical momentum swings
- game flow between major events

### Official path

`GET /v3/football/commentaries/fixtures/{ID}`

### Available query params

- `api_token` — required
- `include`
- `select`
- `filters`
- `locale`

### Include depth

- `1`

### Pagination

- `NO`

### Include options

- `fixture`
- `player`
- `relatedPlayer`

### Best include for analysis

`fixture;player;relatedPlayer`

### Recommended request

```txt
/v3/football/commentaries/fixtures/{FIXTURE_ID}?include=fixture;player;relatedPlayer
```

### Best use inside the bot

Do **not** send all raw commentary lines directly to the final AI response.

Instead, compress them into derived signals such as:

- dangerous attacks in the last 10 minutes
- repeated shots / saves
- recent big chance count
- which team is territorially stronger
- whether momentum changed after a card, goal, or substitution

### #example-response

```json
{
  "data": [
    {
      "id": 4991022,
      "fixture_id": 18535605,
      "comment": "First half starts.",
      "minute": null,
      "extra_minute": null,
      "is_goal": false,
      "is_important": false,
      "order": 1,
      "fixture": {
        "id": 18535605,
        "name": "Team A vs Team B"
      }
    },
    {
      "id": 4991023,
      "fixture_id": 18535605,
      "comment": "Shot saved from the right side of the box.",
      "minute": 1,
      "extra_minute": null,
      "is_goal": false,
      "is_important": false,
      "order": 2,
      "player": {
        "id": 77221,
        "display_name": "Player A"
      },
      "relatedPlayer": {
        "id": 88331,
        "display_name": "Player B"
      }
    }
  ]
}
```

---

# 9) GET Match Facts by Fixture ID

### Why this endpoint is missing-but-important

This endpoint is a strong **evidence layer**.

It helps the bot generate structured supporting facts such as:

- streaks
- H2H tendencies
- player / team outcome patterns
- probability-flavoured narrative context

### Official path

`GET /v3/football/match-facts/{FIXTURE_ID}`

### Available query params

- `api_token` — required
- `include`
- `select`
- `sortBy`
- `filters`
- `locale`

### Include depth

- `3`

### Pagination

- `YES`

### Include options

- `type`
- `sport`
- `fixture`

### Useful special filter

- `matchFactTypes`

### Best include for analysis

`type;sport;fixture`

### Recommended request

```txt
/v3/football/match-facts/{FIXTURE_ID}?include=type;sport;fixture
```

### Best use inside the bot

Use match facts as a structured explanation layer, not as a primary predictive engine.

It is especially useful for:

- reinforcing the final narrative
- summarising pattern-based evidence
- highlighting unusual statistical tendencies

### #example-response

```json
{
  "data": [
    {
      "id": 28083540,
      "sport_id": 1,
      "fixture_id": 19427187,
      "type_id": 76115,
      "participant": "both",
      "basis": "h2h",
      "data": {
        "count": 22
      },
      "natural_language": null,
      "category": "statistics",
      "scope": "allFixtures",
      "type": {
        "id": 76115,
        "name": "Both teams scored in H2H"
      },
      "fixture": {
        "id": 19427187,
        "name": "Team A vs Team B"
      }
    },
    {
      "id": 28083542,
      "sport_id": 1,
      "fixture_id": 19427187,
      "type_id": 76116,
      "participant": "home",
      "basis": "recent",
      "data": {
        "streak": 5,
        "matches": 5
      },
      "category": "streaks",
      "scope": "allFixtures"
    }
  ],
  "pagination": {
    "has_more": false,
    "current_page": 1
  }
}
```

---

# 10) GET Latest Updated Livescores

### Why this endpoint is missing-but-important

This is one of the most important missing **live orchestration** endpoints.

It is ideal for deciding **which live fixtures actually changed** before triggering deeper refreshes.

### Official path

`GET /v3/football/livescores/latest`

### Available query params

- `api_token` — required
- `include`
- `select`
- `sortBy`
- `filters`
- `locale`

### Include depth

- `3`

### Pagination

- `NO`

### Include options

- `sport`
- `round`
- `stage`
- `group`
- `aggregate`
- `league`
- `season`
- `coaches`
- `tvStations`
- `venue`
- `state`
- `weatherReport`
- `lineups`
- `events`
- `timeline`
- `comments`
- `trends`
- `statistics`
- `periods`
- `participants`
- `odds`
- `premiumOdds`
- `inplayOdds`
- `prematchNews`
- `metadata`
- `sidelined`
- `predictions`
- `referees`
- `formations`
- `ballCoordinates`
- `scores`
- `xGFixture`
- `expectedLineups`
- `matchfacts`
- `AIOverviews`

### Best include for analysis

For a lightweight change detector:

`state;participants;scores;events;statistics;inplayOdds;xGFixture;expectedLineups;matchfacts`

### Recommended request

```txt
/v3/football/livescores/latest?include=state;participants;scores;events;statistics;inplayOdds;xGFixture;expectedLineups;matchfacts
```

### Best use inside the bot

This endpoint should sit at the top of the live refresh pipeline:

1. poll every `5–8` seconds if limits allow
2. if `data=[]`, skip heavy refresh work
3. if fixtures changed, refresh only those fixture ids

### #example-response

```json
{
  "data": [
    {
      "id": 19321001,
      "league_id": 501,
      "season_id": 19735,
      "state_id": 3,
      "name": "Team A vs Team B",
      "starting_at": "2026-03-23 20:00:00",
      "starting_at_timestamp": 1774296000,
      "result_info": "1-0",
      "length": 90,
      "participants": [
        {
          "id": 53,
          "name": "Team A",
          "meta": { "location": "home" }
        },
        {
          "id": 62,
          "name": "Team B",
          "meta": { "location": "away" }
        }
      ],
      "scores": [
        {
          "description": "CURRENT",
          "participant_id": 53,
          "score": { "goals": 1, "participant": "home" }
        },
        {
          "description": "CURRENT",
          "participant_id": 62,
          "score": { "goals": 0, "participant": "away" }
        }
      ],
      "state": {
        "id": 3,
        "name": "LIVE"
      }
    }
  ]
}
```

---

# 11) GET Inplay Livescores

### Why this endpoint is missing-but-important

This endpoint is a high-value **live feed** that gives fixture-like data during active matches.

It is more efficient than repeatedly pulling full fixture pages during live play.

### Official path

`GET /v3/football/livescores/inplay`

### Available query params

- `api_token` — required
- `include`
- `select`
- `sortBy`
- `filters`
- `locale`

### Include depth

- `3`

### Pagination

- `NO`

### Include options

- `sport`
- `round`
- `stage`
- `group`
- `aggregate`
- `league`
- `season`
- `coaches`
- `tvStations`
- `venue`
- `state`
- `weatherReport`
- `lineups`
- `events`
- `timeline`
- `comments`
- `trends`
- `statistics`
- `periods`
- `participants`
- `odds`
- `premiumOdds`
- `inplayOdds`
- `prematchNews`
- `postmatchNews`
- `metadata`
- `sidelined`
- `predictions`
- `referees`
- `formations`
- `ballCoordinates`
- `scores`
- `xGFixture`
- `expectedLineups`
- `matchfacts`
- `AIOverviews`

### Best include for analysis

For a rich live packet:

`state;participants;scores;events;statistics;periods;inplayOdds;predictions;referees;formations;xGFixture;expectedLineups;matchfacts`

### Recommended request

```txt
/v3/football/livescores/inplay?include=state;participants;scores;events;statistics;periods;inplayOdds;predictions;referees;formations;xGFixture;expectedLineups;matchfacts
```

### Best use inside the bot

Use this endpoint as the live working feed for:

- score state
- event stream
- live statistics
- live xG snapshot if available
- live inplay odds

### #example-response

```json
{
  "data": [
    {
      "id": 19321001,
      "league_id": 501,
      "season_id": 19735,
      "state_id": 3,
      "name": "Team A vs Team B",
      "participants": [
        {
          "id": 53,
          "name": "Team A",
          "meta": { "location": "home", "winner": true }
        },
        {
          "id": 62,
          "name": "Team B",
          "meta": { "location": "away", "winner": false }
        }
      ],
      "scores": [
        {
          "description": "CURRENT",
          "participant_id": 53,
          "score": { "goals": 2, "participant": "home" }
        },
        {
          "description": "CURRENT",
          "participant_id": 62,
          "score": { "goals": 1, "participant": "away" }
        }
      ],
      "events": [
        {
          "id": 991,
          "minute": 74,
          "type_id": 14,
          "participant_id": 53
        }
      ],
      "statistics": [
        {
          "participant_id": 53,
          "type_id": 42,
          "data": { "value": 11 }
        }
      ],
      "inplayOdds": [
        {
          "market_id": 1,
          "bookmaker_id": 35
        }
      ]
    }
  ]
}
```

---

# 12) GET Team Rankings by Team ID

### Why this endpoint is missing-but-important

This is a high-value **strength-trend** endpoint.

It adds a broader strength model that is not limited to:

- one competition table
- one recent fixture
- raw points only

It is especially useful as a background strength signal for the AI.

### Official path

`GET /v3/football/team-rankings/teams/TEAM_ID`

### Available query params

- `api_token` — required
- `include`
- `select`
- `sortBy`
- `filters`
- `locale`

### Include depth

- `1`

### Pagination

- `YES`

### Include options

- `team`

### Best include for analysis

`team`

### Recommended request

```txt
/v3/football/team-rankings/teams/{TEAM_ID}?include=team
```

### Best use inside the bot

Use this endpoint to build:

- long-range team strength baseline
- ranking trajectory trends
- stability / volatility signals
- a background power rating to complement season standings

### #example-response

```json
{
  "data": [
    {
      "id": 25430410,
      "team_id": 9,
      "date": "2026-03-20",
      "current_rank": 4,
      "scaled_score": 98.17,
      "team": {
        "id": 9,
        "name": "Team A"
      }
    },
    {
      "id": 25429144,
      "team_id": 9,
      "date": "2026-03-19",
      "current_rank": 4,
      "scaled_score": 98.15,
      "team": {
        "id": 9,
        "name": "Team A"
      }
    }
  ],
  "pagination": {
    "has_more": true,
    "current_page": 1
  }
}
```

---

# 13) GET Latest Updated Fixtures

### Why this endpoint is missing-but-important

This endpoint is very useful for **global sync efficiency**, even outside strictly live workflows.

It lets the orchestrator detect fixture records that changed recently and selectively refresh their deeper caches.

### Official path

`GET /v3/football/fixtures/latest`

### Available query params

- `api_token` — required
- `include`
- `select`
- `sortBy`
- `filters`
- `locale`

### Include depth

- `3`

### Pagination

- `NO`

### Include options

- `sport`
- `round`
- `stage`
- `group`
- `aggregate`
- `league`
- `season`
- `coaches`
- `tvStations`
- `venue`
- `state`
- `weatherReport`
- `lineups`
- `events`
- `timeline`
- `comments`
- `trends`
- `statistics`
- `periods`
- `participants`
- `odds`
- `premiumOdds`
- `inplayOdds`
- `prematchNews`
- `postmatchNews`
- `metadata`
- `sidelined`
- `predictions`
- `referees`
- `formations`
- `ballCoordinates`
- `scores`
- `xGFixture`
- `pressure`
- `expectedLineups`
- `matchfacts`
- `AIOverviews`

### Best include for analysis

For selective refresh orchestration:

`state;participants;scores;events;statistics;odds;inplayOdds;xGFixture;expectedLineups;matchfacts`

### Recommended request

```txt
/v3/football/fixtures/latest?include=state;participants;scores;events;statistics;odds;inplayOdds;xGFixture;expectedLineups;matchfacts
```

### Best use inside the bot

Use this for background sync logic:

- detect changed fixtures
- refresh only affected cache entries
- reduce unnecessary full fixture calls
- support efficient stale-while-revalidate behaviour

### #example-response

```json
{
  "data": [
    {
      "id": 19238160,
      "league_id": 1412,
      "season_id": 22988,
      "stage_id": 77469045,
      "state_id": 1,
      "name": "Team A vs Team B",
      "starting_at": "2026-03-24 15:00:00",
      "starting_at_timestamp": 1774364400,
      "length": 90,
      "has_odds": true,
      "has_premium_odds": true,
      "participants": [
        {
          "id": 901,
          "name": "Team A",
          "meta": { "location": "home" }
        },
        {
          "id": 902,
          "name": "Team B",
          "meta": { "location": "away" }
        }
      ]
    }
  ]
}
```

---

# Recommended implementation order

If the Windsurf agent should add these endpoints in the most impactful order, use this sequence:

## Pre-match priority

1. `standings/rounds/{ID}`
2. `standings/corrections/seasons/{ID}`
3. `schedules/seasons/{SEASON_ID}/teams/{TEAM_ID}`
4. `squads/seasons/{SEASON_ID}/teams/{TEAM_ID}`
5. `squads/teams/{TEAM_ID}`
6. `topscorers/seasons/{ID}`
7. `team-rankings/teams/{TEAM_ID}`
8. `match-facts/{FIXTURE_ID}`

## Live priority

1. `livescores/latest`
2. `livescores/inplay`
3. `standings/live/leagues/{ID}`
4. `commentaries/fixtures/{ID}`
5. `fixtures/latest`

---

# Final conclusion for the Windsurf agent

The current project already has a strong core, but it is still missing several endpoints that are essential for a truly professional match-analysis engine.

The most important missing upgrades are:

- round-linked standings context
- standing corrections
- live standings
- schedule congestion context
- squad depth context
- player impact via topscorers
- live narrative via commentaries
- structured pattern evidence via match facts
- selective live refresh via latest livescores / latest fixtures
- long-range strength trend via team rankings

If these endpoints are implemented correctly and merged into the existing analysis packet, the bot will move from a strong data collector to a much more complete football intelligence engine.
