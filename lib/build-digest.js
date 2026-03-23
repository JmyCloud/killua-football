/**
 * lib/build-digest.js  –  Pre-computed Analysis Digest
 *
 * Reads ALL cached analysis data for a fixture and extracts a compact
 * structured summary (~5-10 KB) that GPT can read in ONE call.
 * Zero truncation risk. Zero ambiguity.
 *
 * This is the PROFESSIONAL solution: the server does the heavy lifting
 * (parsing raw SportMonks data), GPT does the interpretation.
 */

import {
  resolveFixtureActors,
  getFixtureChunksMap,
  getCurrentTeamStats,
  getCurrentRefereeStats,
  getOddsSummary,
  getFixtureXg,
  getFixturePredictions,
  getFixtureNews,
  getFixtureExpectedLineups,
  getFixtureTransferRumours,
  getSeasonStandings,
  getRoundStandings,
  getStandingsCorrections,
  getLiveStandings,
  getFixtureCommentaries,
  getFixtureMatchFacts,
  getTeamSquad,
  getTeamSchedule,
  getTeamSquadFallback,
  getSeasonTopscorers,
  getTeamRankings,
  getH2HChunkRows,
  isFixtureLiveLike,
} from "./analysis.js";
import { extractFinalScore } from "./slim-bundle.js";

/* ── helpers ── */
function val(obj) { return obj?.payload ?? obj?.data ?? obj ?? null; }
function arr(v) { const d = val(v); return Array.isArray(d) ? d : d?.data && Array.isArray(d.data) ? d.data : []; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function drop(o) {
  if (!o || typeof o !== "object") return o;
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    if (v == null || (Array.isArray(v) && !v.length)) continue;
    r[k] = v;
  }
  return Object.keys(r).length ? r : null;
}

/* ── stat extractor from SportMonks statistics array ── */
function extractStats(statistics, homeId, awayId) {
  if (!Array.isArray(statistics)) return null;
  const home = {}, away = {};
  for (const s of statistics) {
    const name = s.type?.developer_name ?? s.type?.name ?? (typeof s.type === "string" ? s.type : null);
    const value = s.data?.value ?? s.value;
    const pid = s.participant_id ?? s.team_id;
    const loc = s.location;
    if (!name || value == null) continue;
    const target = loc === "home" ? home : loc === "away" ? away : pid === homeId ? home : pid === awayId ? away : null;
    if (target) target[name] = value;
  }
  const g = (obj, ...keys) => { for (const k of keys) { if (obj[k] != null) return num(obj[k]); } return null; };
  return drop({
    possession: drop({ home: g(home, "Ball Possession %", "ball_possession"), away: g(away, "Ball Possession %", "ball_possession") }),
    shots: drop({ home: g(home, "Shots Total", "shots_total"), away: g(away, "Shots Total", "shots_total") }),
    shots_on_target: drop({ home: g(home, "Shots On Target", "shots_on_target"), away: g(away, "Shots On Target", "shots_on_target") }),
    xg: drop({ home: g(home, "Expected Goals", "expected_goals"), away: g(away, "Expected Goals", "expected_goals") }),
    corners: drop({ home: g(home, "Corners", "corners"), away: g(away, "Corners", "corners") }),
    fouls: drop({ home: g(home, "Fouls", "fouls"), away: g(away, "Fouls", "fouls") }),
    offsides: drop({ home: g(home, "Offsides", "offsides"), away: g(away, "Offsides", "offsides") }),
    passes_pct: drop({ home: g(home, "Passes Accurate Percentage", "passes_accuracy"), away: g(away, "Passes Accurate Percentage", "passes_accuracy") }),
    saves: drop({ home: g(home, "Goalkeeper Saves", "Saves", "saves"), away: g(away, "Goalkeeper Saves", "Saves", "saves") }),
    tackles: drop({ home: g(home, "Tackles", "tackles"), away: g(away, "Tackles", "tackles") }),
    yellowcards: drop({ home: g(home, "Yellowcards", "Yellow Cards"), away: g(away, "Yellowcards", "Yellow Cards") }),
    redcards: drop({ home: g(home, "Redcards", "Red Cards"), away: g(away, "Redcards", "Red Cards") }),
    dangerous_attacks: drop({ home: g(home, "Dangerous Attacks", "attacks_dangerous"), away: g(away, "Dangerous Attacks", "attacks_dangerous") }),
  });
}

/* ── xG from dedicated xG data ── */
function extractXg(xgData, homeId, awayId) {
  const raw = val(xgData);
  if (!raw) return null;
  const teamXg = raw.team_xg ?? raw.data ?? (Array.isArray(raw) ? raw : []);
  if (!Array.isArray(teamXg) || !teamXg.length) return null;
  let homeXg = null, awayXg = null;
  for (const e of teamXg) {
    const pid = e.participant_id ?? e.team_id;
    const v = e.data?.value ?? e.value;
    if (pid === homeId) homeXg = num(v);
    else if (pid === awayId) awayXg = num(v);
  }
  return drop({ home: homeXg, away: awayXg });
}

