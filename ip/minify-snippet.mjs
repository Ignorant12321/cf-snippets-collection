import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(scriptDir, "ip-snippet.js");
const htmlPath = resolve(scriptDir, "ip.html");
const outputPath = resolve(scriptDir, process.argv[2] || "ip-snippet.min.js");
const tempDir = resolve(scriptDir, "..", ".tmp");
const tempPath = join(tempDir, "ip-snippet.premin.js");
const maxBytes = Number(process.env.MAX_SNIPPET_BYTES || 32768);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function runNpx(args, options = {}) {
  if (process.platform === "win32") {
    return execFileSync("cmd.exe", ["/d", "/s", "/c", ["npx", "--yes", ...args].map(quoteCmdArg).join(" ")], {
      cwd: resolve(scriptDir, ".."),
      encoding: options.capture ? "utf8" : undefined,
      stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
  }

  return execFileSync(npx, ["--yes", ...args], {
    cwd: resolve(scriptDir, ".."),
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
}

function quoteCmdArg(value) {
  const text = String(value);
  if (!/[ \t"&<>|^]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function escapeTemplateLiteral(value) {
  return value
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function replaceHomeHtml(source, html) {
  const startMarker = "const HOME_HTML = String.raw`";
  const endMarker = "`;\n\nfunction renderHomePage()";
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  if (start === -1 || end === -1) {
    throw new Error("Could not locate HOME_HTML in ip-snippet.js");
  }

  return source.slice(0, start) +
    startMarker +
    escapeTemplateLiteral(html) +
    source.slice(end);
}

function formatBytes(bytes) {
  return `${bytes.toLocaleString()} bytes`;
}

mkdirSync(tempDir, { recursive: true });

const minifiedHtml = runNpx([
  "html-minifier-terser@7.2.0",
  htmlPath,
  "--collapse-whitespace",
  "--remove-comments",
  "--remove-optional-tags",
  "--remove-redundant-attributes",
  "--remove-script-type-attributes",
  "--remove-style-link-type-attributes",
  "--minify-css",
  "true",
  "--minify-js",
  "true",
], { capture: true }).trim();

const source = readFileSync(sourcePath, "utf8");
writeFileSync(tempPath, replaceHomeHtml(source, minifiedHtml), "utf8");

runNpx([
  "esbuild@0.25.11",
  tempPath,
  "--bundle",
  "--format=esm",
  "--platform=neutral",
  "--target=es2022",
  "--minify",
  "--legal-comments=none",
  `--outfile=${outputPath}`,
]);

const originalBytes = statSync(sourcePath).size;
const outputBytes = statSync(outputPath).size;
rmSync(tempPath, { force: true });

console.log(`Original: ${formatBytes(originalBytes)}`);
console.log(`Minified: ${formatBytes(outputBytes)}`);
console.log(`Limit:    ${formatBytes(maxBytes)}`);

if (outputBytes > maxBytes) {
  process.exitCode = 1;
  console.error(`Snippet is still ${formatBytes(outputBytes - maxBytes)} over the limit.`);
}
