// lib/sync-direct.js
// Direct sync functions — no HTTP chaining, shared DB pool, no timeouts.
// Used by the orchestrator to run all syncs in a single process.

import { query } from "@/lib/db";
import { fetchSportMonksPage, fetchAllSportMonksPages } from "@/lib/sportmonks";
import { staleWhileRevalidate } from "@/lib/cache";
import { resolveFixtureActors, normalizeH2HPair } from "@/lib/analysis";

// ── helpers ──────────────────────────────────────────────

async function startSync(table, scopeKey, dbQ) {
  const r = await dbQ(
    `insert into cache.sync_runs (target_table, scope_key, status)
     values ($1, $2, 'running') returning id`,
    [table, scopeKey]
  );
  const id = r.rows[0]?.id;
  if (!id) throw new Error("Failed to create sync run");
  return id;
}

async function endSync(syncId, status, notes, dbQ) {
  await dbQ(
    `update cache.sync_runs set status = $1, notes = $2, finished_at = now() where id = $3`,
    [status, notes?.slice?.(0, 4000) ?? null, syncId]
  );
}

function wrapSync(opts) {
  return staleWhileRevalidate(opts).then((result) => ({
    ok: true,
    source: result.source,
    stale: result.stale,
    mode: result.mode,
    freshness: result.freshness,
    refresh: result.refresh,
  }));
}

// ═══════════════════════════════════════════════════════════
// 1. syncFixture
// ═══════════════════════════════════════════════════════════

const FIXTURE_INCLUDE =
  "league;season;stage;round;group;aggregate;venue;state;weatherReport;participants;metadata;formations;lineups.player;lineups.detailedPosition;lineups.details.type;scores.type;events.type;statistics.type;periods.type;periods.statistics.type;referees.referee;referees.type;coaches;sidelined.sideline.player;sidelined.sideline.type";

export async function syncFixture(fixtureId, refreshMode, isLive = false) {
  return wrapSync({
    type: isLive ? "fixtures_live" : "fixtures",
    getCached: async (dbQ) => {
      const r = await dbQ(
        `select payload as data, fetched_at from cache.fixtures_raw
         where fixture_id = $1 order by fetched_at desc limit 1`,
        [fixtureId]
      );
      return r.rows[0] ?? null;
    },
    refresh: async (dbQ) => {
      const syncId = await startSync("fixtures_raw", `fixture:${fixtureId}`, dbQ);
      try {
        const payload = await fetchSportMonksPage(`fixtures/${fixtureId}`, {
          include: FIXTURE_INCLUDE,
        });
        const rid = Number(payload?.data?.id ?? fixtureId);
        if (!rid) throw new Error("Fixture payload missing data.id");
        await dbQ(
          `insert into cache.fixtures_raw (fixture_id, page_number, payload, pagination, fetched_at, sync_run_id)
           values ($1, 1, $2::jsonb, $3::jsonb, now(), $4)
           on conflict (fixture_id, page_number) do update set
             payload = excluded.payload, pagination = excluded.pagination,
             fetched_at = excluded.fetched_at, sync_run_id = excluded.sync_run_id, updated_at = now()`,
          [rid, JSON.stringify(payload), JSON.stringify(payload?.pagination ?? null), syncId]
        );
        await dbQ(`select cache.rebuild_fixture_index($1)`, [rid]);
        await endSync(syncId, "done", null, dbQ);
      } catch (err) {
        await endSync(syncId, "failed", err.message, dbQ);
        throw err;
      }
    },
    mode: refreshMode,
    lockKey: `sync:fixtures:${fixtureId}`,
    waitForFreshMs: isLive ? 8000 : 15000,
  });
}

// ═══════════════════════════════════════════════════════════
// 2. syncH2H
// ═══════════════════════════════════════════════════════════

const H2H_INCLUDE =
  "league;season;stage;round;group;aggregate;venue;state;participants;scores.type;events.type;statistics.type;periods.type;referees.referee;referees.type;formations;coaches";