/* ── events → compact timeline ── */
function extractEvents(events) {
  if (!Array.isArray(events)) return [];
  const KEY_TYPES = /goal|penalty|own.goal|yellowcard|redcard|yellow_red|substitution|var/i;
  return events
    .filter(e => {
      const t = e.type?.developer_name ?? e.type?.name ?? (typeof e.type === "string" ? e.type : "");
      return KEY_TYPES.test(t);
    })
    .slice(0, 30)
    .map(e => drop({
      min: e.minute ?? e.min,
      add: e.extra_minute || undefined,
      type: e.type?.developer_name ?? e.type?.name ?? e.type,
      player: e.player_name ?? e.player?.display_name ?? e.player?.common_name ?? e.player?.name,
      related: e.related_player_name ?? e.related_player?.display_name ?? e.related_player?.name,
      team_id: e.participant_id ?? e.team_id,
      result: e.result,
      info: e.info ?? e.addition,
    }));
}

/* ── lineups → starting XI names + formation + top performers ── */
function extractLineups(lineups, formations, participants) {
  const parts = Array.isArray(participants) ? participants : [];
  const home = parts.find(p => p?.meta?.location === "home") ?? parts[0];
  const away = parts.find(p => p?.meta?.location === "away") ?? parts[1];
  const homeId = home?.id, awayId = away?.id;

  let homeXI = [], awayXI = [], homeSubs = [], awaySubs = [];
  const allPlayers = [];
  if (Array.isArray(lineups)) {
    for (const p of lineups) {
      const name = p.player?.display_name ?? p.player?.common_name ?? p.player?.name ?? p.player_name;
      const tid = p.team_id ?? p.participant_id;
      const typeName = p.type?.developer_name ?? (typeof p.type === "string" ? p.type : "");
      const isStarter = p.formation_position != null || /lineup/i.test(typeName);
      if (!name) continue;
      if (tid === homeId) (isStarter ? homeXI : homeSubs).push(name);
      else if (tid === awayId) (isStarter ? awayXI : awaySubs).push(name);
      // Collect player performance for top performers
      const rating = num(p.rating ?? p.player_rating ?? p.statistics?.rating);
      const goals = num(p.goals ?? p.statistics?.goals) ?? 0;
      const assists = num(p.assists ?? p.statistics?.assists) ?? 0;
      const yc = num(p.yellowcards ?? p.statistics?.yellowcards) ?? 0;
      const rc = num(p.redcards ?? p.statistics?.redcards) ?? 0;
      allPlayers.push({ name, tid, rating, goals, assists, yc, rc, pos: p.position ?? p.pos ?? null });
    }
  }

  let homeForm = null, awayForm = null;
  if (Array.isArray(formations)) {
    for (const f of formations) {
      const loc = f.location ?? f.meta?.location;
      const form = f.formation ?? f.name;
      if (loc === "home" || f.participant_id === homeId) homeForm = form;
      else if (loc === "away" || f.participant_id === awayId) awayForm = form;
    }
  }

  // Top performers: best rated + goal/assist contributors
  const rated = allPlayers.filter(p => p.rating != null && p.rating > 0).sort((a, b) => b.rating - a.rating);
  const topPerformers = rated.slice(0, 6).map(p => drop({
    name: p.name, rating: p.rating, goals: p.goals || undefined, assists: p.assists || undefined,
    yc: p.yc || undefined, rc: p.rc || undefined, side: p.tid === homeId ? "home" : "away",
  }));

  return drop({
    home_formation: homeForm,
    away_formation: awayForm,
    home_xi: homeXI.length ? homeXI : undefined,
    away_xi: awayXI.length ? awayXI : undefined,
    home_subs_used: homeSubs.length ? homeSubs : undefined,
    away_subs_used: awaySubs.length ? awaySubs : undefined,
    top_performers: topPerformers.length ? topPerformers : undefined,
  });
}

/* ── sidelined players ── */
function extractSidelined(sidelined, participants) {
  if (!Array.isArray(sidelined) || !sidelined.length) return null;
  const parts = Array.isArray(participants) ? participants : [];
  const home = parts.find(p => p?.meta?.location === "home") ?? parts[0];
  const away = parts.find(p => p?.meta?.location === "away") ?? parts[1];
  const homeOut = [], awayOut = [];
  for (const s of sidelined) {
    const name = s.player?.display_name ?? s.player?.common_name ?? s.player?.name ?? s.player_name ?? "Unknown";
    const reason = s.reason ?? s.type?.developer_name ?? s.type?.name ?? "Unknown";
    const tid = s.team_id ?? s.participant_id;
    const entry = `${name} (${reason})`;
    if (tid === home?.id) homeOut.push(entry);
    else if (tid === away?.id) awayOut.push(entry);
  }
  return drop({ home: homeOut.length ? homeOut : undefined, away: awayOut.length ? awayOut : undefined });
}

