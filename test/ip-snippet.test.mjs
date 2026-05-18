import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildProxycheckUrl,
  handleRequest,
  normalizeRiskIntel,
} from "../ip/ip-snippet.js";

function attachCf(request, cf) {
  Object.defineProperty(request, "cf", {
    value: cf,
    configurable: true,
  });
  return request;
}

const SAMPLE_CF = {
  asn: 212238,
  asOrganization: "Digital Virtualisation Solutions Tokyo",
  city: "Tokyo",
  colo: "NRT",
  country: "JP",
  httpProtocol: "HTTP/2",
  latitude: "35.6895",
  longitude: "139.6917",
  region: "Tokyo",
  timezone: "Asia/Tokyo",
  tlsCipher: "AEAD-AES128-GCM-SHA256",
  tlsVersion: "TLSv1.3",
};

const SAMPLE_PROXYCHECK = {
  status: "ok",
  "203.0.113.8": {
    proxy: "yes",
    type: "VPN",
    risk: 73,
    provider: "Example Transit",
    organisation: "Example Network",
    asn: "AS64500",
    country: "Japan",
    city: "Tokyo",
    "device estimate": "1000+",
    "attack history": "none",
  },
};

const SAMPLE_PROXYCHECK_V3 = {
  status: "ok",
  "109.166.36.159": {
    network: {
      asn: "AS212238",
      range: "109.166.36.0/24",
      hostname: null,
      provider: "Datacamp Limited",
      organisation: "Digital Virtualisation Solutions Tokyo",
      type: "Hosting",
    },
    location: {
      continent_name: "Asia",
      continent_code: "AS",
      country_name: "Japan",
      country_code: "JP",
      region_name: "Tokyo",
      region_code: "13",
      city_name: "Shinagawa (Futaba)",
      postal_code: "142-0043",
      latitude: 35.6066,
      longitude: 139.726,
      timezone: "Asia/Tokyo",
      currency: {
        name: "Yen",
        code: "JPY",
        symbol: "¥",
      },
    },
    device_estimate: {
      address: 1,
      subnet: 32,
    },
    detections: {
      proxy: false,
      vpn: false,
      compromised: false,
      scraper: false,
      tor: false,
      hosting: true,
      anonymous: false,
      risk: 33,
      confidence: 100,
      first_seen: null,
      last_seen: null,
    },
    detection_history: {
      delisted: true,
      delist_datetime: "2026-03-26T05:11:23Z",
    },
    attack_history: null,
    operator: null,
    last_updated: "2026-05-07T04:01:44Z",
  },
  query_time: 4,
};

test("buildProxycheckUrl uses free no-key mode when env key is absent", () => {
  const url = buildProxycheckUrl("203.0.113.8", {});

  assert.equal(url.hostname, "proxycheck.io");
  assert.equal(url.pathname, "/v3/203.0.113.8");
  assert.equal(url.searchParams.get("risk"), "1");
  assert.equal(url.searchParams.get("vpn"), "3");
  assert.equal(url.searchParams.get("asn"), "1");
  assert.equal(url.searchParams.get("node"), "1");
  assert.equal(url.searchParams.has("ver"), false);
  assert.equal(url.searchParams.has("key"), false);
});

test("buildProxycheckUrl can use snippet-local API keys without rendering them to HTML", async () => {
  const secret = "snippet-local-secret";
  const url = buildProxycheckUrl("203.0.113.8", {}, {
    proxycheckEndpoint: "https://proxycheck.io/v3/",
    proxycheckApiKeys: [secret],
  });
  const response = await handleRequest(new Request("https://ip.example/"));
  const html = await response.text();

  assert.equal(url.searchParams.get("key"), secret);
  assert.equal(html.includes(secret), false);
});

test("buildProxycheckUrl rotates through multiple server-side API keys", () => {
  const env = { PROXYCHECK_API_KEYS: "key-alpha, key-beta\nkey-gamma" };

  assert.equal(buildProxycheckUrl("203.0.113.8", env).searchParams.get("key"), "key-alpha");
  assert.equal(buildProxycheckUrl("203.0.113.8", env).searchParams.get("key"), "key-beta");
  assert.equal(buildProxycheckUrl("203.0.113.8", env).searchParams.get("key"), "key-gamma");
  assert.equal(buildProxycheckUrl("203.0.113.8", env).searchParams.get("key"), "key-alpha");
});

test("normalizeRiskIntel extracts risk score and shared device estimate", () => {
  const intel = normalizeRiskIntel(SAMPLE_PROXYCHECK, "203.0.113.8");

  assert.equal(intel.status, "ok");
  assert.equal(intel.riskScore, 73);
  assert.equal(intel.riskLevel, "high");
  assert.equal(intel.proxy, true);
  assert.equal(intel.type, "VPN");
  assert.equal(intel.sharedEstimate, "1000+");
  assert.equal(intel.provider, "Example Transit");
});

