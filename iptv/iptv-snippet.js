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
