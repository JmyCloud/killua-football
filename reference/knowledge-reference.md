# Killua Football — Analysis Reference Guide

## Bundle v3 — Multi-Part System
The `/fixtures/{id}/bundle` endpoint returns data in **2 parts**. Always read BOTH parts.

### Part 1: Core Match Data (`?part=1`, default)
- `match_summary` → **ALWAYS use `ft` for final score** (e.g. "1-2"), `ht` for half-time. Never parse scores array manually.
- `fixture_context` → `base`, `state`, `league`, `season`, `stage`, `round`, `group`, `aggregate`, `venue`, `weatherreport`, `metadata`
- `fixture_squads` → `participants`, `formations`, `lineups` (slimmed: name, pos, rating, goals, assists, cards), `referees`, `coaches`, `sidelined`
- `fixture_events_scores` → `scores` (compact), `events` (minute, type, player, result)
- `fixture_statistics` → full match statistics (flattened)
- `fixture_periods` → period-by-period breakdown
- `fixture_xg` → expected goals data (team + player level)
- `fixture_predictions` → probabilities + value_bets array
- `fixture_expected_lineups` → predicted XI with positions
- `fixture_match_facts` → pre-match key facts
- `odds` → prematch + inplay summaries

### Part 2: Context & History (`?part=2`)
- `match_summary` → same as Part 1 (repeated for reference)
- `h2h.context` → match summaries (last 5 meetings)
- `h2h.events` → goals, cards per meeting
- `h2h.statistics` → stats per meeting
- `h2h.referees` → referee info per meeting
- `home_team` / `away_team`:
  - `.stats` → season statistics: attacking, defending, passing, physical, advanced metrics
  - `.squad` → squad (max 25): name, pos, appearances, goals, assists, rating
  - `.schedule` → recent + upcoming fixtures (max 10, congestion analysis)
  - `.squad_fallback` → current roster when season squad unavailable
- `.rankings` → FIFA/domestic rankings

### Referee
- Direct object with season stats: cards/game, penalties, VAR decisions

### Standings
- `.league` → full league table with form strings
- `.round` → round-specific table
- `.corrections` → point deductions
- `.live` → live table during matches

### Other
- `topscorers` → season top scorers
- `odds.prematch` → pre-match odds market summary
- `odds.inplay` → in-play odds (live matches only)
- `coverage` → readiness summary per family

## Key Market IDs (1xBet)
| ID | Market |
|----|--------|
| 1 | Fulltime Result (1X2) |
| 2 | Over/Under (match goals) |
| 5 | Both Teams to Score |
| 8 | Double Chance |
| 12 | HT/FT |
| 28 | Asian Handicap |
| 47 | Correct Score |
| 75 | Over/Under 1st Half |
| 97 | Total Corners |
| 155 | Player to Score |

## SportMonks Stats Keys
### Team Statistics (details array)
Each stat has `type.developer_name`. Common ones:
- `team-goals`, `team-goals-conceded` — raw goals
- `team-cleansheets`, `team-failed-to-score`
- `team-wins`, `team-draws`, `team-losses`
- `team-scoring-minutes` — when goals happen (0-15, 16-30, etc.)
- `team-avg-goals-per-game`, `team-avg-goals-conceded`
- `team-attacks`, `team-dangerous-attacks`
- `team-shots-on-target`, `team-shots-off-target`
- `team-possession-percentage`
- `team-fouls`, `team-yellow-cards`, `team-red-cards`
- `team-corners`, `team-offsides`
- `team-xg` — expected goals (if available)

### Referee Statistics
- `referee-yellow-cards-per-game`, `referee-red-cards-per-game`
- `referee-penalties-awarded`, `referee-fouls-per-game`

## Standings Analysis Patterns
- **High GF + High GA** → open game, lean Over
- **Low GF + Low GA** → tight game, lean Under
- **Home strong + Away weak** → amplified home advantage
- **Form string WWWWW** → momentum, but regression possible
- **Points per game** → better than raw points when matches differ
- **Position gap > 10** → quality mismatch signal

## Weather Impact Guide
| Condition | Effect |
|-----------|--------|
| Rain (>5mm) | Slippery pitch, harder passing, more fouls, favors physical teams |
| Wind (>30km/h) | Affects crosses, set pieces, GK distribution, long balls |
| Cold (<5°C) | Harder pitch, faster ball, muscle injury risk, favors acclimatized teams |
| Heat (>30°C) | Fatigue especially 2H, favors deeper squads, more substitution impact |
| Snow/Frost | Unpredictable bounces, reduced technical quality, lean Under |

## Value Bet Calculation
```
Edge % = Prediction Probability - Implied Probability
Implied Probability = 1 / Decimal Odds
Example: Prediction says Home Win 65%, odds are 1.80
  Implied = 1/1.80 = 55.6%
  Edge = 65% - 55.6% = 9.4% → Moderate Value
```

## Confidence Calibration
- 90+ → Near-certain, multiple strong signals aligned
- 75-89 → Strong, clear pattern with minor unknowns
- 60-74 → Moderate, some supporting evidence but gaps
- 45-59 → Weak, conflicting signals or limited data
- <45 → Too uncertain → "No Bet"

Reduce confidence by 10-15 if: small sample (<5 matches), key player missing, weather extreme, derby/cup (unpredictable).
