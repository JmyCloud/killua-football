/**
 * lib/slim-bundle.js  –  v3 multi-part aware
 *
 * Aggressive GPT-optimised compression for SportMonks data.
 * Targets: ~300-500KB raw → each bundle part < 60KB.
 *
 * Key techniques:
 *   1. Flatten "details" arrays  →  {developer_name: value}
 *   2. Flatten "type" objects    →  developer_name string
 *   3. Strip bloat keys (image_path, sport_id, model_type …)
 *   4. Remove nulls / empty values
 *   5. Aggressive per-section array caps & field picks
 *   6. Extract explicit final_score from scores array
 */

/* ── Keys stripped everywhere ── */
const STRIP = new Set([
  "meta", "pagination", "subscription", "rate_limit", "timezone",
  "plans", "add_ons", "sport_id", "model_type", "has_values",
  "code", "image_path", "logo_path", "gender", "legacy_id",
  "short_code", "has_jerseys", "has_values",
]);

/* ── SportMonks details pattern detection ── */
function isDetails(a) {
  if (!Array.isArray(a) || !a.length) return false;
  const f = a[0];
  return f && typeof f === "object" && f.type?.developer_name != null && "value" in f;
}

function flatDetails(a) {
  const o = {};
  for (const d of a) {
    const k = d.type?.developer_name ?? d.type?.name ?? String(d.id ?? "");
    if (k) o[k] = d.value;
  }
  return o;
}

/* ── Remove null / undefined / empty-array values ── */
function dropEmpty(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

/* ── Recursive deep slim ── */
function deep(obj, d) {
  if (d > 10 || obj == null) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    if (isDetails(obj)) return flatDetails(obj);
    return obj.slice(0, 60).map(i => deep(i, d + 1));
  }
  const o = {};
  for (const [k, v] of Object.entries(obj)) {
    if (STRIP.has(k)) continue;
    if (k === "type" && v && typeof v === "object" && !Array.isArray(v) && v.developer_name) {
      o.type = v.developer_name;
      continue;
    }
    if (k === "details" && Array.isArray(v) && isDetails(v)) {
      Object.assign(o, flatDetails(v));
      continue;
    }
    o[k] = deep(v, d + 1);
  }
  return o;
}

/* ═══════════════════════════════════════════════════════
   SCORE EXTRACTION  –  unambiguous final score
   ═══════════════════════════════════════════════════════ */
export function extractFinalScore(scoresRaw, participantsRaw) {
  const scores = Array.isArray(scoresRaw) ? scoresRaw : [];
  const parts = Array.isArray(participantsRaw) ? participantsRaw : [];

  const home = parts.find(p => p?.meta?.location === "home") ?? parts[0];
  const away = parts.find(p => p?.meta?.location === "away") ?? parts[1];

  // SportMonks scores: each entry has description, score.goals, score.participant, type
  // We want the LATEST period for each participant (2ND_HALF > 1ST_HALF)
  const periodRank = { "PENALTIES": 4, "EXTRA_TIME": 3, "2ND_HALF": 2, "1ST_HALF": 1 };

  let homeGoals = null, awayGoals = null;
  let htHome = null, htAway = null;
  let homeRank = 0, awayRank = 0;

  for (const s of scores) {
    const desc = s.description ?? "";
    if (desc !== "CURRENT") continue;
    const typeName = s.type?.developer_name ?? s.type?.name ?? s.type ?? "";
    const rank = periodRank[typeName] ?? 0;
    const goals = s.score?.goals;
    const who = s.score?.participant;

    if (who === "home") {
      if (rank >= homeRank) { homeGoals = goals; homeRank = rank; }
      if (typeName === "1ST_HALF") htHome = goals;
    }
    if (who === "away") {
      if (rank >= awayRank) { awayGoals = goals; awayRank = rank; }
      if (typeName === "1ST_HALF") htAway = goals;
    }
  }

  return dropEmpty({
    home_team: home?.name ?? home?.short_code ?? null,
    away_team: away?.name ?? away?.short_code ?? null,
    home_team_id: home?.id ?? null,
    away_team_id: away?.id ?? null,
    ft: homeGoals != null ? `${homeGoals}-${awayGoals}` : null,
    ht: htHome != null ? `${htHome}-${htAway}` : null,
  });
}

/* ═══════════════════════════════════════════════════════
   SECTION SLIMMERS  –  aggressive per-section compression
   ═══════════════════════════════════════════════════════ */