export async function syncH2H(homeTeamId, awayTeamId, limit, refreshMode) {
  const pair = normalizeH2HPair(homeTeamId, awayTeamId);
  return wrapSync({
    type: "fixtures_h2h",
    getCached: async (dbQ) => {
      const r = await dbQ(
        `select payload as data, fetched_at from cache.fixtures_head_to_head_raw
         where home_team_id = $1 and away_team_id = $2 order by fetched_at desc limit 1`,
        [pair.home_team_id, pair.away_team_id]
      );
      return r.rows[0] ?? null;
    },
    refresh: async (dbQ) => {
      const syncId = await startSync("fixtures_head_to_head_raw", `h2h:${pair.home_team_id}:${pair.away_team_id}`, dbQ);
      try {
        const pages = await fetchAllSportMonksPages(
          `fixtures/head-to-head/${homeTeamId}/${awayTeamId}`,
          { include: H2H_INCLUDE, per_page: Math.min(limit, 50), sortBy: "starting_at", order: "desc" }
        );
        for (const page of pages) {
          await dbQ(
            `insert into cache.fixtures_head_to_head_raw
               (home_team_id, away_team_id, page_number, payload, pagination, fetched_at, sync_run_id)
             values ($1, $2, $3, $4::jsonb, $5::jsonb, now(), $6)
             on conflict (home_team_id, away_team_id, page_number) do update set
               payload = excluded.payload, pagination = excluded.pagination,
               fetched_at = excluded.fetched_at, sync_run_id = excluded.sync_run_id, updated_at = now()`,
            [pair.home_team_id, pair.away_team_id, page.page_number,
             JSON.stringify(page.payload), JSON.stringify(page.pagination), syncId]
          );
        }
        await dbQ(
          `delete from cache.fixtures_head_to_head_raw
           where home_team_id = $1 and away_team_id = $2 and page_number > $3`,
          [pair.home_team_id, pair.away_team_id, pages.length]
        );
        await dbQ(`select cache.rebuild_h2h_index($1, $2)`, [pair.home_team_id, pair.away_team_id]);
        await endSync(syncId, "done", null, dbQ);
      } catch (err) {
        await endSync(syncId, "failed", err.message, dbQ);
        throw err;
      }
    },
    mode: refreshMode,
    lockKey: `sync:h2h:${pair.home_team_id}:${pair.away_team_id}`,
  });
}

// ═══════════════════════════════════════════════════════════
// 3. syncTeamStats
// ═══════════════════════════════════════════════════════════

export async function syncTeamStats(teamId, refreshMode) {
  return wrapSync({
    type: "team_season_stats",
    getCached: async (dbQ) => {
      const r = await dbQ(
        `select payload as data, fetched_at from cache.statistics_seasons_teams_raw
         where team_id = $1 order by fetched_at desc limit 1`,
        [teamId]
      );
      return r.rows[0] ?? null;
    },
    refresh: async (dbQ) => {
      const syncId = await startSync("statistics_seasons_teams_raw", `team:${teamId}`, dbQ);
      try {
        const pages = await fetchAllSportMonksPages(
          `statistics/seasons/teams/${teamId}`,
          { include: "season;team", per_page: 50, page: 1 }
        );
        for (const page of pages) {
          await dbQ(
            `insert into cache.statistics_seasons_teams_raw
               (team_id, page_number, payload, pagination, fetched_at, sync_run_id)
             values ($1, $2, $3::jsonb, $4::jsonb, now(), $5)
             on conflict (team_id, page_number) do update set
               payload = excluded.payload, pagination = excluded.pagination,
               fetched_at = excluded.fetched_at, sync_run_id = excluded.sync_run_id, updated_at = now()`,
            [teamId, page.page_number, JSON.stringify(page.payload), JSON.stringify(page.pagination), syncId]
          );
        }
        await dbQ(`select cache.rebuild_team_stats_index($1)`, [teamId]);
        await endSync(syncId, "done", null, dbQ);
      } catch (err) {
        await endSync(syncId, "failed", err.message, dbQ);
        throw err;
      }
    },
    mode: refreshMode,
    lockKey: `sync:team_stats:${teamId}`,
  });
}

