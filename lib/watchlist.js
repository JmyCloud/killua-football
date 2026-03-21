export function parseFixtureIdList(value) {
  return Array.from(
    new Set(
      String(value ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n > 0)
    )
  );
}

export function getWatchlistConfig() {
  const prematchFixtureIds = parseFixtureIdList(
    process.env.WARM_PREMATCH_FIXTURE_IDS
  );

  const liveFixtureIds = parseFixtureIdList(
    process.env.WARM_LIVE_FIXTURE_IDS
  );

  const concurrencyRaw = Number(process.env.WARM_SYNC_CONCURRENCY ?? 2);
  const concurrency =
    Number.isInteger(concurrencyRaw) && concurrencyRaw > 0
      ? Math.min(concurrencyRaw, 5)
      : 2;

  const h2hLimitRaw = Number(process.env.WARM_H2H_LIMIT ?? 5);
  const h2hLimit =
    Number.isInteger(h2hLimitRaw) && h2hLimitRaw > 0
      ? Math.min(h2hLimitRaw, 20)
      : 5;

  return {
    prematchFixtureIds,
    liveFixtureIds,
    concurrency,
    h2hLimit,
  };
}

export function normalizeWatchlistMode(value, fallback = "auto") {
  const mode = String(value ?? "").trim().toLowerCase();
  return ["auto", "prematch", "live"].includes(mode) ? mode : fallback;
}

export function normalizePriority(value, fallback = 100) {
  const n = parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(n)) return fallback;
  return Math.max(1, Math.min(n, 999999));
}

export function normalizeBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

export function normalizeNullableTimestamp(value) {
  if (value == null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function normalizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

export function normalizeWatchlistItem(input) {
  const fixtureId = Number(input?.fixture_id);

  if (!Number.isInteger(fixtureId) || fixtureId < 1) {
    throw new Error("Invalid fixture_id");
  }

  return {
    fixture_id: fixtureId,
    mode: normalizeWatchlistMode(input?.mode, "auto"),
    priority: normalizePriority(input?.priority, 100),
    enabled: normalizeBoolean(input?.enabled, true),
    starts_at: normalizeNullableTimestamp(input?.starts_at),
    expires_at: normalizeNullableTimestamp(input?.expires_at),
    notes: input?.notes != null ? String(input.notes) : null,
    metadata: normalizeMetadata(input?.metadata),
  };
}

export function parsePositiveInt(value, fallback, maxValue) {
  const n = parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, maxValue);
}