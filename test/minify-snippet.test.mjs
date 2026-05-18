import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { test } from "node:test";

import {
  replaceHomeHtml,
  replaceHomeTemplate,
  resolveBuildConfig,
} from "../minify-snippet.mjs";

test("resolveBuildConfig defaults to the ip snippet from the repository root", () => {
  const config = resolveBuildConfig([]);

  assert.equal(config.name, "ip");
  assert.match(config.sourcePath, /[\\/]ip[\\/]ip-snippet\.js$/);
  assert.match(config.htmlPath, /[\\/]ip[\\/]ip\.html$/);
  assert.match(config.outputPath, /[\\/]ip[\\/]ip-snippet\.min\.js$/);
  assert.match(config.tempPath, /[\\/]\.tmp[\\/]ip-snippet\.premin\.js$/);
});

test("resolveBuildConfig accepts an explicit snippet directory and output name", () => {
  const config = resolveBuildConfig(["ip", "ip-snippet.prod.js"]);

  assert.equal(config.name, "ip");
  assert.match(config.sourcePath, /[\\/]ip[\\/]ip-snippet\.js$/);
  assert.match(config.htmlPath, /[\\/]ip[\\/]ip\.html$/);
  assert.match(config.outputPath, /[\\/]ip[\\/]ip-snippet\.prod\.js$/);
});

test("replaceHomeHtml swaps the HOME_HTML template without touching surrounding code", () => {
  const source = [
    "const before = true;",
    "const HOME_HTML = String.raw`old ${value}`;",
    "",
    "function renderHomePage() {",
    "  return HOME_HTML;",
    "}",
  ].join("\n");

  const updated = replaceHomeHtml(source, "<main>` ${safe}</main>", "sample-snippet.js");

  assert.match(updated, /const before = true;/);
  assert.match(updated, /function renderHomePage/);
  assert.match(updated, /String\.raw`<main>\\` \\\$\{safe\}<\/main>`;/);
});

test("replaceHomeTemplate swaps a gzip/base64 HOME_HTML_GZIP_BASE64 template", () => {
  const source = [
    "const before = true;",
    'const HOME_HTML_GZIP_BASE64 = "old";',
    "",
    "async function decodeHomeHtml() {",
    "  return HOME_HTML_GZIP_BASE64;",
    "}",
  ].join("\n");

  const updated = replaceHomeTemplate(source, "<main>IPTV</main>", "iptv-snippet.js");
  const encoded = updated.match(/HOME_HTML_GZIP_BASE64 = "([^"]+)"/)[1];
  const decoded = gunzipSync(Buffer.from(encoded, "base64")).toString("utf8");

  assert.match(updated, /const before = true;/);
  assert.equal(decoded, "<main>IPTV</main>");
});
