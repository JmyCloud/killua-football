


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






CREATE OR REPLACE FUNCTION "cache"."purge_stale_cache"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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
    where started_at < now() - interval '7 days';
end;
$$;

ALTER FUNCTION "cache"."purge_stale_cache"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."rebuild_all_fixtures_index"() RETURNS TABLE("fixture_id" bigint, "status" "text")
    LANGUAGE "plpgsql"
    AS $$
declare
  v_fixture_id bigint;
begin
  for v_fixture_id in
    select distinct f.fixture_id from cache.fixtures_raw f
  loop
    begin
      perform cache.rebuild_fixture_index(v_fixture_id);
      fixture_id := v_fixture_id; status := 'ok'; return next;
    exception when others then
      fixture_id := v_fixture_id; status := sqlerrm; return next;
    end;
  end loop;
end;
$$;


ALTER FUNCTION "cache"."rebuild_all_fixtures_index"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."rebuild_all_h2h_index"() RETURNS TABLE("home_team_id" bigint, "away_team_id" bigint, "fixtures_indexed" integer, "status" "text")
    LANGUAGE "plpgsql"
    AS $$
declare
  v_home  bigint;
  v_away  bigint;
  v_count int;
begin
  for v_home, v_away in
    select distinct h.home_team_id, h.away_team_id
    from cache.fixtures_head_to_head_raw h
  loop
    begin
      perform cache.rebuild_h2h_index(v_home, v_away);

      select count(*) into v_count
      from cache.fixtures_h2h_index
      where home_team_id = v_home
        and away_team_id = v_away
        and chunk = 'summary';

      home_team_id     := v_home;
      away_team_id     := v_away;
      fixtures_indexed := v_count;
      status           := 'ok';
      return next;
    exception when others then
      home_team_id     := v_home;
      away_team_id     := v_away;
      fixtures_indexed := 0;
      status           := sqlerrm;
      return next;
    end;
  end loop;
end;
$$;


ALTER FUNCTION "cache"."rebuild_all_h2h_index"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."rebuild_all_odds_inplay_index"() RETURNS TABLE("fixture_id" bigint, "markets_indexed" integer, "status" "text")
    LANGUAGE "plpgsql"
    AS $$
declare
  v_fid   bigint;
  v_count int;
begin
  for v_fid in
    select distinct r.fixture_id
    from cache.odds_inplay_fixtures_bookmakers_35_raw r
  loop
    begin
      perform cache.rebuild_odds_inplay_index(v_fid);

      select count(*) into v_count
      from cache.odds_inplay_index i
      where i.fixture_id = v_fid;

      fixture_id      := v_fid;
      markets_indexed := v_count;
      status          := 'ok';
      return next;
    exception when others then
      fixture_id      := v_fid;
      markets_indexed := 0;
      status          := sqlerrm;
      return next;
    end;
  end loop;
end;
$$;


ALTER FUNCTION "cache"."rebuild_all_odds_inplay_index"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."rebuild_all_odds_prematch_index"() RETURNS TABLE("fixture_id" bigint, "markets_indexed" integer, "status" "text")
    LANGUAGE "plpgsql"
    AS $$
declare
  v_fid   bigint;
  v_count int;
begin
  for v_fid in
    select distinct r.fixture_id
    from cache.odds_prematch_fixtures_bookmakers_35_raw r
  loop
    begin
      perform cache.rebuild_odds_prematch_index(v_fid);

      select count(*) into v_count
      from cache.odds_prematch_index i
      where i.fixture_id = v_fid;

      fixture_id      := v_fid;
      markets_indexed := v_count;
      status          := 'ok';
      return next;
    exception when others then
      fixture_id      := v_fid;
      markets_indexed := 0;
      status          := sqlerrm;
      return next;
    end;
  end loop;
end;
$$;


ALTER FUNCTION "cache"."rebuild_all_odds_prematch_index"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."rebuild_all_referee_stats_index"() RETURNS TABLE("referee_id" bigint, "seasons_indexed" integer, "status" "text")
    LANGUAGE "plpgsql"
    AS $$
declare
  v_rid   bigint;
  v_count int;
begin
  for v_rid in
    select distinct r.referee_id
    from cache.statistics_seasons_referees_raw r
  loop
    begin
      perform cache.rebuild_referee_stats_index(v_rid);

      select count(*) into v_count
      from cache.statistics_seasons_referees_index i
      where i.referee_id = v_rid;

      referee_id     := v_rid;
      seasons_indexed := v_count;
      status          := 'ok';
      return next;
    exception when others then
      referee_id      := v_rid;
      seasons_indexed := 0;
      status          := sqlerrm;
      return next;
    end;
  end loop;
end;
$$;


ALTER FUNCTION "cache"."rebuild_all_referee_stats_index"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."rebuild_all_team_stats_index"() RETURNS TABLE("team_id" bigint, "seasons_indexed" integer, "status" "text")
    LANGUAGE "plpgsql"
    AS $$
declare
  v_tid   bigint;
  v_count int;
begin
  for v_tid in
    select distinct r.team_id
    from cache.statistics_seasons_teams_raw r
  loop
    begin
      perform cache.rebuild_team_stats_index(v_tid);

      select count(*) into v_count
      from cache.statistics_seasons_teams_index i
      where i.team_id = v_tid;

      team_id        := v_tid;
      seasons_indexed := v_count;
      status          := 'ok';
      return next;
    exception when others then
      team_id         := v_tid;
      seasons_indexed := 0;
      status          := sqlerrm;
      return next;
    end;
  end loop;
end;
$$;