// ═══════════════════════════════════════════════════════════
// 4. syncRefereeStats
// ═══════════════════════════════════════════════════════════

export async function syncRefereeStats(refereeId, refreshMode) {
  return wrapSync({
    type: "referee_season_stats",
    getCached: async (dbQ) => {
      const r = await dbQ(
        `select payload as data, fetched_at from cache.statistics_seasons_referees_raw
         where referee_id = $1 order by fetched_at desc limit 1`,
        [refereeId]
      );
      return r.rows[0] ?? null;
    },
    refresh: async (dbQ) => {
      const syncId = await startSync("statistics_seasons_referees_raw", `referee:${refereeId}`, dbQ);
      try {
        const pages = await fetchAllSportMonksPages(
          `statistics/seasons/referees/${refereeId}`,
          { include: "season;referee", per_page: 50, page: 1 }
        );
        for (const page of pages) {
          await dbQ(
            `insert into cache.statistics_seasons_referees_raw
               (referee_id, page_number, payload, pagination, fetched_at, sync_run_id)
             values ($1, $2, $3::jsonb, $4::jsonb, now(), $5)
             on conflict (referee_id, page_number) do update set
               payload = excluded.payload, pagination = excluded.pagination,
               fetched_at = excluded.fetched_at, sync_run_id = excluded.sync_run_id, updated_at = now()`,
            [refereeId, page.page_number, JSON.stringify(page.payload), JSON.stringify(page.pagination), syncId]
          );
        }
        await dbQ(`select cache.rebuild_referee_stats_index($1)`, [refereeId]);
        await endSync(syncId, "done", null, dbQ);
      } catch (err) {
        await endSync(syncId, "failed", err.message, dbQ);
        throw err;
      }
    },
    mode: refreshMode,
    lockKey: `sync:referee_stats:${refereeId}`,
  });
}

// ═══════════════════════════════════════════════════════════
// 5. syncStandings
// ═══════════════════════════════════════════════════════════

const STANDINGS_INCLUDE = "participant;season;league;stage;round;group;rule;details.type;form";

export async function syncStandings(seasonId, refreshMode) {
  return wrapSync({
    type: "standings",
    getCached: async (dbQ) => {
      const r = await dbQ(
        `select payload as data, fetched_at from cache.standings_seasons_raw
         where season_id = $1 order by fetched_at desc limit 1`,
        [seasonId]
      );
      return r.rows[0] ?? null;
    },
    refresh: async (dbQ) => {
      const syncId = await startSync("standings_seasons_raw", `season:${seasonId}`, dbQ);
      try {
        const pages = await fetchAllSportMonksPages(
          `standings/seasons/${seasonId}`,
          { include: STANDINGS_INCLUDE, per_page: 50, page: 1 }
        );
        const allData = pages.flatMap((p) => p.payload?.data ?? []);
        await dbQ(
          `insert into cache.standings_seasons_raw (season_id, payload, fetched_at, sync_run_id)
           values ($1, $2::jsonb, now(), $3)
           on conflict (season_id) do update set
             payload = excluded.payload, fetched_at = excluded.fetched_at,
             sync_run_id = excluded.sync_run_id, updated_at = now()`,
          [seasonId, JSON.stringify({ data: allData }), syncId]
        );
        await endSync(syncId, "done", null, dbQ);
      } catch (err) {
        await endSync(syncId, "failed", err.message, dbQ);
        throw err;
      }
    },
    mode: refreshMode,
    lockKey: `sync:standings:${seasonId}`,
  });
}