function slimLineupPlayer(p) {
  if (!p || typeof p !== "object") return p;
  const det = Array.isArray(p.details) ? p.details : [];
  const dv = (n) => { const x = det.find(d => d.type?.developer_name === n); return x?.value ?? undefined; };
  const rating = dv("rating");
  return dropEmpty({
    player_id: p.player_id,
    name: p.player?.display_name ?? p.player?.common_name ?? p.player?.name ?? p.player_name,
    num: p.jersey_number,
    pos: p.position ?? p.detailed_position?.name ?? p.detailedPosition?.name,
    formation_pos: p.formation_position,
    type: p.type?.developer_name ?? (typeof p.type === "string" ? p.type : undefined),
    captain: p.captain || undefined,
    rating: typeof rating === "object" ? rating.average : rating,
    goals: dv("goals"), assists: dv("assists"), minutes: dv("minutes-played"),
    yellowcards: dv("yellowcards"), redcards: dv("redcards"),
    shots_total: dv("shots-total"), passes_accuracy: dv("accurate-passes"),
  });
}

function slimLineups(raw) {
  if (!Array.isArray(raw)) return raw;
  return raw.map(slimLineupPlayer);
}

function slimEvents(raw) {
  if (!Array.isArray(raw)) return raw;
  return raw.slice(0, 50).map(e => dropEmpty({
    minute: e.minute, extra_minute: e.extra_minute || undefined,
    type: e.type?.developer_name ?? e.type?.name ?? (typeof e.type === "string" ? e.type : undefined),
    player: e.player_name ?? e.player?.display_name ?? e.player?.name,
    related_player: e.related_player_name ?? e.related_player?.display_name,
    team_id: e.participant_id ?? e.team_id,
    result: e.result, info: e.info ?? e.addition,
  }));
}

function slimScores(raw) {
  if (!Array.isArray(raw)) return raw;
  return raw.map(s => dropEmpty({
    type: s.type?.developer_name ?? s.type?.name ?? (typeof s.type === "string" ? s.type : undefined),
    description: s.description,
    participant: s.score?.participant,
    goals: s.score?.goals,
  }));
}

function slimStandings(raw) {
  const arr = raw?.data ?? (Array.isArray(raw) ? raw : null);
  if (!Array.isArray(arr)) return raw;
  return arr.map(s => {
    const det = Array.isArray(s.details) ? s.details : [];
    const dv = (n) => { const x = det.find(d => (d.type?.developer_name ?? d.type?.name ?? "").toLowerCase() === n.toLowerCase()); return x?.value ?? null; };
    return dropEmpty({
      pos: s.position, team_id: s.participant_id ?? s.participant?.id,
      team: s.participant?.name, pts: s.points, result: s.result,
      p: dv("games_played") ?? dv("matches_played"),
      w: dv("won") ?? dv("wins"), d: dv("draw") ?? dv("draws"), l: dv("lost") ?? dv("losses"),
      gf: dv("goals_for") ?? dv("goals_scored"), ga: dv("goals_against") ?? dv("goals_conceded"),
      gd: dv("goal_difference") ?? dv("goal_diff"),
      form: Array.isArray(s.form) ? s.form : s.form_string ?? null,
      stage: s.stage?.name, group: s.group?.name, round: s.round?.name,
    });
  });
}

function slimSquad(raw, max) {
  const arr = raw?.data ?? (Array.isArray(raw) ? raw : null);
  if (!Array.isArray(arr)) return raw;
  return arr.slice(0, max).map(p => {
    const det = Array.isArray(p.details) ? p.details : [];
    const dv = (n) => { const x = det.find(d => (d.type?.developer_name ?? "").toLowerCase() === n); return x?.value ?? undefined; };
    return dropEmpty({
      player_id: p.player_id ?? p.id,
      name: p.player?.display_name ?? p.player?.common_name ?? p.display_name ?? p.name,
      pos: p.position?.name ?? p.detailedPosition?.name ?? p.position,
      num: p.jersey_number,
      appearances: dv("appearances") ?? p.appearances,
      goals: dv("goals") ?? p.goals, assists: dv("assists") ?? p.assists,
      rating: dv("rating"), yellowcards: dv("yellowcards"), redcards: dv("redcards"),
      injured: p.is_injured || undefined,
    });
  });
}

function slimSchedule(raw, max) {
  const arr = raw?.data ?? (Array.isArray(raw) ? raw : null);
  if (!Array.isArray(arr)) return raw;
  return arr.slice(0, max).map(m => dropEmpty({
    fixture_id: m.id, date: m.starting_at,
    home: m.participants?.[0]?.name ?? m.home_team?.name,
    away: m.participants?.[1]?.name ?? m.away_team?.name,
    score: m.scores ? slimScores(m.scores) : undefined,
    result: m.result_info ?? m.result,
    state: m.state?.developer_name ?? m.state?.name ?? (typeof m.state === "string" ? m.state : undefined),
  }));
}

