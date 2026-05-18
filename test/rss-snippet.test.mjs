import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const snippetUrl = new URL('../rss/rss-snippet.js', import.meta.url);

async function loadSnippet() {
  const source = await readFile(snippetUrl, 'utf8');
  const encoded = Buffer.from(source, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

test('/rss without source renders a simple source directory page', async () => {
  const { default: snippet } = await loadSnippet();
  const response = await snippet.fetch(new Request('https://example.com/rss'));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /text\/html/);
  assert.match(html, /RSS Sources/);
  assert.match(html, /zaobao-china/);
  assert.match(html, /href="\/rss\?source=zaobao-china"/);
  assert.doesNotMatch(html, /<script/i);
});

test('/rss/sources returns source metadata without upstream URLs', async () => {
  const { default: snippet } = await loadSnippet();
  const response = await snippet.fetch(new Request('https://example.com/rss/sources'));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.sources));
  assert.ok(body.sources.some((source) => source.id === 'bilibili-hot'));
  assert.equal(body.sources.some((source) => 'url' in source), false);
});

test('/rss with valid source proxies upstream XML', async () => {
  const { default: snippet } = await loadSnippet();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://rsshub.rssforever.com"/zaobao/realtime/china');
    assert.equal(init.method, 'GET');

    return new Response('<rss version="2.0"></rss>', {
      status: 200,
      headers: {
        'Content-Type': 'application/rss+xml; charset=UTF-8',
      },
    });
  };

  try {
    const response = await snippet.fetch(new Request('https://example.com/rss?source=zaobao-china'));
    const xml = await response.text();

    assert.equal(response.status, 200);
    assert.equal(xml, '<rss version="2.0"></rss>');
    assert.equal(response.headers.get('X-RSS-Source'), 'zaobao-china');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
