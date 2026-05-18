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
      description: "中国大陆、香港、澳门、台湾频道。",
      match: /tvg-id="[^"]*\.(?:cn|hk|mo|tw)(?:@|")/i,
    },
    {
      id: "mainland",
      name: "中国大陆频道",
      description: "央视、卫视、地方台等。",
      match: /tvg-id="[^"]*\.cn(?:@|")/i,
    },
    {
      id: "hongkong",
      name: "香港频道",
      description: "RTHK、HOY、TVB 等。",
      match: /tvg-id="[^"]*\.hk(?:@|")/i,
    },
    {
      id: "macau",
      name: "澳门频道",
      description: "TDM、澳门、澳門相关频道。",
      match: /tvg-id="[^"]*\.mo(?:@|")/i,
    },
    {
      id: "taiwan",
      name: "台湾频道",
      description: "民视、华视、TVBS、三立、东森等。",
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
          <button class="icon-button source-copy" type="button" data-copy-subscription="${escapeHtml(source.playlist_path)}" title="复制在线订阅定制" aria-label="复制${escapeHtml(source.name)}在线订阅定制">&#10697;</button>
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