test("normalizeRiskIntel extracts useful proxycheck v3 fields", () => {
  const intel = normalizeRiskIntel(SAMPLE_PROXYCHECK_V3, "109.166.36.159");

  assert.equal(intel.riskScore, 33);
  assert.equal(intel.confidence, 100);
  assert.equal(intel.hosting, true);
  assert.equal(intel.proxy, false);
  assert.equal(intel.vpn, false);
  assert.equal(intel.tor, false);
  assert.equal(intel.compromised, false);
  assert.equal(intel.scraper, false);
  assert.equal(intel.type, "Hosting");
  assert.equal(intel.country, "Japan");
  assert.equal(intel.countryCode, "JP");
  assert.equal(intel.city, "Shinagawa (Futaba)");
  assert.equal(intel.region, "Tokyo");
  assert.equal(intel.continent, "Asia");
  assert.equal(intel.currencyCode, "JPY");
  assert.equal(intel.sharedEstimate, "地址 1 / 子网 32");
  assert.equal(intel.detectionHistory.delisted, true);
  assert.equal(intel.detectionHistory.delistDatetime, "2026-03-26T05:11:23Z");
  assert.equal(intel.lastUpdated, "2026-05-07T04:01:44Z");
});

test("api/me combines Cloudflare request data with proxycheck risk data", async () => {
  const request = attachCf(
    new Request("https://ip.example/api/me", {
      headers: {
        "CF-Connecting-IP": "203.0.113.8",
        "CF-IPCountry": "JP",
        "CF-Ray": "9fcb4dc95daeebf9-NRT",
        "User-Agent": "NodeTest/1.0",
        "Accept-Language": "zh-CN",
      },
    }),
    SAMPLE_CF,
  );

  const response = await handleRequest(request, {}, {}, {
    fetch: async (url) => {
      assert.equal(new URL(url).searchParams.has("key"), false);
      return Response.json(SAMPLE_PROXYCHECK);
    },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.query.target, "203.0.113.8");
  assert.equal(body.network.ip, "203.0.113.8");
  assert.equal(body.network.location.country, "JP");
  assert.equal(body.network.location.city, "Tokyo");
  assert.equal(body.network.asn.number, 212238);
  assert.equal(body.cloudflare.colo, "NRT");
  assert.equal(body.risk.riskScore, 73);
  assert.equal(body.risk.sharedEstimate, "1000+");
});

test("api/me never exposes server-side proxycheck keys in response body", async () => {
  const request = attachCf(
    new Request("https://ip.example/api/me", {
      headers: {
        "CF-Connecting-IP": "203.0.113.8",
        "CF-Ray": "9fcb4dc95daeebf9-NRT",
      },
    }),
    SAMPLE_CF,
  );
  const secret = "server-only-secret";

  const response = await handleRequest(request, { PROXYCHECK_API_KEYS: secret }, {}, {
    fetch: async (url) => {
      assert.equal(new URL(url).searchParams.get("key"), secret);
      return Response.json(SAMPLE_PROXYCHECK);
    },
  });
  const bodyText = await response.text();

  assert.equal(response.status, 200);
  assert.equal(bodyText.includes(secret), false);
});

test("api/lookup rejects unsafe targets", async () => {
  const request = new Request("https://ip.example/api/lookup?target=https://example.com/path");
  const response = await handleRequest(request, {}, {}, {
    fetch: async () => {
      throw new Error("fetch should not be called");
    },
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.equal(body.error, "Invalid target");
});

test("path query route serves the dashboard and seeds initial target", async () => {
  const response = await handleRequest(new Request("https://ip.example/ip/109.166.36.159"));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /getPathTarget/);
  assert.match(html, /\^\\\/ip\\\/\(\.\+\)\$/);
});

test("home page includes pencil edit control and dashboard shell", async () => {
  const response = await handleRequest(new Request("https://ip.example/"));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /IP 检测/);
  assert.match(html, /aria-label="修改查询目标"/);
  assert.match(html, /data-role="risk-meter"/);
  assert.match(html, /rel="icon"/);
  assert.match(html, /data-action="export-image"/);
  assert.match(html, /class="icon-button top-action" type="button" data-action="refresh" aria-label="刷新"/);
  assert.match(html, /class="icon-button top-action" type="button" data-action="copy-ip" aria-label="复制IP"/);
  assert.match(html, /class="icon-button top-action" type="button" data-action="export-image" aria-label="导出图片"/);
  assert.match(html, /class="icon-button top-action" type="button" data-action="copy-report" aria-label="复制报告"/);
  assert.match(html, /\.icon-button\.done\s*{[\s\S]*?var\(--green\)/);
  assert.match(html, /function markActionDone\(button\)/);
  assert.match(html, /button\.textContent = "✓"/);
  assert.match(html, /copyText\(state\.data\.network\.ip,\s*button\)/);
  assert.match(html, /downloadReportImage\(button\)/);
  assert.doesNotMatch(html, /button\.textContent = label/);
  assert.match(html, /data-action="export-image"[^>]*>▧</);
  assert.doesNotMatch(html, /data-action="refresh"[^>]*>刷新</);
  assert.doesNotMatch(html, /data-action="copy-ip"[^>]*>复制IP</);
  assert.match(html, /\.dashboard\s*{[\s\S]*?align-items:\s*stretch/);
  assert.match(html, /\.main-stack\s*{[\s\S]*?grid-template-rows:\s*auto auto 1fr/);
  assert.match(html, /class="panel external-panel"/);
  assert.match(html, /@media \(max-width: 560px\)[\s\S]*?\.actions\s*{[\s\S]*?display:\s*grid/);
  assert.match(html, /@media \(max-width: 560px\)[\s\S]*?\.top-action\s*{[\s\S]*?width:\s*100%/);
  assert.match(html, /downloadReportImage/);
  assert.match(html, /drawBadge\(ctx, 72, 64, 52\)/);
  assert.match(html, /drawCard\(ctx, 54, 220, 508, 118/);
  assert.match(html, /公网地址/);
  assert.doesNotMatch(html, /data-field="riskSummary"/);
  assert.match(html, /class="risk-value"/);
  assert.match(html, /location-card/);
  assert.match(html, /location-head/);
  assert.match(html, /data-action="refresh-location"/);
  assert.match(html, /aria-label="刷新定位"/);
  assert.match(html, /data-field="mapViewport"/);
  assert.match(html, /按需加载地图/);
  assert.match(html, /\.map-box\s*{[\s\S]*?inset:\s*76px 14px 14px/);
  assert.doesNotMatch(html, /\.map-box\s*{[\s\S]*?radial-gradient/);
  assert.match(html, /\.side-stack\s*{[\s\S]*?grid-template-rows:\s*minmax\(280px,\s*1fr\) auto/);
  assert.match(html, /\.side-compact\s*{[\s\S]*?align-items:\s*start/);
  assert.match(html, /if \(action === "refresh-location"\) renderMap\(state\.data\);/);
  assert.doesNotMatch(html, /action === "refresh-location"\) load/);
  assert.match(html, /renderMap/);
  assert.match(html, /openstreetmap\.org\/export\/embed/);
  assert.doesNotMatch(html, /<iframe[^>]+openstreetmap/i);
  assert.match(html, /class="side-compact"/);
  assert.match(html, /\.side-compact \.stat\s*{[\s\S]*?min-height:\s*58px/);
  assert.doesNotMatch(html, /data-field="cfNode"/);
  assert.doesNotMatch(html, /mini-grid/);
  assert.doesNotMatch(html, /设备估计/);
  assert.doesNotMatch(html, /查询语言/);
  assert.doesNotMatch(html, /pill\.good/);
  assert.match(html, /data-flag="proxy"/);
  assert.match(html, /data-flag="vpn"/);
  assert.match(html, /data-flag="tor"/);
  assert.match(html, /data-flag="hosting"/);
  assert.match(html, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(html, /getInitialTarget/);
  assert.match(html, /data-field="jumpLinks"/);
  assert.match(html, /\.jump-grid\s*{[\s\S]*?margin-top:\s*10px/);
  assert.match(html, /ping0\.cc\/ip\//);
  assert.match(html, /ippure\.com\/\?ip=/);
  assert.match(html, /toChineseLocation/);
});

test("snippet home page stays synchronized with local ip.html", async () => {
  const response = await handleRequest(new Request("https://ip.example/"));
  const snippetHtml = await response.text();
  const html = await readFile(new URL("../ip/ip.html", import.meta.url), "utf8");

  assert.equal(snippetHtml, html);
});

test("unified UI does not include local-only API base form", async () => {
  const html = await readFile(new URL("../ip/ip.html", import.meta.url), "utf8");

  assert.doesNotMatch(html, /id="devForm"/);
  assert.doesNotMatch(html, /id="apiBase"/);
  assert.doesNotMatch(html, /127\.0\.0\.1:8787/);
  assert.match(html, /\/api\/me/);
  assert.match(html, /\/ip\/"\s*\+/);
  assert.match(html, /aria-label="修改查询目标"/);
});

test("unified UI removes expandable raw JSON panel to avoid layout jump", async () => {
  const html = await readFile(new URL("../ip/ip.html", import.meta.url), "utf8");

  assert.doesNotMatch(html, /<details\b/);
  assert.doesNotMatch(html, /<summary\b/);
  assert.doesNotMatch(html, /原始 JSON/);
  assert.doesNotMatch(html, /data-field="json"/);
  assert.doesNotMatch(html, /data-action="copy-json"/);
  assert.doesNotMatch(html, />JSON</);
});