ALTER FUNCTION "cache"."rebuild_all_team_stats_index"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."rebuild_fixture_index"("p_fixture_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_data jsonb;
begin
  select (payload->'data') into v_data
  from cache.fixtures_raw
  where fixture_id = p_fixture_id
  order by fetched_at desc
  limit 1;

  if v_data is null then
    raise exception 'No data found for fixture_id=%', p_fixture_id;
  end if;

  -- base: الحقول الأساسية فقط بدون nested objects
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'base', jsonb_build_object(
    'id', v_data->'id', 'name', v_data->'name', 'leg', v_data->'leg',
    'length', v_data->'length', 'starting_at', v_data->'starting_at',
    'starting_at_timestamp', v_data->'starting_at_timestamp',
    'has_odds', v_data->'has_odds', 'has_premium_odds', v_data->'has_premium_odds',
    'result_info', v_data->'result_info', 'placeholder', v_data->'placeholder',
    'sport_id', v_data->'sport_id', 'league_id', v_data->'league_id',
    'season_id', v_data->'season_id', 'stage_id', v_data->'stage_id',
    'round_id', v_data->'round_id', 'venue_id', v_data->'venue_id',
    'state_id', v_data->'state_id', 'aggregate_id', v_data->'aggregate_id',
    'group_id', v_data->'group_id'
  )) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- state
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'state',
    jsonb_build_object('state', v_data->'state')
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- league
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'league',
    jsonb_build_object('league', v_data->'league')
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- season
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'season',
    jsonb_build_object('season', v_data->'season')
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- stage
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'stage',
    jsonb_build_object('stage', v_data->'stage')
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- round
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'round',
    jsonb_build_object('round', v_data->'round')
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- group
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'group',
    jsonb_build_object('group', v_data->'group')
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- aggregate
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'aggregate',
    jsonb_build_object('aggregate', v_data->'aggregate')
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- venue
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'venue',
    jsonb_build_object('venue', v_data->'venue')
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- weatherreport (include: weatherReport)
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'weatherreport',
    jsonb_build_object('weatherreport', v_data->'weatherreport')
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- participants
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'participants',
    jsonb_build_object('participants', coalesce(v_data->'participants', '[]'))
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- metadata
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'metadata',
    jsonb_build_object('metadata', coalesce(v_data->'metadata', '[]'))
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- formations
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'formations',
    jsonb_build_object('formations', coalesce(v_data->'formations', '[]'))
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- lineups (lineups.player + lineups.detailedposition + lineups.details.type)
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'lineups',
    jsonb_build_object('lineups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',                 item->'id',
        'fixture_id',         item->'fixture_id',
        'team_id',            item->'team_id',
        'player_id',          item->'player_id',
        'player_name',        item->'player_name',
        'position_id',        item->'position_id',
        'jersey_number',      item->'jersey_number',
        'formation_field',    item->'formation_field',
        'formation_position', item->'formation_position',
        'type_id',            item->'type_id',
        'player',             item->'player',
        'detailedposition',   item->'detailedposition',
        'details',            item->'details'
      ))
      from jsonb_array_elements(v_data->'lineups') as item
    ), '[]'))
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- scores (scores.type)
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'scores',
    jsonb_build_object('scores', coalesce(v_data->'scores', '[]'))
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- events (events.type)
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'events',
    jsonb_build_object('events', coalesce(v_data->'events', '[]'))
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- statistics (statistics.type)
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'statistics',
    jsonb_build_object('statistics', coalesce(v_data->'statistics', '[]'))
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- periods (periods.type + periods.statistics.type)
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'periods',
    jsonb_build_object('periods', coalesce(v_data->'periods', '[]'))
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- referees (referees.referee + referees.type)
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'referees',
    jsonb_build_object('referees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',         item->'id',
        'fixture_id', item->'fixture_id',
        'referee_id', item->'referee_id',
        'type_id',    item->'type_id',
        'referee',    item->'referee',
        'type',       item->'type'
      ))
      from jsonb_array_elements(v_data->'referees') as item
    ), '[]'))
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- coaches
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'coaches',
    jsonb_build_object('coaches', coalesce(v_data->'coaches', '[]'))
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

  -- sidelined (sidelined.sideline.player + sidelined.sideline.type)
  insert into cache.fixtures_index (fixture_id, chunk, payload) values (p_fixture_id, 'sidelined',
    jsonb_build_object('sidelined', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',             item->'id',
        'fixture_id',     item->'fixture_id',
        'player_id',      item->'player_id',
        'participant_id', item->'participant_id',
        'sideline_id',    item->'sideline_id',
        'type_id',        item->'type_id',
        'sideline',       item->'sideline'
      ))
      from jsonb_array_elements(v_data->'sidelined') as item
    ), '[]'))
  ) on conflict (fixture_id, chunk) do update set
    payload = excluded.payload, fetched_at = now(), updated_at = now();

end;
$$;