// ═══════════════════════════════════════════════════════════
// 6. syncXG — team xG + player xG
// Endpoints per SportMonks docs:
//   Team:   expected/fixtures   (include: type;fixture;participant)
//   Player: expected/lineups    (include: type;fixture;player;team)
// ═══════════════════════════════════════════════════════════

export async function syncXG(fixtureId, refreshMode) {
  return wrapSync({
    type: "fixture_xg",
    getCached: async (dbQ) => {
      const r = await dbQ(
        `select payload as data, fetched_at from cache.fixture_xg_raw
         where fixture_id = $1 order by fetched_at desc limit 1`,
        [fixtureId]
      );
      return r.rows[0] ?? null;
    },
    refresh: async (dbQ) => {
      const syncId = await startSync("fixture_xg_raw", `fixture:${fixtureId}`, dbQ);
      try {
        let teamXG = [];
        let playerXG = [];

        // Team-level xG: single-fixture endpoint (no pagination needed)
        try {
          const resp = await fetchSportMonksPage(
            `expected/fixtures/${fixtureId}`,
            { include: "type;fixture;participant" }
          );
          const d = resp?.data;
          teamXG = Array.isArray(d) ? d : d ? [d] : [];
        } catch {
          // xG data may not be available (pre-match or plan limitation)
        }

        // Player-level xG: single-fixture endpoint (no pagination needed)
        try {
          const resp = await fetchSportMonksPage(
            `expected/lineups/${fixtureId}`,
            { include: "type;fixture;player;team" }
          );
          const d = resp?.data;
          playerXG = Array.isArray(d) ? d : d ? [d] : [];
        } catch {
          // Player xG data may not be available
        }

        await dbQ(
          `insert into cache.fixture_xg_raw (fixture_id, payload, fetched_at, sync_run_id)
           values ($1, $2::jsonb, now(), $3)
           on conflict (fixture_id) do update set
             payload = excluded.payload, fetched_at = excluded.fetched_at,
             sync_run_id = excluded.sync_run_id, updated_at = now()`,
          [fixtureId, JSON.stringify({ team_xg: teamXG, player_xg: playerXG }), syncId]
        );
        await endSync(syncId, "done", null, dbQ);
      } catch (err) {
        await endSync(syncId, "failed", err.message, dbQ);
        throw err;
      }
    },
    mode: refreshMode,
    lockKey: `sync:xg:${fixtureId}`,
  });
}

// ═══════════════════════════════════════════════════════════
// 7. syncPredictions
// ═══════════════════════════════════════════════════════════

export async function syncPredictions(fixtureId, refreshMode) {
  return wrapSync({
    type: "fixture_predictions",
    getCached: async (dbQ) => {
      const r = await dbQ(
        `select payload as data, fetched_at from cache.fixture_predictions_raw
         where fixture_id = $1 order by fetched_at desc limit 1`,
        [fixtureId]
      );
      return r.rows[0] ?? null;
    },
    refresh: async (dbQ) => {
      const syncId = await startSync("fixture_predictions_raw", `fixture:${fixtureId}`, dbQ);
      try {
        let probabilities = [];
        let valueBets = [];
        try {
          const [probPages, vbPages] = await Promise.all([
            fetchAllSportMonksPages(
              `predictions/probabilities/fixtures/${fixtureId}`,
              { per_page: 50, page: 1, include: "type;fixture" }
            ).catch(() => []),
            fetchAllSportMonksPages(
              `predictions/value-bets/fixtures/${fixtureId}`,
              { per_page: 50, page: 1, include: "type;fixture" }
            ).catch(() => []),
          ]);
          probabilities = probPages.flatMap((p) => p.payload?.data ?? []);
          valueBets = vbPages.flatMap((p) => p.payload?.data ?? []);
        } catch {
          // Predictions may not be available
        }
        await dbQ(
          `insert into cache.fixture_predictions_raw (fixture_id, payload, fetched_at, sync_run_id)
           values ($1, $2::jsonb, now(), $3)
           on conflict (fixture_id) do update set
             payload = excluded.payload, fetched_at = excluded.fetched_at,
             sync_run_id = excluded.sync_run_id, updated_at = now()`,
          [fixtureId, JSON.stringify({ probabilities, value_bets: valueBets }), syncId]
        );
        await endSync(syncId, "done", null, dbQ);
      } catch (err) {
        await endSync(syncId, "failed", err.message, dbQ);
        throw err;
      }
    },
    mode: refreshMode,
    lockKey: `sync:predictions:${fixtureId}`,
  });
}

