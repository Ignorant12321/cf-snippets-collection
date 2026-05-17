const CONFIG = {
  proxycheckEndpoint: "https://proxycheck.io/v3/",
  // Cloudflare Snippets do not expose this source to visitors, but dashboard/API editors can still read it.
  proxycheckApiKeys: [],
  riskCacheSeconds: 600,
  htmlCacheSeconds: 300,
  maxTargetLength: 253,
};

const SAFE_HEADER_NAMES = [
  "accept",
  "accept-language",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "host",
  "user-agent",
  "x-forwarded-proto",
  "x-real-ip",
];

const proxycheckKeyCursors = new Map();

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};

export async function handleRequest(request, env = {}, ctx = {}, deps = {}) {
  const url = new URL(request.url);
  const pathname = normalizePath(url.pathname);

  if (request.method === "OPTIONS") {
    return optionsResponse(request);
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse({ ok: false, error: "Method Not Allowed" }, 405, request);
  }

  if (pathname === "/" || pathname.startsWith("/ip/")) {
    return htmlResponse(renderHomePage(), request);
  }

  if (pathname === "/api/me") {
    const target = getClientIp(request);
    const result = await inspectTarget(target, request, env, deps);
    return jsonResponse(result, result.ok ? 200 : 502, request);
  }

  if (pathname === "/api/lookup") {
    const rawTarget = url.searchParams.get("target") || "";
    const target = sanitizeTarget(rawTarget);

    if (!target) {
      return jsonResponse({
        ok: false,
        error: "Invalid target",
        message: "请输入 IP 地址或纯域名，不要包含协议、路径或端口。",
      }, 400, request);
    }

    const result = await inspectTarget(target, request, env, deps);
    return jsonResponse(result, result.ok ? 200 : 502, request);
  }

  return jsonResponse({ ok: false, error: "Not Found" }, 404, request);
}

async function inspectTarget(target, request, env, deps) {
  const fetcher = deps.fetch || fetch;
  const now = new Date().toISOString();
  const resolved = await resolveLookupTarget(target, fetcher);
  const lookupIp = resolved.ip || target;
  const network = buildNetworkInfo(request, lookupIp, resolved);
  const cloudflare = buildCloudflareInfo(request);
  const headers = collectHeaders(request.headers);

  const risk = await lookupRiskIntel(lookupIp, env, fetcher);

  return {
    ok: true,
    checkedAt: now,
    query: {
      target,
      lookupIp,
      inputType: resolved.inputType,
      resolvedIps: resolved.resolvedIps,
    },
    network,
    cloudflare,
    risk,
    request: {
      userAgent: request.headers.get("user-agent") || null,
      acceptLanguage: request.headers.get("accept-language") || null,
      headers,
    },
  };
}

function buildNetworkInfo(request, ip, resolved) {
  const cf = request.cf || {};

  return {
    ip,
    version: getIpVersion(ip),
    location: {
      country: cf.country || request.headers.get("cf-ipcountry") || null,
      region: cf.region || null,
      city: cf.city || null,
      timezone: cf.timezone || null,
      latitude: numberOrNull(cf.latitude),
      longitude: numberOrNull(cf.longitude),
    },
    asn: {
      number: cf.asn || null,
      organization: cf.asOrganization || null,
    },
    resolved,
  };
}

function buildCloudflareInfo(request) {
  const cf = request.cf || {};
  const ray = request.headers.get("cf-ray") || null;

  return {
    colo: cf.colo || parseColoFromRay(ray),
    ray,
    httpProtocol: cf.httpProtocol || null,
    tlsVersion: cf.tlsVersion || null,
    tlsCipher: cf.tlsCipher || null,
    visitorScheme: parseCfVisitor(request.headers.get("cf-visitor")),
  };
}

async function lookupRiskIntel(targetIp, env, fetcher) {
  if (!targetIp || !isIpAddress(targetIp)) {
    return {
      status: "skipped",
      message: "风控查询需要先解析到有效 IP。",
    };
  }

  try {
    const url = buildProxycheckUrl(targetIp, env);
    const response = await fetcher(url.href, {
      headers: {
        accept: "application/json",
        "user-agent": "CF-Snippets-IP-Check/1.0",
      },
      cf: {
        cacheTtl: CONFIG.riskCacheSeconds,
        cacheEverything: true,
      },
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      return {
        status: "error",
        message: "风控接口返回了无法解析的 JSON。",
        httpStatus: response.status,
      };
    }

    const intel = normalizeRiskIntel(payload, targetIp);
    intel.httpStatus = response.status;
    return intel;
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Risk lookup failed",
    };
  }
}

export function buildProxycheckUrl(target, env = {}, config = CONFIG) {
  const url = new URL(config.proxycheckEndpoint + encodeURIComponent(target));
  const key = selectProxycheckKey(env, config);

  url.searchParams.set("risk", "1");
  url.searchParams.set("vpn", "3");
  url.searchParams.set("asn", "1");
  url.searchParams.set("node", "1");
  url.searchParams.set("days", "7");
  url.searchParams.set("tag", "0");

  if (key) {
    url.searchParams.set("key", key);
  }

  return url;
}

