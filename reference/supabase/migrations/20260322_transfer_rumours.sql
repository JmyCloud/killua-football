-- Transfer rumours cache table
-- Stores transfer rumours per fixture (combined from both teams)
CREATE TABLE "cache"."fixture_transfer_rumours_raw" (
    "fixture_id" bigint NOT NULL,
    "payload" jsonb NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "sync_run_id" uuid
);
ALTER TABLE "cache"."fixture_transfer_rumours_raw" OWNER TO "postgres";
ALTER TABLE ONLY "cache"."fixture_transfer_rumours_raw"
    ADD CONSTRAINT "fixture_transfer_rumours_raw_pkey" PRIMARY KEY ("fixture_id");
CREATE INDEX "idx_fixture_transfer_rumours_raw_fetched_at"
    ON "cache"."fixture_transfer_rumours_raw" USING btree ("fetched_at" DESC);
ALTER TABLE ONLY "cache"."fixture_transfer_rumours_raw"
    ADD CONSTRAINT "fixture_transfer_rumours_raw_sync_run_id_fkey"
    FOREIGN KEY ("sync_run_id") REFERENCES "cache"."sync_runs"("id") ON DELETE SET NULL;
CREATE OR REPLACE TRIGGER "trg_fixture_transfer_rumours_raw_updated_at"
    BEFORE UPDATE ON "cache"."fixture_transfer_rumours_raw"
    FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();

-- Update purge_stale_cache to include transfer rumours (TTL 6h)
create or replace function cache.purge_stale_cache()
returns void as $$
begin
  delete from cache.fixtures_raw
    where fetched_at < now() - interval '48 hours';

  delete from cache.fixtures_h2h_raw
    where fetched_at < now() - interval '48 hours';

  delete from cache.statistics_seasons_teams_raw
    where fetched_at < now() - interval '48 hours';

  delete from cache.statistics_seasons_referees_raw
    where fetched_at < now() - interval '48 hours';

  delete from cache.odds_prematch_fixtures_bookmakers_35_raw
    where fetched_at < now() - interval '24 hours';

  delete from cache.odds_inplay_fixtures_bookmakers_35_raw
    where fetched_at < now() - interval '6 hours';

  delete from cache.fixture_xg_raw
    where fetched_at < now() - interval '24 hours';

  delete from cache.fixture_predictions_raw
    where fetched_at < now() - interval '24 hours';

  delete from cache.fixture_news_raw
    where fetched_at < now() - interval '24 hours';

  delete from cache.fixture_expected_lineups_raw
    where fetched_at < now() - interval '24 hours';

  delete from cache.standings_seasons_raw
    where fetched_at < now() - interval '48 hours';

  delete from cache.fixture_transfer_rumours_raw
    where fetched_at < now() - interval '24 hours';

  delete from cache.sync_runs
    where created_at < now() - interval '7 days';
end;
$$ language plpgsql;
