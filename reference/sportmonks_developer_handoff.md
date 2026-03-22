# Sportmonks Developer Handoff

This document is a reference library for any AI agent or developer working on Sportmonks integration.
It is intentionally written as a **handoff/reference file**, not as an execution plan.
Do **not** assume a fixed implementation order. Use the references below according to the current user request.

---

## Core rule

Use **Sportmonks Football API 3.0** as the primary official source for integration decisions.
Prefer official documentation over assumptions.
Avoid deprecated versions unless the user explicitly asks for legacy support.

---

## Important pagination note (read before implementing list endpoints)

Sportmonks does **not** return unlimited records in a single request.

For many API 3.0 list endpoints:
- `per_page` defaults to **25**
- `per_page` maximum is usually **50**
- pagination commonly uses the `page` query parameter
- you should inspect the response pagination metadata / `has_more` behavior and keep requesting next pages until exhaustion

### Critical implementation warning
Do **not** assume that one request returns the full dataset.

If the user requests:
- all fixtures for a date
- all teams
- all players
- all predictions
- all records in a range
- bulk sync / initial import

then the integration must be pagination-aware by default.

### Very important exception: `filters=populate`
Sportmonks documents a special bulk-loading pattern using `filters=populate`.

This mode is intended for initial data population / bulk sync and allows:
- a higher page size of up to **1000**
- lighter payloads because **includes are disabled**
- fewer total requests during large imports

### Rule for the AI agent
Use this mental model:

- For **UI / normal feature requests**: use normal pagination, usually max **50**
- For **initial sync / database population / bulk ingestion**: consider `filters=populate` with up to **1000**, but only when losing includes is acceptable
- Never silently ignore pagination
- Never assume the first page is the full result set
- Build helpers/utilities for paginated fetching instead of duplicating pagination logic across services

### Recommended pagination behavior
When building a Sportmonks client:
1. Accept `page` and `per_page`
2. Default to safe page sizes
3. Read pagination metadata on every response
4. Continue fetching while more pages exist
5. Merge results deterministically
6. Protect bulk fetches with rate-limit awareness, retries, and caching
7. Keep bulk sync logic separate from UI request logic

---

## Official references

### 1) Main documentation
**Reference:** Sportmonks Docs main entry  
**Use when:** You need the official starting point, API concepts, navigation to entities/endpoints, or the most reliable top-level reference.

### 2) Getting Started
**Reference:** Getting Started guide  
**Use when:** You need authentication details, first request examples, token usage, or Postman collection references.

### 3) Best Practices
**Reference:** Best practices page  
**Use when:** You need guidance on efficient sync patterns, scalable request strategy, caching, and production-safe integration decisions.

### 4) Endpoints overview
**Reference:** Endpoints overview page  
**Use when:** You need to discover which endpoint family matches the feature request.

### 5) Entities overview
**Reference:** Entities overview page  
**Use when:** You need to understand returned object shapes, relationships, or what a base entity represents.

### 6) Includes guide
**Reference:** Includes tutorial / guide  
**Use when:** You need related data in one request and want to reduce API round trips.

### 7) Filter and select fields guide
**Reference:** Filter and select fields tutorial  
**Use when:** You need to reduce payload size, fetch only the needed attributes, or filter results more precisely.

### 8) Pagination guide
**Reference:** Pagination tutorial  
**Use when:** You are loading lists, building sync jobs, importing data in batches, or handling large collections.

### 9) Fixtures tutorial
**Reference:** Fixtures tutorial  
**Use when:** You are implementing schedules, past fixtures, future fixtures, or full fixture detail pages.

### 10) Livescores tutorial
**Reference:** Livescores tutorial  
**Use when:** You are implementing live match sections, now-playing feeds, or near-real-time score experiences.

### 11) Latest Updated Fixtures endpoint
**Reference:** GET Latest Updated Fixtures  
**Use when:** You need smart polling for changing fixture/livescore data without re-fetching everything.

### 12) Latest Updated Livescores endpoint
**Reference:** GET Latest Updated Livescores  
**Use when:** You need efficient incremental updates during live match tracking.

### 13) All Livescores endpoint
**Reference:** GET All Livescores  
**Use when:** You need all current live/near-live fixtures in one stream for live centers or homepage live blocks.

### 14) Leagues and seasons tutorial
**Reference:** Leagues and seasons tutorial  
**Use when:** You need to model competitions, retrieve season IDs, or navigate from leagues into season-specific data.

### 15) Season schedule tutorial
**Reference:** Season schedule tutorial  
**Use when:** You need to build competition schedules, league pages, or season fixture calendars.

### 16) Standings tutorial
**Reference:** Standings tutorial  
**Use when:** You need tables, rankings, live tables, or season standing pages.

### 17) Lineups and formations tutorial
**Reference:** Lineups and formations tutorial  
**Use when:** You need starting XI, benches, formations, and pre-match or live lineup displays.

### 18) Statistics tutorial
**Reference:** Statistics tutorial  
**Use when:** You need team/player/match stats or want to understand statistic typing and structure.

### 19) Teams, players, coaches and referees tutorial
**Reference:** Teams / players / coaches / referees tutorial  
**Use when:** You are building team pages, player pages, squad explorers, or identity-based lookups.

### 20) Coverage / Football API overview
**Reference:** Coverage page  
**Use when:** You need to verify whether leagues, competitions, stats depth, or football data scope are available.

### 21) Football API product page
**Reference:** Football API landing page  
**Use when:** You need a broad feature summary, business-facing overview, or a quick reference to what the football API can power.

### 22) Free plan / pricing / limits
**Reference:** Pricing or free plan page  
**Use when:** You need to understand rate limits, trial boundaries, plan differences, or feature availability constraints.