// ═══════════════════════════════════════════════════════════
// 8. syncNews — season-based endpoint (more targeted)
// Include: fixture;league;lines (lines = article content)
// ═══════════════════════════════════════════════════════════

export async function syncNews(fixtureId, seasonId, refreshMode) {
  return wrapSync({
    type: "fixture_news",
    getCached: async (dbQ) => {
      const r = await dbQ(
        `select payload as data, fetched_at from cache.fixture_news_raw
         where fixture_id = $1 order by fetched_at desc limit 1`,
        [fixtureId]
      );
      return r.rows[0] ?? null;
    },
    refresh: async (dbQ) => {
      const syncId = await startSync("fixture_news_raw", `fixture:${fixtureId}`, dbQ);
      try {
        let fixtureNews = [];
        try {
          const endpoint = seasonId
            ? `news/pre-match/seasons/${seasonId}`
            : `news/pre-match/upcoming`;
          const pages = await fetchAllSportMonksPages(
            endpoint,
            { per_page: 50, page: 1, include: "fixture;league;lines" }
          );
          const allNews = pages.flatMap((p) => p.payload?.data ?? []);
          fixtureNews = allNews.filter(
            (item) => Number(item.fixture_id) === Number(fixtureId)
          );
        } catch {
          // News may not be available
        }
        await dbQ(
          `insert into cache.fixture_news_raw (fixture_id, payload, fetched_at, sync_run_id)
           values ($1, $2::jsonb, now(), $3)
           on conflict (fixture_id) do update set
             payload = excluded.payload, fetched_at = excluded.fetched_at,
             sync_run_id = excluded.sync_run_id, updated_at = now()`,
          [fixtureId, JSON.stringify({ data: fixtureNews }), syncId]
        );
        await endSync(syncId, "done", null, dbQ);
      } catch (err) {
        await endSync(syncId, "failed", err.message, dbQ);
        throw err;
      }
    },
    mode: refreshMode,
    lockKey: `sync:news:${fixtureId}`,
  });
}

// ═══════════════════════════════════════════════════════════
// 9. syncExpectedLineups
// Endpoint: expected-lineups/teams/{teamId}
// Include: type;fixture;participant
// ═══════════════════════════════════════════════════════════

export async function syncExpectedLineups(fixtureId, refreshMode) {
  return wrapSync({
    type: "fixture_expected_lineups",
    getCached: async (dbQ) => {
      const r = await dbQ(
        `select payload as data, fetched_at from cache.fixture_expected_lineups_raw
         where fixture_id = $1 order by fetched_at desc limit 1`,
        [fixtureId]
      );
      return r.rows[0] ?? null;
    },
    refresh: async (dbQ) => {
      const syncId = await startSync("fixture_expected_lineups_raw", `fixture:${fixtureId}`, dbQ);
      try {
        const actors = await resolveFixtureActors(fixtureId);
        const teamIds = [actors.home_team_id, actors.away_team_id].filter(Boolean);
        const allLineups = [];
        for (const teamId of teamIds) {
          try {
            const pages = await fetchAllSportMonksPages(
              `expected-lineups/teams/${teamId}`,
              { per_page: 50, page: 1, include: "type;fixture;participant" }
            );
            const items = pages.flatMap((p) => p.payload?.data ?? []);
            const forFixture = items.filter(
              (item) => Number(item.fixture_id) === Number(fixtureId)
            );
            allLineups.push(...forFixture);
          } catch {
            // Team might not have expected lineups available
          }
        }
        await dbQ(
          `insert into cache.fixture_expected_lineups_raw (fixture_id, payload, fetched_at, sync_run_id)
           values ($1, $2::jsonb, now(), $3)
           on conflict (fixture_id) do update set
             payload = excluded.payload, fetched_at = excluded.fetched_at,
             sync_run_id = excluded.sync_run_id, updated_at = now()`,
          [fixtureId, JSON.stringify({ data: allLineups }), syncId]
        );
        await endSync(syncId, "done", null, dbQ);
      } catch (err) {
        await endSync(syncId, "failed", err.message, dbQ);
        throw err;
      }
    },
    mode: refreshMode,
    lockKey: `sync:expected_lineups:${fixtureId}`,
  });
}