ALTER FUNCTION "cache"."rebuild_fixture_index"("p_fixture_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."rebuild_h2h_index"("p_home_team_id" bigint, "p_away_team_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_pages   jsonb[];
  v_page    jsonb;
  v_matches jsonb;
  v_match   jsonb;
  v_fid     bigint;
begin
  -- جمع كل الـ pages لهذا الـ pair مرتبة
  select array_agg(payload order by page_number)
  into v_pages
  from cache.fixtures_head_to_head_raw
  where home_team_id = p_home_team_id
    and away_team_id = p_away_team_id;

  if v_pages is null then
    raise exception 'No H2H data for home=% away=%', p_home_team_id, p_away_team_id;
  end if;

  -- امسح الـ index القديم لهذا الـ pair
  delete from cache.fixtures_h2h_index
  where home_team_id = p_home_team_id
    and away_team_id = p_away_team_id;

  -- loop على كل page
  foreach v_page in array v_pages loop
    v_matches := v_page -> 'data';
    if jsonb_typeof(v_matches) <> 'array' then continue; end if;

    for v_match in select * from jsonb_array_elements(v_matches) loop
      v_fid := (v_match ->> 'id')::bigint;
      if v_fid is null then continue; end if;

      -- ── chunk: summary ────────────────────────────────────────────────────
      -- يشمل: base fields + state + venue + league + season + stage + round + group + aggregate
      insert into cache.fixtures_h2h_index
        (home_team_id, away_team_id, fixture_id, chunk, payload)
      values (
        p_home_team_id, p_away_team_id, v_fid, 'summary',
        jsonb_build_object(
          -- base
          'id',                    v_match -> 'id',
          'name',                  v_match -> 'name',
          'leg',                   v_match -> 'leg',
          'length',                v_match -> 'length',
          'starting_at',           v_match -> 'starting_at',
          'starting_at_timestamp', v_match -> 'starting_at_timestamp',
          'result_info',           v_match -> 'result_info',
          'placeholder',           v_match -> 'placeholder',
          'has_odds',              v_match -> 'has_odds',
          'has_premium_odds',      v_match -> 'has_premium_odds',
          'sport_id',              v_match -> 'sport_id',
          'league_id',             v_match -> 'league_id',
          'season_id',             v_match -> 'season_id',
          'stage_id',              v_match -> 'stage_id',
          'round_id',              v_match -> 'round_id',
          'venue_id',              v_match -> 'venue_id',
          'state_id',              v_match -> 'state_id',
          'group_id',              v_match -> 'group_id',
          'aggregate_id',          v_match -> 'aggregate_id',
          -- nested includes
          'state',                 v_match -> 'state',
          'venue',                 v_match -> 'venue',
          'league',                v_match -> 'league',
          'season',                v_match -> 'season',
          'stage',                 v_match -> 'stage',
          'round',                 v_match -> 'round',
          'group',                 v_match -> 'group',
          'aggregate',             v_match -> 'aggregate'
        )
      )
      on conflict (home_team_id, away_team_id, fixture_id, chunk) do update set
        payload    = excluded.payload,
        fetched_at = now(),
        updated_at = now();

      -- ── chunk: participants ───────────────────────────────────────────────
      -- يشمل: participants مع meta (winner, location, position)
      insert into cache.fixtures_h2h_index
        (home_team_id, away_team_id, fixture_id, chunk, payload)
      values (
        p_home_team_id, p_away_team_id, v_fid, 'participants',
        jsonb_build_object(
          'fixture_id',   v_fid,
          'participants', coalesce(v_match -> 'participants', '[]'::jsonb)
        )
      )
      on conflict (home_team_id, away_team_id, fixture_id, chunk) do update set
        payload    = excluded.payload,
        fetched_at = now(),
        updated_at = now();

      -- ── chunk: events ─────────────────────────────────────────────────────
      -- يشمل: events.type (goals, cards, subs, penalties, var, owngoals, missedpenalty)
      insert into cache.fixtures_h2h_index
        (home_team_id, away_team_id, fixture_id, chunk, payload)
      values (
        p_home_team_id, p_away_team_id, v_fid, 'events',
        jsonb_build_object(
          'fixture_id', v_fid,
          'events',     coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'id',                  ev -> 'id',
                  'fixture_id',          ev -> 'fixture_id',
                  'participant_id',      ev -> 'participant_id',
                  'player_id',           ev -> 'player_id',
                  'player_name',         ev -> 'player_name',
                  'related_player_id',   ev -> 'related_player_id',
                  'related_player_name', ev -> 'related_player_name',
                  'type_id',             ev -> 'type_id',
                  'type',                ev -> 'type',
                  'minute',              ev -> 'minute',
                  'extra_minute',        ev -> 'extra_minute',
                  'result',              ev -> 'result',
                  'info',                ev -> 'info',
                  'addition',            ev -> 'addition',
                  'on_bench',            ev -> 'on_bench',
                  'injured',             ev -> 'injured',
                  'rescinded',           ev -> 'rescinded',
                  'section',             ev -> 'section',
                  'sub_type_id',         ev -> 'sub_type_id',
                  'sort_order',          ev -> 'sort_order'
                )
              )
              from jsonb_array_elements(v_match -> 'events') as ev
            ),
            '[]'::jsonb
          )
        )
      )
      on conflict (home_team_id, away_team_id, fixture_id, chunk) do update set
        payload    = excluded.payload,
        fetched_at = now(),
        updated_at = now();

      -- ── chunk: scores ─────────────────────────────────────────────────────
      -- يشمل: scores.type (1ST_HALF, 2ND_HALF, CURRENT, 2ND_HALF_ONLY)
      insert into cache.fixtures_h2h_index
        (home_team_id, away_team_id, fixture_id, chunk, payload)
      values (
        p_home_team_id, p_away_team_id, v_fid, 'scores',
        jsonb_build_object(
          'fixture_id', v_fid,
          'scores',     coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'id',             sc -> 'id',
                  'fixture_id',     sc -> 'fixture_id',
                  'participant_id', sc -> 'participant_id',
                  'type_id',        sc -> 'type_id',
                  'type',           sc -> 'type',
                  'score',          sc -> 'score',
                  'description',    sc -> 'description'
                )
              )
              from jsonb_array_elements(v_match -> 'scores') as sc
            ),
            '[]'::jsonb
          )
        )
      )
      on conflict (home_team_id, away_team_id, fixture_id, chunk) do update set
        payload    = excluded.payload,
        fetched_at = now(),
        updated_at = now();

      -- ── chunk: statistics ─────────────────────────────────────────────────
      -- يشمل: statistics.type (كل الإحصائيات مع type name و developer_name)
      insert into cache.fixtures_h2h_index
        (home_team_id, away_team_id, fixture_id, chunk, payload)
      values (
        p_home_team_id, p_away_team_id, v_fid, 'statistics',
        jsonb_build_object(
          'fixture_id', v_fid,
          'statistics', coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'id',             st -> 'id',
                  'fixture_id',     st -> 'fixture_id',
                  'participant_id', st -> 'participant_id',
                  'type_id',        st -> 'type_id',
                  'type',           st -> 'type',
                  'location',       st -> 'location',
                  'data',           st -> 'data'
                )
              )
              from jsonb_array_elements(v_match -> 'statistics') as st
            ),
            '[]'::jsonb
          )
        )
      )
      on conflict (home_team_id, away_team_id, fixture_id, chunk) do update set
        payload    = excluded.payload,
        fetched_at = now(),
        updated_at = now();

      -- ── chunk: referees ───────────────────────────────────────────────────
      -- يشمل: referees.referee + referees.type
      insert into cache.fixtures_h2h_index
        (home_team_id, away_team_id, fixture_id, chunk, payload)
      values (
        p_home_team_id, p_away_team_id, v_fid, 'referees',
        jsonb_build_object(
          'fixture_id', v_fid,
          'referees',   coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'id',         ref -> 'id',
                  'fixture_id', ref -> 'fixture_id',
                  'referee_id', ref -> 'referee_id',
                  'type_id',    ref -> 'type_id',
                  'referee',    ref -> 'referee',
                  'type',       ref -> 'type'
                )
              )
              from jsonb_array_elements(v_match -> 'referees') as ref
            ),
            '[]'::jsonb
          )
        )
      )
      on conflict (home_team_id, away_team_id, fixture_id, chunk) do update set
        payload    = excluded.payload,
        fetched_at = now(),
        updated_at = now();

    end loop;
  end loop;
end;
$$;