### 23) World plan page
**Reference:** Worldwide plan page  
**Use when:** You need to reason about global league access, business scope, or plan fit beyond Europe-only coverage.

### 24) Historical football data page
**Reference:** Historical football data page  
**Use when:** You need guidance on historical match depth or long-range archive features.

### 27) Practical implementation blog references
**Reference:** Sportmonks implementation blogs  
**Use when:** You want practical architecture ideas, polling patterns, or product examples.

---

## Suggested official URLs

### Core docs
- Main docs: https://docs.sportmonks.com/
- Getting started: https://docs.sportmonks.com/v3/welcome/getting-started
- Best practices: https://docs.sportmonks.com/v3/welcome/best-practices
- Endpoints overview: https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints
- Entities overview: https://docs.sportmonks.com/v3/endpoints-and-entities/entities

### Response optimization
- Includes guide: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes
- Filter and select fields guide: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/filter-and-select-fields
- Pagination guide: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/introduction/pagination

### Core football tutorials
- Fixtures tutorial: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/livescores-and-fixtures/fixtures
- Livescores tutorial: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/livescores-and-fixtures/livescores
- Leagues and seasons tutorial: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/leagues-and-seasons/leagues-and-seasons
- Season schedule tutorial: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/season-schedule
- Standings tutorial: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/standings
- Lineups and formations tutorial: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/lineups-and-formations
- Statistics tutorial: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/statistics
- Teams, players, coaches and referees tutorial: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/teams-players-coaches-and-referees

### High-value live endpoints
- GET Latest Updated Fixtures: https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/fixtures/get-latest-updated-fixtures
- GET Latest Updated Livescores: https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/livescores/get-latest-updated-livescores
- GET All Livescores: https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/livescores/get-all-livescores

### Product / coverage / commercial references
- Football API product page: https://www.sportmonks.com/football-api/
- Football coverage: https://www.sportmonks.com/football-api/coverage/
- Free plan / pricing: https://www.sportmonks.com/football-api/free-plan/
- Worldwide plan: https://www.sportmonks.com/football-api/world-plan/
- Historical football data: https://www.sportmonks.com/glossary/historical-football-data/

### Useful blog references
- FIFA World Cup 2026 application guide: https://www.sportmonks.com/blogs/how-to-create-a-fifa-world-cup-2026-application/
- 5 common football API mistakes: https://www.sportmonks.com/blogs/5-common-mistakes-developers-make-with-football-apis-and-how-to-avoid-them/

---

## Reference map by request type

### If the request is about authentication
Go to:
- Getting Started
- Main docs

### If the request is about choosing the correct endpoint
Go to:
- Endpoints overview
- Entities overview
- Main docs

### If the request is about reducing request count or optimizing response composition
Go to:
- Includes guide
- Filter and select fields guide
- Endpoints overview
- Best practices

### If the request is about loading big datasets or import/sync logic
Go to:
- Pagination guide
- Best practices
- Endpoints overview
- Pricing / limits

### If the request is about live data or smart polling
Go to:
- Livescores tutorial
- Fixtures tutorial
- GET Latest Updated Fixtures
- GET Latest Updated Livescores
- GET All Livescores
- Best practices

### If the request is about season / league / competition modeling
Go to:
- Leagues and seasons tutorial
- Season schedule tutorial
- Standings tutorial
- Coverage page

### If the request is about lineups, formations, or statistics
Go to:
- Lineups and formations tutorial
- Statistics tutorial
- Fixtures tutorial
- Includes guide

### If the request is about teams, players, coaches, or referees
Go to:
- Teams, players, coaches and referees tutorial
- Endpoints overview
- Entities overview

### If the request is about whether a competition/stat/feed is available
Go to:
- Coverage page
- World plan page
- Pricing / plan limits
- Endpoint docs if needed

### If the request is about rate limits, development safety, or production readiness
Go to:
- Pricing / free plan
- Pagination guide
- Best practices
- Includes guide
- Filter and select fields guide

### If the request is about historical depth
Go to:
- Historical football data page
- Coverage page
- Leagues and seasons tutorial

---

## Architecture notes for the AI agent

### Keep a service layer
Create a clean Sportmonks access layer so the product can call stable internal methods instead of raw URLs everywhere.

### Prefer stable identifiers
Model around identifiers such as:
- fixture_id
- team_id
- player_id
- league_id
- season_id

### Use includes intentionally
Includes are powerful, but they can also increase payload size.
Use them when they reduce request count meaningfully.

### Use select and filters aggressively where appropriate
Do not fetch entire payloads when only a small field set is needed.

### Respect plan limitations
Not every plan exposes the same depth, limits, or premium data families.

### Build with caching
Caching is highly recommended for:
- fixture lists
- standings
- team lookups
- league metadata
- season metadata

### Separate live reads from background sync logic
Live match data and scheduled sync/import jobs should not be treated the same way.

### Prefer live-specialized endpoints for live experiences
Do not poll generic fixture endpoints aggressively when livescore or latest-updated endpoints are a better fit.

### Avoid hard-coding assumptions about coverage
Always verify coverage before promising a feature for a competition, stat family, or market.

### Do not rely on deprecated API versions
Default to v3 unless the user specifically requests otherwise.

### Centralize pagination
Pagination should be implemented once in reusable helpers or a shared transport layer.

### Distinguish bulk-fetch mode from UI-fetch mode
Normal page requests and database population requests should use different fetching strategies.

### Model around seasons early
Many implementation mistakes come from skipping proper season handling.

---

## Final reminder to the AI agent

This file is a **reference companion**.
It does not force execution order.
Use it to choose the right official reference depending on the exact task requested by the user.

The single most common integration mistake is assuming the first response page contains the full dataset.
Do not make that mistake.
