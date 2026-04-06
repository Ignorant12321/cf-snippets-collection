// =========================
// 配置区
// =========================

// 首页入口前缀
// 例如 home-gh.<YOUR_DOMAIN>
const HOME_PREFIX = 'home-gh.';

// 域名白名单配置（仅保留需要的原生域名）
const domain_whitelist = [
  'github.com',
  'avatars.githubusercontent.com',
  'github.githubassets.com',
  'collector.github.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
  'github.io',
  'assets-cdn.github.com',
  'cdn.jsdelivr.net',
  'securitylab.github.com',
  'www.githubstatus.com',
  'npmjs.com',
  'git-lfs.github.com',
  'githubusercontent.com',
  'github.global.ssl.fastly.net',
  'api.npms.io',
  'github.community',
  'desktop.github.com',
  'central.github.com'
];

// 由白名单自动生成映射
const domain_mappings = Object.fromEntries(
  domain_whitelist.map(domain => [domain, domain.replace(/\./g, '-') + '-'])
);

// 需要重定向的路径（屏蔽海外后可以不填写）
const redirect_paths = [];

// 中国大陆以外的地区重定向到原始 GitHub 域名
const enable_geo_redirect = true;

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request);
  }
};

async function handleRequest(request) {
  const url = new URL(request.url);

  const current_host = url.host.toLowerCase();
  const host_header = request.headers.get('Host');
  const effective_host = (host_header || current_host).toLowerCase();
  const host_prefix = getProxyPrefix(effective_host);

  // =========================
  // 首页入口
  // =========================
  if (host_prefix === HOME_PREFIX) {
    const proxy_base_host = effective_host.slice(HOME_PREFIX.length);

    if (url.pathname === '/' || url.pathname === '') {
      return new Response(renderHomePage('', proxy_base_host), {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=UTF-8',
          'cache-control': 'public, max-age=600'
        }
      });
    }

    if (url.pathname === '/go') {
      const input = url.searchParams.get('url') || '';
      const target = buildProxyUrl(input, proxy_base_host);
      if (!target) {
        return new Response(renderHomePage('链接无效，请输入完整的 GitHub / Raw / Gist / GitHub Pages 链接。', proxy_base_host), {
          status: 400,
          headers: {
            'content-type': 'text/html; charset=UTF-8'
          }
        });
      }
      return Response.redirect(target, 302);
    }

    if (url.pathname === '/api/convert') {
      const input = url.searchParams.get('url') || '';
      const target = buildProxyUrl(input, proxy_base_host);
      if (!target) {
        return jsonResponse({ ok: false, error: 'Invalid URL' }, 200);
      }
      return jsonResponse({ ok: true, proxy_url: target });
    }
  }

  // 检查特殊路径，返回正常错误
  if (redirect_paths.includes(url.pathname)) {
    return new Response('Not Found', { status: 404 });
  }

  // 强制使用 HTTPS
  if (url.protocol === 'http:') {
    url.protocol = 'https:';
    return Response.redirect(url.href, 301);
  }

  // 从有效主机名中提取前缀
  if (!host_prefix) {
    return new Response(
      `Domain not configured for proxy.\nHost: ${effective_host}, Prefix check failed`,
      { status: 404 }
    );
  }

  // =========================
  // 非中国大陆地区跳回源站
  // =========================
  if (enable_geo_redirect) {
    const country = request.headers.get('CF-IPCountry') || '';
    if (country && country !== 'CN') {
      const original_host = resolveTargetHostFromPrefix(host_prefix);
      if (original_host) {
        const original_url = new URL(request.url);
        original_url.host = original_host;
        original_url.protocol = 'https:';
        return Response.redirect(original_url.href, 302);
      }
    }
  }

  // 根据前缀找到对应的原始域名
  const target_host = resolveTargetHostFromPrefix(host_prefix);

  if (!target_host) {
    return new Response(
      `Domain not configured for proxy.\nHost: ${effective_host}, Prefix: ${host_prefix}, Target lookup failed`,
      { status: 404 }
    );
  }

  // 修复特定嵌套 URL 模式
  let pathname = url.pathname;
  pathname = pathname.replace(
    /(\/[^\/]+\/[^\/]+\/(?:latest-commit|tree-commit-info)\/[^\/]+)\/https%3A\/\/[^\/]+\/.*/,
    '$1'
  );
  pathname = pathname.replace(
    /(\/[^\/]+\/[^\/]+\/(?:latest-commit|tree-commit-info)\/[^\/]+)\/https:\/\/[^\/]+\/.*/,
    '$1'
  );

  // 构建新的请求 URL
  const new_url = new URL(url);
  new_url.host = target_host;
  new_url.pathname = pathname;
  new_url.protocol = 'https:';

  // 设置新的请求头
  const new_headers = new Headers(request.headers);
  new_headers.set('Host', target_host);
  new_headers.set('Referer', new_url.href);
  new_headers.delete('accept-encoding');

  try {
    const response = await fetch(new_url.href, {
      method: request.method,
      headers: new_headers,
      body: canHaveBody(request.method) ? request.body : undefined,
      redirect: 'manual'
    });

    // 处理重定向
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        const modified_location = modifyUrl(location, host_prefix, effective_host);
        const new_res_headers = new Headers(response.headers);
        new_res_headers.set('location', modified_location);
        return new Response(null, {
          status: response.status,
          headers: new_res_headers
        });
      }
    }

    // 设置新的响应头
    const new_response_headers = new Headers(response.headers);
    new_response_headers.set('access-control-allow-origin', '*');
    new_response_headers.set('access-control-allow-credentials', 'true');
    new_response_headers.set('cache-control', 'public, max-age=14400');
    new_response_headers.delete('content-security-policy');
    new_response_headers.delete('content-security-policy-report-only');
    new_response_headers.delete('clear-site-data');

    const content_type = response.headers.get('content-type') || '';
    const is_text =
      content_type.includes('text/') ||
      content_type.includes('application/json') ||
      content_type.includes('application/javascript') ||
      content_type.includes('application/xml') ||
      content_type.includes('application/xhtml+xml') ||
      content_type.includes('image/svg+xml');

    // 对文本内容进行改写
    if (response.status === 200 && is_text) {
      new_response_headers.delete('content-encoding');
      new_response_headers.delete('content-length');

      let text = await response.text();
      text = await modifyText(text, host_prefix, effective_host);

      // 可选注入脚本
      if (content_type.includes('text/html')) {
        const inject_script = '';
        if (inject_script) {
          if (text.includes('</body>')) {
            text = text.replace('</body>', `${inject_script}</body>`);
          } else if (text.includes('</html>')) {
            text = text.replace('</html>', `${inject_script}</html>`);
          } else {
            text += inject_script;
          }
        }
      }

      return new Response(text, {
        status: response.status,
        headers: new_response_headers
      });
    }

    // 非文本内容直接返回
    return new Response(response.body, {
      status: response.status,
      headers: new_response_headers
    });
  } catch (err) {
    return new Response(`Proxy Error: ${err.message}`, { status: 502 });
  }
}

