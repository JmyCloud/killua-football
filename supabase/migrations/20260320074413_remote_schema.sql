


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "cache";


ALTER SCHEMA "cache" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";








ALTER SCHEMA "public" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "util";


ALTER SCHEMA "util" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "cache"."finish_sync_fixtures"("p_fixture_id" bigint, "p_sync_run_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  delete from cache.fixtures_raw
  where fixture_id = p_fixture_id
    and sync_run_id is distinct from p_sync_run_id;

  update cache.sync_runs
  set status = 'done', finished_at = now()
  where id = p_sync_run_id;
end;
$$;


ALTER FUNCTION "cache"."finish_sync_fixtures"("p_fixture_id" bigint, "p_sync_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."finish_sync_h2h"("p_home_team_id" bigint, "p_away_team_id" bigint, "p_sync_run_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  delete from cache.fixtures_head_to_head_raw
  where home_team_id = p_home_team_id
    and away_team_id = p_away_team_id
    and sync_run_id is distinct from p_sync_run_id;

  update cache.sync_runs
  set status = 'done', finished_at = now()
  where id = p_sync_run_id;
end;
$$;


ALTER FUNCTION "cache"."finish_sync_h2h"("p_home_team_id" bigint, "p_away_team_id" bigint, "p_sync_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."finish_sync_odds_inplay"("p_fixture_id" bigint, "p_bookmaker_id" integer, "p_sync_run_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  delete from cache.odds_inplay_fixtures_bookmakers_35_raw
  where fixture_id = p_fixture_id
    and bookmaker_id = p_bookmaker_id
    and sync_run_id is distinct from p_sync_run_id;

  update cache.sync_runs
  set status = 'done', finished_at = now()
  where id = p_sync_run_id;
end;
$$;


ALTER FUNCTION "cache"."finish_sync_odds_inplay"("p_fixture_id" bigint, "p_bookmaker_id" integer, "p_sync_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."finish_sync_odds_markets"("p_sync_run_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  delete from cache.odds_markets_raw
  where sync_run_id is distinct from p_sync_run_id;

  perform cache.rebuild_odds_markets_index();

  update cache.sync_runs
  set status = 'done', finished_at = now()
  where id = p_sync_run_id;
end;
$$;


ALTER FUNCTION "cache"."finish_sync_odds_markets"("p_sync_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."finish_sync_odds_prematch"("p_fixture_id" bigint, "p_bookmaker_id" integer, "p_sync_run_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  delete from cache.odds_prematch_fixtures_bookmakers_35_raw
  where fixture_id = p_fixture_id
    and bookmaker_id = p_bookmaker_id
    and sync_run_id is distinct from p_sync_run_id;

  update cache.sync_runs
  set status = 'done', finished_at = now()
  where id = p_sync_run_id;
end;
$$;


ALTER FUNCTION "cache"."finish_sync_odds_prematch"("p_fixture_id" bigint, "p_bookmaker_id" integer, "p_sync_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."finish_sync_referee_stats"("p_referee_id" bigint, "p_sync_run_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  delete from cache.statistics_seasons_referees_raw
  where referee_id = p_referee_id
    and sync_run_id is distinct from p_sync_run_id;

  update cache.sync_runs
  set status = 'done', finished_at = now()
  where id = p_sync_run_id;
end;
$$;


ALTER FUNCTION "cache"."finish_sync_referee_stats"("p_referee_id" bigint, "p_sync_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."finish_sync_team_stats"("p_team_id" bigint, "p_sync_run_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  delete from cache.statistics_seasons_teams_raw
  where team_id = p_team_id
    and sync_run_id is distinct from p_sync_run_id;

  update cache.sync_runs
  set status = 'done', finished_at = now()
  where id = p_sync_run_id;
end;
$$;


ALTER FUNCTION "cache"."finish_sync_team_stats"("p_team_id" bigint, "p_sync_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."mark_sync_failed"("p_sync_run_id" "uuid", "p_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  update cache.sync_runs
  set status = 'failed',
      finished_at = now(),
      notes = coalesce(p_notes, notes)
  where id = p_sync_run_id;
end;
$$;


ALTER FUNCTION "cache"."mark_sync_failed"("p_sync_run_id" "uuid", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."purge_stale_cache"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- live odds: قصيرة جدًا
  delete from cache.odds_inplay_fixtures_bookmakers_35_raw
  where fetched_at < now() - interval '30 minutes';

  -- prematch / fixtures: يومين
  delete from cache.odds_prematch_fixtures_bookmakers_35_raw
  where fetched_at < now() - interval '2 days';

  delete from cache.fixtures_raw
  where fetched_at < now() - interval '2 days';

  -- h2h / team / referee: أسبوع
  delete from cache.fixtures_head_to_head_raw
  where fetched_at < now() - interval '7 days';

  delete from cache.statistics_seasons_teams_raw
  where fetched_at < now() - interval '7 days';

  delete from cache.statistics_seasons_referees_raw
  where fetched_at < now() - interval '7 days';

  -- markets catalog: 30 يوم
  delete from cache.odds_markets_raw
  where fetched_at < now() - interval '30 days';

  delete from cache.sync_runs
  where started_at < now() - interval '14 days';
end;
$$;


ALTER FUNCTION "cache"."purge_stale_cache"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."rebuild_odds_markets_index"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  truncate table cache.odds_markets_index;

  insert into cache.odds_markets_index (
    market_id,
    legacy_id,
    name,
    developer_name,
    has_winning_calculations,
    normalized_name,
    aliases
  )
  select distinct on (x.market_id)
    x.market_id,
    x.legacy_id,
    x.name,
    x.developer_name,
    x.has_winning_calculations,
    util.normalize_text(concat_ws(' ', x.name, x.developer_name)) as normalized_name,
    '[]'::jsonb as aliases
  from (
    select
      (item->>'id')::bigint as market_id,
      case
        when nullif(item->>'legacy_id', '') is null then null
        else (item->>'legacy_id')::bigint
      end as legacy_id,
      nullif(item->>'name', '') as name,
      nullif(item->>'developer_name', '') as developer_name,
      case
        when item ? 'has_winning_calculations'
          then coalesce((item->>'has_winning_calculations')::boolean, false)
        else false
      end as has_winning_calculations,
      r.fetched_at
    from cache.odds_markets_raw r
    cross join lateral jsonb_array_elements(coalesce(r.payload->'data', '[]'::jsonb)) as item
  ) x
  order by x.market_id, x.fetched_at desc;
end;
$$;


ALTER FUNCTION "cache"."rebuild_odds_markets_index"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."start_sync"("p_target_table" "text", "p_scope_key" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_sync_id uuid;
begin
  insert into cache.sync_runs (target_table, scope_key)
  values (p_target_table, p_scope_key)
  returning id into v_sync_id;

  return v_sync_id;
end;
$$;


ALTER FUNCTION "cache"."start_sync"("p_target_table" "text", "p_scope_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "util"."normalize_text"("p_text" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select trim(regexp_replace(lower(coalesce(p_text, '')), '\s+', ' ', 'g'));
$$;


ALTER FUNCTION "util"."normalize_text"("p_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "util"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "util"."touch_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "cache"."fixtures_head_to_head_raw" (
    "home_team_id" bigint NOT NULL,
    "away_team_id" bigint NOT NULL,
    "page_number" integer DEFAULT 1 NOT NULL,
    "payload" "jsonb" NOT NULL,
    "pagination" "jsonb",
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_run_id" "uuid",
    CONSTRAINT "fixtures_head_to_head_raw_page_number_check" CHECK (("page_number" >= 1))
);


ALTER TABLE "cache"."fixtures_head_to_head_raw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "cache"."fixtures_raw" (
    "fixture_id" bigint NOT NULL,
    "page_number" integer DEFAULT 1 NOT NULL,
    "payload" "jsonb" NOT NULL,
    "pagination" "jsonb",
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_run_id" "uuid",
    CONSTRAINT "fixtures_raw_page_number_check" CHECK (("page_number" >= 1))
);


ALTER TABLE "cache"."fixtures_raw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "cache"."odds_inplay_fixtures_bookmakers_35_raw" (
    "fixture_id" bigint NOT NULL,
    "bookmaker_id" integer DEFAULT 35 NOT NULL,
    "page_number" integer DEFAULT 1 NOT NULL,
    "payload" "jsonb" NOT NULL,
    "pagination" "jsonb",
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_run_id" "uuid",
    CONSTRAINT "odds_inplay_fixtures_bookmakers_35_raw_page_number_check" CHECK (("page_number" >= 1))
);


ALTER TABLE "cache"."odds_inplay_fixtures_bookmakers_35_raw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "cache"."odds_markets_index" (
    "market_id" bigint NOT NULL,
    "legacy_id" bigint,
    "name" "text",
    "developer_name" "text",
    "has_winning_calculations" boolean DEFAULT false NOT NULL,
    "normalized_name" "text",
    "aliases" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "cache"."odds_markets_index" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "cache"."odds_markets_raw" (
    "page_number" integer NOT NULL,
    "payload" "jsonb" NOT NULL,
    "pagination" "jsonb",
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_run_id" "uuid",
    CONSTRAINT "odds_markets_raw_page_number_check" CHECK (("page_number" >= 1))
);


ALTER TABLE "cache"."odds_markets_raw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "cache"."odds_prematch_fixtures_bookmakers_35_raw" (
    "fixture_id" bigint NOT NULL,
    "bookmaker_id" integer DEFAULT 35 NOT NULL,
    "page_number" integer DEFAULT 1 NOT NULL,
    "payload" "jsonb" NOT NULL,
    "pagination" "jsonb",
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_run_id" "uuid",
    CONSTRAINT "odds_prematch_fixtures_bookmakers_35_raw_page_number_check" CHECK (("page_number" >= 1))
);


ALTER TABLE "cache"."odds_prematch_fixtures_bookmakers_35_raw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "cache"."statistics_seasons_referees_raw" (
    "referee_id" bigint NOT NULL,
    "page_number" integer DEFAULT 1 NOT NULL,
    "payload" "jsonb" NOT NULL,
    "pagination" "jsonb",
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_run_id" "uuid",
    CONSTRAINT "statistics_seasons_referees_raw_page_number_check" CHECK (("page_number" >= 1))
);


ALTER TABLE "cache"."statistics_seasons_referees_raw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "cache"."statistics_seasons_teams_raw" (
    "team_id" bigint NOT NULL,
    "page_number" integer DEFAULT 1 NOT NULL,
    "payload" "jsonb" NOT NULL,
    "pagination" "jsonb",
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_run_id" "uuid",
    CONSTRAINT "statistics_seasons_teams_raw_page_number_check" CHECK (("page_number" >= 1))
);


ALTER TABLE "cache"."statistics_seasons_teams_raw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "cache"."sync_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "target_table" "text" NOT NULL,
    "scope_key" "text" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "notes" "text",
    CONSTRAINT "sync_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'done'::"text", 'failed'::"text"])))
);


ALTER TABLE "cache"."sync_runs" OWNER TO "postgres";


ALTER TABLE ONLY "cache"."fixtures_head_to_head_raw"
    ADD CONSTRAINT "fixtures_head_to_head_raw_pkey" PRIMARY KEY ("home_team_id", "away_team_id", "page_number");



ALTER TABLE ONLY "cache"."fixtures_raw"
    ADD CONSTRAINT "fixtures_raw_pkey" PRIMARY KEY ("fixture_id", "page_number");



ALTER TABLE ONLY "cache"."odds_inplay_fixtures_bookmakers_35_raw"
    ADD CONSTRAINT "odds_inplay_fixtures_bookmakers_35_raw_pkey" PRIMARY KEY ("fixture_id", "bookmaker_id", "page_number");



ALTER TABLE ONLY "cache"."odds_markets_index"
    ADD CONSTRAINT "odds_markets_index_pkey" PRIMARY KEY ("market_id");



ALTER TABLE ONLY "cache"."odds_markets_raw"
    ADD CONSTRAINT "odds_markets_raw_pkey" PRIMARY KEY ("page_number");



ALTER TABLE ONLY "cache"."odds_prematch_fixtures_bookmakers_35_raw"
    ADD CONSTRAINT "odds_prematch_fixtures_bookmakers_35_raw_pkey" PRIMARY KEY ("fixture_id", "bookmaker_id", "page_number");



ALTER TABLE ONLY "cache"."statistics_seasons_referees_raw"
    ADD CONSTRAINT "statistics_seasons_referees_raw_pkey" PRIMARY KEY ("referee_id", "page_number");



ALTER TABLE ONLY "cache"."statistics_seasons_teams_raw"
    ADD CONSTRAINT "statistics_seasons_teams_raw_pkey" PRIMARY KEY ("team_id", "page_number");



ALTER TABLE ONLY "cache"."sync_runs"
    ADD CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_fixtures_raw_fetched_at" ON "cache"."fixtures_raw" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_h2h_raw_fetched_at" ON "cache"."fixtures_head_to_head_raw" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_odds_inplay_raw_fetched_at" ON "cache"."odds_inplay_fixtures_bookmakers_35_raw" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_odds_markets_index_normalized_name" ON "cache"."odds_markets_index" USING "btree" ("normalized_name");



CREATE INDEX "idx_odds_markets_raw_fetched_at" ON "cache"."odds_markets_raw" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_odds_prematch_raw_fetched_at" ON "cache"."odds_prematch_fixtures_bookmakers_35_raw" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_ref_stats_raw_fetched_at" ON "cache"."statistics_seasons_referees_raw" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_sync_runs_started_at" ON "cache"."sync_runs" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_sync_runs_target_scope" ON "cache"."sync_runs" USING "btree" ("target_table", "scope_key");



CREATE INDEX "idx_team_stats_raw_fetched_at" ON "cache"."statistics_seasons_teams_raw" USING "btree" ("fetched_at" DESC);



CREATE OR REPLACE TRIGGER "trg_fixtures_raw_updated_at" BEFORE UPDATE ON "cache"."fixtures_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_h2h_raw_updated_at" BEFORE UPDATE ON "cache"."fixtures_head_to_head_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_odds_inplay_raw_updated_at" BEFORE UPDATE ON "cache"."odds_inplay_fixtures_bookmakers_35_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_odds_markets_index_updated_at" BEFORE UPDATE ON "cache"."odds_markets_index" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_odds_markets_raw_updated_at" BEFORE UPDATE ON "cache"."odds_markets_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_odds_prematch_raw_updated_at" BEFORE UPDATE ON "cache"."odds_prematch_fixtures_bookmakers_35_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ref_stats_raw_updated_at" BEFORE UPDATE ON "cache"."statistics_seasons_referees_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_team_stats_raw_updated_at" BEFORE UPDATE ON "cache"."statistics_seasons_teams_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



ALTER TABLE ONLY "cache"."fixtures_head_to_head_raw"
    ADD CONSTRAINT "fixtures_head_to_head_raw_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "cache"."sync_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "cache"."fixtures_raw"
    ADD CONSTRAINT "fixtures_raw_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "cache"."sync_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "cache"."odds_inplay_fixtures_bookmakers_35_raw"
    ADD CONSTRAINT "odds_inplay_fixtures_bookmakers_35_raw_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "cache"."sync_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "cache"."odds_markets_raw"
    ADD CONSTRAINT "odds_markets_raw_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "cache"."sync_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "cache"."odds_prematch_fixtures_bookmakers_35_raw"
    ADD CONSTRAINT "odds_prematch_fixtures_bookmakers_35_raw_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "cache"."sync_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "cache"."statistics_seasons_referees_raw"
    ADD CONSTRAINT "statistics_seasons_referees_raw_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "cache"."sync_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "cache"."statistics_seasons_teams_raw"
    ADD CONSTRAINT "statistics_seasons_teams_raw_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "cache"."sync_runs"("id") ON DELETE SET NULL;





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";









































































































































































































ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";




























