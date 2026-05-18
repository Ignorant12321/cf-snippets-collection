import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const snippetUrl = new URL("../iptv/iptv-snippet.js", import.meta.url);

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
  assert.match(html, /id="search-form"/);
  assert.match(html, /data-default-source="china"/);
  assert.match(html, /data-source="china"/);
  assert.match(html, /id="header-playlist-link"/);
  assert.match(html, /data-tab="favorites"/);
  assert.match(html, /data-favorite/);
  assert.match(html, /fav-icon/);
  assert.match(html, /lastGroupLink/);
  assert.match(html, /sideCount\.textContent = String/);
  assert.match(html, /id="refresh-results"/);
  assert.doesNotMatch(html, /id="export-favorites-json"/);
  assert.match(html, /id="export-results-m3u"/);
  assert.match(html, /data-copy-subscription/);
  assert.match(html, /data-copy-favorite/);
  assert.match(html, /focusFavorite/);
  assert.match(html, /data-channel-key/);
  assert.match(html, /refreshFavorites/);
  assert.match(html, /exportResultsM3U/);
  assert.doesNotMatch(html, /exportFavorites/);
  assert.doesNotMatch(html, /render\(\[item\]\)/);
  assert.match(html, /favoriteIdentity/);
  assert.match(html, /side-body/);
  assert.match(html, /favorite-list/);
  assert.match(html, /fav-icon/);
  assert.doesNotMatch(html, /按 tvg-id/);
  assert.match(html, /data-copy/);
  assert.match(html, /data-open/);
  assert.match(html, /index\.m3u/);
  assert.match(html, /\/search\.json\?q=/);
  assert.match(html, /\/search\.m3u\?q=/);
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

test("standalone iptv.html can hydrate local preview placeholders", async () => {
  const html = await readFile(new URL("../iptv/iptv.html", import.meta.url), "utf8");

  assert.match(html, /id="source-template"/);
  assert.match(html, /LOCAL_SOURCES/);
  assert.match(html, /hydrateSources/);
  assert.doesNotMatch(html, /<ul class="sources" id="source-list">\s*__SOURCE_ITEMS__\s*<\/ul>/);
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
  assert.ok(body.sources.every((source) => source.json_path));
});

test("/sources/china.json returns the default group channels for the homepage", async () => {
  const { default: snippet } = await loadSnippet();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      [
        "#EXTM3U",
        '#EXTINF:-1 tvg-id="CCTV1.cn" tvg-name="CCTV-1" tvg-logo="https://logo.example/cctv1.png" group-title="China",CCTV-1',
        "https://example.com/cctv1.m3u8",
        '#EXTINF:-1 tvg-id="BBCNews.uk" tvg-name="BBC News" group-title="News",BBC News',
        "https://example.com/bbc.m3u8",
        '#EXTINF:-1 tvg-id="TTV.tw" tvg-name="台视" group-title="Taiwan",台视',
        "https://example.com/ttv.m3u8",
      ].join("\n"),
      { status: 200 },
    );

  try {
    const response = await snippet.fetch(new Request("https://iptv.ssr.ddns-ip.net/sources/china.json"));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.source.id, "china");
    assert.equal(body.source.playlist_url, "https://iptv.ssr.ddns-ip.net/china");
    assert.equal(body.count, 2);
    assert.deepEqual(body.results.map((channel) => channel.tvg_id), ["CCTV1.cn", "TTV.tw"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("/search.json searches upstream channels for the homepage", async () => {
  const { default: snippet } = await loadSnippet();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      [
        "#EXTM3U",
        '#EXTINF:-1 tvg-id="CCTV1.cn" tvg-name="CCTV-1" tvg-logo="https://logo.example/cctv1.png" group-title="China",CCTV-1',
        "https://example.com/cctv1.m3u8",
        '#EXTINF:-1 tvg-id="BBCNews.uk" tvg-name="BBC News" group-title="News",BBC News',
        "https://example.com/bbc.m3u8",
      ].join("\n"),
      { status: 200 },
    );

  try {
    const response = await snippet.fetch(new Request("https://iptv.ssr.ddns-ip.net/search.json?q=cctv1"));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.query, "cctv1");
    assert.equal(body.count, 1);
    assert.equal(body.playlist_url, "https://iptv.ssr.ddns-ip.net/search.m3u?q=cctv1");
    assert.deepEqual(body.results[0], {
      name: "CCTV-1",
      tvg_id: "CCTV1.cn",
      tvg_name: "CCTV-1",
      group_title: "China",
      logo: "https://logo.example/cctv1.png",
      url: "https://example.com/cctv1.m3u8",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("/search.m3u supports lightweight field filters for players", async () => {
  const { default: snippet } = await loadSnippet();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      [
        "#EXTM3U",
        '#EXTINF:-1 tvg-id="CCTV1.cn" tvg-name="CCTV-1" group-title="China",CCTV-1',
        "https://example.com/cctv1.m3u8",
        '#EXTINF:-1 tvg-id="CCTV10.cn" tvg-name="CCTV-10" group-title="China",CCTV-10',
        "https://example.com/cctv10.m3u8",
        '#EXTINF:-1 tvg-id="BBCNews.uk" tvg-name="BBC News" group-title="News",BBC News',
        "https://example.com/bbc.m3u8",
      ].join("\n"),
      { status: 200 },
    );

  try {
    const response = await snippet.fetch(new Request("https://iptv.ssr.ddns-ip.net/search.m3u?q=country:cn cctv"));
    const playlist = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type"), /audio\/x-mpegurl/);
    assert.equal(response.headers.get("X-IPTV-Source"), "search");
    assert.match(playlist, /^#EXTM3U/);
    assert.match(playlist, /CCTV-1/);
    assert.match(playlist, /CCTV-10/);
    assert.doesNotMatch(playlist, /BBC News/);
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
