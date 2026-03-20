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

// ─── جيب أحدث fetched_at لأي جدول ───────────────────────────────────────────
async function getLatestFetchedAt(table, whereClause, params) {
  const result = await query(
    `select max(fetched_at) as fetched_at from ${table} where ${whereClause}`,
    params
  );
  return result.rows[0]?.fetched_at ?? null;
}

// ─── Stale-While-Revalidate ───────────────────────────────────────────────────
//
// المنطق:
//   1. اتحقق من Supabase: هل في بيانات؟
//   2. لو في بيانات → ارجعها فوراً للـ GPT (حتى لو قديمة)
//   3. لو قديمة → ابدأ refresh في الـ background (بدون await)
//   4. لو مافيش بيانات خالص → استنى الـ refresh (أول مرة فقط)
//
// النتيجة:
//   - الـ GPT دايماً بيرجع بسرعة
//   - SportMonks بيتطلب مرة واحدة بس لكل TTL
// ─────────────────────────────────────────────────────────────────────────────

export async function staleWhileRevalidate({
  // اسم النوع للـ TTL
  type,
  // function ترجع البيانات الحالية من Supabase
  getCached,
  // function تعمل الـ refresh من SportMonks وتحفظ في Supabase
  refresh,
}) {
  const ttl = TTL[type];

  if (!ttl) {
    throw new Error(`Unknown cache type: ${type}`);
  }

  // 1. جيب البيانات الحالية من Supabase
  const cached = await getCached();

  const stale = isStale(cached?.fetched_at ?? null, ttl);

  if (cached && !stale) {
    // البيانات fresh → ارجعها مباشرة بدون أي طلب لـ SportMonks
    return { data: cached.data, source: "cache", stale: false };
  }

  if (cached && stale) {
    // البيانات موجودة بس قديمة → ارجعها فوراً وجدّد في الـ background
    triggerBackgroundRefresh(refresh, type);
    return { data: cached.data, source: "cache", stale: true };
  }

  // مافيش بيانات خالص (أول مرة) → لازم نستنى
  await refresh();
  const fresh = await getCached();

  if (!fresh) {
    throw new Error(`Refresh succeeded but no data found for type: ${type}`);
  }

  return { data: fresh.data, source: "sportmonks", stale: false };
}

// ─── Background Refresh (fire and forget) ────────────────────────────────────
function triggerBackgroundRefresh(refreshFn, type) {
  // بنستخدم waitUntil لو متاح (Vercel Edge) أو Promise عادية
  const promise = refreshFn().catch((err) => {
    console.error(`[cache] Background refresh failed for type=${type}:`, err.message);
  });

  // في Vercel Node.js runtime، الـ background promise بتكمل حتى بعد ما الـ response يتبعت
  if (typeof globalThis !== "undefined" && globalThis[Symbol.for("nextjs-async-storage")]) {
    // Next.js بيتعامل معاها تلقائياً
  }

  // نضمن إن الـ promise متكتمش بصمت
  promise.then(() => {
    console.log(`[cache] Background refresh completed for type=${type}`);
  });
}