/* ── standings → find both teams ── */
function extractStandings(standingsData, homeId, awayId) {
  const raw = val(standingsData);
  if (!raw) return null;
  const rows = raw?.data ?? (Array.isArray(raw) ? raw : []);
  if (!Array.isArray(rows) || !rows.length) return null;

  function teamRow(rows, teamId) {
    const r = rows.find(s => (s.participant_id ?? s.participant?.id) === teamId);
    if (!r) return null;
    const det = Array.isArray(r.details) ? r.details : [];
    const dv = (n) => { const x = det.find(d => (d.type?.developer_name ?? d.type?.name ?? "").toLowerCase().replace(/[_\s]/g, "") === n.toLowerCase().replace(/[_\s]/g, "")); return x?.value ?? null; };
    // Home/away splits from standing details
    const homeW = num(dv("home_won")) ?? num(dv("homewon"));
    const homeD = num(dv("home_draw")) ?? num(dv("homedraw"));
    const homeL = num(dv("home_lost")) ?? num(dv("homelost"));
    const homeGF = num(dv("home_goals_for")) ?? num(dv("homegoals_for"));
    const homeGA = num(dv("home_goals_against")) ?? num(dv("homegoals_against"));
    const awayW = num(dv("away_won")) ?? num(dv("awaywon"));
    const awayD = num(dv("away_draw")) ?? num(dv("awaydraw"));
    const awayL = num(dv("away_lost")) ?? num(dv("awaylost"));
    const awayGF = num(dv("away_goals_for")) ?? num(dv("awaygoals_for"));
    const awayGA = num(dv("away_goals_against")) ?? num(dv("awaygoals_against"));
    const hasHomeSplit = homeW != null || homeD != null || homeL != null;
    const hasAwaySplit = awayW != null || awayD != null || awayL != null;
    return drop({
      pos: r.position, pts: r.points, result: r.result,
      p: num(dv("games_played")) ?? num(dv("matches_played")),
      w: num(dv("won")) ?? num(dv("wins")),
      d: num(dv("draw")) ?? num(dv("draws")),
      l: num(dv("lost")) ?? num(dv("losses")),
      gf: num(dv("goals_for")) ?? num(dv("goals_scored")),
      ga: num(dv("goals_against")) ?? num(dv("goals_conceded")),
      gd: num(dv("goal_difference")) ?? num(dv("goal_diff")),
      form: Array.isArray(r.form) ? r.form.join("") : r.form_string ?? r.form ?? null,
      home_record: hasHomeSplit ? `${homeW??0}W-${homeD??0}D-${homeL??0}L` : undefined,
      home_goals: hasHomeSplit ? `${homeGF??0}GF-${homeGA??0}GA` : undefined,
      away_record: hasAwaySplit ? `${awayW??0}W-${awayD??0}D-${awayL??0}L` : undefined,
      away_goals: hasAwaySplit ? `${awayGF??0}GF-${awayGA??0}GA` : undefined,
    });
  }

  return drop({ home: teamRow(rows, homeId), away: teamRow(rows, awayId) });
}

/* ── H2H summary ── */
function extractH2H(h2hContext, homeId) {
  if (!Array.isArray(h2hContext) || !h2hContext.length) return null;
  let homeWins = 0, draws = 0, awayWins = 0, totalGoals = 0, btts = 0, over25 = 0;
  const results = [];
  for (const m of h2hContext) {
    const p = m.participants ?? m.data?.participants ?? [];
    const sc = m.scores ?? m.data?.scores ?? [];
    const hTeam = p.find(pp => pp?.meta?.location === "home") ?? p[0];
    const aTeam = p.find(pp => pp?.meta?.location === "away") ?? p[1];
    const scoreSummary = extractFinalScore(sc, p);
    const hName = hTeam?.name ?? hTeam?.short_code ?? "Home";
    const aName = aTeam?.name ?? aTeam?.short_code ?? "Away";
    const ft = scoreSummary.ft;
    if (ft) {
      results.push(`${hName} ${ft} ${aName}`);
      const [hg, ag] = ft.split("-").map(Number);
      if (Number.isFinite(hg) && Number.isFinite(ag)) {
        totalGoals += hg + ag;
        if (hg > 0 && ag > 0) btts++;
        if (hg + ag > 2) over25++;
        const isHome = hTeam?.id === homeId;
        if (hg > ag) isHome ? homeWins++ : awayWins++;
        else if (hg < ag) isHome ? awayWins++ : homeWins++;
        else draws++;
      }
    }
  }
  const n = h2hContext.length;
  return drop({
    matches: n,
    home_wins: homeWins, draws, away_wins: awayWins,
    avg_goals: n ? Math.round((totalGoals / n) * 10) / 10 : null,
    btts_pct: n ? Math.round((btts / n) * 100) : null,
    over25_pct: n ? Math.round((over25 / n) * 100) : null,
    results: results.length ? results : undefined,
  });
}

/* ── predictions ── */
function extractPredictions(predictionsData) {
  const raw = val(predictionsData);
  if (!raw) return null;
  const probs = raw.probabilities ?? raw.data?.probabilities ?? [];
  const vb = raw.value_bets ?? raw.data?.value_bets ?? [];

  const out = {};
  if (Array.isArray(probs)) {
    for (const p of probs) {
      const name = p.prediction ?? p.type?.name ?? p.type?.developer_name ?? "";
      const prob = num(p.probability ?? p.value);
      if (name && prob != null) out[name] = prob;
    }
  }
  const valueBets = Array.isArray(vb) ? vb.slice(0, 5).map(b => drop({
    market: b.market ?? b.description,
    prob: num(b.probability ?? b.fair_probability),
    odds: num(b.odds ?? b.fair_odds),
    edge: num(b.edge ?? b.value),
  })) : [];

  return drop({ probabilities: Object.keys(out).length ? out : undefined, value_bets: valueBets.length ? valueBets : undefined });
}

