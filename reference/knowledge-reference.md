# Killua Football — Analysis Reference Guide

## Digest v2 — PRIMARY Endpoint (Recommended)
`GET /fixtures/{id}/digest` returns a compact pre-computed summary (~8-15KB) in **ONE call**.
The server extracts ALL key metrics from every data source. 100% bundle parity. Zero truncation.

### What's in the digest (v2 — complete):
- **match**: home, away, ft (final score), ht (half-time), status, league, season, round, stage, group, venue, date, is_live
- **aggregate**: cup tie aggregate result, home_score, away_score
- **weather**: temp_c, wind_kmh, humidity, clouds, condition
- **tactical**: formations, home_xi, away_xi, coaches, subs_used, top_performers (name, rating, goals, assists, cards, side)
- **sidelined**: injured/suspended players per team
- **events**: goals, cards, subs timeline (min, type, player, team_id, result)
- **stats**: possession, shots, shots_on_target, xG, corners, fouls, offsides, passes_pct, saves, tackles, cards, dangerous_attacks
- **xg**: dedicated xG values (if not already in stats)
- **periods**: 1H/2H goal splits per team
- **standings**: pos, pts, W/D/L, GF/GA/GD, form, home_record ("5W-2D-1L"), home_goals ("14GF-5GA"), away_record, away_goals
- **round_standings**: group stage mini-table (pos, team, pts, p, gd)
- **standings_corrections**: point deductions affecting teams
- **live_standings**: real-time table position (live matches only)
- **h2h**: matches, home_wins, draws, away_wins, avg_goals, btts_pct, over25_pct, results
- **h2h_discipline**: avg_cards_per_match, avg_possession, avg_shots from past meetings
- **predictions**: probabilities + value_bets
- **odds_overview**: pre-match 1xBet market availability (1X2, O/U, BTTS, DC, AH) + total_markets
- **inplay_odds_overview**: live odds availability (live matches only)
- **referee**: name, matches, yellowcards_avg, redcards_total, penalties, fouls_avg
- **home_season / away_season**: sample, goals_scored/conceded, clean_sheets, W/D/L, avg_possession, btts, over_2_5, failed_to_score, avg_corners, avg_cards, scoring_minutes
- **home_squad_depth / away_squad_depth**: top 6 contributors (name, pos, apps, goals, assists, rating, injured)
- **rankings**: FIFA/domestic rankings (position, type, points) for both teams
- **home_schedule / away_schedule**: rest_days, next_in_days, next_opponent
- **news**: top 5 headlines
- **match_facts**: up to 8 key facts
- **commentaries**: key live match moments (live only) — minute, text, is_goal
- **transfer_rumours**: incoming/outgoing targets
- **topscorers**: league top scorers from both teams
- **expected_lineups**: pre-match predicted XI availability
- **data_flags**: 21 explicit flags (xg, predictions, lineups_confirmed, expected_lineups, odds_prematch, odds_inplay, standings, round_standings, standings_corrections, live_standings, h2h_count, referee_stats, news_count, match_facts, commentaries, team_stats, home_squad, away_squad, home_rankings, away_rankings, topscorers)

### GPT Execution: prepare → digest → odds → analysis. ONE data call.

---

## Bundle v3 — Multi-Part System (Fallback)
The `/fixtures/{id}/bundle` endpoint returns data in **2 parts**. Use as fallback for raw data deep-dive.

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