// =========================
// 工具函数
// =========================

function canHaveBody(method) {
  const upper = (method || '').toUpperCase();
  return !['GET', 'HEAD'].includes(upper);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8'
    }
  });
}

// 获取当前主机名的前缀，用于匹配反向映射
function getProxyPrefix(host) {
  const ghMatch = host.match(/^([a-z0-9-]+-gh\.)/);
  if (ghMatch) {
    return ghMatch[1];
  }
  return null;
}

// 根据前缀解析原始域名
function resolveTargetHostFromPrefix(host_prefix) {
  if (!host_prefix || !host_prefix.endsWith('-gh.')) {
    return null;
  }

  const prefix_part = host_prefix.slice(0, -4);

  for (const original of Object.keys(domain_mappings)) {
    const normalized_original = original.trim().toLowerCase();
    if (normalized_original.replace(/\./g, '-') === prefix_part) {
      return original;
    }
  }

  return null;
}

// 把用户输入的网址转成代理网址
function buildProxyUrl(input, proxy_base_host) {
  if (!input) return null;

  let raw = input.trim();
  if (!raw) return null;

  // 支持用户直接输入 github.com/user/repo
  if (!/^https?:\/\//i.test(raw)) {
    raw = 'https://' + raw;
  }

  try {
    const u = new URL(raw);
    const host = u.host.toLowerCase();

    if (!domain_whitelist.includes(host)) {
      return null;
    }

    const proxy_prefix = host.replace(/\./g, '-') + '-gh.';
    const proxy = new URL(u.href);
    proxy.protocol = 'https:';
    proxy.host = `${proxy_prefix}${proxy_base_host}`;
    return proxy.href;
  } catch (e) {
    return null;
  }
}

// 修改文本中的域名引用
async function modifyText(text, host_prefix, effective_hostname) {
  const domain_suffix = effective_hostname.substring(host_prefix.length);

  for (const [original_domain] of Object.entries(domain_mappings)) {
    const escaped_domain = original_domain.replace(/\./g, '\\.');
    const current_prefix = original_domain.replace(/\./g, '-') + '-gh.';
    const full_proxy_domain = `${current_prefix}${domain_suffix}`;

    text = text.replace(
      new RegExp(`https?://${escaped_domain}(?=/|"|'|\\\\s|$)`, 'g'),
      `https://${full_proxy_domain}`
    );

    text = text.replace(
      new RegExp(`//${escaped_domain}(?=/|"|'|\\\\s|$)`, 'g'),
      `//${full_proxy_domain}`
    );
  }

  return text;
}

