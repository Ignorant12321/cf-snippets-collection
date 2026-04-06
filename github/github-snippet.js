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
const HOME_HTML_GZIP_BASE64 = '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';
let homeHtmlPromise;

async function decodeHomeHtml() {
  const binary = atob(HOME_HTML_GZIP_BASE64);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function getHomeHtml() {
  if (!homeHtmlPromise) {
    homeHtmlPromise = decodeHomeHtml();
  }
  return homeHtmlPromise;
}

async function renderHomePage(errorMessage = '', proxy_base_host = '<YOUR_DOMAIN>') {
  const html = await getHomeHtml();
  return html
    .replaceAll('__PROXY_BASE_HOST__', JSON.stringify(proxy_base_host))
    .replace('__ERROR_MESSAGE__', JSON.stringify(errorMessage || ''));
}
