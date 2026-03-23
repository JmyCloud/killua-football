/**
 * lib/slim-bundle.js
 * GPT-optimised compression for bundle responses.
 *
 * SportMonks stores stats in "details" arrays:
 *   [{id, type:{id,name,developer_name,code,model_type}, value}]
 * A single lineup player can have 20 such entries (~5KB).
 * With 30 players + 20 standing rows, that alone is ~250KB of bloat.
 *
 * This module:
 *   1. Flattens "details" arrays → {developer_name: value, ...}
 *   2. Flattens "type" objects   → developer_name string
 *   3. Strips irrelevant meta keys (image_path, sport_id, etc.)
 *   4. Caps array sizes per section
 *
 * Result: ~300-500KB raw → <100KB slim.
 */

// ── Keys stripped from every object (not useful for text analysis) ──
const STRIP_KEYS = new Set([
  "meta",
  "pagination",
  "subscription",
  "rate_limit",
  "timezone",
  "plans",
  "add_ons",
  "sport_id",
  "model_type",
  "has_values",
  "code",
  "image_path",
  "logo_path",
  "gender",
]);

// ── Detect SportMonks details pattern ──
function isDetailsArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  const f = arr[0];
  return (
    f != null &&
    typeof f === "object" &&
    f.type != null &&
    typeof f.type === "object" &&
    (f.type.developer_name != null || f.type.name != null) &&
    "value" in f
  );
}

// ── Flatten details → {developer_name: value} ──
function flattenDetails(arr) {
  const out = {};
  for (const d of arr) {
    const k = d.type?.developer_name ?? d.type?.name ?? String(d.id ?? "");
    if (k) out[k] = d.value;
  }
  return out;
}

// ── Recursive deep slim ──
function deepSlim(obj, depth) {
  if (depth > 12 || obj == null) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    if (isDetailsArray(obj)) return flattenDetails(obj);
    const capped = obj.length > 80 ? obj.slice(0, 80) : obj;
    return capped.map((item) => deepSlim(item, depth + 1));
  }

  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (STRIP_KEYS.has(k)) continue;

    // Flatten type objects → developer_name string
    if (
      k === "type" &&
      v != null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      v.developer_name
    ) {
      out.type = v.developer_name;
      continue;
    }

    // Flatten details arrays into parent
    if (k === "details" && Array.isArray(v) && isDetailsArray(v)) {
      Object.assign(out, flattenDetails(v));
      continue;
    }

    out[k] = deepSlim(v, depth + 1);
  }

  return out;
}

// ── Array cap helper ──
function capArray(val, max) {
  if (Array.isArray(val)) return val.slice(0, max);
  if (val != null && typeof val === "object" && Array.isArray(val.data)) {
    return { ...val, data: val.data.slice(0, max) };
  }
  return val;
}

// ── News: truncate article bodies ──
function slimNews(news) {
  if (!news) return news;
  const articles = news?.data ?? (Array.isArray(news) ? news : null);
  if (!Array.isArray(articles)) return news;

  const slimmed = articles.slice(0, 8).map((a) => {
    if (!a || typeof a !== "object") return a;
    const out = { ...a };
    if (typeof out.body === "string" && out.body.length > 400) {
      out.body = out.body.slice(0, 400) + "\u2026";
    }
    // Trim nested lines to short summaries
    if (Array.isArray(out.lines)) {
      out.lines = out.lines.slice(0, 4).map((l) => {
        if (typeof l === "string") return l.length > 300 ? l.slice(0, 300) + "\u2026" : l;
        if (l && typeof l === "object") {
          const text = l.line ?? l.text ?? l.content ?? "";
          return typeof text === "string" && text.length > 300
            ? text.slice(0, 300) + "\u2026"
            : text;
        }
        return l;
      });
    }
    return out;
  });

  if (news?.data) return { ...news, data: slimmed };
  return slimmed;
}

// ── Commentaries: keep only important moments ──
function slimCommentaries(comm) {
  if (!comm) return comm;
  const items = comm?.data ?? (Array.isArray(comm) ? comm : null);
  if (!Array.isArray(items)) return comm;

  const important = items.filter((c) => {
    if (c.is_goal || c.is_important || c.important) return true;
    const txt = String(c.comment ?? c.text ?? "").toLowerCase();
    return /goal|card|penal|var|half|kick.off|substit|injur|end of|red|yellow/.test(
      txt
    );
  });

  const result = (important.length >= 5 ? important : items).slice(0, 40);
  if (comm?.data) return { ...comm, data: result };
  return result;
}

// ── Main entry: slim a full bundle body ──
export function slimBundle(body) {
  if (!body || typeof body !== "object") return body;

  // Phase 1 — deep slim (flattens details, types, strips meta, caps arrays)
  const s = deepSlim(body, 0);

  // Phase 2 — section-specific caps & adjustments

  s.fixture_news = slimNews(s.fixture_news);
  s.fixture_commentaries = slimCommentaries(s.fixture_commentaries);

  // Team data caps
  for (const teamKey of ["home_team", "away_team"]) {
    const team = s[teamKey];
    if (!team) continue;
    team.squad = capArray(team.squad, 28);
    team.schedule = capArray(team.schedule, 12);
    team.squad_fallback = capArray(team.squad_fallback, 28);
  }

  // Topscorers
  s.topscorers = capArray(s.topscorers, 15);

  // H2H
  if (s.h2h) {
    for (const k of ["context", "events", "statistics", "referees"]) {
      if (Array.isArray(s.h2h[k])) s.h2h[k] = s.h2h[k].slice(0, 8);
    }
  }

  // Transfer rumours
  s.fixture_transfer_rumours = capArray(s.fixture_transfer_rumours, 15);

  return s;
}