function selectProxycheckKey(env = {}, config = CONFIG) {
  const keys = getProxycheckKeys(env, config);

  if (keys.length === 0) {
    return "";
  }

  if (keys.length === 1) {
    return keys[0];
  }

  const poolId = keys.join("\n");
  const cursor = proxycheckKeyCursors.get(poolId) || 0;
  proxycheckKeyCursors.set(poolId, (cursor + 1) % keys.length);

  return keys[cursor];
}

function getProxycheckKeys(env = {}, config = CONFIG) {
  const multi = firstDefined(env.PROXYCHECK_API_KEYS, env.PROXYCHECK_KEYS);
  const single = firstDefined(env.PROXYCHECK_API_KEY, env.PROXYCHECK_KEY);
  const snippetKeys = Array.isArray(config.proxycheckApiKeys) ? config.proxycheckApiKeys.join("\n") : config.proxycheckApiKeys;
  const raw = multi || single || snippetKeys || "";

  return String(raw)
    .split(/[\s,;]+/)
    .map((key) => key.trim())
    .filter(Boolean);
}

export function normalizeRiskIntel(payload, target) {
  if (!payload || typeof payload !== "object") {
    return { status: "error", message: "Empty risk response" };
  }

  const status = payload.status || "unknown";
  const entry = findRiskEntry(payload, target);

  if (!entry || typeof entry !== "object") {
    return {
      status,
      message: payload.message || payload.error || "No risk data for this IP",
      rawStatus: status,
    };
  }

  const network = entry.network && typeof entry.network === "object" ? entry.network : entry;
  const detections = entry.detections && typeof entry.detections === "object" ? entry.detections : entry;
  const location = entry.location && typeof entry.location === "object" ? entry.location : entry;
  const deviceEstimate = entry.device_estimate || entry.deviceEstimate || entry["device estimate"] || {};
  const attackHistory = entry.attack_history || entry.attackHistory || entry["attack history"] || null;
  const riskScore = clampNumber(
    firstDefined(entry.risk, entry.risk_score, entry.riskScore, detections.risk, detections.risk_score),
    0,
    100,
  );
  const confidence = clampNumber(
    firstDefined(detections.confidence, entry.confidence),
    0,
    100,
  );
  const proxy = booleanish(firstDefined(detections.proxy, entry.proxy));
  const vpn = booleanish(firstDefined(detections.vpn, entry.vpn));
  const tor = booleanish(firstDefined(detections.tor, detections.TOR, entry.tor));
  const hosting = booleanish(firstDefined(detections.hosting, entry.hosting));
  const compromised = booleanish(firstDefined(detections.compromised, entry.compromised));
  const scraper = booleanish(firstDefined(detections.scraper, entry.scraper));
  const anonymous = booleanish(firstDefined(detections.anonymous, entry.anonymous, proxy || vpn || tor));
  const type = firstDefined(network.type, entry.type, detections.type);

  return {
    status,
    riskScore,
    riskLevel: getRiskLevel(riskScore),
    confidence,
    proxy,
    vpn,
    tor,
    hosting,
    compromised,
    scraper,
    anonymous,
    type: type || null,
    provider: firstDefined(network.provider, entry.provider) || null,
    organisation: firstDefined(network.organisation, network.organization, entry.organisation, entry.organization) || null,
    asn: firstDefined(network.asn, entry.asn) || null,
    range: network.range || null,
    hostname: network.hostname || entry.hostname || null,
    continent: firstDefined(location.continent_name, location.continentName, entry.continent_name, entry.continent) || null,
    continentCode: firstDefined(location.continent_code, location.continentCode, entry.continent_code) || null,
    country: firstDefined(location.country_name, location.country, entry.country_name, entry.country) || null,
    countryCode: firstDefined(location.country_code, location.countryCode, entry.country_code) || null,
    region: firstDefined(location.region_name, location.region, entry.region_name, entry.region) || null,
    regionCode: firstDefined(location.region_code, location.regionCode, entry.region_code) || null,
    city: firstDefined(location.city_name, location.city, entry.city_name, entry.city) || null,
    postalCode: firstDefined(location.postal_code, location.postalCode, entry.postal_code) || null,
    latitude: numberOrNull(firstDefined(location.latitude, entry.latitude)),
    longitude: numberOrNull(firstDefined(location.longitude, entry.longitude)),
    timezone: firstDefined(location.timezone, entry.timezone) || null,
    currencyCode: firstDefined(location.currency?.code, entry.currency?.code) || null,
    currencyName: firstDefined(location.currency?.name, entry.currency?.name) || null,
    sharedEstimate: getSharedEstimate(deviceEstimate),
    deviceEstimate: normalizeDeviceEstimate(deviceEstimate),
    attackHistory: normalizeAttackHistory(attackHistory),
    detectionHistory: normalizeDetectionHistory(entry.detection_history || entry.detectionHistory),
    operator: normalizeOperator(entry.operator),
    lastSeen: firstDefined(detections.last_seen, entry.last_seen, entry["last seen human"]) || null,
    firstSeen: firstDefined(detections.first_seen, entry.first_seen) || null,
    lastUpdated: firstDefined(entry.last_updated, payload.last_updated) || null,
    queryTime: payload["query time"] || payload.query_time || null,
    source: "proxycheck.io",
  };
}