function slimNews(raw) {
  const arr = raw?.data ?? (Array.isArray(raw) ? raw : null);
  if (!Array.isArray(arr)) return raw;
  return arr.slice(0, 6).map(a => dropEmpty({
    title: a.title,
    summary: typeof a.body === "string" ? a.body.slice(0, 300) : undefined,
    published_at: a.published_at,
  }));
}

function slimCommentaries(raw) {
  const arr = raw?.data ?? (Array.isArray(raw) ? raw : null);
  if (!Array.isArray(arr)) return raw;
  const imp = arr.filter(c => {
    if (c.is_goal || c.is_important || c.important) return true;
    const t = String(c.comment ?? c.text ?? "").toLowerCase();
    return /goal|card|penal|var|half|kick.off|substit|injur|end of|red|yellow/.test(t);
  });
  return (imp.length >= 5 ? imp : arr).slice(0, 30).map(c => dropEmpty({
    minute: c.minute, comment: c.comment ?? c.text, is_goal: c.is_goal || undefined,
    is_important: c.is_important || undefined,
  }));
}

function slimTopscorers(raw) {
  const arr = raw?.data ?? (Array.isArray(raw) ? raw : null);
  if (!Array.isArray(arr)) return raw;
  return arr.slice(0, 15).map(t => dropEmpty({
    player: t.player?.display_name ?? t.player?.name,
    team: t.participant?.name, total: t.total,
    type: t.type?.name ?? (typeof t.type === "string" ? t.type : undefined),
    pos: t.position,
  }));
}

function slimRumours(raw) {
  const arr = raw?.data ?? (Array.isArray(raw) ? raw : null);
  if (!Array.isArray(arr)) return raw;
  return arr.slice(0, 12).map(r => dropEmpty({
    player: r.player?.data?.display_name ?? r.player?.display_name ?? r.player_name,
    from: r.fromTeam?.data?.name ?? r.from_team_name,
    to: r.toTeam?.data?.name ?? r.to_team_name,
    type: r.type?.data?.name ?? r.type?.name ?? (typeof r.type === "string" ? r.type : undefined),
    status: r.status, fee: r.fee,
  }));
}

/* ═══════════════════════════════════════════════════════
   MAIN ENTRY  –  slim a bundle part
   ═══════════════════════════════════════════════════════ */
export function slimBundle(body) {
  if (!body || typeof body !== "object") return body;

  // Phase 1: deep slim (flatten details/types, strip bloat)
  const s = deep(body, 0);

  // Phase 2: aggressive section-specific compression

  // Lineups
  if (s.fixture_squads?.lineups) {
    s.fixture_squads.lineups = slimLineups(body.fixture_squads?.lineups ?? s.fixture_squads.lineups);
  }
  // Events & Scores
  if (s.fixture_events_scores) {
    if (s.fixture_events_scores.events) {
      s.fixture_events_scores.events = slimEvents(body.fixture_events_scores?.events ?? s.fixture_events_scores.events);
    }
    if (s.fixture_events_scores.scores) {
      s.fixture_events_scores.scores = slimScores(body.fixture_events_scores?.scores ?? s.fixture_events_scores.scores);
    }
  }
  // Standings
  if (s.standings) {
    if (s.standings.league) s.standings.league = slimStandings(body.standings?.league ?? s.standings.league);
    if (s.standings.round) s.standings.round = slimStandings(body.standings?.round ?? s.standings.round);
    if (s.standings.live) s.standings.live = slimStandings(body.standings?.live ?? s.standings.live);
  }
  // Teams
  for (const tk of ["home_team", "away_team"]) {
    const team = s[tk];
    if (!team) continue;
    const raw = body[tk] ?? {};
    team.squad = slimSquad(raw.squad ?? team.squad, 25);
    team.schedule = slimSchedule(raw.schedule ?? team.schedule, 10);
    team.squad_fallback = slimSquad(raw.squad_fallback ?? team.squad_fallback, 25);
  }
  // Topscorers, News, Commentaries, Rumours
  s.topscorers = slimTopscorers(body.topscorers ?? s.topscorers);
  s.fixture_news = slimNews(body.fixture_news ?? s.fixture_news);
  s.fixture_commentaries = slimCommentaries(body.fixture_commentaries ?? s.fixture_commentaries);
  s.fixture_transfer_rumours = slimRumours(body.fixture_transfer_rumours ?? s.fixture_transfer_rumours);

  // H2H caps
  if (s.h2h) {
    for (const k of ["context", "events", "statistics", "referees"]) {
      if (Array.isArray(s.h2h[k])) s.h2h[k] = s.h2h[k].slice(0, 6);
    }
  }

  // Drop top-level nulls
  return dropEmpty(s);
}
