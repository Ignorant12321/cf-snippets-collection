// =========================
// 配置区
// =========================

// 允许访问的前端来源（开发 + 生产）
const ALLOWED_ORIGINS = [
  "http://localhost:4321",
  "http://localhost:4322",
  "https://blog.218501.xyz",
  "https://218501.xyz",
  "https://ignorant.top",
];

// RSS 源白名单（不要开放任意 URL）
const FEEDS = [
  {
    id: "zaobao-china",
    name: "联合早报 · 中国",
    url: "https://rsshub.pseudoyu.com/zaobao/realtime/china",
  },
  {
    id: "zaobao-world",
    name: "联合早报 · 国际",
    url: "https://rsshub.pseudoyu.com/zaobao/realtime/world",
  },
  {
    id: "csdn-geeknews",
    name: "CSDN · 极客日报",
    url: "https://rsshub.pseudoyu.com/csdn/blog/csdngeeknews",
  },
  {
    id: "bilibili-hot",
    name: "bilibili 排行榜 · 全站",
    url: "https://rsshub.pseudoyu.com/bilibili/ranking/all",
  },
];

// =========================
// 主入口
// =========================

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 只处理 /rss
    if (url.pathname !== "/rss") {
      return new Response("Not Found", { status: 404 });
    }

    // 处理 OPTIONS 预检
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(request),
      });
    }

    if (request.method !== "GET") {
      return jsonResponse(
        request,
        { ok: false, error: "Method Not Allowed" },
        405
      );
    }

    // 获取 source
    const source = url.searchParams.get("source");

    const feed = FEEDS.find((item) => item.id === source);

    if (!source || !feed) {
      return jsonResponse(
        request,
        {
          ok: false,
          error: "Invalid source",
          available_sources: FEEDS.map((item) => item.id),
        },
        400
      );
    }

    const target = feed.url;

    try {
      const upstream = await fetch(target, {
        method: "GET",
        headers: {
          "User-Agent": "AstroRSSProxy/1.0",
          "Accept":
            "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
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
          502
        );
      }

      const body = await upstream.text();

      const headers = new Headers();

      // 原样返回 XML
      headers.set(
        "Content-Type",
        upstream.headers.get("Content-Type") ||
          "application/xml; charset=UTF-8"
      );

      // 缓存 5 分钟
      headers.set("Cache-Control", "public, max-age=300");

      // 调试用
      headers.set("X-RSS-Source", source);

      // 加 CORS
      applyCors(headers, request);

      return new Response(body, {
        status: 200,
        headers,
      });
    } catch (err) {
      return jsonResponse(
        request,
        {
          ok: false,
          error: "Fetch RSS failed",
          detail: err.message,
        },
        502
      );
    }
  },
};

// =========================
// CORS 相关
// =========================

function buildCorsHeaders(request) {
  const origin = request.headers.get("Origin");

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
  }

  // fallback（不允许的 origin）
  return {
    "Access-Control-Allow-Origin": "null",
  };
}

function applyCors(headers, request) {
  const cors = buildCorsHeaders(request);
  for (const key in cors) {
    headers.set(key, cors[key]);
  }
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