function findRiskEntry(payload, target) {
  if (payload[target]) {
    return payload[target];
  }

  if (payload.ip && payload[payload.ip]) {
    return payload[payload.ip];
  }

  const keys = Object.keys(payload);
  return payload[keys.find((key) => isIpAddress(key) || key.includes("@"))] || null;
}

function normalizeDeviceEstimate(value) {
  if (!value || typeof value !== "object") {
    return {
      addressCount: value || null,
      subnetCount: null,
    };
  }

  return {
    addressCount: firstDefined(value.address_count, value.addressCount, value.ip, value.address, value.count),
    subnetCount: firstDefined(value.subnet_count, value.subnetCount, value.subnet),
  };
}

function getSharedEstimate(value) {
  if (!value) {
    return null;
  }

  if (typeof value !== "object") {
    return String(value);
  }

  const addressCount = firstDefined(value.address_count, value.addressCount, value.ip, value.address, value.count);
  const subnetCount = firstDefined(value.subnet_count, value.subnetCount, value.subnet);

  if (addressCount && subnetCount) {
    return `地址 ${addressCount} / 子网 ${subnetCount}`;
  }

  if (addressCount) {
    return String(addressCount);
  }

  if (subnetCount) {
    return `子网 ${subnetCount}`;
  }

  return null;
}

function normalizeAttackHistory(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value !== "object") {
    return String(value);
  }

  const total = Object.values(value).reduce((sum, item) => {
    const number = Number(item);
    return Number.isFinite(number) ? sum + number : sum;
  }, 0);

  return {
    total,
    items: value,
  };
}

function normalizeOperator(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    name: value.name || null,
    url: value.url || null,
    anonymity: value.anonymity || null,
    popularity: value.popularity || null,
    services: Array.isArray(value.services) ? value.services : [],
  };
}

async function resolveLookupTarget(target, fetcher) {
  const inputType = isIpAddress(target) ? getIpVersion(target) : "domain";
  const base = {
    input: target,
    inputType,
    ip: isIpAddress(target) ? target : null,
    resolvedIps: isIpAddress(target) ? [target] : [],
  };

  if (base.ip) {
    return base;
  }

  try {
    const records = await resolveDomainWithDoh(target, fetcher);
    return {
      ...base,
      ip: records[0] || null,
      resolvedIps: records,
    };
  } catch (error) {
    return {
      ...base,
      resolveError: error instanceof Error ? error.message : "DNS resolve failed",
    };
  }
}

async function resolveDomainWithDoh(domain, fetcher) {
  const records = [];

  for (const type of ["A", "AAAA"]) {
    const url = new URL("https://cloudflare-dns.com/dns-query");
    url.searchParams.set("name", domain);
    url.searchParams.set("type", type);

    const response = await fetcher(url.href, {
      headers: { accept: "application/dns-json" },
      cf: { cacheTtl: 300, cacheEverything: true },
    });

    if (!response.ok) {
      continue;
    }

    const payload = await response.json();
    for (const answer of payload.Answer || []) {
      if (answer && typeof answer.data === "string" && isIpAddress(answer.data)) {
        records.push(answer.data);
      }
    }
  }

  return [...new Set(records)];
}

function sanitizeTarget(value) {
  const target = String(value || "").trim();

  if (!target || target.length > CONFIG.maxTargetLength) {
    return null;
  }

  if (/[:/\\?#@]/.test(target.replace(/^\[[0-9a-f:.]+\]$/i, "")) && !isIpAddress(target)) {
    return null;
  }

  const unwrapped = target.startsWith("[") && target.endsWith("]") ? target.slice(1, -1) : target;

  if (isIpAddress(unwrapped)) {
    return unwrapped;
  }

  if (!/^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(unwrapped)) {
    return null;
  }

  return unwrapped.toLowerCase();
}

function getClientIp(request) {
  return request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "0.0.0.0";
}

function collectHeaders(headers) {
  const output = {};

  for (const name of SAFE_HEADER_NAMES) {
    const value = headers.get(name);
    if (value) {
      output[name] = value;
    }
  }

  return output;
}

function isIpAddress(value) {
  return getIpVersion(value) !== "unknown";
}

function getIpVersion(value) {
  const input = String(value || "").trim();

  if (/^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(input)) {
    return "IPv4";
  }

  if (/^(?=.*:)[0-9a-f:.]+$/i.test(input) && input.includes(":")) {
    return "IPv6";
  }

  return "unknown";
}

function getRiskLevel(score) {
  if (score === null) {
    return "unknown";
  }

  if (score <= 25) {
    return "low";
  }

  if (score <= 50) {
    return "medium";
  }

  if (score <= 75) {
    return "high";
  }

  return "critical";
}

function booleanish(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return ["yes", "true", "1"].includes(value.toLowerCase());
  }

  return Boolean(value);
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  return Math.min(max, Math.max(min, number));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function parseColoFromRay(ray) {
  if (!ray || !ray.includes("-")) {
    return null;
  }

  return ray.split("-").pop() || null;
}

function parseCfVisitor(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value).scheme || null;
  } catch (error) {
    return null;
  }
}

function normalizePath(pathname) {
  const path = pathname.replace(/\/{2,}/g, "/");
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function jsonResponse(data, status = 200, request = null) {
  const headers = new Headers({
    "content-type": "application/json; charset=UTF-8",
    "cache-control": "no-store",
  });

  applyCors(headers, request);

  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers,
  });
}

