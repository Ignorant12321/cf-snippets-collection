/**
 * Cloudflare Snippet
 * 
 * 功能说明：
 * 1. 仅拦截 /h、/v、/r 三个路径
 * 2. 通过读取源站 random.js 获取图片数量信息
 * 3. 随机选择图片后返回 302 重定向
 * 4. 其他请求保持原样转发，不影响原静态站点
 */

const CONFIG = {
  // 你的静态随机图站点根地址
  originBaseUrl: 'https://pic.ssr.ddns-ip.net',

  // 缓存 counts 信息的时长（毫秒）
  countsCacheTtlMs: 10 * 60 * 1000,

  // random.js 的边缘缓存时间（秒）
  randomJsCacheTtlSeconds: 600,

  // 图片默认扩展名
  imageExtension: 'webp',
};

/**
 * 内存缓存：
 * 在 Snippet 实例存活期间，减少重复请求 random.js
 */
let cachedCounts = null;
let cachedAt = 0;

/**
 * 判断缓存是否仍然有效
 * 
 * @returns {boolean}
 */
function isCountsCacheValid() {
  return (
    cachedCounts !== null &&
    Date.now() - cachedAt < CONFIG.countsCacheTtlMs
  );
}

/**
 * 生成 [1, max] 范围内的随机整数
 * 
 * @param {number} max 最大值，必须大于 0
 * @returns {number}
 */
function getRandomInt(max) {
  if (!Number.isInteger(max) || max <= 0) {
    throw new Error(`无效的随机范围：${max}`);
  }

  return Math.floor(Math.random() * max) + 1;
}

/**
 * 从 random.js 文本中提取 counts 对象
 * 兼容如下形式：
 *   counts = {"h":123,"v":456}
 *   const counts = {"h":123,"v":456}
 * 
 * @param {string} scriptText
 * @returns {{h: number, v: number}}
 */
function parseCountsFromScript(scriptText) {
  const patterns = [
    /counts\s*=\s*(\{[^}]+\})/,
    /const\s+counts\s*=\s*(\{[^}]+\})/,
  ];

  for (const pattern of patterns) {
    const match = scriptText.match(pattern);
    if (!match) {
      continue;
    }

    const parsed = JSON.parse(match[1]);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Number.isInteger(parsed.h) &&
      Number.isInteger(parsed.v)
    ) {
      return parsed;
    }
  }

  throw new Error('无法从 random.js 中解析 counts 信息');
}

/**
 * 获取图片数量信息
 * 优先使用内存缓存；缓存失效时重新请求源站 random.js
 * 
 * @returns {Promise<{h: number, v: number}>}
 */
async function getCounts() {
  if (isCountsCacheValid()) {
    return cachedCounts;
  }

  const randomJsUrl = `${CONFIG.originBaseUrl}/random.js`;

  const response = await fetch(randomJsUrl, {
    cf: {
      cacheTtl: CONFIG.randomJsCacheTtlSeconds,
      cacheEverything: true,
    },
  });

  if (!response.ok) {
    throw new Error(`请求 random.js 失败，状态码：${response.status}`);
  }

  const scriptText = await response.text();
  const counts = parseCountsFromScript(scriptText);

  cachedCounts = counts;
  cachedAt = Date.now();

  return counts;
}

/**
 * 构造图片真实地址
 * 
 * @param {'h' | 'v'} type 图片类型：h=横图，v=竖图
 * @param {number} index 图片编号
 * @returns {string}
 */
function buildImageUrl(type, index) {
  return `${CONFIG.originBaseUrl}/ri/${type}/${index}.${CONFIG.imageExtension}`;
}

/**
 * 生成不缓存随机入口的 302 重定向响应
 * 真实图片 URL 仍然可以由源站/CDN 正常缓存
 *
 * @param {string} imageUrl
 * @returns {Response}
 */
function createNoCacheRedirect(imageUrl) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: imageUrl,
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}

/**
 * 生成横图的 302 重定向响应
 * 
 * @param {{h: number, v: number}} counts
 * @returns {Response}
 */
function createHorizontalRedirect(counts) {
  const index = getRandomInt(counts.h);
  const imageUrl = buildImageUrl('h', index);
  return createNoCacheRedirect(imageUrl);
}

/**
 * 生成竖图的 302 重定向响应
 * 
 * @param {{h: number, v: number}} counts
 * @returns {Response}
 */
function createVerticalRedirect(counts) {
  const index = getRandomInt(counts.v);
  const imageUrl = buildImageUrl('v', index);
  return createNoCacheRedirect(imageUrl);
}

/**
 * 生成混合随机图的 302 重定向响应
 * 随机在横图、竖图中二选一
 * 
 * @param {{h: number, v: number}} counts
 * @returns {Response}
 */
function createRandomRedirect(counts) {
  const useVertical = Math.random() < 0.5;

  if (useVertical) {
    return createVerticalRedirect(counts);
  }

  return createHorizontalRedirect(counts);
}

/**
 * 判断当前路径是否属于 Snippet 需要处理的 API 路径
 * 
 * @param {string} path
 * @returns {boolean}
 */
function isApiPath(path) {
  return path === '/h' || path === '/v' || path === '/r';
}

export default {
  /**
   * Cloudflare 请求入口
   * 
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async fetch(request) {
    const url = new URL(request.url);

    // 去掉末尾多余的斜杠，保证 /h 和 /h/ 都能兼容
    const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';

    // 非目标路径直接放行，避免影响原站首页、静态资源、random.js 等内容
    if (!isApiPath(normalizedPath)) {
      return fetch(request);
    }

    try {
      const counts = await getCounts();

      switch (normalizedPath) {
        case '/h':
          return createHorizontalRedirect(counts);

        case '/v':
          return createVerticalRedirect(counts);

        case '/r':
          return createRandomRedirect(counts);

        default:
          // 理论上不会走到这里，作为兜底处理
          return fetch(request);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '未知错误';

      return new Response(`Snippet 运行失败：${message}`, {
        status: 500,
        headers: {
          'Content-Type': 'text/plain; charset=UTF-8',
        },
      });
    }
  },
};
