import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

async function loadSnippet() {
  const source = await readFile(new URL('./pic-snippet.js', import.meta.url), 'utf8');
  const encoded = Buffer.from(source, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

test('/r redirects without allowing the random entry to be cached', async () => {
  const { default: snippet } = await loadSnippet();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/random.js')) {
      return new Response('const counts = {"h":2,"v":2}', { status: 200 });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const response = await snippet.fetch(new Request('https://pic.ssr.ddns-ip.net/r'));

    assert.equal(response.status, 302);
    assert.match(response.headers.get('Location'), /^https:\/\/pic\.ssr\.ddns-ip\.net\/ri\/[hv]\/[12]\.webp$/);
    assert.match(response.headers.get('Cache-Control'), /no-store/);
    assert.equal(response.headers.get('Pragma'), 'no-cache');
    assert.equal(response.headers.get('Expires'), '0');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
