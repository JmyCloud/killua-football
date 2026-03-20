import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Route: GET /api/admin/markets?search=corners ─────────────────────────────
//
// الـ GPT يستخدم الـ route ده عشان يعرف الـ market_id قبل ما يبعت filter
//
// مثال:
//   GET /api/admin/markets?search=corners
//   → [{ market_id: 45, name: "Corners", developer_name: "CORNERS" }]
//
//   بعدين GPT يبعت:
//   POST /api/admin/sync/odds/pre-match/fixtures/123/bookmakers/35?filter=markets:45
// ─────────────────────────────────────────────────────────────────────────────

function isAuthorized(request) {
  const expected = process.env.PROXY_SHARED_SECRET;
  const provided = request.headers.get("x-admin-secret");
  if (!expected) throw new Error("Missing PROXY_SHARED_SECRET");
  return provided === expected;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";

  if (!search) {
    // لو مفيش search → رجّع كل الأسواق المتاحة
    const result = await query(
      `select market_id, name, developer_name, has_winning_calculations
       from cache.odds_markets_index
       order by name asc
       limit 200`
    );

    return NextResponse.json({
      ok:      true,
      count:   result.rows.length,
      markets: result.rows,
    });
  }

  // بحث بالاسم أو developer_name باستخدام normalized_name
  const normalized = search.toLowerCase().replace(/\s+/g, " ").trim();

  const result = await query(
    `select market_id, name, developer_name, has_winning_calculations, normalized_name
     from cache.odds_markets_index
     where normalized_name ilike $1
        or developer_name  ilike $1
        or name            ilike $1
     order by
       case when lower(name) = lower($2) then 0 else 1 end, -- exact match أولاً
       name asc
     limit 20`,
    [`%${normalized}%`, search]
  );

  return NextResponse.json({
    ok:           true,
    search_query: search,
    count:        result.rows.length,
    markets:      result.rows,
    // الـ GPT يستخدم market_id من النتيجة دي في filter=markets:X
    usage_hint:   `Use filter=markets:${result.rows.map(r => r.market_id).join(",")} in odds routes`,
  });
}
