export const GPT_PACKS = Object.freeze([
  "fixture_context",
  "fixture_squads",
  "fixture_events_scores",
  "fixture_statistics",
  "fixture_periods",
  "h2h_context",
  "h2h_events",
  "h2h_statistics",
  "h2h_referees",
  "home_team_all",
  "away_team_all",
  "referee_all",
  "odds_prematch_summary",
  "odds_inplay_summary",
]);

export const GPT_READ_MODES = Object.freeze(["full", "safe"]);

export function isValidGptPack(pack) {
  return GPT_PACKS.includes(String(pack ?? ""));
}