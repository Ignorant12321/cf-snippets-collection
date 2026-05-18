import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const snippetUrl = new URL('../github/github-snippet.js', import.meta.url);
const htmlUrl = new URL('../github/github.html', import.meta.url);

async function loadSnippet() {
  const source = await readFile(snippetUrl, 'utf8');
  const encoded = Buffer.from(source, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

async function readStaticHomeHtml() {
  return readFile(htmlUrl, 'utf8');
}

test('home page keeps the primary action to opening the generated proxy link', async () => {
  const { default: snippet } = await loadSnippet();
  const response = await snippet.fetch(new Request('https://home-gh.ssr.ddns-ip.net/'));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /id="goForm"/);
  assert.doesNotMatch(html, /id="convertBtn"|id="copyBtn"|>转换<|>复制</);
});

test('home page includes a favicon for the GitHub proxy project', async () => {
  const { default: snippet } = await loadSnippet();
  const response = await snippet.fetch(new Request('https://home-gh.ssr.ddns-ip.net/'));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<link rel="icon"[^>]+type="image\/svg\+xml"/);
  assert.match(html, /viewBox='0 0 32 32'/);
});

test('static GitHub project page includes the same favicon', async () => {
  const html = await readStaticHomeHtml();

  assert.match(html, /<link rel="icon"[^>]+type="image\/svg\+xml"/);
  assert.match(html, /viewBox='0 0 32 32'/);
});

test('static GitHub project page uses the refreshed console layout markers', async () => {
  const html = await readStaticHomeHtml();

  assert.match(html, /data-ui="github-console"/);
  assert.match(html, /class="[^"]*\bworkspace\b/);
  assert.match(html, /class="[^"]*\bconvert-card\b/);
  assert.match(html, /class="[^"]*\binspector\b/);
  assert.match(html, /class="[^"]*\btabbar\b/);
});

test('rendered snippet home page includes the refreshed console layout markers', async () => {
  const { default: snippet } = await loadSnippet();
  const response = await snippet.fetch(new Request('https://home-gh.ssr.ddns-ip.net/'));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /data-ui="github-console"/);
  assert.match(html, /class="[^"]*\bworkspace\b/);
  assert.match(html, /class="[^"]*\bconvert-card\b/);
  assert.match(html, /class="[^"]*\binspector\b/);
  assert.match(html, /class="[^"]*\btabbar\b/);
});

test('snippet source stays within Cloudflare 32KB limit', async () => {
  const source = await readFile(snippetUrl, 'utf8');

  assert.ok(
    Buffer.byteLength(source, 'utf8') <= 32 * 1024,
    `github-snippet.js is ${Buffer.byteLength(source, 'utf8')} bytes`
  );
});

test('/go redirects valid GitHub links to the proxy host', async () => {
  const { default: snippet } = await loadSnippet();
  const response = await snippet.fetch(
    new Request('https://home-gh.ssr.ddns-ip.net/go?url=https%3A%2F%2Fgithub.com%2Foctocat%2FHello-World')
  );

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), 'https://github-com-gh.ssr.ddns-ip.net/octocat/Hello-World');
});