/* ── odds: extract key 1xBet markets ── */
function extractKeyOdds(oddsSummary) {
  if (!Array.isArray(oddsSummary) || !oddsSummary.length) return null;
  const out = {};
  for (const m of oddsSummary) {
    const name = m.developer_name ?? m.market_name ?? "";
    const id = m.market_id;
    // Key markets: Fulltime Result (1), Over/Under (12/5), BTTS (9/6), Double Chance (2)
    if (id === 1 || /fulltime.result|match.result|1x2/i.test(name)) out["1X2"] = { market_id: id, odds_count: m.odds_count };
    else if (id === 12 || id === 5 || /over.under|total.goals/i.test(name)) out["O/U"] = { market_id: id, odds_count: m.odds_count };
    else if (id === 9 || id === 6 || /both.teams|btts/i.test(name)) out["BTTS"] = { market_id: id, odds_count: m.odds_count };
    else if (id === 2 || /double.chance/i.test(name)) out["DC"] = { market_id: id, odds_count: m.odds_count };
    else if (id === 28 || /asian.handicap/i.test(name)) out["AH"] = { market_id: id, odds_count: m.odds_count };
  }
  out._total_markets = oddsSummary.length;
  return drop(out);
}

/* ── referee profile ── */
function extractReferee(refereeStats, referees) {
  let refName = null;
  if (Array.isArray(referees)) {
    const main = referees.find(r => /referee|main/i.test(r.type?.name ?? r.type?.developer_name ?? "")) ?? referees[0];
    refName = main?.referee?.common_name ?? main?.referee?.name ?? main?.name ?? null;
  }

  if (!refereeStats) return refName ? { name: refName } : null;
  const p = refereeStats.payload ?? refereeStats;
  const det = Array.isArray(p?.details) ? p.details : (Array.isArray(p?.data?.details) ? p.data.details : []);

  const dv = (n) => {
    for (const d of det) {
      const dn = (d.type?.developer_name ?? d.type?.name ?? "").toLowerCase();
      if (dn.includes(n.toLowerCase())) return num(d.value);
    }
    return null;
  };

  return drop({
    name: refName,
    matches: dv("matches") ?? dv("appearances"),
    yellowcards_avg: dv("yellowcards") != null && dv("matches") ? Math.round((dv("yellowcards") / dv("matches")) * 10) / 10 : null,
    redcards_total: dv("redcards"),
    penalties: dv("penalties"),
    fouls_avg: dv("fouls") != null && dv("matches") ? Math.round((dv("fouls") / dv("matches")) * 10) / 10 : null,
  });
}

/* ── weather ── */
function extractWeather(weatherreport) {
  if (!weatherreport) return null;
  const w = weatherreport.weatherreport ?? weatherreport;
  return drop({
    temp_c: num(w.temperature?.temp) ?? num(w.temperature),
    feels_like: num(w.temperature?.feels_like),
    wind_kmh: num(w.wind?.speed) ?? num(w.wind),
    wind_dir: w.wind?.direction ?? w.wind_direction,
    humidity: num(w.humidity),
    clouds: w.clouds ?? w.description ?? w.clouds_percentage,
    condition: w.icon ?? w.description,
  });
}

/* ── news headlines ── */
function extractNews(newsData) {
  const items = arr(newsData);
  if (!items.length) return null;
  return items.slice(0, 5).map(a => a.title ?? a.headline ?? "").filter(Boolean);
}

/* ── schedule → rest days and next match ── */
function extractScheduleContext(scheduleData, matchDate) {
  const items = arr(scheduleData);
  if (!items.length || !matchDate) return null;
  const md = new Date(matchDate).getTime();
  if (!Number.isFinite(md)) return null;

  let prevDate = null, nextDate = null, nextOpponent = null;
  for (const m of items) {
    const d = new Date(m.starting_at ?? m.date).getTime();
    if (!Number.isFinite(d) || d === md) continue;
    if (d < md && (!prevDate || d > prevDate)) prevDate = d;
    if (d > md && (!nextDate || d < nextDate)) {
      nextDate = d;
      const parts = m.participants ?? [];
      nextOpponent = parts.find(p => p?.meta?.location !== "home")?.name ?? parts[1]?.name ?? m.away_team?.name ?? null;
    }
  }

  return drop({
    rest_days: prevDate ? Math.round((md - prevDate) / 86400000) : null,
    next_in_days: nextDate ? Math.round((nextDate - md) / 86400000) : null,
    next_opponent: nextOpponent,
  });
}

/* ── team season stats → key metrics ── */
function extractTeamSeasonStats(teamStats) {
  if (!teamStats) return null;
  const p = teamStats.payload ?? teamStats;
  const det = Array.isArray(p?.details) ? p.details : (Array.isArray(p?.data?.details) ? p.data.details : []);
  if (!det.length && typeof p === "object") {
    // Maybe flat format
    return drop({
      season_id: teamStats.season_id,
      sample: num(p.matches_played) ?? num(p.games_played),
    });
  }

  const dv = (n) => {
    for (const d of det) {
      const dn = (d.type?.developer_name ?? d.type?.name ?? "").toLowerCase();
      if (dn.includes(n.toLowerCase())) return d.value;
    }
    return null;
  };

  return drop({
    season_id: teamStats.season_id,
    sample: num(dv("matches_played")) ?? num(dv("games_played")),
    goals_scored: num(dv("goals_scored")) ?? num(dv("team_goals")),
    goals_conceded: num(dv("goals_conceded")),
    clean_sheets: num(dv("clean_sheets")),
    avg_goals_per_match: num(dv("average_goals_per_match")),
    wins: num(dv("wins")) ?? num(dv("won")),
    draws: num(dv("draws")) ?? num(dv("draw")),
    losses: num(dv("losses")) ?? num(dv("lost")),
    avg_possession: num(dv("avg_ball_possession")) ?? num(dv("ball_possession")),
    btts: num(dv("both_teams_scored")) ?? num(dv("btts")),
    over_2_5: num(dv("over_2_5")) ?? num(dv("over25")),
    failed_to_score: num(dv("failed_to_score")),
    avg_corners: num(dv("avg_corners")) ?? num(dv("corners_per_match")),
    avg_cards: num(dv("avg_cards")) ?? num(dv("cards_per_match")),
    scoring_minutes: dv("scoring_minutes") ?? undefined,
  });
}