ALTER FUNCTION "cache"."rebuild_h2h_index"("p_home_team_id" bigint, "p_away_team_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."rebuild_odds_inplay_index"("p_fixture_id" bigint, "p_bookmaker_id" integer DEFAULT 35) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_all_odds jsonb := '[]'::jsonb;
  v_page     record;
begin
  for v_page in
    select payload
    from cache.odds_inplay_fixtures_bookmakers_35_raw
    where fixture_id   = p_fixture_id
      and bookmaker_id = p_bookmaker_id
    order by page_number
  loop
    if jsonb_typeof(v_page.payload -> 'data') = 'array' then
      v_all_odds := v_all_odds || (v_page.payload -> 'data');
    end if;
  end loop;

  if jsonb_array_length(v_all_odds) = 0 then
    raise exception 'No inplay odds for fixture=% bookmaker=%',
      p_fixture_id, p_bookmaker_id;
  end if;

  delete from cache.odds_inplay_index
  where fixture_id   = p_fixture_id
    and bookmaker_id = p_bookmaker_id;

  insert into cache.odds_inplay_index
    (fixture_id, bookmaker_id, market_id, market_description, odds, fetched_at)
  select
    p_fixture_id,
    p_bookmaker_id,
    (item ->> 'market_id')::bigint,
    max(item ->> 'market_description'),
    jsonb_agg(
      jsonb_build_object(
        'id',                       item -> 'id',
        'name',                     item -> 'name',
        'label',                    item -> 'label',
        'value',                    item -> 'value',
        'dp3',                      item -> 'dp3',
        'american',                 item -> 'american',
        'fractional',               item -> 'fractional',
        'probability',              item -> 'probability',
        'total',                    item -> 'total',
        'handicap',                 item -> 'handicap',
        'winning',                  item -> 'winning',
        'stopped',                  item -> 'stopped',
        'sort_order',               item -> 'sort_order',
        'original_label',           item -> 'original_label',
        'participants',             item -> 'participants',
        'latest_bookmaker_update',  item -> 'latest_bookmaker_update'
      )
      order by (item ->> 'sort_order')::int
    ),
    now()
  from jsonb_array_elements(v_all_odds) as item
  where (item ->> 'market_id') is not null
  group by (item ->> 'market_id')::bigint;

end;
$$;


ALTER FUNCTION "cache"."rebuild_odds_inplay_index"("p_fixture_id" bigint, "p_bookmaker_id" integer) OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "cache"."rebuild_odds_prematch_index"("p_fixture_id" bigint, "p_bookmaker_id" integer DEFAULT 35) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_all_odds jsonb := '[]'::jsonb;
  v_page     record;
begin
  -- جمع كل الـ odds من كل الـ pages
  for v_page in
    select payload
    from cache.odds_prematch_fixtures_bookmakers_35_raw
    where fixture_id   = p_fixture_id
      and bookmaker_id = p_bookmaker_id
    order by page_number
  loop
    if jsonb_typeof(v_page.payload -> 'data') = 'array' then
      v_all_odds := v_all_odds || (v_page.payload -> 'data');
    end if;
  end loop;

  if jsonb_array_length(v_all_odds) = 0 then
    raise exception 'No prematch odds for fixture=% bookmaker=%',
      p_fixture_id, p_bookmaker_id;
  end if;

  -- امسح الـ index القديم لهذه المباراة
  delete from cache.odds_prematch_index
  where fixture_id   = p_fixture_id
    and bookmaker_id = p_bookmaker_id;

  -- group by market_id وinsert صف لكل market
  insert into cache.odds_prematch_index
    (fixture_id, bookmaker_id, market_id, market_description, odds, fetched_at)
  select
    p_fixture_id,
    p_bookmaker_id,
    (item ->> 'market_id')::bigint,
    max(item ->> 'market_description'),
    jsonb_agg(
      jsonb_build_object(
        'id',                       item -> 'id',
        'name',                     item -> 'name',
        'label',                    item -> 'label',
        'value',                    item -> 'value',
        'dp3',                      item -> 'dp3',
        'american',                 item -> 'american',
        'fractional',               item -> 'fractional',
        'probability',              item -> 'probability',
        'total',                    item -> 'total',
        'handicap',                 item -> 'handicap',
        'winning',                  item -> 'winning',
        'stopped',                  item -> 'stopped',
        'sort_order',               item -> 'sort_order',
        'original_label',           item -> 'original_label',
        'participants',             item -> 'participants',
        'latest_bookmaker_update',  item -> 'latest_bookmaker_update'
      )
      order by (item ->> 'sort_order')::int
    ),
    now()
  from jsonb_array_elements(v_all_odds) as item
  where (item ->> 'market_id') is not null
  group by (item ->> 'market_id')::bigint;

end;
$$;


ALTER FUNCTION "cache"."rebuild_odds_prematch_index"("p_fixture_id" bigint, "p_bookmaker_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."rebuild_referee_stats_index"("p_referee_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_all_items jsonb := '[]'::jsonb;
  v_page      record;
  v_item      jsonb;
  v_details   jsonb;
  v_val       jsonb;

  -- extracted fields
  v_season_id           bigint;
  v_statistic_id        bigint;
  v_referee_name        text;
  v_referee_common_name text;
  v_referee_country_id  bigint;
  v_referee_image_path  text;
  v_referee_obj         jsonb;
  v_season_name         text;
  v_season_league_id    bigint;
  v_season_is_current   boolean;
  v_season_starting_at  text;
  v_season_ending_at    text;
  v_season_obj          jsonb;
  v_matches_officiated  jsonb;
  v_fouls               jsonb;
  v_yellowcards         jsonb;
  v_redcards            jsonb;
  v_yellowred_cards     jsonb;
  v_penalties           jsonb;
  v_var_reviews         jsonb;
begin
  -- جمع كل الـ pages
  for v_page in
    select payload
    from cache.statistics_seasons_referees_raw
    where referee_id = p_referee_id
    order by page_number
  loop
    if jsonb_typeof(v_page.payload -> 'data') = 'array' then
      v_all_items := v_all_items || (v_page.payload -> 'data');
    end if;
  end loop;

  if jsonb_array_length(v_all_items) = 0 then
    raise exception 'No referee stats for referee_id=%', p_referee_id;
  end if;

  -- امسح القديم
  delete from cache.statistics_seasons_referees_index
  where referee_id = p_referee_id;

  -- loop على كل item (كل موسم)
  for v_item in select * from jsonb_array_elements(v_all_items) loop

    v_season_id    := (v_item ->> 'season_id')::bigint;
    v_statistic_id := (v_item ->> 'id')::bigint;

    if v_season_id is null then continue; end if;

    -- referee info
    v_referee_obj         := v_item -> 'referee';
    v_referee_name        := v_referee_obj ->> 'name';
    v_referee_common_name := v_referee_obj ->> 'common_name';
    v_referee_country_id  := (v_referee_obj ->> 'country_id')::bigint;
    v_referee_image_path  := v_referee_obj ->> 'image_path';

    -- season info
    v_season_obj         := v_item -> 'season';
    v_season_name        := v_season_obj ->> 'name';
    v_season_league_id   := (v_season_obj ->> 'league_id')::bigint;
    v_season_is_current  := (v_season_obj ->> 'is_current')::boolean;
    v_season_starting_at := v_season_obj ->> 'starting_at';
    v_season_ending_at   := v_season_obj ->> 'ending_at';

    -- reset stats
    v_matches_officiated := null;
    v_fouls              := null;
    v_yellowcards        := null;
    v_redcards           := null;
    v_yellowred_cards    := null;
    v_penalties          := null;
    v_var_reviews        := null;

    -- فك الـ details لأعمدة منفصلة
    for v_details in select * from jsonb_array_elements(coalesce(v_item -> 'details', '[]')) loop
      v_val := v_details -> 'value';
      case (v_details ->> 'type_id')::int
        when 188 then v_matches_officiated := v_val;
        when 56  then v_fouls              := v_val;
        when 84  then v_yellowcards        := v_val;
        when 83  then v_redcards           := v_val;
        when 85  then v_yellowred_cards    := v_val;
        when 47  then v_penalties          := v_val;
        when 314 then v_var_reviews        := v_val;
        else null;
      end case;
    end loop;

    insert into cache.statistics_seasons_referees_index (
      referee_id, season_id,
      referee_name, referee_common_name, referee_country_id, referee_image_path, referee,
      season_name, season_league_id, season_is_current, season_starting_at, season_ending_at, season,
      matches_officiated, fouls, yellowcards, redcards, yellowred_cards, penalties, var_reviews,
      statistic_id, fetched_at
    ) values (
      p_referee_id, v_season_id,
      v_referee_name, v_referee_common_name, v_referee_country_id, v_referee_image_path, v_referee_obj,
      v_season_name, v_season_league_id, v_season_is_current, v_season_starting_at, v_season_ending_at, v_season_obj,
      v_matches_officiated, v_fouls, v_yellowcards, v_redcards, v_yellowred_cards, v_penalties, v_var_reviews,
      v_statistic_id, now()
    )
    on conflict (referee_id, season_id) do update set
      referee_name        = excluded.referee_name,
      referee_common_name = excluded.referee_common_name,
      referee_country_id  = excluded.referee_country_id,
      referee_image_path  = excluded.referee_image_path,
      referee             = excluded.referee,
      season_name         = excluded.season_name,
      season_league_id    = excluded.season_league_id,
      season_is_current   = excluded.season_is_current,
      season_starting_at  = excluded.season_starting_at,
      season_ending_at    = excluded.season_ending_at,
      season              = excluded.season,
      matches_officiated  = excluded.matches_officiated,
      fouls               = excluded.fouls,
      yellowcards         = excluded.yellowcards,
      redcards            = excluded.redcards,
      yellowred_cards     = excluded.yellowred_cards,
      penalties           = excluded.penalties,
      var_reviews         = excluded.var_reviews,
      statistic_id        = excluded.statistic_id,
      fetched_at          = excluded.fetched_at,
      updated_at          = now();

  end loop;
end;
$$;


ALTER FUNCTION "cache"."rebuild_referee_stats_index"("p_referee_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."rebuild_team_stats_index"("p_team_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_all_items jsonb := '[]'::jsonb;
  v_page      record;
  v_item      jsonb;
  v_detail    jsonb;
  v_tid       int;
  v_val       jsonb;
  v_map       jsonb;

  v_season_id          bigint;
  v_statistic_id       bigint;
  v_has_values         boolean;
  v_team_obj           jsonb;
  v_team_name          text;
  v_team_short_code    text;
  v_team_image_path    text;
  v_team_country_id    bigint;
  v_season_obj         jsonb;
  v_season_name        text;
  v_season_league_id   bigint;
  v_season_is_current  boolean;
  v_season_starting_at text;
  v_season_ending_at   text;

  v_attacking  jsonb;
  v_defending  jsonb;
  v_passing    jsonb;
  v_form       jsonb;
  v_physical   jsonb;
  v_advanced   jsonb;
begin
  -- جمع كل الـ pages
  for v_page in
    select payload
    from cache.statistics_seasons_teams_raw
    where team_id = p_team_id
    order by page_number
  loop
    if jsonb_typeof(v_page.payload -> 'data') = 'array' then
      v_all_items := v_all_items || (v_page.payload -> 'data');
    end if;
  end loop;

  if jsonb_array_length(v_all_items) = 0 then
    raise exception 'No team stats for team_id=%', p_team_id;
  end if;

  delete from cache.statistics_seasons_teams_index
  where team_id = p_team_id;

  for v_item in select * from jsonb_array_elements(v_all_items) loop

    v_season_id    := (v_item ->> 'season_id')::bigint;
    v_statistic_id := (v_item ->> 'id')::bigint;
    v_has_values   := (v_item ->> 'has_values')::boolean;

    if v_season_id is null then continue; end if;

    -- team info
    v_team_obj        := v_item -> 'team';
    v_team_name       := v_team_obj ->> 'name';
    v_team_short_code := v_team_obj ->> 'short_code';
    v_team_image_path := v_team_obj ->> 'image_path';
    v_team_country_id := (v_team_obj ->> 'country_id')::bigint;

    -- season info
    v_season_obj         := v_item -> 'season';
    v_season_name        := v_season_obj ->> 'name';
    v_season_league_id   := (v_season_obj ->> 'league_id')::bigint;
    v_season_is_current  := (v_season_obj ->> 'is_current')::boolean;
    v_season_starting_at := v_season_obj ->> 'starting_at';
    v_season_ending_at   := v_season_obj ->> 'ending_at';

    -- reset categories
    v_attacking := '{}'::jsonb;
    v_defending := '{}'::jsonb;
    v_passing   := '{}'::jsonb;
    v_form      := '{}'::jsonb;
    v_physical  := '{}'::jsonb;
    v_advanced  := '{}'::jsonb;

    -- فك الـ details في categories
    for v_detail in select * from jsonb_array_elements(coalesce(v_item -> 'details', '[]')) loop
      v_tid := (v_detail ->> 'type_id')::int;
      v_val := v_detail -> 'value';

      case v_tid
        -- ── ATTACKING ────────────────────────────────────────────────────────
        when 52   then v_attacking := v_attacking || jsonb_build_object('goals', v_val);
        when 1677 then v_attacking := v_attacking || jsonb_build_object('shots', v_val);
        when 34   then v_attacking := v_attacking || jsonb_build_object('corners', v_val);
        when 51   then v_attacking := v_attacking || jsonb_build_object('offsides', v_val);
        when 27254 then v_attacking := v_attacking || jsonb_build_object('assists', v_val);
        when 47   then v_attacking := v_attacking || jsonb_build_object('penalties', v_val);
        when 118  then v_attacking := v_attacking || jsonb_build_object('avg_goals_per_game', v_val);
        when 44   then v_attacking := v_attacking || jsonb_build_object('dangerous_attacks', v_val);
        when 43   then v_attacking := v_attacking || jsonb_build_object('attacks', v_val);
        when 9680 then v_attacking := v_attacking || jsonb_build_object('shot_conversion_pct', v_val);
        when 9681 then v_attacking := v_attacking || jsonb_build_object('goal_conversion_pct', v_val);
        when 9682 then v_attacking := v_attacking || jsonb_build_object('shots_on_target_pct', v_val);
        when 27248 then v_attacking := v_attacking || jsonb_build_object('scoring_frequency', v_val);
        when 27251 then v_attacking := v_attacking || jsonb_build_object('most_frequent_scoring_minute', v_val);
        when 27250 then v_attacking := v_attacking || jsonb_build_object('scoring_by_half', v_val);

        -- ── DEFENDING ────────────────────────────────────────────────────────
        when 78   then v_defending := v_defending || jsonb_build_object('tackles', v_val);
        when 27252 then v_defending := v_defending || jsonb_build_object('interceptions', v_val);
        when 56   then v_defending := v_defending || jsonb_build_object('fouls', v_val);
        when 84   then v_defending := v_defending || jsonb_build_object('yellowcards', v_val);
        when 83   then v_defending := v_defending || jsonb_build_object('redcards', v_val);
        when 85   then v_defending := v_defending || jsonb_build_object('yellowred_cards', v_val);
        when 192  then v_defending := v_defending || jsonb_build_object('clean_sheets', v_val);
        when 88   then v_defending := v_defending || jsonb_build_object('goals_conceded', v_val);
        when 191  then v_defending := v_defending || jsonb_build_object('goals_conceded_lines', v_val);
        when 9683 then v_defending := v_defending || jsonb_build_object('cards_to_fouls_ratio', v_val);
        when 575  then v_defending := v_defending || jsonb_build_object('failed_to_score', v_val);

        -- ── PASSING ──────────────────────────────────────────────────────────
        when 27253 then v_passing := v_passing || jsonb_build_object('passes', v_val);
        when 45   then v_passing := v_passing || jsonb_build_object('ball_possession_pct', v_val);

        -- ── FORM ─────────────────────────────────────────────────────────────
        when 214  then v_form := v_form || jsonb_build_object('wins', v_val);
        when 215  then v_form := v_form || jsonb_build_object('draws', v_val);
        when 216  then v_form := v_form || jsonb_build_object('losses', v_val);
        when 9676 then v_form := v_form || jsonb_build_object('points_per_game', v_val);
        when 194  then v_form := v_form || jsonb_build_object('scoring_first', v_val);
        when 213  then v_form := v_form || jsonb_build_object('goals_conceded_timing', v_val);
        when 196  then v_form := v_form || jsonb_build_object('goals_scored_timing', v_val);
        when 27261 then v_form := v_form || jsonb_build_object('goal_lines', v_val);
        when 27256 then v_form := v_form || jsonb_build_object('match_outcomes', v_val);
        when 27260 then v_form := v_form || jsonb_build_object('draws_detail', v_val);
        when 27263 then v_form := v_form || jsonb_build_object('btts', v_val);
        when 211  then v_form := v_form || jsonb_build_object('best_rated_player', v_val);

        -- ── PHYSICAL ─────────────────────────────────────────────────────────
        when 9672 then v_physical := v_physical || jsonb_build_object('avg_height', v_val);
        when 9675 then v_physical := v_physical || jsonb_build_object('foot_preference', v_val);
        when 27249 then v_physical := v_physical || jsonb_build_object('total_minutes_played', v_val);
        when 124  then v_physical := v_physical || jsonb_build_object('avg_player_age', v_val);
        when 125  then v_physical := v_physical || jsonb_build_object('avg_player_value', v_val);

        -- ── ADVANCED ─────────────────────────────────────────────────────────
        when 9677 then v_advanced := v_advanced || jsonb_build_object('most_appearing_players', v_val);
        when 9678 then v_advanced := v_advanced || jsonb_build_object('most_substituted_players', v_val);
        when 9679 then v_advanced := v_advanced || jsonb_build_object('most_injured_players', v_val);
        when 27258 then v_advanced := v_advanced || jsonb_build_object('national_team_players', v_val);
        when 192  then null; -- already in defending
        else
          -- أي type_id مش معروف يروح advanced
          v_advanced := v_advanced || jsonb_build_object('type_' || v_tid::text, v_val);
      end case;
    end loop;

    insert into cache.statistics_seasons_teams_index (
      team_id, season_id,
      team_name, team_short_code, team_image_path, team_country_id, team,
      season_name, season_league_id, season_is_current, season_starting_at, season_ending_at, season,
      attacking, defending, passing, form, physical, advanced,
      statistic_id, has_values, fetched_at
    ) values (
      p_team_id, v_season_id,
      v_team_name, v_team_short_code, v_team_image_path, v_team_country_id, v_team_obj,
      v_season_name, v_season_league_id, v_season_is_current, v_season_starting_at, v_season_ending_at, v_season_obj,
      v_attacking, v_defending, v_passing, v_form, v_physical, v_advanced,
      v_statistic_id, v_has_values, now()
    )
    on conflict (team_id, season_id) do update set
      team_name           = excluded.team_name,
      team_short_code     = excluded.team_short_code,
      team_image_path     = excluded.team_image_path,
      team_country_id     = excluded.team_country_id,
      team                = excluded.team,
      season_name         = excluded.season_name,
      season_league_id    = excluded.season_league_id,
      season_is_current   = excluded.season_is_current,
      season_starting_at  = excluded.season_starting_at,
      season_ending_at    = excluded.season_ending_at,
      season              = excluded.season,
      attacking           = excluded.attacking,
      defending           = excluded.defending,
      passing             = excluded.passing,
      form                = excluded.form,
      physical            = excluded.physical,
      advanced            = excluded.advanced,
      statistic_id        = excluded.statistic_id,
      has_values          = excluded.has_values,
      fetched_at          = excluded.fetched_at,
      updated_at          = now();

  end loop;
end;
$$;


ALTER FUNCTION "cache"."rebuild_team_stats_index"("p_team_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "cache"."start_sync"("p_table" "text", "p_key" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
declare v_id uuid;
begin
  insert into cache.sync_runs (target_table, scope_key, status)
  values (p_table, p_key, 'running')
  returning id into v_id;
  return v_id;
end;
$$;


ALTER FUNCTION "cache"."start_sync"("p_table" "text", "p_key" "text") OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "cache"."fixture_expected_lineups_raw" (
    "fixture_id" bigint NOT NULL,
    "payload" "jsonb" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_run_id" "uuid"
);


ALTER TABLE "cache"."fixture_expected_lineups_raw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "cache"."fixture_news_raw" (
    "fixture_id" bigint NOT NULL,
    "payload" "jsonb" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_run_id" "uuid"
);


ALTER TABLE "cache"."fixture_news_raw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "cache"."fixture_predictions_raw" (
    "fixture_id" bigint NOT NULL,
    "payload" "jsonb" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_run_id" "uuid"
);


ALTER TABLE "cache"."fixture_predictions_raw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "cache"."fixture_transfer_rumours_raw" (
    "fixture_id" bigint NOT NULL,
    "payload" "jsonb" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_run_id" "uuid"
);


ALTER TABLE "cache"."fixture_transfer_rumours_raw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "cache"."fixture_watchlist" (
    "fixture_id" bigint NOT NULL,
    "mode" "text" DEFAULT 'auto'::"text" NOT NULL,
    "priority" integer DEFAULT 100 NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "starts_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_warmed_at" timestamp with time zone,
    "last_warm_status" "text",
    "last_warm_error" "text",
    "last_match_is_live_like" boolean,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fixture_watchlist_last_warm_status_check" CHECK (("last_warm_status" = ANY (ARRAY['ok'::"text", 'partial'::"text", 'failed'::"text"]))),
    CONSTRAINT "fixture_watchlist_mode_check" CHECK (("mode" = ANY (ARRAY['auto'::"text", 'prematch'::"text", 'live'::"text"])))
);


