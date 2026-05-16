import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const snippetUrl = new URL("./iptv-snippet.js", import.meta.url);

async function loadSnippet() {
  const source = await readFile(snippetUrl, "utf8");
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

test("/ renders an HTML source directory instead of an M3U playlist", async () => {
  const { default: snippet } = await loadSnippet();
  const response = await snippet.fetch(new Request("https://iptv.ssr.ddns-ip.net/"));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /text\/html/);
  assert.match(html, /IPTV Sources/);
  assert.match(html, /href="\/china"/);
  assert.match(html, /rel="icon"/);
  assert.match(html, /image\/svg\+xml/);
  assert.doesNotMatch(html, /^#EXTM3U/);
});

test("snippet uses compressed homepage HTML and stays within Cloudflare size limit", async () => {
  const source = await readFile(snippetUrl, "utf8");
  const bytes = Buffer.byteLength(source, "utf8");

  assert.ok(bytes < 32 * 1024, `snippet is ${bytes} bytes, must stay under 32768`);
  assert.match(source, /HOME_HTML_GZIP_BASE64/);
  assert.match(source, /DecompressionStream\("gzip"\)/);
  assert.doesNotMatch(source, /<style>\s*:root/);
});

test("/sources returns public source metadata", async () => {
  const { default: snippet } = await loadSnippet();
  const response = await snippet.fetch(new Request("https://iptv.ssr.ddns-ip.net/sources"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.sources));
  assert.ok(body.sources.some((source) => source.id === "china"));
  assert.ok(body.sources.some((source) => source.id === "mainland"));
  assert.ok(body.sources.some((source) => source.id === "hongkong"));
  assert.ok(body.sources.some((source) => source.id === "macau"));
  assert.ok(body.sources.some((source) => source.id === "taiwan"));
  assert.equal(body.sources.some((source) => "filter" in source), false);
});

test("/china fetches the upstream M3U and keeps China-related channels", async () => {
  const { default: snippet } = await loadSnippet();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://iptv-org.github.io/iptv/index.m3u");
    assert.equal(init.method, "GET");

    return new Response(
      [
        "#EXTM3U",
        '#EXTINF:-1 tvg-id="CCTV1.cn",CCTV-1',
        "https://example.com/cctv1.m3u8",
        '#EXTINF:-1 tvg-id="BBCNews.uk",BBC News',
        "https://example.com/bbc.m3u8",
        '#EXTINF:-1 tvg-id="CGTN.cn",CGTN',
        "https://example.com/cgtn.m3u8",
        '#EXTINF:-1 tvg-id="HunanTV.cn@SD",Hunan TV',
        "https://example.com/hunan.m3u8",
        '#EXTINF:-1 tvg-id="RTHKTV31.hk@SD",RTHK TV 31',
        "https://example.com/rthk.m3u8",
        '#EXTINF:-1 tvg-id="TDMInformation.mo@SD",TDM Info. Macau',
        "https://example.com/tdm.m3u8",
        '#EXTINF:-1 tvg-id="TTV.tw@SD",台视',
        "https://example.com/ttv.m3u8",
      ].join("\n"),
      {
        status: 200,
        headers: {
          "Content-Type": "audio/x-mpegurl; charset=UTF-8",
        },
      },
    );
  };

  try {
    const response = await snippet.fetch(new Request("https://iptv.ssr.ddns-ip.net/china"));
    const playlist = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type"), /audio\/x-mpegurl/);
    assert.match(playlist, /^#EXTM3U/);
    assert.match(playlist, /CCTV-1/);
    assert.match(playlist, /CGTN/);
    assert.match(playlist, /Hunan TV/);
    assert.match(playlist, /RTHK TV 31/);
    assert.match(playlist, /TDM Info\. Macau/);
    assert.match(playlist, /台视/);
    assert.doesNotMatch(playlist, /BBC News/);
    assert.equal(response.headers.get("X-IPTV-Source"), "china");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("/hongkong returns only Hong Kong tvg-id channels from the sample", async () => {
  const { default: snippet } = await loadSnippet();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      [
        "#EXTM3U",
        '#EXTINF:-1 tvg-id="HunanTV.cn@SD",Hunan TV',
        "https://example.com/hunan.m3u8",
        '#EXTINF:-1 tvg-id="RTHKTV31.hk@SD",RTHK TV 31',
        "https://example.com/rthk.m3u8",
      ].join("\n"),
      { status: 200 },
    );

  try {
    const response = await snippet.fetch(new Request("https://iptv.ssr.ddns-ip.net/hongkong"));
    const playlist = await response.text();

    assert.equal(response.status, 200);
    assert.match(playlist, /RTHK TV 31/);
    assert.doesNotMatch(playlist, /Hunan TV/);
    assert.equal(response.headers.get("X-IPTV-Source"), "hongkong");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unknown source paths return available source ids", async () => {
  const { default: snippet } = await loadSnippet();
  const response = await snippet.fetch(new Request("https://iptv.ssr.ddns-ip.net/not-exists"));
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.ok, false);
  assert.equal(body.error, "Unknown source");
  assert.ok(body.available_sources.includes("china"));
});