// ═══════════════════════════════════════════════════════════
// 10. syncTransferRumours
// ═══════════════════════════════════════════════════════════

const TR_INCLUDE = "player;type;fromTeam;toTeam;position";

export async function syncTransferRumours(fixtureId, refreshMode) {
  return wrapSync({
    type: "fixture_transfer_rumours",
    getCached: async (dbQ) => {
      const r = await dbQ(
        `select payload as data, fetched_at from cache.fixture_transfer_rumours_raw
         where fixture_id = $1 order by fetched_at desc limit 1`,
        [fixtureId]
      );
      return r.rows[0] ?? null;
    },
    refresh: async (dbQ) => {
      const syncId = await startSync("fixture_transfer_rumours_raw", `fixture:${fixtureId}`, dbQ);
      try {
        const actors = await resolveFixtureActors(fixtureId);
        const teamIds = [actors.home_team_id, actors.away_team_id].filter(Boolean);
        const allRumours = [];
        for (const teamId of teamIds) {
          try {
            const pages = await fetchAllSportMonksPages(
              `transfer-rumours/teams/${teamId}`,
              { per_page: 50, page: 1, include: TR_INCLUDE }
            );
            allRumours.push(...pages.flatMap((p) => p.payload?.data ?? []));
          } catch {
            // Team might not have transfer rumours
          }
        }
        const seen = new Set();
        const unique = allRumours.filter((r) => {
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });
        await dbQ(
          `insert into cache.fixture_transfer_rumours_raw (fixture_id, payload, fetched_at, sync_run_id)
           values ($1, $2::jsonb, now(), $3)
           on conflict (fixture_id) do update set
             payload = excluded.payload, fetched_at = excluded.fetched_at,
             sync_run_id = excluded.sync_run_id, updated_at = now()`,
          [fixtureId, JSON.stringify({ data: unique }), syncId]
        );
        await endSync(syncId, "done", null, dbQ);
      } catch (err) {
        await endSync(syncId, "failed", err.message, dbQ);
        throw err;
      }
    },
    mode: refreshMode,
    lockKey: `sync:transfer_rumours:${fixtureId}`,
  });
}

// ═══════════════════════════════════════════════════════════
// 11. syncOddsPrematch (Standard, NOT Premium)
// Endpoint: odds/pre-match/fixtures/{id}/bookmakers/35
// Include: market;bookmaker  |  NO pagination
// ═══════════════════════════════════════════════════════════

const BOOKMAKER_ID = 35;

