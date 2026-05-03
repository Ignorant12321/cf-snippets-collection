// =========================
// 配置区
// =========================

const CONFIG = {
  path: "/rss",
  userAgent: "AstroRSSProxy/1.0",
  edgeCacheTtlSeconds: 300,
  homepageCacheTtlSeconds: 300,
  rssHubInstances: {
    default: "https://rsshub.pseudoyu.com",
    rssforever: "https://rsshub.rssforever.com",
  },
  allowedOrigins: [
    "http://localhost:4321",
    "http://localhost:4322",
    "https://blog.218501.xyz",
    "https://218501.xyz",
    "https://ignorant.top",
  ],
  feeds: [
    {
      id: "zaobao-china",
      name: "联合早报 · 中国",
      route: "/zaobao/realtime/china",
    },
    {
      id: "zaobao-world",
      name: "联合早报 · 国际",
      route: "/zaobao/realtime/world",
    },
    {
      id: "csdn-geeknews",
      name: "CSDN · 极客日报",
      route: "/csdn/blog/csdngeeknews",
    },
    {
      id: "bilibili-hot",
      name: "bilibili 排行榜 · 全站",
      route: "/bilibili/ranking/all",
    },
    {
      id: "ruanyifeng-blog",
      name: "阮一峰的网络日志",
      url: "https://www.ruanyifeng.com/blog/atom.xml",
    },
  ],
};

const FEED_MAP = new Map(CONFIG.feeds.map((feed) => [feed.id, feed]));

// =========================
// 主入口
// =========================

export default {
  async fetch(request) {
    return handleRequest(request);
  },
};

async function handleRequest(request) {
  const url = new URL(request.url);
  const pathname = normalizePath(url.pathname);

  const allowedPaths = [CONFIG.path, `${CONFIG.path}/sources`, "/"];
  if (!allowedPaths.includes(pathname)) {
    return new Response("Not Found", { status: 404 });
  }

  if (request.method === "OPTIONS") {
    return createOptionsResponse(request);
  }

  if (request.method !== "GET") {
    return jsonResponse(
      request,
      { ok: false, error: "Method Not Allowed" },
      405,
    );
  }

  if (pathname === `${CONFIG.path}/sources`) {
    return jsonResponse(request, {
      ok: true,
      sources: getPublicSources(),
    });
  }

  const source = url.searchParams.get("source");

  if (!source) {
    return htmlResponse(request, renderHomePage(request));
  }

  const feed = FEED_MAP.get(source);

  if (!feed) {
    return jsonResponse(
      request,
      {
        ok: false,
        error: "Invalid source",
        available_sources: CONFIG.feeds.map((item) => item.id),
      },
      400,
    );
  }

  return proxyFeed(request, source, feed);
}

async function proxyFeed(request, source, feed) {
  try {
    const upstream = await fetch(buildFeedUrl(feed), {
      method: "GET",
      headers: {
        "User-Agent": CONFIG.userAgent,
        Accept:
          "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
      cf: {
        cacheTtl: CONFIG.edgeCacheTtlSeconds,
        cacheEverything: true,
      },
    });

    if (!upstream.ok) {
      return jsonResponse(
        request,
        {
          ok: false,
          error: `Upstream error: ${upstream.status}`,
          source,
        },
        502,
      );
    }

    const headers = new Headers();

    headers.set(
      "Content-Type",
      upstream.headers.get("Content-Type") || "application/xml; charset=UTF-8",
    );
    headers.set(
      "Cache-Control",
      `public, max-age=${CONFIG.edgeCacheTtlSeconds}`,
    );
    headers.set("X-RSS-Source", source);

    applyCors(headers, request);

    return new Response(await upstream.text(), {
      status: 200,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    return jsonResponse(
      request,
      {
        ok: false,
        error: "Fetch RSS failed",
        detail: message,
      },
      502,
    );
  }
}

function normalizePath(pathname) {
  return pathname.replace(/\/+$/, "") || "/";
}

function buildFeedUrl(feed) {
  if (feed.url) {
    return feed.url;
  }

  const instance = CONFIG.rssHubInstances[feed.instance || "default"];
  return `${instance}${feed.route}`;
}

function getPublicSources() {
  return CONFIG.feeds.map((feed) => ({
    id: feed.id,
    name: feed.name,
    rss_path: `${CONFIG.path}?source=${encodeURIComponent(feed.id)}`,
  }));
}

// =========================
// CORS 相关
// =========================

function buildCorsHeaders(request) {
  const origin = request.headers.get("Origin");

  if (origin && CONFIG.allowedOrigins.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
  }

  return {};
}

function applyCors(headers, request) {
  const cors = buildCorsHeaders(request);
  for (const key in cors) {
    headers.set(key, cors[key]);
  }
}

function createOptionsResponse(request) {
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(request),
  });
}

// =========================
// JSON 响应
// =========================

function jsonResponse(request, data, status = 200) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=UTF-8",
  });

  applyCors(headers, request);

  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers,
  });
}

