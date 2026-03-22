-- ============================================================
-- League Standings: Season standings for contextual analysis
-- ============================================================

CREATE TABLE IF NOT EXISTS "cache"."standings_seasons_raw" (
    "season_id" bigint NOT NULL,
    "payload" jsonb NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "sync_run_id" uuid
);
ALTER TABLE "cache"."standings_seasons_raw" OWNER TO "postgres";
ALTER TABLE ONLY "cache"."standings_seasons_raw"
    ADD CONSTRAINT "standings_seasons_raw_pkey" PRIMARY KEY ("season_id");
CREATE INDEX "idx_standings_seasons_raw_fetched_at"
    ON "cache"."standings_seasons_raw" USING btree ("fetched_at" DESC);
ALTER TABLE ONLY "cache"."standings_seasons_raw"
    ADD CONSTRAINT "standings_seasons_raw_sync_run_id_fkey"
    FOREIGN KEY ("sync_run_id") REFERENCES "cache"."sync_runs"("id") ON DELETE SET NULL;
CREATE OR REPLACE TRIGGER "trg_standings_seasons_raw_updated_at"
    BEFORE UPDATE ON "cache"."standings_seasons_raw"
    FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();

-- ── Update purge_stale_cache to include standings ────────────
CREATE OR REPLACE FUNCTION "cache"."purge_stale_cache"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- live odds: very short
  delete from cache.odds_inplay_fixtures_bookmakers_35_raw
  where fetched_at < now() - interval '30 minutes';

  -- prematch / fixtures: 2 days
  delete from cache.odds_prematch_fixtures_bookmakers_35_raw
  where fetched_at < now() - interval '2 days';

  delete from cache.fixtures_raw
  where fetched_at < now() - interval '2 days';

  -- h2h / team / referee: 7 days
  delete from cache.fixtures_head_to_head_raw
  where fetched_at < now() - interval '7 days';

  delete from cache.statistics_seasons_teams_raw
  where fetched_at < now() - interval '7 days';

  delete from cache.statistics_seasons_referees_raw
  where fetched_at < now() - interval '7 days';

  -- standings: 3 days
  delete from cache.standings_seasons_raw
  where fetched_at < now() - interval '3 days';

  -- markets catalog: 30 days
  delete from cache.odds_markets_raw
  where fetched_at < now() - interval '30 days';

  delete from cache.sync_runs
  where started_at < now() - interval '14 days';

  -- premium endpoints: 2 days
  delete from cache.fixture_xg_raw
  where fetched_at < now() - interval '2 days';

  delete from cache.fixture_predictions_raw
  where fetched_at < now() - interval '2 days';

  delete from cache.fixture_news_raw
  where fetched_at < now() - interval '2 days';

  delete from cache.fixture_expected_lineups_raw
  where fetched_at < now() - interval '2 days';
end;
$$;

ALTER FUNCTION "cache"."purge_stale_cache"() OWNER TO "postgres";