export async function syncOddsPrematch(fixtureId, refreshMode) {
  return wrapSync({
    type: "odds_prematch",
    getCached: async (dbQ) => {
      const r = await dbQ(
        `select payload as data, fetched_at from cache.odds_prematch_fixtures_bookmakers_35_raw
         where fixture_id = $1 and bookmaker_id = $2 order by fetched_at desc limit 1`,
        [fixtureId, BOOKMAKER_ID]
      );
      return r.rows[0] ?? null;
    },
    refresh: async (dbQ) => {
      const syncId = await startSync("odds_prematch_fixtures_bookmakers_35_raw", `fixture:${fixtureId}:bookmaker:${BOOKMAKER_ID}`, dbQ);
      try {
        let payload = { data: [] };
        try {
          payload = await fetchSportMonksPage(
            `odds/pre-match/fixtures/${fixtureId}/bookmakers/${BOOKMAKER_ID}`,
            { include: "market;bookmaker" }
          );
        } catch {
          // Odds may not be available
        }
        await dbQ(
          `insert into cache.odds_prematch_fixtures_bookmakers_35_raw
             (fixture_id, bookmaker_id, page_number, payload, pagination, fetched_at, sync_run_id)
           values ($1, $2, 1, $3::jsonb, $4::jsonb, now(), $5)
           on conflict (fixture_id, bookmaker_id, page_number) do update set
             payload = excluded.payload, pagination = excluded.pagination,
             fetched_at = excluded.fetched_at, sync_run_id = excluded.sync_run_id, updated_at = now()`,
          [fixtureId, BOOKMAKER_ID, JSON.stringify(payload), JSON.stringify(null), syncId]
        );
        await dbQ(`select cache.rebuild_odds_prematch_index($1)`, [fixtureId]);
        await endSync(syncId, "done", null, dbQ);
      } catch (err) {
        await endSync(syncId, "failed", err.message, dbQ);
        throw err;
      }
    },
    mode: refreshMode,
    lockKey: `sync:odds_prematch:${fixtureId}:35`,
  });
}

// ═══════════════════════════════════════════════════════════
// 12. syncOddsInplay (Standard, NOT Premium)
// Endpoint: odds/inplay/fixtures/{id}/bookmakers/35
// Include: market;bookmaker  |  NO pagination
// ═══════════════════════════════════════════════════════════

export async function syncOddsInplay(fixtureId, refreshMode) {
  return wrapSync({
    type: "odds_inplay",
    getCached: async (dbQ) => {
      const r = await dbQ(
        `select payload as data, fetched_at from cache.odds_inplay_fixtures_bookmakers_35_raw
         where fixture_id = $1 and bookmaker_id = $2 order by fetched_at desc limit 1`,
        [fixtureId, BOOKMAKER_ID]
      );
      return r.rows[0] ?? null;
    },
    refresh: async (dbQ) => {
      const syncId = await startSync("odds_inplay_fixtures_bookmakers_35_raw", `fixture:${fixtureId}:bookmaker:${BOOKMAKER_ID}`, dbQ);
      try {
        let payload = { data: [] };
        try {
          payload = await fetchSportMonksPage(
            `odds/inplay/fixtures/${fixtureId}/bookmakers/${BOOKMAKER_ID}`,
            { include: "market;bookmaker" }
          );
        } catch {
          // Inplay odds may not be available
        }
        await dbQ(
          `insert into cache.odds_inplay_fixtures_bookmakers_35_raw
             (fixture_id, bookmaker_id, page_number, payload, pagination, fetched_at, sync_run_id)
           values ($1, $2, 1, $3::jsonb, $4::jsonb, now(), $5)
           on conflict (fixture_id, bookmaker_id, page_number) do update set
             payload = excluded.payload, pagination = excluded.pagination,
             fetched_at = excluded.fetched_at, sync_run_id = excluded.sync_run_id, updated_at = now()`,
          [fixtureId, BOOKMAKER_ID, JSON.stringify(payload), JSON.stringify(null), syncId]
        );
        await dbQ(`select cache.rebuild_odds_inplay_index($1)`, [fixtureId]);
        await endSync(syncId, "done", null, dbQ);
      } catch (err) {
        await endSync(syncId, "failed", err.message, dbQ);
        throw err;
      }
    },
    mode: refreshMode,
    lockKey: `sync:odds_inplay:${fixtureId}:35`,
    waitForFreshMs: 8000,
  });
}
