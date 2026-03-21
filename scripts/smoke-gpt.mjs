const BASE_URL = String(process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const FIXTURE_ID = String(process.env.SMOKE_FIXTURE_ID || "").trim();
const GPT_SECRET = String(process.env.SMOKE_GPT_SECRET || "").trim();

if (!FIXTURE_ID) throw new Error("Missing SMOKE_FIXTURE_ID");
if (!GPT_SECRET) throw new Error("Missing SMOKE_GPT_SECRET");

async function api(method, path) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            "x-gpt-secret": GPT_SECRET,
            "accept": "application/json",
        },
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(`${method} ${path} failed: ${res.status} ${JSON.stringify(body)}`);
    }
    return body;
}

function packNameOf(item) {
    return item?.pack || item?.name || item?.slug || null;
}

function packReady(item) {
    return item?.ready === true || item?.status === "ready";
}

async function main() {
    console.log("1) prepare");
    const prepare = await api("POST", `/api/gpt/fixtures/${FIXTURE_ID}/prepare`);
    console.log(JSON.stringify({ ok: prepare.ok, fixture_id: prepare.fixture_id }, null, 2));

    console.log("2) manifest");
    const manifest = await api("GET", `/api/gpt/fixtures/${FIXTURE_ID}/manifest`);

    const packMap = new Map(
        (manifest.packs || [])
            .map((item) => [packNameOf(item), item])
            .filter(([name]) => Boolean(name))
    );

    const readyPacks = (manifest.default_read_order || []).filter((name) => {
        const meta = packMap.get(name);
        return meta && packReady(meta);
    });

    console.log(JSON.stringify({ ready_packs: readyPacks }, null, 2));

    for (const name of readyPacks) {
        const meta = packMap.get(name) || {};
        const safeEnabled = meta?.safe_read?.enabled === true;
        let page = 1;

        while (true) {
            const qs = new URLSearchParams();
            if (safeEnabled) {
                qs.set("read_mode", "safe");
                qs.set("page", String(page));
                qs.set("page_size", String(meta?.safe_read?.default_page_size || 2));
            }

            const pack = await api(
                "GET",
                `/api/gpt/fixtures/${FIXTURE_ID}/packs/${name}${qs.toString() ? `?${qs}` : ""}`
            );

            console.log(JSON.stringify({
                pack: name,
                page,
                ok: pack.ok,
                has_next_page: pack?.paging?.has_next_page ?? false,
            }, null, 2));

            if (!safeEnabled || pack?.paging?.has_next_page !== true) break;
            page += 1;
        }
    }

    console.log("SMOKE_GPT_OK");
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});