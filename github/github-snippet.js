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
      return new Response(await renderHomePage('', proxy_base_host), {
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
        return new Response(await renderHomePage('链接无效，请输入完整的 GitHub / Raw / Gist / GitHub Pages 链接。', proxy_base_host), {
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
const GITHUB_FAVICON_LINK = `  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%2311130f'/%3E%3Cpath d='M11 12h-1a5 5 0 0 0 0 10h5' fill='none' stroke='%2378c66d' stroke-width='2.4' stroke-linecap='round'/%3E%3Cpath d='M17 10h5a5 5 0 0 1 0 10h-1' fill='none' stroke='%2378c8c4' stroke-width='2.4' stroke-linecap='round'/%3E%3Cpath d='M12 17h8' fill='none' stroke='%23d7ad58' stroke-width='2.4' stroke-linecap='round'/%3E%3Cpath d='M18 14l3 3-3 3' fill='none' stroke='%23d7ad58' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E" type="image/svg+xml">
`;
const HOME_HTML_GZIP_BASE64 = "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";
let homeHtmlPromise;

async function decodeHomeHtml() {
  const binary = atob(HOME_HTML_GZIP_BASE64);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function getHomeHtml() {
  if (!homeHtmlPromise) {
    homeHtmlPromise = decodeHomeHtml().then((html) => (
      html.includes('rel="icon"')
        ? html
        : html.replace('  <title>云间引渡</title>\n', `  <title>云间引渡</title>\n${GITHUB_FAVICON_LINK}`)
    ));
  }
  return homeHtmlPromise;
}

async function renderHomePage(errorMessage = '', proxy_base_host = '<YOUR_DOMAIN>') {
  const html = await getHomeHtml();
  return html
    .replaceAll('__PROXY_BASE_HOST__', JSON.stringify(proxy_base_host))
    .replace('__ERROR_MESSAGE__', JSON.stringify(errorMessage || ''));
}