/* ── squad depth → top scorers/assists from full season squad ── */
function extractSquadDepth(squadData, fallbackData) {
  const raw = val(squadData) ?? val(fallbackData);
  if (!raw) return null;
  const players = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
  if (!players.length) return null;
  // Rank by goals+assists, take top 5
  const ranked = players
    .map(p => ({
      name: p.player?.display_name ?? p.player?.common_name ?? p.display_name ?? p.name,
      pos: p.position?.name ?? p.position ?? p.detailed_position?.name ?? null,
      apps: num(p.appearances) ?? num(p.matches) ?? num(p.statistics?.appearances),
      goals: num(p.goals) ?? num(p.statistics?.goals) ?? 0,
      assists: num(p.assists) ?? num(p.statistics?.assists) ?? 0,
      rating: num(p.rating) ?? num(p.statistics?.rating),
      injured: p.injured ?? p.is_injured ?? false,
    }))
    .filter(p => p.name && (p.goals > 0 || p.assists > 0 || p.apps > 3))
    .sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists))
    .slice(0, 6);
  if (!ranked.length) return null;
  return ranked.map(p => drop({
    name: p.name, pos: p.pos, apps: p.apps,
    goals: p.goals || undefined, assists: p.assists || undefined,
    rating: p.rating, injured: p.injured || undefined,
  }));
}

/* ── team rankings → FIFA/domestic ranking position ── */
function extractRankings(rankingsData) {
  const raw = val(rankingsData);
  if (!raw) return null;
  const items = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : [raw]);
  if (!items.length || !items[0]) return null;
  // Take the most recent ranking
  const r = items[0];
  return drop({
    position: num(r.position) ?? num(r.rank),
    type: r.type?.name ?? r.type?.developer_name ?? r.rule?.name ?? "Unknown",
    points: num(r.points),
  });
}

/* ── round standings → group stage mini-table ── */
function extractRoundStandings(roundData, homeId, awayId) {
  const raw = val(roundData);
  if (!raw) return null;
  const rows = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
  if (!rows.length) return null;
  // Extract just the relevant rows (both teams + neighbors)
  const compact = rows.slice(0, 10).map(r => drop({
    pos: r.position,
    team: r.participant?.name ?? r.team_name ?? r.name,
    team_id: r.participant_id ?? r.participant?.id,
    pts: r.points,
    p: num(r.games_played ?? r.matches_played),
    gd: num(r.goal_difference ?? r.goal_diff),
  }));
  return compact.length ? compact : null;
}

/* ── standings corrections → point deductions ── */
function extractCorrections(correctionsData, homeId, awayId) {
  const raw = val(correctionsData);
  if (!raw) return null;
  const items = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
  if (!items.length) return null;
  // Only extract corrections affecting our teams
  const relevant = items.filter(c => {
    const tid = c.participant_id ?? c.team_id;
    return tid === homeId || tid === awayId;
  });
  if (!relevant.length) return null;
  return relevant.map(c => drop({
    team_id: c.participant_id ?? c.team_id,
    team: c.participant?.name ?? c.team_name,
    points: num(c.value ?? c.points ?? c.correction),
    reason: c.reason ?? c.description ?? c.type?.name,
  }));
}

/* ── live standings → real-time table for live matches ── */
function extractLiveStandings(liveData, homeId, awayId) {
  const raw = val(liveData);
  if (!raw) return null;
  const rows = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
  if (!rows.length) return null;
  function findTeam(teamId) {
    const r = rows.find(s => (s.participant_id ?? s.participant?.id) === teamId);
    if (!r) return null;
    return drop({ pos: r.position, pts: r.points, team: r.participant?.name });
  }
  return drop({ home: findTeam(homeId), away: findTeam(awayId) });
}

