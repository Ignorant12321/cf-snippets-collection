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