// 修改 URL（用于重定向等）
function modifyUrl(url_str, host_prefix, effective_hostname) {
  try {
    const url = new URL(url_str);
    const domain_suffix = effective_hostname.substring(host_prefix.length);

    for (const [original_domain] of Object.entries(domain_mappings)) {
      if (url.host === original_domain) {
        const current_prefix = original_domain.replace(/\./g, '-') + '-gh.';
        url.host = `${current_prefix}${domain_suffix}`;
        break;
      }
    }

    return url.href;
  } catch (e) {
    return url_str;
  }
}

// 首页 HTML
function renderHomePage(errorMessage = '', proxy_base_host = '<YOUR_DOMAIN>') {
  const safeErrorMessage = JSON.stringify(errorMessage || '');
  const safeWhitelist = JSON.stringify(domain_whitelist);
  const safeMirrorRecommendations = JSON.stringify([
    {
      name: 'ghproxy',
      url: 'https://ghproxy.com/',
      note: '常见下载加速入口，可拼接 GitHub 资源地址使用'
    },
    {
      name: 'ghproxy.net',
      url: 'https://ghproxy.net/',
      note: '备用加速入口，适合与主入口交替尝试'
    },
    {
      name: 'ghfast.top',
      url: 'https://ghfast.top/',
      note: '下载链路常用镜像，网络波动时可尝试'
    },
    {
      name: 'FastGit',
      url: 'https://hub.fastgit.xyz/',
      note: '社区常见镜像网关，稳定性会随时变化'
    }
  ]);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>云间引渡（Github代理）</title>
  <style>
    :root {
      --bg: #0d1117;
      --panel: #161b22;
      --border: #30363d;
      --text: #e6edf3;
      --muted: #8b949e;
      --green: #238636;
      --green-hover: #2ea043;
      --blue: #1f6feb;
      --orange: #d29922;
      --danger: #f85149;
      --input: #0d1117;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      overflow: hidden;
      background:
        radial-gradient(circle at top, rgba(31,111,235,0.18), transparent 38%),
        linear-gradient(180deg, #0d1117 0%, #0b0f14 100%);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }
    .wrap {
      width: 100%;
      height: 100vh;
      max-width: none;
      padding: 10px;
      display: flex;
    }
    .card {
      width: 100%;
      background: rgba(22,27,34,0.92);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 18px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.35);
      backdrop-filter: blur(8px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .hero {
      display: grid;
      gap: 8px;
      margin-bottom: 14px;
      text-align: center;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 30px;
      line-height: 1.2;
      letter-spacing: 0.08em;
    }
    .workspace {
      display: grid;
      gap: 10px;
      min-height: 0;
      padding: 14px;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 16px;
      background: rgba(10,14,20,0.42);
    }
    .module-title {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      margin-bottom: 2px;
    }
    .module-title strong {
      font-size: 15px;
      letter-spacing: 0.16em;
      color: #dfe7f1;
    }
    .module-title strong::before,
    .section-title strong::before {
      content: '|';
      display: inline-block;
      margin-right: 8px;
      color: #4b5667;
      letter-spacing: 0;
    }
    .row {
      display: grid;
      grid-template-columns: 56px minmax(0, 1fr);
      gap: 10px;
      align-items: stretch;
    }
    .label {
      display: flex;
      align-items: center;
      color: var(--muted);
      font-size: 13px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      white-space: nowrap;
      padding-left: 0;
    }
    .control {
      min-width: 0;
      min-height: 52px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: rgba(13,17,23,0.9);
      display: flex;
      align-items: center;
      padding: 0 14px;
      overflow: hidden;
    }
    .control.output-control {
      color: #66707c;
    }
    .control input {
      width: 100%;
      background: transparent;
      color: var(--text);
      border: 0;
      padding: 0;
      font-size: 15px;
      outline: none;
      min-width: 0;
    }
    .control input::placeholder {
      color: #66707c;
    }
    .output-value {
      width: 100%;
      min-width: 0;
      flex: 1;
      color: var(--text);
      font-size: 15px;
      line-height: 1.4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .output-value.placeholder {
      color: #66707c;
    }
    .control.output-control {
      position: relative;
      gap: 10px;
      padding-right: 12px;
    }
    .icon-btn {
      appearance: none;
      border: 1px solid rgba(120, 153, 212, 0.36);
      background: rgba(255, 255, 255, 0.03);
      color: #cdd9eb;
      border-radius: 999px;
      width: 28px;
      height: 28px;
      padding: 0;
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease, transform 0.15s ease;
    }
    .icon-btn:hover:not(:disabled) {
      border-color: rgba(145, 180, 245, 0.62);
      color: #f2f7ff;
      background: rgba(120, 153, 212, 0.16);
      transform: translateY(-1px);
    }
    .icon-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      transform: none;
    }
    input[type="text"] {
      width: 100%;
    }
    .actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-top: 4px;
    }
    button {
      appearance: none;
      border: 1px solid #2a313c;
      border-radius: 14px;
      padding: 14px 18px;
      font-size: 14px;
      font-weight: 600;
      line-height: 1;
      cursor: pointer;
      color: #e3eaf3;
      transition: transform 0.15s ease, border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;
      background: linear-gradient(180deg, #171b23 0%, #10151c 100%);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
    }
    .btn-primary {
      border-color: rgba(74,192,96,0.32);
    }
    .btn-primary:hover {
      border-color: rgba(74,192,96,0.38);
      color: #f2fff4;
    }
    .btn-secondary {
      border-color: rgba(68,128,255,0.32);
    }
    .btn-secondary:hover {
      border-color: rgba(68,128,255,0.38);
      color: #f2f6ff;
    }
    .btn-warning {
      border-color: rgba(223,180,86,0.32);
    }
    .btn-warning:hover {
      border-color: rgba(223,180,86,0.4);
      color: #fffaf0;
    }
    button:hover {
      transform: translateY(-1px);
    }
    .result-status {
      position: absolute;
      right: 48px;
      top: 50%;
      transform: translateY(-50%);
      min-width: 0;
      color: #d8dee9;
      font-size: 12px;
      letter-spacing: 0.04em;
      white-space: nowrap;
      opacity: 0;
      transition: opacity 0.2s ease;
      pointer-events: none;
    }
    .result-status.show {
      opacity: 1;
    }
    .result-text {
      display: none;
    }
    .section {
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px solid rgba(255,255,255,0.06);
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .section-head {
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .section-title {
      display: grid;
      gap: 2px;
    }
    .section-title strong {
      font-size: 16px;
      letter-spacing: 0.2px;
    }
    .tab-nav {
      display: flex;
      gap: 8px;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }
    .tab-btn {
      appearance: none;
      border: 1px solid #2f3642;
      background: rgba(15,21,30,0.8);
      color: #c4ccd8;
      border-radius: 999px;
      padding: 7px 12px;
      font-size: 13px;
      line-height: 1;
      cursor: pointer;
      transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease;
    }
    .tab-btn.active {
      border-color: rgba(68,128,255,0.55);
      color: #eef4ff;
      background: rgba(68,128,255,0.18);
    }
    .panel {
      display: block;
      border: 1px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
      background: rgba(13,17,23,0.74);
      flex: 1;
      min-height: 0;
    }
    .panel:not(.active) {
      display: none;
    }
    .panel-meta {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      color: var(--muted);
      font-size: 13px;
    }
    .panel-meta code {
      color: #c9d1d9;
      background: rgba(255,255,255,0.04);
      padding: 2px 6px;
      border-radius: 6px;
    }
    .panel-scroll {
      flex: 1;
      min-height: 0;
      overflow: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .panel-scroll::-webkit-scrollbar {
      width: 0;
      height: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    thead th {
      text-align: left;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      background: rgba(255,255,255,0.02);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      padding: 10px 12px;
    }
    tbody td {
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 14px;
      color: var(--text);
      white-space: normal;
      word-break: break-word;
    }
    tbody tr:last-child td {
      border-bottom: 0;
    }
    .whitelist-host {
      font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace;
    }
    .history-list,
    .mirror-list {
      display: grid;
      gap: 8px;
      padding: 10px;
    }

    .empty-state {
      margin: 10px;
      padding: 16px;
      border: 1px dashed rgba(255,255,255,0.12);
      border-radius: 12px;
      color: #7f8792;
      font-size: 13px;
      text-align: center;
    }

    .history-card,
    .mirror-card {
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      background: rgba(255,255,255,0.02);
      padding: 10px;
      display: grid;
      gap: 8px;
    }

    .history-head {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      justify-content: space-between;
    }

    .history-tag {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 30px;
      height: 20px;
      padding: 0 7px;
      border-radius: 6px;
      border: 1px solid rgba(139, 151, 170, 0.45);
      background: rgba(255, 255, 255, 0.02);
      color: #b8c2d2;
      font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace;
      font-size: 11px;
      line-height: 1;
      letter-spacing: 0.02em;
    }

    .history-time {
      min-width: 0;
      flex: 1;
      font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.4;
      color: #a8b3c4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .history-source {
      min-width: 0;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      width: fit-content;
      max-width: 100%;
      font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace;
      font-size: 13px;
      line-height: 1.4;
      color: #dce6f5;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .history-source > span {
      min-width: 0;
      flex: 0 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .history-target-row {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      width: fit-content;
      max-width: 100%;
    }

    .history-target {
      min-width: 0;
      flex: 0 1 auto;
      font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.4;
      color: #8fb2ff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .history-inline-actions {
      display: inline-flex;
      align-items: center;
      gap: 1px;
      flex: 0 0 auto;
      white-space: nowrap;
      margin-left: 1px;
    }

    .history-inline-link {
      border: 0;
      width: auto;
      height: auto;
      padding: 0;
      color: #9ab9ff;
      background: transparent;
      font-size: 11px;
      line-height: 1;
      position: relative;
      top: -2px;
      margin-left: 0;
      transform: none;
      white-space: nowrap;
      flex: 0 0 auto;
      letter-spacing: 0;
    }

    .history-inline-link:hover:not(:disabled) {
      color: #d6e6ff;
      background: transparent;
      transform: none;
    }

    .history-delete {
      width: 24px;
      height: 24px;
      border-color: rgba(248, 81, 73, 0.36);
      color: #ffd7d5;
      flex: 0 0 auto;
    }

    .history-delete:hover:not(:disabled) {
      border-color: rgba(248, 81, 73, 0.62);
      color: #fff2f1;
      background: rgba(248, 81, 73, 0.14);
    }

    .history-actions {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .btn-inline {
      appearance: none;
      border: 1px solid #2f3642;
      background: rgba(15,21,30,0.8);
      color: #d8e1ee;
      border-radius: 10px;
      padding: 6px 10px;
      font-size: 12px;
      line-height: 1;
      cursor: pointer;
      transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease;
    }
    .btn-inline:hover {
      border-color: rgba(68,128,255,0.5);
      color: #eef4ff;
    }
    .btn-inline.danger:hover {
      border-color: rgba(248,81,73,0.5);
      color: #ffe9e8;
    }

    .mirror-name {
      font-size: 14px;
      color: #ecf2fc;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .mirror-url {
      font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace;
      font-size: 12px;
      color: #8fb2ff;
      word-break: break-all;
    }
    .mirror-note {
      color: #8b949e;
      font-size: 12px;
      line-height: 1.4;
    }
    th:first-child,
    td:first-child {
      width: 42px;
      min-width: 42px;
      max-width: 42px;
      padding-right: 8px;
      text-align: center;
    }
    @media (max-width: 640px) {
      .card {
        padding: 14px;
        border-radius: 16px;
      }
      h1 {
        font-size: 24px;
      }
      .wrap {
        padding: 8px;
      }
      .row {
        grid-template-columns: 46px minmax(0, 1fr);
        gap: 8px;
      }
      .label {
        padding-left: 0;
      }
      .icon-btn {
        width: 26px;
        height: 26px;
      }
      .actions {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      button {
        width: 100%;
      }
      .panel-meta {
        flex-direction: column;
      }
      .tab-nav {
        gap: 6px;
      }
      .tab-btn {
        padding: 7px 10px;
      }
      thead th,
      tbody td {
        padding: 8px 10px;
      }
      .history-actions {
        gap: 6px;
      }
      th:first-child,
      td:first-child {
        width: 34px;
        min-width: 34px;
        max-width: 34px;
        padding-right: 6px;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="hero">
        <h1>云间引渡（Github代理）</h1>
      </div>

      <div class="workspace">
        <div class="module-title"><strong>迁津</strong></div>
        <div class="row">
          <span class="label">输入</span>
          <div class="control">
            <input
              id="url"
              type="text"
              placeholder="例如：https://github.com/user/repo 或 raw.githubusercontent.com/user/repo/main/file.js"
              autocomplete="off"
            />
            <button class="icon-btn" id="clearInputBtn" type="button" title="清空输入" aria-label="清空输入">×</button>
          </div>
        </div>

        <div class="row">
          <span class="label">输出</span>
          <div class="control output-control">
            <span class="output-value placeholder" id="result">生成后的代理链接会显示在这里</span>
            <button class="icon-btn" id="openOutputBtn" type="button" title="打开输出链接" aria-label="打开输出链接" disabled>↗</button>
            <span class="result-status" id="toast" aria-live="polite"></span>
          </div>
        </div>

        <div class="actions">
          <button class="btn-primary" onclick="convertOnly()">转换</button>
          <button class="btn-warning" onclick="copyProxy()">复制</button>
          <button class="btn-secondary" onclick="openProxy()">打开</button>
        </div>

        <div class="section">
          <div class="section-head">
            <div class="section-title"><strong>嘉录</strong></div>
          </div>

          <div class="tab-nav" id="tabNav">
            <button class="tab-btn active" type="button" data-tab="history">历史记录</button>
            <button class="tab-btn" type="button" data-tab="mirrors">镜像推荐</button>
            <button class="tab-btn" type="button" data-tab="whitelist">白名单</button>
          </div>

          <div class="panel active" data-panel="history">
            <div class="panel-meta">
              <div>记录数量：<code id="historyCount"></code></div>
              <button class="btn-inline danger" id="clearHistoryBtn" type="button">清空历史</button>
            </div>
            <div class="panel-scroll">
              <div class="history-list" id="historyList"></div>
            </div>
          </div>

          <div class="panel" data-panel="mirrors">
            <div class="panel-meta">
              <div>推荐数量：<code id="mirrorCount"></code></div>
              <div>可用性会随网络波动变化</div>
            </div>
            <div class="panel-scroll">
              <div class="mirror-list" id="mirrorList"></div>
            </div>
          </div>

          <div class="panel" data-panel="whitelist">
            <div class="panel-meta">
              <div>白名单数量：<code id="whitelistCount"></code></div>
            </div>
            <div class="panel-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>域名</th>
                  </tr>
                </thead>
                <tbody id="whitelistBody"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const input = document.getElementById('url');
    const result = document.getElementById('result');
    const clearInputBtn = document.getElementById('clearInputBtn');
    const openOutputBtn = document.getElementById('openOutputBtn');
    const tabNav = document.getElementById('tabNav');
    const tabButtons = Array.from(tabNav.querySelectorAll('.tab-btn'));
    const panels = Array.from(document.querySelectorAll('[data-panel]'));
    const historyList = document.getElementById('historyList');
    const historyCount = document.getElementById('historyCount');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const mirrorCount = document.getElementById('mirrorCount');
    const mirrorList = document.getElementById('mirrorList');
    const whitelistBody = document.getElementById('whitelistBody');
    const whitelistCount = document.getElementById('whitelistCount');
    const toast = document.getElementById('toast');
    const errorMessage = ${safeErrorMessage};
    const whitelist = ${safeWhitelist};
    const mirrorRecommendations = ${safeMirrorRecommendations};
    const proxyBaseHost = ${JSON.stringify(proxy_base_host)};
    const historyStorageKey = 'github_proxy_history_v1';
    const maxHistoryItems = 40;
    let currentOutputUrl = '';

    let historyRecords = loadHistory();

    function normalizeInput(v) {
      return (v || '').trim();
    }

    function escapeText(v) {
      return String(v || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function loadHistory() {
      try {
        const raw = localStorage.getItem(historyStorageKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(function (item) {
          return item && typeof item.input === 'string' && typeof item.proxy === 'string' && typeof item.time === 'number';
        });
      } catch (e) {
        return [];
      }
    }

    function persistHistory() {
      try {
        localStorage.setItem(historyStorageKey, JSON.stringify(historyRecords));
      } catch (e) {}
    }

    function formatTime(ts) {
      try {
        return new Date(ts).toLocaleString('zh-CN', { hour12: false });
      } catch (e) {
        return '';
      }
    }

    function saveHistory(inputUrl, proxyUrl) {
      if (!inputUrl || !proxyUrl) return;

      const normalizedInput = String(inputUrl).trim();
      const normalizedProxy = String(proxyUrl).trim();
      if (!normalizedInput || !normalizedProxy) return;

      historyRecords = historyRecords.filter(function (item) {
        return item.proxy !== normalizedProxy;
      });

      historyRecords.unshift({
        input: normalizedInput,
        proxy: normalizedProxy,
        time: Date.now()
      });

      if (historyRecords.length > maxHistoryItems) {
        historyRecords = historyRecords.slice(0, maxHistoryItems);
      }

      persistHistory();
      renderHistory();
    }

    function removeHistoryByIndex(index) {
      if (!Number.isInteger(index) || index < 0 || index >= historyRecords.length) return;
      historyRecords.splice(index, 1);
      persistHistory();
      renderHistory();
    }

    function clearHistory() {
      historyRecords = [];
      persistHistory();
      renderHistory();
    }

    function renderHistory() {
      historyCount.textContent = String(historyRecords.length);

      if (!historyRecords.length) {
        historyList.innerHTML = '<div class="empty-state">暂无历史记录，转换成功后会自动保存到本地。</div>';
        return;
      }

      historyList.innerHTML = historyRecords.map(function (item, index) {
        return '<article class="history-card">' +
          '<div class="history-head">' +
            '<span class="history-tag">#' + (index + 1) + '</span>' +
            '<span class="history-time">' + escapeText(formatTime(item.time)) + '</span>' +
            '<button class="icon-btn history-delete" type="button" data-action="delete" data-index="' + index + '" title="删除记录" aria-label="删除记录">🗑</button>' +
          '</div>' +
          '<div class="history-source">' +
            '<span title="' + escapeText(item.input) + '">' + escapeText(item.input) + '</span>' +
            '<span class="history-inline-actions">' +
              '<button class="icon-btn history-inline-link" type="button" data-action="copy-source" data-index="' + index + '" title="复制原网址" aria-label="复制原网址">⧉</button>' +
              '<button class="icon-btn history-inline-link" type="button" data-action="open-source" data-index="' + index + '" title="打开原网址" aria-label="打开原网址">↗</button>' +
            '</span>' +
          '</div>' +
          '<div class="history-target-row">' +
            '<div class="history-target" title="' + escapeText(item.proxy) + '">' + escapeText(item.proxy) + '</div>' +
            '<span class="history-inline-actions">' +
              '<button class="icon-btn history-inline-link" type="button" data-action="copy-target" data-index="' + index + '" title="复制代理网址" aria-label="复制代理网址">⧉</button>' +
              '<button class="icon-btn history-inline-link" type="button" data-action="open-target" data-index="' + index + '" title="打开代理网址" aria-label="打开代理网址">↗</button>' +
            '</span>' +
          '</div>' +
        '</article>';
      }).join('');
    }

    function renderMirrors() {
      mirrorCount.textContent = String(mirrorRecommendations.length);

      if (!mirrorRecommendations.length) {
        mirrorList.innerHTML = '<div class="empty-state">暂未配置镜像推荐。</div>';
        return;
      }

      mirrorList.innerHTML = mirrorRecommendations.map(function (item) {
        const name = escapeText(item && item.name ? item.name : '-');
        const url = escapeText(item && item.url ? item.url : '-');
        const note = escapeText(item && item.note ? item.note : '');
        return '<div class="mirror-card">' +
          '<div class="mirror-name">' + name + '</div>' +
          '<div class="mirror-url">' + url + '</div>' +
          '<div class="mirror-note">' + note + '</div>' +
          '<div class="history-actions">' +
            '<button class="btn-inline" type="button" data-mirror-action="open" data-url="' + url + '">打开</button>' +
            '<button class="btn-inline" type="button" data-mirror-action="copy" data-url="' + url + '">复制</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function setActiveTab(tab) {
      tabButtons.forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
      });
      panels.forEach(function (panel) {
        panel.classList.toggle('active', panel.getAttribute('data-panel') === tab);
      });
    }

    function buildProxyUrl(input) {
      if (!input) return null;

      let raw = input.trim();
      if (!raw) return null;

      if (!/^https?:\\/\\//i.test(raw)) {
        raw = 'https://' + raw;
      }

      try {
        const u = new URL(raw);
        const host = u.host.toLowerCase();
        if (whitelist.indexOf(host) === -1) {
          return null;
        }

        const proxyPrefix = host.replace(/\./g, '-') + '-gh.';
        const proxy = new URL(u.href);
        proxy.protocol = 'https:';
        proxy.host = proxyPrefix + proxyBaseHost;
        return proxy.href;
      } catch (e) {
        return null;
      }
    }

    function renderWhitelist() {
      whitelistCount.textContent = String(whitelist.length);
      whitelistBody.innerHTML = whitelist.map((domain, index) => {
        return '<tr>' +
          '<td>' + (index + 1) + '</td>' +
          '<td class="whitelist-host">' + domain + '</td>' +
        '</tr>';
      }).join('');
    }

    function setOutput(text, isPlaceholder, outputUrl) {
      result.textContent = text;
      result.classList.toggle('placeholder', !!isPlaceholder);
      currentOutputUrl = outputUrl || '';
      openOutputBtn.disabled = !currentOutputUrl;
      openOutputBtn.title = currentOutputUrl ? '打开输出链接' : '暂无可打开链接';
    }

    function showToast(text) {
      toast.textContent = text;
      toast.classList.add('show');
      window.clearTimeout(window.__toastTimer);
      window.__toastTimer = window.setTimeout(function () {
        toast.classList.remove('show');
      }, 1200);
    }

    async function convertUrl() {
      const raw = normalizeInput(input.value);
      if (!raw) {
        setOutput('请先输入链接', true, '');
        return null;
      }

      const localTarget = buildProxyUrl(raw);
      if (location.protocol === 'file:' || !location.hostname || location.hostname === '') {
        if (!localTarget) {
          setOutput('链接无效，或当前域名不在白名单中', true, '');
          return null;
        }
        setOutput(localTarget, false, localTarget);
        saveHistory(raw, localTarget);
        return localTarget;
      }

      const api = '/api/convert?url=' + encodeURIComponent(raw);
      try {
        const res = await fetch(api, { method: 'GET' });
        const data = await res.json();
        if (!res.ok || !data.ok || !data.proxy_url) {
          if (localTarget) {
            setOutput(localTarget, false, localTarget);
            saveHistory(raw, localTarget);
            return localTarget;
          }
          setOutput('链接无效，或当前域名不在白名单中', true, '');
          return null;
        }
        setOutput(data.proxy_url, false, data.proxy_url);
        saveHistory(raw, data.proxy_url);
        return data.proxy_url;
      } catch (e) {
        if (localTarget) {
          setOutput(localTarget, false, localTarget);
          saveHistory(raw, localTarget);
          return localTarget;
        }
        setOutput('转换失败：' + e.message, true, '');
        return null;
      }
    }

    async function convertOnly() {
      await convertUrl();
    }

    async function openProxy() {
      const popup = window.open('about:blank', '_blank');
      if (!popup) {
        showToast('浏览器拦截了新标签页');
        return;
      }
      try { popup.opener = null; } catch (e) {}

      const target = await convertUrl();
      if (!target) {
        popup.close();
        return;
      }

      popup.location.replace(target);
    }

    async function copyProxy() {
      const target = await convertUrl();
      if (!target) return;

      try {
        await navigator.clipboard.writeText(target);
        showToast('已复制');
      } catch (e) {
        showToast('复制失败');
      }
    }

    function openCurrentOutput() {
      if (!currentOutputUrl) {
        showToast('暂无可打开链接');
        return;
      }
      window.open(currentOutputUrl, '_blank', 'noopener,noreferrer');
    }

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        openProxy();
      }
    });

    clearInputBtn.addEventListener('click', function () {
      input.value = '';
      input.focus();
      setOutput('生成后的代理链接会显示在这里', true, '');
    });

    openOutputBtn.addEventListener('click', openCurrentOutput);

    tabNav.addEventListener('click', function (event) {
      const btn = event.target.closest('button[data-tab]');
      if (!btn) return;
      setActiveTab(btn.getAttribute('data-tab'));
    });

    clearHistoryBtn.addEventListener('click', function () {
      if (!historyRecords.length) {
        showToast('历史为空');
        return;
      }
      if (!window.confirm('确认清空本地历史记录？')) return;
      clearHistory();
      showToast('已清空');
    });

    historyList.addEventListener('click', async function (event) {
      const btn = event.target.closest('button[data-action]');
      if (!btn) return;

      const index = Number(btn.getAttribute('data-index'));
      const item = historyRecords[index];
      if (!item) return;

      const action = btn.getAttribute('data-action');
      if (action === 'open-source') {
        window.open(item.input, '_blank', 'noopener,noreferrer');
        return;
      }

      if (action === 'copy-source') {
        try {
          await navigator.clipboard.writeText(item.input);
          showToast('已复制');
        } catch (e) {
          showToast('复制失败');
        }
        return;
      }

      if (action === 'open-target') {
        window.open(item.proxy, '_blank', 'noopener,noreferrer');
        return;
      }

      if (action === 'copy-target') {
        try {
          await navigator.clipboard.writeText(item.proxy);
          showToast('已复制');
        } catch (e) {
          showToast('复制失败');
        }
        return;
      }

      if (action === 'delete') {
        removeHistoryByIndex(index);
        showToast('已删除');
      }
    });

    mirrorList.addEventListener('click', async function (event) {
      const btn = event.target.closest('button[data-mirror-action]');
      if (!btn) return;

      const action = btn.getAttribute('data-mirror-action');
      const targetUrl = btn.getAttribute('data-url') || '';
      if (!targetUrl) return;

      if (action === 'open') {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      if (action === 'copy') {
        try {
          await navigator.clipboard.writeText(targetUrl);
          showToast('已复制');
        } catch (e) {
          showToast('复制失败');
        }
      }
    });

    renderWhitelist();
    renderMirrors();
    renderHistory();
    setActiveTab('history');

    if (errorMessage) {
      setOutput(errorMessage, true);
    }
  </script>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
