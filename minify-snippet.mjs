import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

export function resolveBuildConfig(args = process.argv.slice(2), options = {}) {
  const root = options.repoRoot || repoRoot;
  const [firstArg, secondArg] = args;
  let snippetName = "ip";
  let outputName = secondArg;

  if (firstArg) {
    const possibleDir = resolve(root, firstArg);

    if (existsSync(possibleDir) && statSync(possibleDir).isDirectory()) {
      snippetName = firstArg;
    } else if (secondArg) {
      snippetName = firstArg;
    } else {
      outputName = firstArg;
    }
  }

  const snippetDir = resolve(root, snippetName);
  const name = basename(snippetDir);
  const tempDir = resolve(root, ".tmp");

  return {
    name,
    repoRoot: root,
    snippetDir,
    sourcePath: resolve(snippetDir, `${name}-snippet.js`),
    htmlPath: resolve(snippetDir, `${name}.html`),
    outputPath: resolve(snippetDir, outputName || `${name}-snippet.min.js`),
    tempDir,
    tempPath: join(tempDir, `${name}-snippet.premin.js`),
    maxBytes: Number(process.env.MAX_SNIPPET_BYTES || 32768),
  };
}

export function replaceHomeHtml(source, html, sourceLabel = "snippet source") {
  const startMarker = "const HOME_HTML = String.raw`";
  const start = source.indexOf(startMarker);

  if (start === -1) {
    throw new Error(`Could not locate HOME_HTML in ${sourceLabel}`);
  }

  const htmlStart = start + startMarker.length;
  const htmlEnd = findTemplateLiteralEnd(source, htmlStart);

  if (htmlEnd === -1 || source.slice(htmlEnd, htmlEnd + 2) !== "`;") {
    throw new Error(`Could not locate the end of HOME_HTML in ${sourceLabel}`);
  }

  return source.slice(0, htmlStart) +
    escapeTemplateLiteral(html) +
    source.slice(htmlEnd);
}

export function escapeTemplateLiteral(value) {
  return value
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

export function formatBytes(bytes) {
  return `${bytes.toLocaleString()} bytes`;
}

export function buildSnippet(config = resolveBuildConfig()) {
  mkdirSync(config.tempDir, { recursive: true });

  const minifiedHtml = runNpx([
    "html-minifier-terser@7.2.0",
    config.htmlPath,
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
  ], config, { capture: true }).trim();

  const source = readFileSync(config.sourcePath, "utf8");
  writeFileSync(config.tempPath, replaceHomeHtml(source, minifiedHtml, config.sourcePath), "utf8");

  runNpx([
    "esbuild@0.25.11",
    config.tempPath,
    "--bundle",
    "--format=esm",
    "--platform=neutral",
    "--target=es2022",
    "--minify",
    "--legal-comments=none",
    `--outfile=${config.outputPath}`,
  ], config);

  const result = {
    originalBytes: statSync(config.sourcePath).size,
    outputBytes: statSync(config.outputPath).size,
    maxBytes: config.maxBytes,
    outputPath: config.outputPath,
  };

  rmSync(config.tempPath, { force: true });
  return result;
}

function runNpx(args, config, options = {}) {
  if (process.platform === "win32") {
    return execFileSync("cmd.exe", ["/d", "/s", "/c", ["npx", "--yes", ...args].map(quoteCmdArg).join(" ")], {
      cwd: config.repoRoot,
      encoding: options.capture ? "utf8" : undefined,
      stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
  }

  return execFileSync(npx, ["--yes", ...args], {
    cwd: config.repoRoot,
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

function findTemplateLiteralEnd(source, start) {
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "`" && !isEscaped(source, index)) {
      return index;
    }
  }

  return -1;
}

function isEscaped(source, index) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function printResult(result) {
  console.log(`Original: ${formatBytes(result.originalBytes)}`);
  console.log(`Minified: ${formatBytes(result.outputBytes)}`);
  console.log(`Limit:    ${formatBytes(result.maxBytes)}`);

  if (result.outputBytes > result.maxBytes) {
    process.exitCode = 1;
    console.error(`Snippet is still ${formatBytes(result.outputBytes - result.maxBytes)} over the limit.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  printResult(buildSnippet(resolveBuildConfig()));
}
