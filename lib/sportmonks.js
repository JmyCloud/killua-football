const SPORTMONKS_FOOTBALL_BASE_URL = "https://api.sportmonks.com/v3/football/";
const SPORTMONKS_GLOBAL_BASE_URL = "https://api.sportmonks.com/v3/";

function normalizePath(path) {
  return String(path || "").replace(/^\/+/, "");
}

function buildUrl(baseUrl, path, query = {}) {
  const url = new URL(normalizePath(path), baseUrl);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}
export async function fetchSportMonksPage(path, query = {}, options = {}) {
  const token = process.env.SPORTMONKS_API_TOKEN;

  if (!token) {
    throw new Error("Missing SPORTMONKS_API_TOKEN");
  }

  const baseUrl =
    options.base === "global"
      ? SPORTMONKS_GLOBAL_BASE_URL
      : SPORTMONKS_FOOTBALL_BASE_URL;

  const url = buildUrl(baseUrl, path, {
    ...query,
    api_token: token
  });

  console.log("SPORTMONKS URL =>", url.replace(token, "HIDDEN_TOKEN"));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SportMonks request failed: ${response.status} ${body}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchAllSportMonksPages(path, query = {}, options = {}) {
  const pages = [];
  let currentPage = Number(query.page ?? 1);
  let guard = 0;

  while (true) {
    guard += 1;

    if (guard > 100) {
      throw new Error("Pagination safety limit exceeded");
    }

    if (!Number.isInteger(currentPage) || currentPage < 1) {
      throw new Error(`Invalid page value before request: ${currentPage}`);
    }

    const payload = await fetchSportMonksPage(
      path,
      {
        ...query,
        page: currentPage
      },
      options
    );

    const pagination =
      payload?.pagination ??
      payload?.meta?.pagination ??
      null;

    pages.push({
      page_number: currentPage,
      payload,
      pagination
    });

    const hasMore = Boolean(pagination?.has_more);
    const nextPageRaw = pagination?.next_page;

    if (!hasMore || !nextPageRaw) {
      break;
    }

    let nextPageNumber = null;

    if (typeof nextPageRaw === "number") {
      nextPageNumber = nextPageRaw;
    } else if (typeof nextPageRaw === "string") {
      if (/^\d+$/.test(nextPageRaw.trim())) {
        nextPageNumber = Number(nextPageRaw.trim());
      } else {
        try {
          const nextUrl = new URL(nextPageRaw);
          const pageFromUrl = nextUrl.searchParams.get("page");

          if (pageFromUrl && /^\d+$/.test(pageFromUrl)) {
            nextPageNumber = Number(pageFromUrl);
          }
        } catch {
          nextPageNumber = null;
        }
      }
    }

    if (!Number.isInteger(nextPageNumber) || nextPageNumber < 1) {
      throw new Error(`Invalid next_page value received from SportMonks: ${nextPageRaw}`);
    }

    currentPage = nextPageNumber;
  }

  return pages;
}