// =========================
// HTML 首页
// =========================

function htmlResponse(request, html) {
  const headers = new Headers({
    "Content-Type": "text/html; charset=UTF-8",
    "Cache-Control": `public, max-age=${CONFIG.homepageCacheTtlSeconds}`,
  });

  applyCors(headers, request);

  return new Response(html, {
    status: 200,
    headers,
  });
}

function renderHomePage(request) {
  const url = new URL(request.url);
  const basePath = CONFIG.path;
  const items = getPublicSources()
    .map((source) => {
      const href = `${basePath}?source=${encodeURIComponent(source.id)}`;
      return `
        <li class="source">
          <a href="${escapeHtml(href)}">
            <span>${escapeHtml(source.name)}</span>
            <code>${escapeHtml(source.id)}</code>
          </a>
        </li>`;
    })
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RSS Sources</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%230f766e'/%3E%3Ccircle cx='10' cy='22' r='3' fill='white'/%3E%3Cpath d='M6 12a14 14 0 0 1 14 14h-4a10 10 0 0 0-10-10z' fill='white'/%3E%3Cpath d='M6 6a20 20 0 0 1 20 20h-4a16 16 0 0 0-16-16z' fill='white'/%3E%3C/svg%3E" type="image/svg+xml">
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f7f5ef;
      --fg: #202124;
      --muted: #6f6a60;
      --line: #d8d2c4;
      --surface: #fffdf8;
      --accent: #0f766e;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #171817;
        --fg: #f1eee6;
        --muted: #aaa398;
        --line: #38362f;
        --surface: #1f211f;
        --accent: #5eead4;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--fg);
      font: 16px/1.6 ui-serif, Georgia, "Times New Roman", serif;
    }
    main {
      width: min(720px, calc(100% - 40px));
      margin: 0 auto;
      padding: 72px 0;
    }
    h1 {
      margin: 0 0 8px;
      font-size: clamp(2rem, 8vw, 4.25rem);
      line-height: 1;
      letter-spacing: 0;
    }
    .intro {
      margin: 0 0 40px;
      color: var(--muted);
    }
    .sources {
      list-style: none;
      margin: 0;
      padding: 0;
      border-top: 1px solid var(--line);
    }
    .source a {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      min-height: 64px;
      padding: 16px 0;
      color: inherit;
      text-decoration: none;
      border-bottom: 1px solid var(--line);
    }
    .source a:hover span,
    .source a:focus-visible span {
      color: var(--accent);
    }
    code {
      flex: none;
      color: var(--muted);
      font: 0.875rem/1.4 ui-monospace, SFMono-Regular, Consolas, monospace;
    }
    footer {
      margin-top: 40px;
      color: var(--muted);
      font-size: 0.875rem;
    }
    footer a {
      color: inherit;
      text-decoration-color: var(--line);
      text-underline-offset: 4px;
    }
    @media (max-width: 520px) {
      main {
        width: min(100% - 28px, 720px);
        padding: 44px 0;
      }
      .source a {
        align-items: flex-start;
        flex-direction: column;
        gap: 4px;
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>RSS Sources</h1>
    <p class="intro">当前入口支持 ${CONFIG.feeds.length} 个订阅源。</p>
    <ul class="sources">${items}
    </ul>
    <footer>
      JSON: <a href="${basePath}/sources">${url.origin}${basePath}/sources</a>
    </footer>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });
}