/* ── H2H discipline from events + stats + referees ── */
function extractH2HDiscipline(h2hEvents, h2hStats, h2hRefs) {
  let totalCards = 0, totalFouls = 0, matchCount = 0;
  // From H2H events: count cards
  if (Array.isArray(h2hEvents) && h2hEvents.length) {
    for (const m of h2hEvents) {
      matchCount++;
      const events = m.events ?? m.data?.events ?? [];
      if (Array.isArray(events)) {
        for (const e of events) {
          const t = e.type?.developer_name ?? e.type?.name ?? "";
          if (/yellow|red/i.test(t)) totalCards++;
        }
      }
    }
  }
  // From H2H stats: extract avg possession, shots
  let avgPoss = null, avgShots = null;
  if (Array.isArray(h2hStats) && h2hStats.length) {
    let possSum = 0, possN = 0, shotsSum = 0, shotsN = 0;
    for (const m of h2hStats) {
      const stats = m.statistics ?? m.data?.statistics ?? [];
      if (Array.isArray(stats)) {
        for (const s of stats) {
          const name = (s.type?.developer_name ?? s.type?.name ?? "").toLowerCase();
          const v = num(s.data?.value ?? s.value);
          if (v == null) continue;
          if (name.includes("possession")) { possSum += v; possN++; }
          if (name.includes("shots_total") || name.includes("shots total")) { shotsSum += v; shotsN++; }
        }
      }
    }
    if (possN) avgPoss = Math.round(possSum / possN);
    if (shotsN) avgShots = Math.round((shotsSum / shotsN) * 10) / 10;
  }
  // From H2H referees: extract referee frequency
  let refSummary = undefined;
  if (Array.isArray(h2hRefs) && h2hRefs.length) {
    const refCounts = {};
    for (const m of h2hRefs) {
      const refs = m.referees ?? m.data?.referees ?? [];
      if (Array.isArray(refs)) {
        for (const r of refs) {
          const name = r.referee?.common_name ?? r.referee?.display_name ?? r.common_name ?? r.display_name;
          if (name) refCounts[name] = (refCounts[name] || 0) + 1;
        }
      }
    }
    const repeats = Object.entries(refCounts).filter(([, c]) => c >= 2).map(([n, c]) => `${n} (${c}x)`);
    if (repeats.length) refSummary = repeats;
  }
  const n = matchCount || (Array.isArray(h2hStats) ? h2hStats.length : 0);
  if (!n && !avgPoss && !refSummary) return null;
  return drop({
    avg_cards_per_match: n && totalCards ? Math.round((totalCards / n) * 10) / 10 : undefined,
    avg_possession: avgPoss,
    avg_shots: avgShots,
    repeat_referees: refSummary,
  });
}

/* ── commentaries highlights → key moments for live ── */
function extractCommentariesHighlights(commentariesData) {
  const items = arr(commentariesData);
  if (!items.length) return null;
  // Filter to important moments (goals, cards, subs, VAR)
  const important = items.filter(c => {
    const isGoal = c.is_goal || c.isGoal;
    const isImportant = c.is_important || c.isImportant;
    const comment = (c.comment ?? c.text ?? "").toLowerCase();
    return isGoal || isImportant || /goal|penalty|red.card|var|substitut/i.test(comment);
  });
  const source = important.length >= 3 ? important : items;
  return source.slice(-8).map(c => drop({
    min: c.minute ?? c.min,
    text: (c.comment ?? c.text ?? "").slice(0, 120),
    is_goal: c.is_goal || c.isGoal || undefined,
  }));
}

/* ── topscorers → top 5 for key player identification ── */
function extractTopscorers(topscorersData, homeId, awayId) {
  const items = arr(topscorersData);
  if (!items.length) return null;
  // Filter to players from the two teams, or take top 5 overall
  const relevant = items.filter(t => {
    const tid = t.participant_id ?? t.team_id ?? t.participant?.id;
    return tid === homeId || tid === awayId;
  });
  const source = relevant.length >= 2 ? relevant : items;
  return source.slice(0, 8).map(t => drop({
    player: t.player?.display_name ?? t.player?.common_name ?? t.player?.name ?? t.player_name,
    team: t.participant?.name ?? t.team_name,
    goals: num(t.total) ?? num(t.goals),
    assists: num(t.assists),
    type: t.type?.developer_name ?? t.type?.name,
  }));
}

/* ════════════════════════════════════════════════════════════
   MAIN: buildDigest(fixtureId) → compact ~5-10KB digest
   ════════════════════════════════════════════════════════════ */
