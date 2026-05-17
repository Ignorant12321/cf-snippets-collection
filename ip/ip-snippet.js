const CONFIG = {
  proxycheckEndpoint: "https://proxycheck.io/v3/",
  proxycheckVersion: "20-November-2025",
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

  if (pathname === "/") {
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

export function buildProxycheckUrl(target, env = {}) {
  const url = new URL(CONFIG.proxycheckEndpoint + encodeURIComponent(target));
  const key = env.PROXYCHECK_API_KEY || env.PROXYCHECK_KEY || "";

  url.searchParams.set("risk", "1");
  url.searchParams.set("vpn", "3");
  url.searchParams.set("asn", "1");
  url.searchParams.set("node", "1");
  url.searchParams.set("days", "7");
  url.searchParams.set("tag", "0");
  url.searchParams.set("ver", CONFIG.proxycheckVersion);

  if (key) {
    url.searchParams.set("key", key);
  }

  return url;
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
    anonymous,
    type: type || null,
    provider: firstDefined(network.provider, entry.provider) || null,
    organisation: firstDefined(network.organisation, network.organization, entry.organisation, entry.organization) || null,
    asn: firstDefined(network.asn, entry.asn) || null,
    range: network.range || null,
    hostname: network.hostname || entry.hostname || null,
    country: firstDefined(location.country, entry.country) || null,
    city: firstDefined(location.city, entry.city) || null,
    sharedEstimate: getSharedEstimate(deviceEstimate),
    deviceEstimate: normalizeDeviceEstimate(deviceEstimate),
    attackHistory: normalizeAttackHistory(attackHistory),
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
    return `${addressCount} / subnet ${subnetCount}`;
  }

  if (addressCount) {
    return String(addressCount);
  }

  if (subnetCount) {
    return `subnet ${subnetCount}`;
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

function renderHomePage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>IP 检测</title>
  <style>
    :root {
      color-scheme: dark;
      --ink: #eef8ff;
      --muted: #9fb0c3;
      --line: rgba(218, 237, 255, 0.14);
      --panel: rgba(25, 36, 54, 0.82);
      --panel-strong: rgba(42, 53, 76, 0.9);
      --cyan: #7df0e1;
      --mint: #7be495;
      --gold: #ffd166;
      --coral: #ff6f61;
      --violet: #9d8cff;
      --shadow: rgba(0, 0, 0, 0.38);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: ui-rounded, "Aptos", "Segoe UI", "Microsoft YaHei", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 9% 12%, rgba(125, 240, 225, 0.18), transparent 29rem),
        radial-gradient(circle at 84% 16%, rgba(157, 140, 255, 0.16), transparent 30rem),
        linear-gradient(135deg, #07131a 0%, #161824 46%, #231f35 100%);
      overflow-x: hidden;
    }

    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      background-image:
        linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,.028) 1px, transparent 1px);
      background-size: 44px 44px;
      mask-image: linear-gradient(to bottom, rgba(0,0,0,.6), transparent 80%);
    }

    button,
    input {
      font: inherit;
    }

    .shell {
      width: min(1480px, calc(100% - 40px));
      margin: 0 auto;
      padding: 30px 0 36px;
    }

    .top-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.8fr);
      gap: 22px;
      align-items: stretch;
    }

    .hero,
    .side,
    .panel {
      border: 1px solid var(--line);
      background: linear-gradient(142deg, rgba(29, 48, 61, 0.9), rgba(27, 31, 48, 0.84) 50%, rgba(54, 48, 77, 0.78));
      box-shadow: 0 20px 70px var(--shadow), inset 0 1px 0 rgba(255,255,255,0.05);
      backdrop-filter: blur(18px);
    }

    .hero {
      min-height: 470px;
      border-radius: 30px 30px 8px 30px;
      padding: 36px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      overflow: hidden;
    }

    .hero::after {
      content: "";
      position: absolute;
      inset: auto -8% -38% 38%;
      height: 56%;
      background: linear-gradient(110deg, rgba(125,240,225,.22), rgba(255,111,97,.1), rgba(157,140,255,.2));
      transform: rotate(-8deg);
      filter: blur(18px);
      pointer-events: none;
    }

    .nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      position: relative;
      z-index: 1;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--muted);
      font-size: 18px;
    }

    .badge {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      border-radius: 14px;
      background: var(--cyan);
      color: #06252b;
      font-weight: 900;
      letter-spacing: 0;
      box-shadow: 0 0 38px rgba(125, 240, 225, .35);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: flex-end;
    }

    .chip,
    .icon-button {
      min-height: 44px;
      border: 1px solid rgba(255,255,255,.16);
      border-radius: 999px;
      color: var(--ink);
      background: rgba(255,255,255,.07);
      cursor: pointer;
      transition: transform .18s ease, border-color .18s ease, background .18s ease;
    }

    .chip {
      padding: 0 17px;
    }

    .chip:hover,
    .icon-button:hover {
      transform: translateY(-1px);
      border-color: rgba(125,240,225,.45);
      background: rgba(125,240,225,.12);
    }

    .copy-state {
      min-width: 92px;
    }

    h1 {
      margin: 58px 0 12px;
      font-size: clamp(56px, 7vw, 98px);
      line-height: .95;
      letter-spacing: 0;
      position: relative;
      z-index: 1;
    }

    .subtitle {
      margin: 0;
      max-width: 800px;
      color: var(--muted);
      font-size: clamp(17px, 2vw, 22px);
      line-height: 1.6;
      position: relative;
      z-index: 1;
    }

    .ip-card {
      margin-top: 36px;
      border: 1px solid rgba(218,237,255,.16);
      border-radius: 26px 26px 8px 26px;
      padding: 26px;
      background: linear-gradient(115deg, rgba(94, 150, 158, .36), rgba(74, 68, 110, .55));
      position: relative;
      z-index: 1;
    }

    .label {
      color: var(--muted);
      font-size: 15px;
      margin-bottom: 12px;
    }

    .ip-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .ip-value {
      margin: 0;
      font-family: "Cascadia Mono", "SFMono-Regular", Consolas, monospace;
      font-size: clamp(34px, 5.4vw, 66px);
      line-height: 1;
      letter-spacing: 0;
      word-break: break-word;
    }

    .edit-form {
      display: none;
      width: min(100%, 760px);
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }

    .edit-form.active {
      display: flex;
    }

    .edit-form input {
      flex: 1 1 300px;
      min-height: 58px;
      min-width: 0;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 18px;
      padding: 0 16px;
      color: var(--ink);
      background: rgba(0,0,0,.22);
      outline: none;
    }

    .icon-button {
      width: 44px;
      height: 44px;
      display: inline-grid;
      place-items: center;
      padding: 0;
    }

    .edit-button {
      opacity: .62;
    }

    .pills {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 20px;
    }

    .pill {
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 999px;
      padding: 9px 13px;
      color: var(--muted);
      background: rgba(255,255,255,.05);
      min-width: 58px;
      text-align: center;
    }

    .side {
      border-radius: 30px 30px 30px 8px;
      padding: 28px;
      display: grid;
      gap: 16px;
    }

    .stat {
      min-height: 144px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 24px 24px 8px 24px;
      padding: 22px;
      background: rgba(255,255,255,.055);
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .stat strong {
      display: block;
      margin-top: 8px;
      font-size: clamp(21px, 2.2vw, 28px);
      line-height: 1.22;
      word-break: break-word;
    }

    .content-grid {
      display: grid;
      grid-template-columns: minmax(300px, .72fr) minmax(0, 1fr);
      gap: 22px;
      margin-top: 22px;
    }

    .panel {
      border-radius: 28px 28px 8px 28px;
      padding: 28px;
      min-width: 0;
    }

    h2 {
      margin: 0 0 22px;
      font-size: 27px;
      letter-spacing: 0;
    }

    .rows {
      display: grid;
      gap: 0;
    }

    .row {
      display: grid;
      grid-template-columns: minmax(116px, .42fr) minmax(0, 1fr);
      gap: 18px;
      padding: 17px 0;
      border-bottom: 1px solid rgba(255,255,255,.09);
      align-items: center;
    }

    .row span:first-child {
      color: var(--muted);
    }

    .row strong,
    .row code {
      color: var(--ink);
      font-size: 17px;
      word-break: break-word;
    }

    .risk-head {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 22px;
    }

    .risk-score {
      font-size: clamp(44px, 5vw, 76px);
      line-height: 1;
      font-weight: 900;
      color: var(--gold);
    }

    .risk-meter {
      height: 18px;
      border-radius: 999px;
      overflow: hidden;
      background: linear-gradient(90deg, var(--mint), var(--gold), var(--coral));
      border: 1px solid rgba(255,255,255,.12);
      position: relative;
    }

    .risk-pin {
      position: absolute;
      top: -6px;
      width: 4px;
      height: 30px;
      border-radius: 4px;
      background: #fff;
      box-shadow: 0 0 18px rgba(255,255,255,.7);
      left: 0;
      transform: translateX(-2px);
    }

    .risk-cards {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-top: 18px;
    }

    .mini {
      min-height: 96px;
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 16px 16px 6px 16px;
      padding: 15px;
      background: rgba(255,255,255,.045);
    }

    .mini b {
      display: block;
      margin-top: 8px;
      font-size: 20px;
      word-break: break-word;
    }

    .json-box {
      max-height: 300px;
      overflow: auto;
      margin: 22px 0 0;
      padding: 18px;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,.1);
      background: rgba(0,0,0,.24);
      color: #d6f7ff;
      font-family: "Cascadia Mono", "SFMono-Regular", Consolas, monospace;
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .loading {
      opacity: .72;
    }

    .error {
      color: #ffb3aa;
    }

    @media (max-width: 980px) {
      .top-grid,
      .content-grid {
        grid-template-columns: 1fr;
      }

      .hero,
      .side,
      .panel {
        border-radius: 24px 24px 8px 24px;
      }
    }

    @media (max-width: 640px) {
      .shell {
        width: min(100% - 24px, 1480px);
        padding-top: 14px;
      }

      .hero,
      .side,
      .panel {
        padding: 20px;
      }

      .nav {
        align-items: flex-start;
        flex-direction: column;
      }

      .actions {
        justify-content: flex-start;
      }

      .risk-cards {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .row {
        grid-template-columns: 1fr;
        gap: 6px;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="top-grid">
      <div class="hero">
        <div class="nav">
          <div class="brand">
            <span class="badge">IP</span>
            <span>CF Snippets Network Check</span>
          </div>
          <div class="actions">
            <button class="chip copy-state" data-action="copy-ip">复制IP</button>
            <button class="chip" data-action="copy-json">JSON</button>
            <button class="chip" data-action="copy-report">Report</button>
          </div>
        </div>

        <div>
          <h1>IP 检测</h1>
          <p class="subtitle">查看公网 IP、网络位置、Cloudflare 边缘节点、请求头与 proxycheck.io 风控情报。</p>

          <section class="ip-card">
            <div class="label">你的公网IP</div>
            <div class="ip-row" id="ipDisplay">
              <p class="ip-value loading" data-field="ip">检测中</p>
              <button class="icon-button edit-button" type="button" data-action="edit-target" aria-label="修改查询目标" title="修改查询目标">✎</button>
            </div>
            <form class="edit-form" id="editForm">
              <input id="targetInput" name="target" autocomplete="off" placeholder="输入 IP 或域名">
              <button class="chip" type="submit">查询</button>
              <button class="icon-button" type="button" data-action="cancel-edit" aria-label="取消">×</button>
            </form>
            <div class="pills">
              <span class="pill" data-field="ipVersion">--</span>
              <span class="pill" data-field="country">--</span>
              <span class="pill" data-field="colo">Colo --</span>
              <span class="pill" data-field="http">HTTP --</span>
            </div>
          </section>
        </div>
      </div>

      <aside class="side">
        <div class="stat">
          <span class="label">网络位置</span>
          <strong data-field="location">--</strong>
        </div>
        <div class="stat">
          <span class="label">ASN/运营商</span>
          <strong data-field="asn">--</strong>
        </div>
        <div class="stat">
          <span class="label">Cloudflare节点</span>
          <strong data-field="cfNode">--</strong>
        </div>
      </aside>
    </section>

    <section class="content-grid">
      <section class="panel">
        <h2>网络信息</h2>
        <div class="rows">
          <div class="row"><span>IP类型</span><strong data-field="netType">--</strong></div>
          <div class="row"><span>国家/地区</span><strong data-field="countryFull">--</strong></div>
          <div class="row"><span>时区</span><strong data-field="timezone">--</strong></div>
          <div class="row"><span>经纬度</span><strong data-field="coords">--</strong></div>
          <div class="row"><span>请求语言</span><strong data-field="language">--</strong></div>
        </div>
      </section>

      <section class="panel">
        <div class="risk-head">
          <div>
            <h2>风控情报</h2>
            <div class="label" data-field="riskSource">proxycheck.io</div>
          </div>
          <div class="risk-score" data-field="riskScore">--</div>
        </div>
        <div class="risk-meter" data-role="risk-meter">
          <span class="risk-pin" data-field="riskPin"></span>
        </div>
        <div class="risk-cards">
          <div class="mini"><span class="label">风险等级</span><b data-field="riskLevel">--</b></div>
          <div class="mini"><span class="label">共享人数</span><b data-field="shared">--</b></div>
          <div class="mini"><span class="label">匿名网络</span><b data-field="anonymous">--</b></div>
          <div class="mini"><span class="label">网络类型</span><b data-field="riskType">--</b></div>
        </div>
        <pre class="json-box" data-field="json">{}</pre>
      </section>
    </section>
  </main>

  <script>
    const state = { data: null, currentTarget: "" };
    const fields = Object.fromEntries([...document.querySelectorAll("[data-field]")].map((node) => [node.dataset.field, node]));
    const editForm = document.getElementById("editForm");
    const ipDisplay = document.getElementById("ipDisplay");
    const targetInput = document.getElementById("targetInput");

    const fmt = (value, fallback = "--") => value === null || value === undefined || value === "" ? fallback : value;
    const yesNo = (value) => value ? "是" : "否";

    async function load(target = "") {
      setLoading();
      const endpoint = target ? "/api/lookup?target=" + encodeURIComponent(target) : "/api/me";
      try {
        const response = await fetch(endpoint, { headers: { accept: "application/json" } });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.message || data.error || "查询失败");
        state.data = data;
        state.currentTarget = data.query.target;
        render(data);
      } catch (error) {
        fields.ip.textContent = "查询失败";
        fields.ip.classList.add("error");
        fields.json.textContent = JSON.stringify({ error: error.message }, null, 2);
      }
    }

    function setLoading() {
      fields.ip.textContent = "检测中";
      fields.ip.classList.add("loading");
      fields.ip.classList.remove("error");
      fields.riskScore.textContent = "--";
      fields.riskPin.style.left = "0%";
    }

    function render(data) {
      const network = data.network || {};
      const loc = network.location || {};
      const asn = network.asn || {};
      const cf = data.cloudflare || {};
      const risk = data.risk || {};
      const cityLine = [loc.country, loc.region, loc.city].filter(Boolean).join(" • ");
      const asnLine = [asn.number ? "AS" + asn.number : risk.asn, asn.organization || risk.provider || risk.organisation].filter(Boolean).join(" • ");
      const score = Number.isFinite(risk.riskScore) ? risk.riskScore : null;

      fields.ip.classList.remove("loading", "error");
      fields.ip.textContent = network.ip || data.query.lookupIp || "--";
      fields.ipVersion.textContent = network.version || "--";
      fields.country.textContent = loc.country || risk.country || "--";
      fields.colo.textContent = "Colo " + fmt(cf.colo);
      fields.http.textContent = fmt(cf.httpProtocol, "HTTP --");
      fields.location.textContent = cityLine || "--";
      fields.asn.textContent = asnLine || "--";
      fields.cfNode.textContent = [cf.colo, cf.ray].filter(Boolean).join(" • ") || "--";
      fields.netType.textContent = risk.type || network.version || "--";
      fields.countryFull.textContent = cityLine || risk.country || "--";
      fields.timezone.textContent = loc.timezone || "--";
      fields.coords.textContent = loc.latitude && loc.longitude ? loc.latitude + ", " + loc.longitude : "--";
      fields.language.textContent = data.request?.acceptLanguage || "--";
      fields.riskScore.textContent = score === null ? "--" : String(score);
      fields.riskPin.style.left = (score === null ? 0 : score) + "%";
      fields.riskLevel.textContent = translateRiskLevel(risk.riskLevel);
      fields.shared.textContent = risk.sharedEstimate || "未知";
      fields.anonymous.textContent = yesNo(risk.anonymous || risk.proxy || risk.vpn || risk.tor);
      fields.riskType.textContent = risk.type || (risk.hosting ? "Hosting" : "--");
      fields.riskSource.textContent = risk.status === "error" ? risk.message : "proxycheck.io";
      fields.json.textContent = JSON.stringify(data, null, 2);
      targetInput.value = state.currentTarget || "";
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

      if (action === "edit-target") showEdit(true);
      if (action === "cancel-edit") showEdit(false);
      if (action === "copy-ip" && state.data) copyText(state.data.network.ip, "IP已复制");
      if (action === "copy-json" && state.data) copyText(JSON.stringify(state.data, null, 2), "JSON已复制");
      if (action === "copy-report" && state.data) {
        const data = state.data;
        copyText([
          "IP: " + data.network.ip,
          "Location: " + fields.location.textContent,
          "ASN: " + fields.asn.textContent,
          "Risk: " + fields.riskScore.textContent,
          "Shared: " + fields.shared.textContent,
        ].join("\\n"), "报告已复制");
      }
    });

    editForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const target = targetInput.value.trim();
      if (!target) return;
      showEdit(false);
      load(target);
    });

    load();
  </script>
</body>
</html>`;
}