function htmlResponse(html, request) {
  const headers = new Headers({
    "content-type": "text/html; charset=UTF-8",
    "cache-control": `public, max-age=${CONFIG.htmlCacheSeconds}`,
  });

  applyCors(headers, request);

  return new Response(html, { status: 200, headers });
}

function optionsResponse(request) {
  const headers = new Headers({
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  });

  applyCors(headers, request);

  return new Response(null, { status: 204, headers });
}

function applyCors(headers, request) {
  const origin = request?.headers?.get("origin") || "*";
  headers.set("access-control-allow-origin", origin);
  headers.set("vary", "Origin");
}

const HOME_HTML = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>IP 检测</title>
  <link rel="icon" href='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="%2355d6c2"/><text x="32" y="40" text-anchor="middle" font-family="Arial" font-size="24" font-weight="900" fill="%23061413">IP</text></svg>'>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b1115;
      --panel: #111b22;
      --panel-2: #16232b;
      --ink: #eef7f6;
      --muted: #8ea1a8;
      --line: rgba(210, 235, 231, .14);
      --cyan: #55d6c2;
      --gold: #e7c766;
      --coral: #e46f5c;
      --green: #74d384;
      --shadow: rgba(0, 0, 0, .32);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Aptos", "Segoe UI", "Microsoft YaHei", sans-serif;
      color: var(--ink);
      background:
        linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px),
        linear-gradient(rgba(255,255,255,.028) 1px, transparent 1px),
        linear-gradient(135deg, #081015, #111820 48%, #161a20);
      background-size: 36px 36px, 36px 36px, auto;
      overflow-x: hidden;
    }

    button,
    input {
      font: inherit;
    }

    .shell {
      width: min(1240px, calc(100% - 32px));
      min-height: 100vh;
      margin: 0 auto;
      padding: 20px 0 24px;
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 14px;
    }

    .topbar,
    .panel {
      border: 1px solid var(--line);
      background: linear-gradient(155deg, rgba(18, 30, 38, .96), rgba(14, 21, 27, .94));
      box-shadow: 0 18px 50px var(--shadow), inset 0 1px 0 rgba(255,255,255,.04);
    }

    .topbar {
      min-height: 66px;
      border-radius: 8px;
      padding: 10px 12px;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 12px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .badge {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      color: #061413;
      background: var(--cyan);
      font-weight: 900;
      flex: 0 0 auto;
    }

    h1,
    h2,
    p {
      margin: 0;
      letter-spacing: 0;
    }

    h1 {
      font-size: 22px;
      line-height: 1.1;
    }

    .subtitle {
      margin-top: 4px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.35;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }

    .chip,
    .icon-button {
      min-height: 38px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 8px;
      color: var(--ink);
      background: rgba(255,255,255,.06);
      cursor: pointer;
      transition: border-color .16s ease, background .16s ease, transform .16s ease;
    }

    .chip {
      padding: 0 12px;
      white-space: nowrap;
    }

    .chip:hover,
    .icon-button:hover {
      border-color: rgba(85, 214, 194, .55);
      background: rgba(85, 214, 194, .12);
      transform: translateY(-1px);
    }

    .dashboard {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(360px, .86fr);
      gap: 14px;
      align-content: start;
    }

    .main-stack,
    .side-stack {
      display: grid;
      gap: 14px;
      min-width: 0;
    }

    .side-stack {
      align-content: start;
      align-items: start;
    }

    .panel {
      border-radius: 8px;
      padding: 18px;
      min-width: 0;
    }

    .query-panel {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
      align-items: stretch;
    }

    .label {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .08em;
    }

    .ip-row {
      min-height: 66px;
      margin-top: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .ip-value {
      font-family: "Cascadia Mono", "SFMono-Regular", Consolas, monospace;
      font-size: clamp(30px, 5vw, 58px);
      line-height: 1.04;
      word-break: break-word;
    }

    .edit-form {
      display: none;
      min-height: 66px;
      margin-top: 10px;
      gap: 8px;
      align-items: center;
    }

    .edit-form.active {
      display: flex;
    }

    .edit-form input {
      flex: 1 1 240px;
      min-width: 0;
      min-height: 44px;
      border: 1px solid rgba(255,255,255,.16);
      border-radius: 8px;
      padding: 0 12px;
      color: var(--ink);
      background: rgba(0,0,0,.22);
      outline: none;
    }

    .edit-form input:focus {
      border-color: rgba(85, 214, 194, .62);
      box-shadow: 0 0 0 3px rgba(85, 214, 194, .12);
    }

    .icon-button {
      width: 38px;
      height: 38px;
      display: inline-grid;
      place-items: center;
      padding: 0;
    }

    .pills {
      margin-top: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
    }

    .pill {
      min-height: 30px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 8px;
      padding: 6px 9px;
      color: var(--muted);
      background: rgba(255,255,255,.045);
      font-size: 13px;
      word-break: break-word;
    }

    .pill.active {
      border-color: rgba(228, 111, 92, .8);
      color: #fff4f1;
      background: rgba(228, 111, 92, .28);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
    }

    .risk-compact {
      display: grid;
      align-content: space-between;
      gap: 12px;
      border-left: 1px solid var(--line);
      padding-left: 16px;
    }

    .risk-line {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 12px;
    }

    .risk-score {
      color: var(--gold);
      font-size: clamp(44px, 6vw, 72px);
      line-height: .9;
      font-weight: 900;
    }

    .risk-meter {
      height: 12px;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--green), var(--gold), var(--coral));
      border: 1px solid rgba(255,255,255,.12);
      position: relative;
      overflow: hidden;
    }

    .risk-pin {
      position: absolute;
      top: -8px;
      left: 0;
      width: 8px;
      height: 30px;
      border: 2px solid #0b1115;
      border-radius: 999px;
      background: #fff;
      transform: translateX(-4px);
      box-shadow: 0 0 0 1px rgba(255,255,255,.9), 0 0 16px rgba(255,255,255,.85);
    }

    .stat {
      min-width: 0;
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 8px;
      background: rgba(255,255,255,.045);
      padding: 13px;
    }

    .stat strong {
      display: block;
      margin-top: 6px;
      font-size: 17px;
      line-height: 1.22;
      word-break: break-word;
    }

    .location-card {
      min-height: 260px;
      position: relative;
      overflow: hidden;
    }

    .location-card.map-loaded::after {
      display: none;
    }

    .location-head {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .location-refresh {
      width: 30px;
      height: 30px;
      min-height: 30px;
      border-radius: 7px;
      font-size: 15px;
    }

    .location-card::after {
      content: "";
      position: absolute;
      inset: auto 18px 18px auto;
      width: 160px;
      height: 84px;
      opacity: .16;
      background:
        radial-gradient(circle at 30% 45%, var(--cyan) 0 4px, transparent 5px),
        linear-gradient(135deg, transparent 48%, rgba(85,214,194,.9) 49% 51%, transparent 52%),
        linear-gradient(45deg, transparent 48%, rgba(85,214,194,.55) 49% 51%, transparent 52%);
      background-size: auto, 28px 28px, 28px 28px;
      border: 1px solid rgba(85,214,194,.25);
      border-radius: 8px;
      pointer-events: none;
    }

    .map-box {
      position: absolute;
      inset: 88px 14px 14px;
      z-index: 1;
      border: 1px solid rgba(85,214,194,.25);
      border-radius: 8px;
      background:
        radial-gradient(circle at 30% 45%, rgba(85,214,194,.9) 0 4px, transparent 5px),
        linear-gradient(135deg, transparent 48%, rgba(85,214,194,.24) 49% 51%, transparent 52%),
        linear-gradient(45deg, transparent 48%, rgba(85,214,194,.16) 49% 51%, transparent 52%);
      background-size: auto, 28px 28px, 28px 28px;
      display: grid;
      place-items: center;
      overflow: hidden;
    }

    .map-box span {
      color: var(--muted);
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 7px;
      background: rgba(8,16,21,.72);
    }

    .map-box iframe {
      width: 100%;
      height: 100%;
      border: 0;
      filter: saturate(.82) contrast(.95);
    }

    .side-compact {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(210px, .72fr);
      gap: 10px;
      align-items: start;
    }

    .side-compact .stat {
      min-height: 58px;
      padding: 8px 10px;
    }

    .side-compact .stat strong {
      margin-top: 4px;
      font-size: 14px;
      line-height: 1.12;
    }

    .risk-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
    }

    .risk-value {
      color: var(--gold);
      font-size: clamp(24px, 3vw, 34px);
      line-height: .9;
      text-align: right;
    }

    .risk-evaluation .risk-meter {
      height: 6px;
      margin-top: 7px;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .row {
      min-width: 0;
      border-bottom: 1px solid rgba(255,255,255,.08);
      padding: 10px 0;
      display: grid;
      grid-template-columns: 88px minmax(0, 1fr);
      gap: 10px;
      align-items: start;
    }

    .row span {
      color: var(--muted);
      font-size: 13px;
    }

    .row strong {
      font-size: 14px;
      line-height: 1.35;
      word-break: break-word;
    }

    .jump-grid {
      margin-top: 10px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .jump-link {
      min-height: 58px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 8px;
      padding: 12px 14px;
      color: var(--ink);
      background: rgba(255,255,255,.045);
      text-decoration: none;
      display: grid;
      align-content: center;
      gap: 4px;
    }

    .jump-link span {
      color: var(--muted);
      font-size: 12px;
    }

    .jump-link:hover {
      border-color: rgba(85, 214, 194, .55);
      background: rgba(85, 214, 194, .1);
    }

    .loading {
      opacity: .68;
    }

    .error {
      color: #ffb4aa;
    }

    @media (max-width: 920px) {
      .shell {
        width: min(100% - 24px, 1240px);
      }

      .topbar,
      .dashboard,
      .query-panel,
      .info-grid {
        grid-template-columns: 1fr;
      }

      .risk-compact {
        border-left: 0;
        border-top: 1px solid var(--line);
        padding-left: 0;
        padding-top: 14px;
      }
    }

    @media (max-width: 560px) {
      .shell {
        width: min(100% - 18px, 1240px);
        padding-top: 10px;
      }

      .topbar,
      .panel {
        padding: 14px;
      }

      .actions,
      .edit-form {
        width: 100%;
      }

      .chip {
        flex: 1 1 auto;
        text-align: center;
      }

      .row {
        grid-template-columns: 1fr;
        gap: 4px;
      }

      .jump-grid,
      .side-compact {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="badge">IP</span>
        <div>
          <h1>IP 检测</h1>
          <p class="subtitle">公网地址、网络归属与 proxycheck.io 风控情报。</p>
        </div>
      </div>
      <div class="actions">
        <button class="chip" type="button" data-action="refresh">刷新</button>
        <button class="chip" type="button" data-action="copy-ip">复制IP</button>
        <button class="chip" type="button" data-action="export-image">图片</button>
        <button class="chip" type="button" data-action="copy-report">Report</button>
      </div>
    </header>

    <section class="dashboard">
      <div class="main-stack">
        <section class="panel query-panel">
          <div>
            <div class="label">查询目标</div>
            <div class="ip-row" id="ipDisplay">
              <p class="ip-value loading" data-field="ip">检测中</p>
              <button class="icon-button" type="button" data-action="edit-target" aria-label="修改查询目标" title="修改查询目标">✎</button>
            </div>
            <form class="edit-form" id="editForm">
              <input id="targetInput" name="target" autocomplete="off" placeholder="输入 IP 或域名">
              <button class="chip" type="submit">查询</button>
              <button class="icon-button" type="button" data-action="cancel-edit" aria-label="取消">×</button>
            </form>
            <div class="pills">
              <span class="pill" data-flag="proxy">Proxy</span>
              <span class="pill" data-flag="vpn">VPN</span>
              <span class="pill" data-flag="tor">Tor</span>
              <span class="pill" data-flag="hosting">Hosting</span>
              <span class="pill" data-flag="scraper">Scraper</span>
              <span class="pill" data-flag="compromised">Compromised</span>
            </div>
          </div>
        </section>

        <section class="panel info-grid">
          <div class="row"><span>IP类型</span><strong data-field="netType">--</strong></div>
          <div class="row"><span>国家/地区</span><strong data-field="countryFull">--</strong></div>
          <div class="row"><span>时区</span><strong data-field="timezone">--</strong></div>
          <div class="row"><span>经纬度</span><strong data-field="coords">--</strong></div>
        </section>

        <section class="panel">
          <div class="label">外部查询</div>
          <div class="jump-grid" data-field="jumpLinks">
            <a class="jump-link" data-jump="ping0" href="https://ping0.cc/ip/" target="_blank" rel="noopener noreferrer">
              Ping0.cc
              <span>ping0.cc/ip/IP</span>
            </a>
            <a class="jump-link" data-jump="ippure" href="https://ippure.com/" target="_blank" rel="noopener noreferrer">
              IPPure
              <span>ippure.com/?ip=IP</span>
            </a>
          </div>
        </section>
      </div>

      <aside class="side-stack">
        <section class="stat location-card">
          <div class="location-head">
            <span class="label">网络位置</span>
            <button class="icon-button location-refresh" type="button" data-action="refresh-location" aria-label="刷新定位" title="刷新定位">↻</button>
          </div>
          <strong data-field="location">--</strong>
          <div class="map-box" data-field="mapViewport"><span>按需加载地图</span></div>
        </section>
        <div class="side-compact">
          <section class="stat">
            <span class="label">ASN/运营商</span>
            <strong data-field="asn">--</strong>
          </section>
          <section class="stat risk-evaluation">
            <div class="risk-top">
              <span class="label">风险评估</span>
              <strong class="risk-value" data-field="riskScore">--</strong>
            </div>
            <div class="risk-meter" data-role="risk-meter">
              <span class="risk-pin" data-field="riskPin"></span>
            </div>
          </section>
        </div>
      </aside>
    </section>
  </main>

    <script>
    const state = { data: null, currentTarget: "", lastEndpoint: "", mapLoaded: false };
    const fields = Object.fromEntries([...document.querySelectorAll("[data-field]")].map((node) => [node.dataset.field, node]));
    const flagPills = Object.fromEntries([...document.querySelectorAll("[data-flag]")].map((node) => [node.dataset.flag, node]));
    const jumpLinks = Object.fromEntries([...document.querySelectorAll("[data-jump]")].map((node) => [node.dataset.jump, node]));
    const locationCard = document.querySelector(".location-card");
    const editForm = document.getElementById("editForm");
    const ipDisplay = document.getElementById("ipDisplay");
    const targetInput = document.getElementById("targetInput");

    const fmt = (value, fallback = "--") => value === null || value === undefined || value === "" ? fallback : value;
    const yesNo = (value) => value ? "是" : "否";

    async function load(target = "") {
      setLoading();
      const endpoint = target ? "/api/lookup?target=" + encodeURIComponent(target) : "/api/me";
      state.lastEndpoint = endpoint;

      try {
        const response = await fetch(endpoint, { headers: { accept: "application/json" } });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.message || data.error || "查询失败");
        state.data = data;
        state.currentTarget = data.query.target;
        render(data);
        if (state.mapLoaded) renderMap(data);
        return data;
      } catch (error) {
        fields.ip.textContent = "查询失败";
        fields.ip.classList.add("error");
        return null;
      }
    }

    function setLoading() {
      fields.ip.textContent = "检测中";
      fields.ip.classList.add("loading");
      fields.ip.classList.remove("error");
      fields.riskScore.textContent = "--";
      fields.riskPin.style.left = "0%";
      updateFlagPills({});
    }

    function render(data) {
      const network = data.network || {};
      const loc = network.location || {};
      const asn = network.asn || {};
      const cf = data.cloudflare || {};
      const risk = data.risk || {};
      const asnLine = [asn.number ? "AS" + asn.number : risk.asn, asn.organization || risk.provider || risk.organisation].filter(Boolean).join(" • ");
      const score = Number.isFinite(risk.riskScore) ? risk.riskScore : null;

      fields.ip.classList.remove("loading", "error");
      fields.ip.textContent = network.ip || data.query.lookupIp || "--";
      fields.location.textContent = toChineseLocation(loc, risk);
      fields.asn.textContent = asnLine || "--";
      fields.netType.textContent = risk.type || network.version || "--";
      fields.countryFull.textContent = getCountryLine(loc, risk);
      fields.timezone.textContent = loc.timezone || risk.timezone || "--";
      fields.coords.textContent = getCoordsLine(loc, risk);
      fields.riskScore.textContent = score === null ? "--" : String(score);
      fields.riskPin.style.left = (score === null ? 0 : score) + "%";
      updateFlagPills(risk);
      updateJumpLinks(network.ip || data.query.lookupIp || state.currentTarget || "");
      targetInput.value = state.currentTarget || "";
    }

    function resetMap() {
      state.mapLoaded = false;
      locationCard.classList.remove("map-loaded");
      fields.mapViewport.replaceChildren();
      const label = document.createElement("span");
      label.textContent = "按需加载地图";
      fields.mapViewport.append(label);
    }

    function renderMap(data = state.data) {
      const network = data?.network || {};
      const loc = network.location || {};
      const risk = data?.risk || {};
      const latitude = loc.latitude ?? risk.latitude;
      const longitude = loc.longitude ?? risk.longitude;
      const lat = Number(latitude);
      const lon = Number(longitude);

      state.mapLoaded = true;
      fields.mapViewport.replaceChildren();

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        const label = document.createElement("span");
        label.textContent = "暂无经纬度";
        fields.mapViewport.append(label);
        return;
      }

      const url = new URL("https://www.openstreetmap.org/export/embed.html");
      const spread = 0.08;
      url.searchParams.set("bbox", [lon - spread, lat - spread, lon + spread, lat + spread].join(","));
      url.searchParams.set("layer", "mapnik");
      url.searchParams.set("marker", [lat, lon].join(","));

      const iframe = document.createElement("iframe");
      iframe.title = "IP 位置地图";
      iframe.loading = "lazy";
      iframe.referrerPolicy = "no-referrer";
      iframe.src = url.href;
      fields.mapViewport.append(iframe);
      locationCard.classList.add("map-loaded");
    }

    function getInitialTarget() {
      const params = new URLSearchParams(window.location.search);
      return getPathTarget() || (params.get("ip") || params.get("target") || "").trim();
    }

    function getPathTarget() {
      const match = window.location.pathname.match(/^\/ip\/(.+)$/);
      return match ? decodeURIComponent(match[1]).trim() : "";
    }

    function getLocationLine(loc, risk) {
      const country = loc.country || risk.country || risk.countryCode;
      const region = loc.region || risk.region;
      const city = loc.city || risk.city;
      return [country, region, city].filter(Boolean).join(" • ") || "--";
    }

    function toChineseLocation(loc, risk) {
      const countryCode = risk.countryCode || loc.country;
      const country = getChineseCountry(countryCode, risk.country || loc.country);
      const region = translateRegion(risk.region || loc.region);
      const city = translateRegion(risk.city || loc.city);
      return [country, region, city].filter(Boolean).join(" • ") || getLocationLine(loc, risk);
    }

    function getChineseCountry(code, fallback) {
      if (code && /^[A-Z]{2}$/i.test(code) && typeof Intl !== "undefined" && Intl.DisplayNames) {
        try {
          return new Intl.DisplayNames(["zh-CN"], { type: "region" }).of(code.toUpperCase()) || fallback;
        } catch (error) {
          return fallback;
        }
      }
      const map = { Japan: "日本", China: "中国", "United States": "美国", Singapore: "新加坡", Germany: "德国" };
      return map[fallback] || fallback;
    }

    function translateRegion(value) {
      const map = { Asia: "亚洲", Tokyo: "东京", Japan: "日本", "Shinagawa (Futaba)": "品川 Futaba" };
      return map[value] || value;
    }

    function getCountryLine(loc, risk) {
      const country = risk.country || loc.country;
      const code = risk.countryCode || loc.country;
      const continent = risk.continent;
      return [country, code && code !== country ? code : "", continent].filter(Boolean).join(" • ") || "--";
    }

    function getCoordsLine(loc, risk) {
      const latitude = loc.latitude ?? risk.latitude;
      const longitude = loc.longitude ?? risk.longitude;
      return latitude && longitude ? latitude + ", " + longitude : "--";
    }

    function getDetectionLine(risk) {
      return ["proxy", "vpn", "tor", "hosting", "scraper", "compromised"]
        .filter((name) => risk[name])
        .map((name) => ({ proxy: "Proxy", vpn: "VPN", tor: "Tor", hosting: "Hosting", scraper: "Scraper", compromised: "Compromised" }[name]))
        .join(" / ");
    }

    function updateFlagPills(risk) {
      for (const [name, node] of Object.entries(flagPills)) {
        const active = Boolean(risk[name]);
        node.classList.toggle("active", active);
      }
    }

    function updateJumpLinks(ip) {
      if (!ip) return;
      jumpLinks.ping0.href = "https://ping0.cc/ip/" + encodeURIComponent(ip);
      jumpLinks.ippure.href = "https://ippure.com/?ip=" + encodeURIComponent(ip);
    }

    function translateRiskLevel(level) {
      return { low: "低", medium: "中", high: "高", critical: "极高", unknown: "未知" }[level] || "--";
    }

    function showEdit(show) {
      editForm.classList.toggle("active", show);
      ipDisplay.style.display = show ? "none" : "flex";
      if (show) targetInput.focus();
    }

    async function copyText(text, label = "已复制") {
      await navigator.clipboard.writeText(text);
      const button = document.querySelector("[data-action='copy-ip']");
      const old = button.textContent;
      button.textContent = label;
      setTimeout(() => button.textContent = old, 1100);
    }

    document.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;

      if (action === "refresh") load(state.currentTarget || "");
      if (action === "refresh-location") load(state.currentTarget || "").then((data) => renderMap(data || state.data));
      if (action === "edit-target") showEdit(true);
      if (action === "cancel-edit") showEdit(false);
      if (action === "copy-ip" && state.data) copyText(state.data.network.ip, "IP已复制");
      if (action === "export-image" && state.data) downloadReportImage();
      if (action === "copy-report" && state.data) {
        copyText([
          "Endpoint: " + state.lastEndpoint,
          "IP: " + state.data.network.ip,
          "Location: " + fields.location.textContent,
          "ASN: " + fields.asn.textContent,
          "Risk: " + fields.riskScore.textContent,
        ].join("\n"), "报告已复制");
      }
    });

    editForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const target = targetInput.value.trim();
      if (!target) return;
      showEdit(false);
      resetMap();
      window.history.pushState(null, "", "/ip/" + encodeURIComponent(target));
      load(target);
    });

    resetMap();
    load(getInitialTarget());

    function downloadReportImage() {
      const width = 1200;
      const height = 720;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#0b1115";
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "rgba(210,235,231,.14)";
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 36) line(ctx, x, 0, x, height);
      for (let y = 0; y < height; y += 36) line(ctx, 0, y, width, y);
      drawPanel(ctx, 34, 34, 1132, 652);
      text(ctx, "IP 检测报告", 72, 92, 32, "#eef7f6", "700");
      text(ctx, state.data.network.ip || "--", 72, 158, 54, "#eef7f6", "700", "monospace");
      text(ctx, "风险分", 820, 114, 18, "#8ea1a8");
      text(ctx, fields.riskScore.textContent, 820, 178, 64, "#e7c766", "800");
      drawMeter(ctx, 820, 210, 250, 16, Number(fields.riskScore.textContent) || 0);
      const rows = [
        ["位置", fields.location.textContent],
        ["ASN", fields.asn.textContent],
        ["类型", fields.netType.textContent],
        ["检测", getDetectionLine(state.data.risk || {}) || "无命中"],
      ];
      rows.forEach(([label, value], index) => {
        const y = 268 + index * 54;
        text(ctx, label, 72, y, 18, "#8ea1a8");
        text(ctx, value || "--", 190, y, 22, "#eef7f6", "600");
      });
      text(ctx, "Generated " + new Date().toISOString(), 72, 642, 15, "#8ea1a8");
      const link = document.createElement("a");
      link.download = "ip-report-" + (state.data.network.ip || "target").replace(/[^a-z0-9.-]/gi, "_") + ".png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    }

    function drawPanel(ctx, x, y, width, height) {
      ctx.fillStyle = "#111b22";
      ctx.strokeStyle = "rgba(210,235,231,.2)";
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, 14);
      ctx.fill();
      ctx.stroke();
    }

    function drawMeter(ctx, x, y, width, height, score) {
      const gradient = ctx.createLinearGradient(x, y, x + width, y);
      gradient.addColorStop(0, "#74d384");
      gradient.addColorStop(.55, "#e7c766");
      gradient.addColorStop(1, "#e46f5c");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, 999);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(x + Math.max(0, Math.min(100, score)) / 100 * width - 2, y - 4, 4, height + 8);
    }

    function line(ctx, x1, y1, x2, y2) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    function text(ctx, value, x, y, size, color, weight = "400", family = "Aptos, Segoe UI, sans-serif") {
      ctx.fillStyle = color;
      ctx.font = weight + " " + size + "px " + family;
      ctx.fillText(String(value || "--"), x, y);
    }
  </script>
</body>
</html>
`;

function renderHomePage() {
  return HOME_HTML;
}

function normalizeDetectionHistory(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    delisted: booleanish(value.delisted),
    delistDatetime: value.delist_datetime || value.delistDatetime || null,
  };
}
