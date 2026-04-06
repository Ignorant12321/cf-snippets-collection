# rss-snippet.js（Cloudflare Snippets）简明操作指南

本文用于快速部署和使用 `rss-snippet.js`。

## 功能

- 提供统一的 RSS 代理入口：`/rss?source=<id>`。
- 通过 `FEEDS` 白名单限制可访问的 RSS 源，避免开放任意 URL 代理。
- 对允许的前端域名返回 CORS 头，支持浏览器跨域访问。
- 透传上游 RSS/XML 内容，前端可直接解析。
- 提供基础缓存与错误响应，便于线上排障。

## 原理

1. 请求进入 Cloudflare Snippet 后，只处理路径 `/rss`。
2. 读取查询参数 `source`，在 `FEEDS` 中按 `id` 查找目标 RSS 地址。
3. 若 `source` 不存在，返回 `400` JSON（包含可用 `source` 列表）。
4. 若存在，Snippet 以服务端请求上游 RSS，并获取 XML 内容。
5. 将上游内容原样返回，同时附加：
   - CORS 响应头（基于 `ALLOWED_ORIGINS`）
   - `Cache-Control` 缓存头
   - `X-RSS-Source` 调试头

## 使用示例

浏览器直接访问：

```text
https://example.com/rss?source=csdn-geeknews
```

使用 `curl`：

```bash
curl "https://example.com/rss?source=bilibili-hot"
```

前端 `fetch`：

```js
const resp = await fetch("https://example.com/rss?source=zaobao-world");
const xmlText = await resp.text();
console.log(xmlText);
```

错误示例（无效 `source`）：

```text
GET https://example.com/rss?source=not-exists
```

## 1. 在 Cloudflare 创建 Snippet

1. 登录 Cloudflare Dashboard。
2. 进入你的站点（Domain）页面。
3. 打开 `Rules` -> `Snippets`。
4. 点击 `Create snippet`。
5. 名称可填：`rss-proxy`（可自定义）。
6. 将 `rss-snippet.js` 全量内容粘贴进去并保存。

## 2. 配置生效路由

在 Snippet 的 `Route` 中添加你要拦截的路径，例如：

- `https://example.com/rss*`

说明：

- 当前代码只处理路径 `/rss`，其他路径会返回 `404`。
- 查询参数 `source` 用来选择具体 RSS 源。

## 3. 允许前端域名（CORS）

在代码顶部 `ALLOWED_ORIGINS` 中维护允许访问的前端域名，例如：

- `http://localhost:4321`
- `https://example.com`

如果前端域名不在白名单，浏览器会因 CORS 被拦截。

## 4. 调用方式

接口示例：

```text
GET https://example.com/rss?source=zaobao-china
```

可用 `source`（来自 `FEEDS` 的 `id`）：

- `zaobao-china`
- `zaobao-world`
- `csdn-geeknews`
- `bilibili-hot`

返回：

- 成功：原始 RSS/XML 内容。
- 失败：JSON 错误（如 `Invalid source`、`Upstream error`）。

## 5. 新增 RSS 源

在 `FEEDS` 数组中新增一项：

```js
{
  id: "your-source-id",
  name: "显示名称",
  url: "https://example.com/rss.xml",
}
```

要求：

- `id` 需唯一（用于 `?source=` 查询）。
- `url` 必须是可信的 RSS 地址（避免开放任意代理）。

## 6. 快速自检

1. 访问一个有效地址，确认返回 XML：
   - `/rss?source=zaobao-china`
2. 访问一个无效 source，确认返回 400：
   - `/rss?source=not-exists`
3. 在浏览器开发者工具检查响应头：
   - `Access-Control-Allow-Origin`
   - `X-RSS-Source`
   - `Cache-Control`