export async function buildDigest(fixtureId) {
  const id = Number(fixtureId);
  const actors = await resolveFixtureActors(id);
  const liveLike = isFixtureLiveLike(actors.state);
  const homeId = actors.home_team_id;
  const awayId = actors.away_team_id;

  // Fetch ALL data in parallel — BATCH 1: core + standings + odds + predictions
  const [
    fixtureChunks,
    homeStats, awayStats, refereeStats,
    prematchOdds, inplayOdds, xgData, predictionsData,
    newsData, matchFactsData, expectedLineupsData,
    standingsData, roundStandingsData, correctionsData, liveStandingsData,
    commentariesData, transferRumoursData,
    homeScheduleData, awayScheduleData,
    topscorersData,
    homeSquadData, awaySquadData,
    homeSquadFbData, awaySquadFbData,
    homeRankingsData, awayRankingsData,
  ] = await Promise.all([
    getFixtureChunksMap(id, [
      "base", "state", "league", "season", "stage", "round", "group",
      "aggregate", "venue", "weatherreport", "metadata",
      "participants", "formations", "lineups", "referees",
      "coaches", "sidelined", "scores", "events", "statistics", "periods",
    ]),
    homeId ? getCurrentTeamStats(homeId) : null,
    awayId ? getCurrentTeamStats(awayId) : null,
    actors.referee_id ? getCurrentRefereeStats(actors.referee_id) : null,
    getOddsSummary(id, "prematch"),
    liveLike ? getOddsSummary(id, "inplay") : null,
    getFixtureXg(id),
    getFixturePredictions(id),
    getFixtureNews(id),
    getFixtureMatchFacts(id),
    getFixtureExpectedLineups(id),
    actors.season_id ? getSeasonStandings(actors.season_id) : null,
    actors.round_id ? getRoundStandings(actors.round_id) : null,
    actors.season_id ? getStandingsCorrections(actors.season_id) : null,
    liveLike && actors.league_id ? getLiveStandings(actors.league_id) : null,
    getFixtureCommentaries(id),
    getFixtureTransferRumours(id),
    actors.season_id && homeId ? getTeamSchedule(actors.season_id, homeId) : null,
    actors.season_id && awayId ? getTeamSchedule(actors.season_id, awayId) : null,
    actors.season_id ? getSeasonTopscorers(actors.season_id) : null,
    actors.season_id && homeId ? getTeamSquad(actors.season_id, homeId) : null,
    actors.season_id && awayId ? getTeamSquad(actors.season_id, awayId) : null,
    homeId ? getTeamSquadFallback(homeId) : null,
    awayId ? getTeamSquadFallback(awayId) : null,
    homeId ? getTeamRankings(homeId) : null,
    awayId ? getTeamRankings(awayId) : null,
  ]);

  // H2H — all 4 types (summary + events + statistics + referees)
  let h2hContext = [], h2hEvents = [], h2hStats = [], h2hRefs = [];
  if (homeId && awayId) {
    [h2hContext, h2hEvents, h2hStats, h2hRefs] = await Promise.all([
      getH2HChunkRows(homeId, awayId, "summary", 5, id),
      getH2HChunkRows(homeId, awayId, "events", 5, id),
      getH2HChunkRows(homeId, awayId, "statistics", 5, id),
      getH2HChunkRows(homeId, awayId, "referees", 5, id),
    ]);
  }

  const chunk = (n) => fixtureChunks[n]?.data ?? null;

  // ── Build match summary ──
  const matchSummary = extractFinalScore(chunk("scores"), chunk("participants"));

  // ── Extract stats (from statistics OR from xG endpoint as fallback) ──
  const stats = extractStats(chunk("statistics"), homeId, awayId);
  const xg = extractXg(xgData, homeId, awayId);

  // Merge xG into stats if stats.xg is missing but xG endpoint has data
  if (stats && !stats.xg && xg) stats.xg = xg;

  // ── Extract periods for HT/FT patterns ──
  let periods = null;
  const periodsRaw = chunk("periods");
  if (Array.isArray(periodsRaw) && periodsRaw.length) {
    const home1h = { goals: 0, shots: 0 }, away1h = { goals: 0, shots: 0 };
    const home2h = { goals: 0, shots: 0 }, away2h = { goals: 0, shots: 0 };
    for (const p of periodsRaw) {
      const period = p.description ?? p.period ?? p.type?.developer_name ?? "";
      const loc = p.location ?? (p.participant_id === homeId ? "home" : p.participant_id === awayId ? "away" : null);
      const det = Array.isArray(p.details) ? p.details : [];
      const gv = (n) => { const x = det.find(d => (d.type?.developer_name ?? "").toLowerCase().includes(n)); return num(x?.value) ?? 0; };
      const goals = gv("goals") || gv("scoring");
      const shots = gv("shots") || gv("attacks");
      const is1h = /1st|first/i.test(period);
      if (loc === "home") { if (is1h) { home1h.goals += goals; home1h.shots += shots; } else { home2h.goals += goals; home2h.shots += shots; } }
      if (loc === "away") { if (is1h) { away1h.goals += goals; away1h.shots += shots; } else { away2h.goals += goals; away2h.shots += shots; } }
    }
    periods = drop({
      home_1h_goals: home1h.goals || undefined, home_2h_goals: home2h.goals || undefined,
      away_1h_goals: away1h.goals || undefined, away_2h_goals: away2h.goals || undefined,
    });
  }

  // ── Coaches ──
  let homeCoach = null, awayCoach = null;
  const coaches = chunk("coaches");
  if (Array.isArray(coaches)) {
    for (const c of coaches) {
      const loc = c.meta?.location ?? c.location;
      const name = c.common_name ?? c.display_name ?? c.name;
      if (loc === "home" || c.participant_id === homeId) homeCoach = name;
      else if (loc === "away" || c.participant_id === awayId) awayCoach = name;
    }
  }

  // ── Expected lineups (pre-match only) ──
  let expectedLineups = null;
  const expLU = arr(expectedLineupsData);
  if (expLU.length) {
    expectedLineups = { available: true, count: expLU.length };
  }

  // ── Match facts ──
  let matchFacts = null;
  const factsArr = arr(matchFactsData);
  if (factsArr.length) {
    matchFacts = factsArr.slice(0, 8).map(f => f.fact ?? f.text ?? f.title ?? String(f)).filter(Boolean);
    if (!matchFacts.length) matchFacts = null;
  }

  // ── Commentaries highlights (live) ──
  const commentariesHighlights = liveLike ? extractCommentariesHighlights(commentariesData) : null;
  const commArr = arr(commentariesData);

  // ── Transfer rumours ──
  let rumours = null;
  const rumoursArr = arr(transferRumoursData);
  if (rumoursArr.length) {
    rumours = rumoursArr.slice(0, 6).map(r => {
      const player = r.player?.data?.display_name ?? r.player?.display_name ?? r.player_name ?? "Unknown";
      const to = r.toTeam?.data?.name ?? r.to_team_name ?? "";
      return `${player} → ${to}`;
    }).filter(Boolean);
  }

  // ── H2H discipline (from events + stats) ──
  const h2hDiscipline = extractH2HDiscipline(h2hEvents, h2hStats, h2hRefs);

  // ── Build data_flags (explicit availability — COMPLETE) ──
  const data_flags = {
    xg: Boolean(xg || stats?.xg),
    predictions: Boolean(val(predictionsData)),
    lineups_confirmed: Boolean(chunk("lineups")?.length),
    expected_lineups: Boolean(expLU.length),
    odds_prematch: Boolean(prematchOdds?.length),
    odds_inplay: Boolean(inplayOdds?.length),
    standings: Boolean(val(standingsData)),
    round_standings: Boolean(val(roundStandingsData)),
    standings_corrections: Boolean(val(correctionsData)),
    live_standings: Boolean(val(liveStandingsData)),
    h2h_count: h2hContext.length,
    referee_stats: Boolean(refereeStats),
    news_count: arr(newsData).length,
    match_facts: Boolean(factsArr.length),
    commentaries: commArr.length,
    team_stats: Boolean(homeStats || awayStats),
    home_squad: Boolean(val(homeSquadData) || val(homeSquadFbData)),
    away_squad: Boolean(val(awaySquadData) || val(awaySquadFbData)),
    home_rankings: Boolean(val(homeRankingsData)),
    away_rankings: Boolean(val(awayRankingsData)),
    topscorers: Boolean(val(topscorersData)),
  };

  const matchDate = chunk("base")?.starting_at;

  return drop({
    ok: true,
    fixture_id: id,
    digest_version: 2,

    match: drop({
      home: matchSummary.home_team,
      away: matchSummary.away_team,
      home_id: homeId,
      away_id: awayId,
      ft: matchSummary.ft,
      ht: matchSummary.ht,
      status: actors.state?.developer_name ?? actors.state?.name ?? actors.state?.short_name ?? null,
      league: chunk("league")?.name,
      season: chunk("season")?.name,
      round: chunk("round")?.name ?? (chunk("base")?.round_id ? `Round ${chunk("base")?.round_id}` : null),
      stage: chunk("stage")?.name,
      group: chunk("group")?.name,
      venue: chunk("venue")?.name,
      date: matchDate,
      is_live: liveLike,
    }),

    aggregate: chunk("aggregate") ? drop({
      result: chunk("aggregate")?.result,
      home_score: num(chunk("aggregate")?.home_result ?? chunk("aggregate")?.home_score),
      away_score: num(chunk("aggregate")?.away_result ?? chunk("aggregate")?.away_score),
    }) : undefined,

    weather: extractWeather(chunk("weatherreport")),

    tactical: drop({
      home_formation: null,
      away_formation: null,
      home_coach: homeCoach,
      away_coach: awayCoach,
      ...extractLineups(chunk("lineups"), chunk("formations"), chunk("participants")),
    }),

    sidelined: extractSidelined(chunk("sidelined"), chunk("participants")),

    events: extractEvents(chunk("events")),

    stats,

    xg: !stats?.xg ? xg : undefined,

    periods,

    standings: extractStandings(standingsData, homeId, awayId),

    round_standings: extractRoundStandings(roundStandingsData, homeId, awayId),

    standings_corrections: extractCorrections(correctionsData, homeId, awayId),

    live_standings: extractLiveStandings(liveStandingsData, homeId, awayId),

    h2h: extractH2H(h2hContext, homeId),

    h2h_discipline: h2hDiscipline,

    predictions: extractPredictions(predictionsData),

    odds_overview: extractKeyOdds(prematchOdds),

    inplay_odds_overview: liveLike ? extractKeyOdds(inplayOdds) : undefined,

    referee: extractReferee(refereeStats, chunk("referees")),

    home_season: extractTeamSeasonStats(homeStats),
    away_season: extractTeamSeasonStats(awayStats),

    home_squad_depth: extractSquadDepth(homeSquadData, homeSquadFbData),
    away_squad_depth: extractSquadDepth(awaySquadData, awaySquadFbData),

    rankings: drop({
      home: extractRankings(homeRankingsData),
      away: extractRankings(awayRankingsData),
    }),

    home_schedule: extractScheduleContext(homeScheduleData, matchDate),
    away_schedule: extractScheduleContext(awayScheduleData, matchDate),

    news: extractNews(newsData),

    match_facts: matchFacts,

    commentaries: commentariesHighlights,

    transfer_rumours: rumours,

    topscorers: extractTopscorers(topscorersData, homeId, awayId),

    expected_lineups: expectedLineups,

    data_flags,

    notes: [
      "Pre-computed analysis digest v2. ALL data extracted server-side — zero truncation.",
      "match.ft = definitive final score. match.ht = half-time score.",
      "data_flags shows exactly what data is available for each category.",
      "For detailed odds prices: GET /fixtures/{id}/odds/pre-match?filter=market:1,2,5",
      "For raw data deep-dive: GET /fixtures/{id}/bundle?part=1 and ?part=2",
    ],
  });
}
