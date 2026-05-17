import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildProxycheckUrl,
  handleRequest,
  normalizeRiskIntel,
} from "./ip-snippet.js";

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

test("buildProxycheckUrl uses free no-key mode when env key is absent", () => {
  const url = buildProxycheckUrl("203.0.113.8", {});

  assert.equal(url.hostname, "proxycheck.io");
  assert.equal(url.pathname, "/v3/203.0.113.8");
  assert.equal(url.searchParams.get("risk"), "1");
  assert.equal(url.searchParams.get("vpn"), "3");
  assert.equal(url.searchParams.get("asn"), "1");
  assert.equal(url.searchParams.get("node"), "1");
  assert.equal(url.searchParams.has("key"), false);
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

test("home page includes pencil edit control and dashboard shell", async () => {
  const response = await handleRequest(new Request("https://ip.example/"));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /IP 检测/);
  assert.match(html, /aria-label="修改查询目标"/);
  assert.match(html, /data-role="risk-meter"/);
});

test("local ip.html can test a configurable Worker API", async () => {
  const html = await readFile(new URL("./ip.html", import.meta.url), "utf8");

  assert.match(html, /IP 本地测试台/);
  assert.match(html, /id="apiBase"/);
  assert.match(html, /http:\/\/127\.0\.0\.1:8787/);
  assert.match(html, /\/api\/me/);
  assert.match(html, /\/api\/lookup\?target=/);
  assert.match(html, /aria-label="修改查询目标"/);
});
