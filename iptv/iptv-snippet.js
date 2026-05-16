// =========================
// 配置区
// =========================

const CONFIG = {
  homepageHost: "iptv.ssr.ddns-ip.net",
  defaultUpstreamUrl: "https://iptv-org.github.io/iptv/index.m3u",
  userAgent: "Mozilla/5.0 IPTVSnippet/1.0",
  playlistCacheTtlSeconds: 3600,
  homepageCacheTtlSeconds: 600,
  allowedOrigins: [
    "https://iptv.ssr.ddns-ip.net",
  ],
  sources: [
    {
      id: "china",
      name: "国内及港澳台频道",
      description: "按 tvg-id 地区后缀筛选中国大陆、香港、澳门、台湾频道。",
      match: /tvg-id="[^"]*\.(?:cn|hk|mo|tw)(?:@|")/i,
    },
    {
      id: "mainland",
      name: "中国大陆频道",
      description: "筛选 tvg-id 为 .cn 的频道，包含央视、卫视、地方台等。",
      match: /tvg-id="[^"]*\.cn(?:@|")/i,
    },
    {
      id: "hongkong",
      name: "香港频道",
      description: "筛选 tvg-id 为 .hk 的频道，包含 RTHK、HOY、TVB 等。",
      match: /tvg-id="[^"]*\.hk(?:@|")/i,
    },
    {
      id: "macau",
      name: "澳门频道",
      description: "筛选 tvg-id 为 .mo 的频道，包含 TDM、澳门、澳門相关频道。",
      match: /tvg-id="[^"]*\.mo(?:@|")/i,
    },
    {
      id: "taiwan",
      name: "台湾频道",
      description: "筛选 tvg-id 为 .tw 的频道，包含民视、华视、TVBS、三立、东森等。",
      match: /tvg-id="[^"]*\.tw(?:@|")/i,
    },
    {
      id: "cctv",
      name: "CCTV",
      description: "只保留 CCTV 频道。",
      match: /CCTV/i,
    },
    {
      id: "cgtn",
      name: "CGTN",
      description: "只保留 CGTN 频道。",
      match: /CGTN/i,
    },
    {
      id: "all",
      name: "完整 IPTV.org",
      description: "返回 IPTV.org index.m3u 完整源。",
      match: null,
    },
  ],
};

const SOURCE_MAP = new Map(CONFIG.sources.map((source) => [source.id, source]));
const HOME_HTML_GZIP_BASE64 = "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";
let homeHtmlPromise;

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

  if (request.method === "OPTIONS") {
    return createOptionsResponse(request);
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse(
      request,
      { ok: false, error: "Method Not Allowed" },
      405,
    );
  }

  if (pathname === "/") {
    return htmlResponse(request, await renderHomePage(request));
  }

  if (pathname === "/sources") {
    return jsonResponse(request, {
      ok: true,
      homepage: getPublicBaseUrl(request),
      sources: getPublicSources(request),
    });
  }

  const sourceId = getSourceIdFromPath(pathname);
  const source = SOURCE_MAP.get(sourceId);

  if (!source) {
    return jsonResponse(
      request,
      {
        ok: false,
        error: "Unknown source",
        available_sources: CONFIG.sources.map((item) => item.id),
      },
      404,
    );
  }

  return proxyPlaylist(request, source);
}

async function proxyPlaylist(request, source) {
  try {
    const upstream = await fetch(CONFIG.defaultUpstreamUrl, {
      method: "GET",
      headers: {
        "User-Agent": CONFIG.userAgent,
        Accept: "audio/x-mpegurl, application/vnd.apple.mpegurl, text/plain;q=0.9, */*;q=0.8",
      },
      cf: {
        cacheTtl: CONFIG.playlistCacheTtlSeconds,
        cacheEverything: true,
      },
    });

    if (!upstream.ok) {
      return playlistErrorResponse(
        request,
        `Source fetch failed: ${upstream.status}`,
        502,
        source.id,
      );
    }

    const text = await upstream.text();
    const playlist = filterPlaylist(text, source);
    const headers = new Headers({
      "Content-Type": "audio/x-mpegurl; charset=UTF-8",
      "Cache-Control": `public, max-age=${CONFIG.playlistCacheTtlSeconds}`,
      "X-IPTV-Source": source.id,
    });

    applyCors(headers, request);

    return new Response(playlist, {
      status: 200,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return playlistErrorResponse(request, `Fetch IPTV failed: ${message}`, 502, source.id);
  }
}

function filterPlaylist(text, source) {
  if (!source.match) {
    return ensurePlaylistHeader(text);
  }

  const lines = text.split(/\r?\n/);
  const out = ["#EXTM3U"];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();

    if (!line.startsWith("#EXTINF")) {
      continue;
    }

    const block = [line];
    let searchable = line;
    let j = i + 1;

    for (; j < lines.length; j += 1) {
      const next = lines[j].trim();

      if (!next) {
        continue;
      }

      block.push(next);
      searchable += `\n${next}`;

      if (!next.startsWith("#")) {
        break;
      }
    }

    if (source.match.test(searchable) && block.some((item) => !item.startsWith("#"))) {
      out.push(...block);
    }

    i = j;
  }

  if (out.length === 1) {
    out.push(`# No channels matched: ${source.id}`);
  }

  return out.join("\n");
}

function ensurePlaylistHeader(text) {
  const trimmed = text.trim();

  if (trimmed.startsWith("#EXTM3U")) {
    return trimmed;
  }

  return `#EXTM3U\n${trimmed}`;
}

function getSourceIdFromPath(pathname) {
  const raw = decodeURIComponent(pathname.replace(/^\/+/, ""));
  return raw.replace(/\.(m3u8?|txt)$/i, "").toLowerCase();
}

function normalizePath(pathname) {
  return pathname.replace(/\/+$/, "") || "/";
}

function getPublicBaseUrl(request) {
  const url = new URL(request.url);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

function getPublicSources(request) {
  const baseUrl = getPublicBaseUrl(request);

  return CONFIG.sources.map((source) => ({
    id: source.id,
    name: source.name,
    description: source.description,
    playlist_path: `/${source.id}`,
    playlist_url: `${baseUrl}/${source.id}`,
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
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
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
// 响应工具
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

function playlistErrorResponse(request, message, status, sourceId) {
  const headers = new Headers({
    "Content-Type": "audio/x-mpegurl; charset=UTF-8",
    "Cache-Control": "no-store",
    "X-IPTV-Source": sourceId,
  });

  applyCors(headers, request);

  return new Response(`#EXTM3U\n# ${message}`, {
    status,
    headers,
  });
}

// =========================
// HTML 首页
// =========================

async function decodeHomeHtml() {
  const binary = atob(HOME_HTML_GZIP_BASE64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function getHomeHtml() {
  if (!homeHtmlPromise) {
    homeHtmlPromise = decodeHomeHtml();
  }

  return homeHtmlPromise;
}

async function renderHomePage(request) {
  const baseUrl = getPublicBaseUrl(request);
  const sources = getPublicSources(request)
    .map((source) => {
      return `
        <li class="source">
          <a href="${escapeHtml(source.playlist_path)}">
            <span>
              <strong>${escapeHtml(source.name)}</strong>
              <small>${escapeHtml(source.description)}</small>
            </span>
            <code>${escapeHtml(source.playlist_path)}</code>
          </a>
        </li>`;
    })
    .join("");

  return (await getHomeHtml())
    .replace("__HOST__", escapeHtml(CONFIG.homepageHost))
    .replace("__BASE_URL__", escapeHtml(baseUrl))
    .replace("__SOURCE_ITEMS__", sources);
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
