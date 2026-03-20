import { query } from "@/lib/db";

// ─── TTL لكل نوع بيانات (بالثواني) ───────────────────────────────────────────
export const TTL = {
  fixtures:             15 * 60,       // 15 دقيقة
  fixtures_h2h:         24 * 60 * 60,  // 24 ساعة
  team_season_stats:    6  * 60 * 60,  // 6 ساعات
  referee_season_stats: 6  * 60 * 60,  // 6 ساعات
  odds_prematch:        15 * 60,       // 15 دقيقة
  odds_inplay:          10,            // 10 ثواني
};

// ─── هل البيانات قديمة؟ ───────────────────────────────────────────────────────
export function isStale(fetchedAt, ttlSeconds) {
  if (!fetchedAt) return true;
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  return ageMs > ttlSeconds * 1000;
}

// ─── فلترة الـ odds payload بناءً على market IDs ─────────────────────────────
// filterParam مثال: "markets:1,2,45"
// بيفلتر الـ data array وبيرجع بس الـ items اللي market_id بتاعها في القائمة
export function filterOddsPayload(data, filterParam) {
  if (!filterParam) return data;

  // parse: "markets:1,2,45" → Set { 1, 2, 45 }
  const match = String(filterParam).match(/^markets:([\d,]+)$/);
  if (!match) return data; // format غلط → رجّع كل حاجة

  const marketIds = new Set(
    match[1].split(",").map((id) => Number(id.trim())).filter(Boolean)
  );

  if (marketIds.size === 0) return data;

  // data ممكن يكون object فيه data array (payload من Supabase)
  const rawData = data?.data ?? data;

  if (!Array.isArray(rawData)) return data;

  const filtered = rawData.filter((item) => {
    // SportMonks بيحط market_id في مستويات مختلفة
    const itemMarketId =
      item?.market_id ??
      item?.market?.id ??
      item?.id;
    return marketIds.has(Number(itemMarketId));
  });

  // رجّع بنفس الـ structure الأصلي
  if (data?.data !== undefined) {
    return { ...data, data: filtered };
  }

  return filtered;
}

// ─── Stale-While-Revalidate ───────────────────────────────────────────────────
//
// المنطق:
//   1. اتحقق من Supabase: هل في بيانات؟
//   2. لو في بيانات fresh → ارجعها مباشرة (صفر طلبات SportMonks)
//   3. لو في بيانات قديمة → ارجعها فوراً + جدّد في الـ background
//   4. لو مافيش بيانات خالص → استنى الـ refresh (أول مرة فقط)
//
// النتيجة:
//   - الـ GPT دايماً بيرجع بسرعة
//   - SportMonks بيتطلب مرة واحدة بس لكل TTL
// ─────────────────────────────────────────────────────────────────────────────
export async function staleWhileRevalidate({ type, getCached, refresh }) {
  const ttl = TTL[type];

  if (!ttl) throw new Error(`Unknown cache type: ${type}`);

  const cached = await getCached();
  const stale  = isStale(cached?.fetched_at ?? null, ttl);

  if (cached && !stale) {
    return { data: cached.data, source: "cache", stale: false };
  }

  if (cached && stale) {
    triggerBackgroundRefresh(refresh, type);
    return { data: cached.data, source: "cache", stale: true };
  }

  // أول مرة خالص → لازم نستنى
  await refresh();
  const fresh = await getCached();

  if (!fresh) {
    throw new Error(`Refresh succeeded but no data found for type: ${type}`);
  }

  return { data: fresh.data, source: "sportmonks", stale: false };
}

// ─── Background Refresh (fire and forget) ────────────────────────────────────
function triggerBackgroundRefresh(refreshFn, type) {
  refreshFn()
    .then(() => console.log(`[cache] Background refresh done: ${type}`))
    .catch((err) => console.error(`[cache] Background refresh failed: ${type}`, err.message));
}
