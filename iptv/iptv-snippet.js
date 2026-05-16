// =========================
// 配置区
// =========================

const CONFIG = {
  homepageHost: "iptv.ssr.ddns-ip.net",
  defaultUpstreamUrl: "https://iptv-org.github.io/iptv/index.m3u",
  userAgent: "Mozilla/5.0 IPTVSnippet/1.0",
  playlistCacheTtlSeconds: 3600,
  homepageCacheTtlSeconds: 600,
  searchResultLimit: 100,
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

  const sourceJsonId = getSourceJsonIdFromPath(pathname);
  if (sourceJsonId) {
    const source = SOURCE_MAP.get(sourceJsonId);

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

    return sourceJsonResponse(request, source);
  }

  if (pathname === "/search.json") {
    return searchPlaylist(request, "json");
  }

  if (pathname === "/search.m3u" || pathname === "/search") {
    return searchPlaylist(request, "m3u");
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
    const text = await fetchUpstreamPlaylist();
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

async function searchPlaylist(request, format) {
  const url = new URL(request.url);
  const query = parseSearchQuery(url.searchParams);

  if (!query.hasTerms) {
    if (format === "json") {
      return jsonResponse(request, {
        ok: false,
        error: "Missing search query",
        example: "/search.json?q=cctv1",
      }, 400);
    }

    return playlistErrorResponse(request, "Missing search query. Example: /search.m3u?q=cctv1", 400, "search");
  }

  try {
    const text = await fetchUpstreamPlaylist();
    const channels = parsePlaylist(text);
    const matches = channels.filter((channel) => matchesSearch(channel, query));

    if (format === "json") {
      return jsonResponse(request, {
        ok: true,
        query: query.raw,
        count: matches.length,
        playlist_url: getSearchPlaylistUrl(request, query.raw),
        results: matches.slice(0, CONFIG.searchResultLimit).map(formatSearchResult),
      });
    }

    const headers = new Headers({
      "Content-Type": "audio/x-mpegurl; charset=UTF-8",
      "Cache-Control": `public, max-age=${CONFIG.playlistCacheTtlSeconds}`,
      "X-IPTV-Source": "search",
    });

    applyCors(headers, request);

    return new Response(formatPlaylist(matches, `No channels matched: ${query.raw}`), {
      status: 200,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (format === "json") {
      return jsonResponse(request, { ok: false, error: `Fetch IPTV failed: ${message}` }, 502);
    }

    return playlistErrorResponse(request, `Fetch IPTV failed: ${message}`, 502, "search");
  }
}

async function sourceJsonResponse(request, source) {
  try {
    const text = await fetchUpstreamPlaylist();
    const channels = parsePlaylist(text);
    const matches = channels.filter((channel) => matchesSource(channel, source));

    return jsonResponse(request, {
      ok: true,
      source: getPublicSource(request, source),
      count: matches.length,
      results: matches.slice(0, CONFIG.searchResultLimit).map(formatSearchResult),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(request, { ok: false, error: `Fetch IPTV failed: ${message}` }, 502);
  }
}

async function fetchUpstreamPlaylist() {
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
    throw new Error(`Source fetch failed: ${upstream.status}`);
  }

  return upstream.text();
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

function matchesSource(channel, source) {
  return !source.match || source.match.test(channel.searchable);
}

function parsePlaylist(text) {
  const lines = text.split(/\r?\n/);
  const channels = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();

    if (!line.startsWith("#EXTINF")) {
      continue;
    }

    const block = [line];
    let searchable = line;
    let streamUrl = "";
    let j = i + 1;

    for (; j < lines.length; j += 1) {
      const next = lines[j].trim();

      if (!next) {
        continue;
      }

      block.push(next);
      searchable += `\n${next}`;

      if (!next.startsWith("#")) {
        streamUrl = next;
        break;
      }
    }

    if (streamUrl) {
      const attrs = parseExtinfAttributes(line);
      const name = parseChannelName(line);
      const country = parseCountry(attrs["tvg-id"]);

      channels.push({
        block,
        searchable,
        name,
        tvgId: attrs["tvg-id"] || "",
        tvgName: attrs["tvg-name"] || "",
        groupTitle: attrs["group-title"] || "",
        logo: attrs["tvg-logo"] || "",
        url: streamUrl,
        country,
      });
    }

    i = j;
  }

  return channels;
}

function parseExtinfAttributes(line) {
  const attrs = {};
  const pattern = /([\w-]+)="([^"]*)"/g;
  let match;

  while ((match = pattern.exec(line))) {
    attrs[match[1].toLowerCase()] = match[2];
  }

  return attrs;
}

function parseChannelName(line) {
  const comma = line.lastIndexOf(",");
  return comma >= 0 ? line.slice(comma + 1).trim() : "";
}

function parseCountry(tvgId) {
  const match = String(tvgId || "").match(/\.([a-z]{2})(?:@|$)/i);
  return match ? match[1].toLowerCase() : "";
}

function parseSearchQuery(searchParams) {
  const rawInput = (searchParams.get("q") || "").trim();
  const fields = [];

  for (const key of ["name", "tvg", "country", "group", "url", "logo"]) {
    const value = (searchParams.get(key) || "").trim();

    if (value) {
      fields.push({ key, value });
    }
  }

  const parts = tokenizeQuery(rawInput);
  const terms = [];

  for (const part of parts) {
    const field = parseQueryField(part);

    if (field) {
      fields.push(field);
    } else {
      terms.push(part);
    }
  }

  return {
    raw: rawInput || fields.map((field) => `${field.key}:${field.value}`).join(" "),
    terms,
    fields,
    hasTerms: Boolean(rawInput || fields.length),
  };
}

function tokenizeQuery(query) {
  const tokens = [];
  const pattern = /"([^"]+)"|'([^']+)'|(\S+)/g;
  let match;

  while ((match = pattern.exec(query))) {
    tokens.push(match[1] || match[2] || match[3]);
  }

  return tokens;
}

function parseQueryField(token) {
  const match = token.match(/^([a-z_-]+):(.+)$/i);

  if (!match) {
    return null;
  }

  return {
    key: match[1].toLowerCase(),
    value: match[2].replace(/^["']|["']$/g, ""),
  };
}

function matchesSearch(channel, query) {
  return query.fields.every((field) => matchesField(channel, field))
    && query.terms.every((term) => includesText(channel.searchable, term));
}

function matchesField(channel, field) {
  const value = field.value.toLowerCase();

  if (!value) {
    return true;
  }

  switch (field.key) {
    case "country":
      return channel.country === value;
    case "name":
      return includesText(`${channel.name}\n${channel.tvgName}`, value);
    case "tvg":
    case "tvg-id":
      return includesText(channel.tvgId, value);
    case "group":
    case "group-title":
      return includesText(channel.groupTitle, value);
    case "url":
      return includesText(channel.url, value);
    case "logo":
      return includesText(channel.logo, value);
    default:
      return includesText(channel.searchable, `${field.key}:${field.value}`);
  }
}

function includesText(text, needle) {
  return String(text || "").toLowerCase().includes(String(needle || "").toLowerCase());
}

function formatPlaylist(channels, emptyMessage) {
  const out = ["#EXTM3U"];

  for (const channel of channels) {
    out.push(...channel.block);
  }

  if (out.length === 1) {
    out.push(`# ${emptyMessage}`);
  }

  return out.join("\n");
}

function formatSearchResult(channel) {
  return {
    name: channel.name,
    tvg_id: channel.tvgId,
    tvg_name: channel.tvgName,
    group_title: channel.groupTitle,
    logo: channel.logo,
    url: channel.url,
  };
}

function getSearchPlaylistUrl(request, query) {
  const url = new URL(request.url);
  url.pathname = "/search.m3u";
  url.search = `?q=${encodeURIComponent(query)}`;
  url.hash = "";
  return url.href;
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

function getSourceJsonIdFromPath(pathname) {
  const match = pathname.match(/^\/sources\/([^/]+)\.json$/i);
  return match ? decodeURIComponent(match[1]).toLowerCase() : "";
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
  return CONFIG.sources.map((source) => getPublicSource(request, source));
}

function getPublicSource(request, source) {
  const baseUrl = getPublicBaseUrl(request);

  return {
    id: source.id,
    name: source.name,
    description: source.description,
    playlist_path: `/${source.id}`,
    playlist_url: `${baseUrl}/${source.id}`,
    json_path: `/sources/${source.id}.json`,
    json_url: `${baseUrl}/sources/${source.id}.json`,
  };
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
          <a href="${escapeHtml(source.playlist_path)}" data-source="${escapeHtml(source.id)}" data-json="${escapeHtml(source.json_path)}" data-playlist="${escapeHtml(source.playlist_path)}" data-name="${escapeHtml(source.name)}">
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