ALTER TABLE "cache"."fixture_watchlist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "cache"."fixture_xg_raw" (
    "fixture_id" bigint NOT NULL,
    "payload" "jsonb" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_run_id" "uuid"
);


ALTER TABLE "cache"."fixture_xg_raw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "cache"."fixtures_h2h_index" (
    "home_team_id" bigint NOT NULL,
    "away_team_id" bigint NOT NULL,
    "fixture_id" bigint NOT NULL,
    "chunk" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "cache"."fixtures_h2h_index" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "cache"."fixtures_index" (
    "fixture_id" bigint NOT NULL,
    "chunk" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "cache"."fixtures_index" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "cache"."odds_inplay_index" (
    "fixture_id" bigint NOT NULL,
    "bookmaker_id" integer DEFAULT 35 NOT NULL,
    "market_id" bigint NOT NULL,
    "market_description" "text",
    "odds" "jsonb" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "cache"."odds_inplay_index" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "cache"."odds_prematch_index" (
    "fixture_id" bigint NOT NULL,
    "bookmaker_id" integer DEFAULT 35 NOT NULL,
    "market_id" bigint NOT NULL,
    "market_description" "text",
    "odds" "jsonb" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "cache"."odds_prematch_index" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "cache"."standings_seasons_raw" (
    "season_id" bigint NOT NULL,
    "payload" "jsonb" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_run_id" "uuid"
);


ALTER TABLE "cache"."standings_seasons_raw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "cache"."statistics_seasons_referees_index" (
    "referee_id" bigint NOT NULL,
    "season_id" bigint NOT NULL,
    "referee_name" "text",
    "referee_common_name" "text",
    "referee_country_id" bigint,
    "referee_image_path" "text",
    "referee" "jsonb",
    "season_name" "text",
    "season_league_id" bigint,
    "season_is_current" boolean,
    "season_starting_at" "text",
    "season_ending_at" "text",
    "season" "jsonb",
    "matches_officiated" "jsonb",
    "fouls" "jsonb",
    "yellowcards" "jsonb",
    "redcards" "jsonb",
    "yellowred_cards" "jsonb",
    "penalties" "jsonb",
    "var_reviews" "jsonb",
    "statistic_id" bigint,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "cache"."statistics_seasons_referees_index" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "cache"."statistics_seasons_teams_index" (
    "team_id" bigint NOT NULL,
    "season_id" bigint NOT NULL,
    "team_name" "text",
    "team_short_code" "text",
    "team_image_path" "text",
    "team_country_id" bigint,
    "team" "jsonb",
    "season_name" "text",
    "season_league_id" bigint,
    "season_is_current" boolean,
    "season_starting_at" "text",
    "season_ending_at" "text",
    "season" "jsonb",
    "attacking" "jsonb",
    "defending" "jsonb",
    "passing" "jsonb",
    "form" "jsonb",
    "physical" "jsonb",
    "advanced" "jsonb",
    "statistic_id" bigint,
    "has_values" boolean,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "cache"."statistics_seasons_teams_index" OWNER TO "postgres";


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


ALTER TABLE ONLY "cache"."fixture_expected_lineups_raw"
    ADD CONSTRAINT "fixture_expected_lineups_raw_pkey" PRIMARY KEY ("fixture_id");



ALTER TABLE ONLY "cache"."fixture_news_raw"
    ADD CONSTRAINT "fixture_news_raw_pkey" PRIMARY KEY ("fixture_id");



ALTER TABLE ONLY "cache"."fixture_predictions_raw"
    ADD CONSTRAINT "fixture_predictions_raw_pkey" PRIMARY KEY ("fixture_id");



ALTER TABLE ONLY "cache"."fixture_transfer_rumours_raw"
    ADD CONSTRAINT "fixture_transfer_rumours_raw_pkey" PRIMARY KEY ("fixture_id");



ALTER TABLE ONLY "cache"."fixture_watchlist"
    ADD CONSTRAINT "fixture_watchlist_pkey" PRIMARY KEY ("fixture_id");



ALTER TABLE ONLY "cache"."fixture_xg_raw"
    ADD CONSTRAINT "fixture_xg_raw_pkey" PRIMARY KEY ("fixture_id");



ALTER TABLE ONLY "cache"."fixtures_h2h_index"
    ADD CONSTRAINT "fixtures_h2h_index_pkey" PRIMARY KEY ("home_team_id", "away_team_id", "fixture_id", "chunk");



ALTER TABLE ONLY "cache"."fixtures_head_to_head_raw"
    ADD CONSTRAINT "fixtures_head_to_head_raw_pkey" PRIMARY KEY ("home_team_id", "away_team_id", "page_number");



ALTER TABLE ONLY "cache"."fixtures_index"
    ADD CONSTRAINT "fixtures_index_pkey" PRIMARY KEY ("fixture_id", "chunk");



ALTER TABLE ONLY "cache"."fixtures_raw"
    ADD CONSTRAINT "fixtures_raw_pkey" PRIMARY KEY ("fixture_id", "page_number");



ALTER TABLE ONLY "cache"."odds_inplay_fixtures_bookmakers_35_raw"
    ADD CONSTRAINT "odds_inplay_fixtures_bookmakers_35_raw_pkey" PRIMARY KEY ("fixture_id", "bookmaker_id", "page_number");



ALTER TABLE ONLY "cache"."odds_inplay_index"
    ADD CONSTRAINT "odds_inplay_index_pkey" PRIMARY KEY ("fixture_id", "bookmaker_id", "market_id");



ALTER TABLE ONLY "cache"."odds_markets_index"
    ADD CONSTRAINT "odds_markets_index_pkey" PRIMARY KEY ("market_id");



ALTER TABLE ONLY "cache"."odds_markets_raw"
    ADD CONSTRAINT "odds_markets_raw_pkey" PRIMARY KEY ("page_number");



ALTER TABLE ONLY "cache"."odds_prematch_fixtures_bookmakers_35_raw"
    ADD CONSTRAINT "odds_prematch_fixtures_bookmakers_35_raw_pkey" PRIMARY KEY ("fixture_id", "bookmaker_id", "page_number");



ALTER TABLE ONLY "cache"."odds_prematch_index"
    ADD CONSTRAINT "odds_prematch_index_pkey" PRIMARY KEY ("fixture_id", "bookmaker_id", "market_id");



ALTER TABLE ONLY "cache"."standings_seasons_raw"
    ADD CONSTRAINT "standings_seasons_raw_pkey" PRIMARY KEY ("season_id");



ALTER TABLE ONLY "cache"."statistics_seasons_referees_index"
    ADD CONSTRAINT "statistics_seasons_referees_index_pkey" PRIMARY KEY ("referee_id", "season_id");



ALTER TABLE ONLY "cache"."statistics_seasons_referees_raw"
    ADD CONSTRAINT "statistics_seasons_referees_raw_pkey" PRIMARY KEY ("referee_id", "page_number");



ALTER TABLE ONLY "cache"."statistics_seasons_teams_index"
    ADD CONSTRAINT "statistics_seasons_teams_index_pkey" PRIMARY KEY ("team_id", "season_id");



ALTER TABLE ONLY "cache"."statistics_seasons_teams_raw"
    ADD CONSTRAINT "statistics_seasons_teams_raw_pkey" PRIMARY KEY ("team_id", "page_number");



ALTER TABLE ONLY "cache"."sync_runs"
    ADD CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id");



CREATE INDEX "fixture_watchlist_enabled_priority_idx" ON "cache"."fixture_watchlist" USING "btree" ("enabled", "priority", "starts_at");



CREATE INDEX "fixture_watchlist_expires_idx" ON "cache"."fixture_watchlist" USING "btree" ("expires_at");



CREATE INDEX "fixture_watchlist_mode_idx" ON "cache"."fixture_watchlist" USING "btree" ("mode");



CREATE INDEX "idx_fixture_expected_lineups_raw_fetched_at" ON "cache"."fixture_expected_lineups_raw" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_fixture_news_raw_fetched_at" ON "cache"."fixture_news_raw" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_fixture_predictions_raw_fetched_at" ON "cache"."fixture_predictions_raw" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_fixture_transfer_rumours_raw_fetched_at" ON "cache"."fixture_transfer_rumours_raw" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_fixture_xg_raw_fetched_at" ON "cache"."fixture_xg_raw" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_fixtures_index_fetched_at" ON "cache"."fixtures_index" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_fixtures_index_fixture_id" ON "cache"."fixtures_index" USING "btree" ("fixture_id");



CREATE INDEX "idx_fixtures_raw_fetched_at" ON "cache"."fixtures_raw" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_h2h_index_fetched_at" ON "cache"."fixtures_h2h_index" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_h2h_index_fixture_id" ON "cache"."fixtures_h2h_index" USING "btree" ("fixture_id");



CREATE INDEX "idx_h2h_index_teams" ON "cache"."fixtures_h2h_index" USING "btree" ("home_team_id", "away_team_id");



CREATE INDEX "idx_h2h_raw_fetched_at" ON "cache"."fixtures_head_to_head_raw" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_odds_inplay_index_fetched_at" ON "cache"."odds_inplay_index" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_odds_inplay_index_fixture" ON "cache"."odds_inplay_index" USING "btree" ("fixture_id", "bookmaker_id");



CREATE INDEX "idx_odds_inplay_index_market" ON "cache"."odds_inplay_index" USING "btree" ("market_id");



CREATE INDEX "idx_odds_inplay_raw_fetched_at" ON "cache"."odds_inplay_fixtures_bookmakers_35_raw" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_odds_markets_index_normalized_name" ON "cache"."odds_markets_index" USING "btree" ("normalized_name");



CREATE INDEX "idx_odds_markets_raw_fetched_at" ON "cache"."odds_markets_raw" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_odds_prematch_index_fetched_at" ON "cache"."odds_prematch_index" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_odds_prematch_index_fixture" ON "cache"."odds_prematch_index" USING "btree" ("fixture_id", "bookmaker_id");



CREATE INDEX "idx_odds_prematch_index_market" ON "cache"."odds_prematch_index" USING "btree" ("market_id");



CREATE INDEX "idx_odds_prematch_raw_fetched_at" ON "cache"."odds_prematch_fixtures_bookmakers_35_raw" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_ref_stats_index_current" ON "cache"."statistics_seasons_referees_index" USING "btree" ("referee_id", "season_is_current") WHERE ("season_is_current" = true);



CREATE INDEX "idx_ref_stats_index_fetched_at" ON "cache"."statistics_seasons_referees_index" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_ref_stats_index_referee_id" ON "cache"."statistics_seasons_referees_index" USING "btree" ("referee_id");



CREATE INDEX "idx_ref_stats_index_season_id" ON "cache"."statistics_seasons_referees_index" USING "btree" ("season_id");



CREATE INDEX "idx_ref_stats_raw_fetched_at" ON "cache"."statistics_seasons_referees_raw" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_standings_seasons_raw_fetched_at" ON "cache"."standings_seasons_raw" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_sync_runs_started_at" ON "cache"."sync_runs" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_sync_runs_target_scope" ON "cache"."sync_runs" USING "btree" ("target_table", "scope_key");



CREATE INDEX "idx_team_stats_index_current" ON "cache"."statistics_seasons_teams_index" USING "btree" ("team_id", "season_is_current") WHERE ("season_is_current" = true);



CREATE INDEX "idx_team_stats_index_fetched_at" ON "cache"."statistics_seasons_teams_index" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_team_stats_index_season_id" ON "cache"."statistics_seasons_teams_index" USING "btree" ("season_id");



CREATE INDEX "idx_team_stats_index_team_id" ON "cache"."statistics_seasons_teams_index" USING "btree" ("team_id");



CREATE INDEX "idx_team_stats_raw_fetched_at" ON "cache"."statistics_seasons_teams_raw" USING "btree" ("fetched_at" DESC);



CREATE OR REPLACE TRIGGER "trg_fixture_expected_lineups_raw_updated_at" BEFORE UPDATE ON "cache"."fixture_expected_lineups_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_fixture_news_raw_updated_at" BEFORE UPDATE ON "cache"."fixture_news_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_fixture_predictions_raw_updated_at" BEFORE UPDATE ON "cache"."fixture_predictions_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_fixture_transfer_rumours_raw_updated_at" BEFORE UPDATE ON "cache"."fixture_transfer_rumours_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_fixture_xg_raw_updated_at" BEFORE UPDATE ON "cache"."fixture_xg_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_fixtures_index_updated_at" BEFORE UPDATE ON "cache"."fixtures_index" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_fixtures_raw_updated_at" BEFORE UPDATE ON "cache"."fixtures_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_h2h_index_updated_at" BEFORE UPDATE ON "cache"."fixtures_h2h_index" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_h2h_raw_updated_at" BEFORE UPDATE ON "cache"."fixtures_head_to_head_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_odds_inplay_index_updated_at" BEFORE UPDATE ON "cache"."odds_inplay_index" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_odds_inplay_raw_updated_at" BEFORE UPDATE ON "cache"."odds_inplay_fixtures_bookmakers_35_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_odds_markets_index_updated_at" BEFORE UPDATE ON "cache"."odds_markets_index" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_odds_markets_raw_updated_at" BEFORE UPDATE ON "cache"."odds_markets_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_odds_prematch_index_updated_at" BEFORE UPDATE ON "cache"."odds_prematch_index" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_odds_prematch_raw_updated_at" BEFORE UPDATE ON "cache"."odds_prematch_fixtures_bookmakers_35_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ref_stats_index_updated_at" BEFORE UPDATE ON "cache"."statistics_seasons_referees_index" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ref_stats_raw_updated_at" BEFORE UPDATE ON "cache"."statistics_seasons_referees_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_standings_seasons_raw_updated_at" BEFORE UPDATE ON "cache"."standings_seasons_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_team_stats_index_updated_at" BEFORE UPDATE ON "cache"."statistics_seasons_teams_index" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_team_stats_raw_updated_at" BEFORE UPDATE ON "cache"."statistics_seasons_teams_raw" FOR EACH ROW EXECUTE FUNCTION "util"."touch_updated_at"();



ALTER TABLE ONLY "cache"."fixture_expected_lineups_raw"
    ADD CONSTRAINT "fixture_expected_lineups_raw_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "cache"."sync_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "cache"."fixture_news_raw"
    ADD CONSTRAINT "fixture_news_raw_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "cache"."sync_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "cache"."fixture_predictions_raw"
    ADD CONSTRAINT "fixture_predictions_raw_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "cache"."sync_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "cache"."fixture_transfer_rumours_raw"
    ADD CONSTRAINT "fixture_transfer_rumours_raw_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "cache"."sync_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "cache"."fixture_xg_raw"
    ADD CONSTRAINT "fixture_xg_raw_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "cache"."sync_runs"("id") ON DELETE SET NULL;



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



ALTER TABLE ONLY "cache"."standings_seasons_raw"
    ADD CONSTRAINT "standings_seasons_raw_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "cache"."sync_runs"("id") ON DELETE SET NULL;



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




























drop extension if exists "pg_net";


