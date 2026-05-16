# iptv-snippet.js 使用说明

`iptv-snippet.js` 是一个用于 Cloudflare Snippets 的 IPTV M3U 代理脚本。它把 `iptv-org` 的公开 M3U 源整理成几个稳定路径：主页给人看，播放列表给播放器订阅。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `iptv-snippet.js` | 部署到 Cloudflare Snippets 的脚本。 |
| `iptv.html` | 本地预览主页样式用，不直接部署。 |
| `iptv-snippet.test.mjs` | Node 测试，覆盖路由、筛选、favicon 和 32KB 限制。 |
| `index.m3u` | 本地下载的上游样本，用于检查频道覆盖情况。 |

## 路由

| 路径 | 返回类型 | 用途 |
| --- | --- | --- |
| `/` | `text/html` | 主页，展示可用播放源。 |
| `/sources` | `application/json` | 源列表 JSON，给前端或脚本读取。 |
| `/china` | `audio/x-mpegurl` | 国内及港澳台频道。 |
| `/mainland` | `audio/x-mpegurl` | 中国大陆频道。 |
| `/hongkong` | `audio/x-mpegurl` | 香港频道。 |
| `/macau` | `audio/x-mpegurl` | 澳门频道。 |
| `/taiwan` | `audio/x-mpegurl` | 台湾频道。 |
| `/cctv` | `audio/x-mpegurl` | CCTV 频道。 |
| `/cgtn` | `audio/x-mpegurl` | CGTN 频道。 |
| `/all` | `audio/x-mpegurl` | 完整 `iptv-org` 上游源。 |

也兼容 `.m3u` / `.m3u8` / `.txt` 后缀，例如：

```text
https://iptv.ssr.ddns-ip.net/china.m3u
```

## 原理

Snippet 收到请求后，先按路径判断资源类型：

```mermaid
flowchart TD
  A[Client Request] --> B{Path}
  B -->|/| C[返回 HTML 主页]
  B -->|/sources| D[返回 JSON 源列表]
  B -->|/china 等源路径| E[拉取 iptv-org index.m3u]
  E --> F{source.match}
  F -->|正则筛选| G[输出过滤后的 M3U]
  F -->|match: null| H[输出完整 M3U]
  B -->|未知路径| I[404 JSON + 可用 source 列表]
```

频道筛选不是开放代理，也不是让用户传任意 URL。所有可访问源都在 `CONFIG.sources` 里白名单声明：

```js
{
  id: "mainland",
  name: "中国大陆频道",
  description: "筛选 tvg-id 为 .cn 的频道，包含央视、卫视、地方台等。",
  match: /tvg-id="[^"]*\.cn(?:@|")/i,
}
```

`match` 会匹配每个频道的 `#EXTINF` 元信息和播放地址。当前大中华地区入口主要依据 `tvg-id` 的国家/地区后缀：

- `.cn`：中国大陆
- `.hk`：香港
- `.mo`：澳门
- `.tw`：台湾

这样比只匹配 `CCTV|China|中国` 更稳。用本地 `index.m3u` 样本检查时，旧规则会漏掉大量 `.cn` 地方台和卫视；现在 `/china` 能覆盖 `.cn/.hk/.mo/.tw` 编码频道。

## 为什么浏览器之前是黑色播放窗口

这不是“网页黑屏”问题，本质是 URL 的资源契约设计错了。

原始代码在根路径 `/` 直接返回 M3U，并声明：

```text
Content-Type: audio/x-mpegurl
```

浏览器看到这个 MIME type，会把当前 URL 当成媒体播放列表，而不是网页。于是浏览器进入内置媒体播放界面，常见表现就是一个黑色播放窗口。

PotPlayer 能播放，是因为 PotPlayer 的角色就是 IPTV/M3U 播放器；浏览器直接打开根路径时，它并不知道你想看的是“源目录页”，还是“播放一个媒体资源”。另外，M3U 里通常包含许多远端 HLS 地址，浏览器内置播放器还可能受编码、跨域、协议和上游可用性影响，即使进入播放界面也不一定能播放。

现在的设计把资源分开：

```text
/        -> text/html，人看的主页
/china   -> audio/x-mpegurl，播放器订阅源
/sources -> application/json，程序读取的源列表
```

这让浏览器、播放器和脚本都能按正确的协议处理同一个站点。

## Cloudflare 32KB 限制

Cloudflare Snippets 有 32KB 大小限制。为避免主页 HTML/CSS 把脚本撑大，当前实现做了压缩嵌入：

1. `iptv.html` 保留完整可读的静态展示页，方便本地看界面。
2. `iptv-snippet.js` 内只保存 gzip 后的 base64 HTML 模板。
3. Snippet 运行时用 `DecompressionStream("gzip")` 解压模板。
4. 解压后填入 `__HOST__`、`__BASE_URL__`、`__SOURCE_ITEMS__`。
5. 测试会检查脚本大小必须小于 `32 * 1024` 字节。

主页 favicon 使用内联 SVG，不需要额外静态文件。

## 风险与影响

这个 Snippet 只代理 M3U 文本，不代理真实视频流。播放器拿到播放列表后，会直接访问列表里的 `.m3u8` 或视频分片地址，通常不会再经过你的 Cloudflare 域名。

对 Cloudflare 的主要影响是：

- Snippet 调用次数会增加。
- 边缘节点会定期拉取上游 `index.m3u`。
- `/all` 返回完整 M3U，文本流量比筛选后的路径更高。
- HTML 主页会在请求 `/` 时解压一次模板，开销很小。

需要留意的风险：

- 上游源或频道地址可能失效、变慢或被地区限制。
- 公开传播后，请求量可能增加；如果只是自用，影响通常很小。
- IPTV 内容的版权和可用地区需要自行判断。
- 不建议开放 `?url=任意地址` 形式的代理，当前白名单配置更可控。

## 部署

1. 登录 Cloudflare Dashboard。
2. 进入对应站点。
3. 打开 `Rules` -> `Snippets`。
4. 点击 `Create snippet`。
5. 名称可填 `iptv-proxy`。
6. 粘贴 `iptv-snippet.js` 全量内容并保存。
7. 给 Snippet 配置路由：

```text
https://iptv.ssr.ddns-ip.net/*
```

如果以后换域名，优先改 Cloudflare 路由。`CONFIG.homepageHost` 只用于主页徽标展示。

## 使用

浏览器访问主页：

```text
https://iptv.ssr.ddns-ip.net/
```

PotPlayer / VLC / Kodi / TiviMate 订阅地址：

```text
https://iptv.ssr.ddns-ip.net/china
```

命令行自检：

```bash
curl "https://iptv.ssr.ddns-ip.net/sources"
curl "https://iptv.ssr.ddns-ip.net/china"
curl "https://iptv.ssr.ddns-ip.net/mainland"
```

无效路径会返回 `404` JSON，并附带可用源列表：

```text
GET https://iptv.ssr.ddns-ip.net/not-exists
```

## 自定义源

在 `CONFIG.sources` 中新增一项即可：

```js
{
  id: "sports",
  name: "体育频道",
  description: "筛选体育相关频道。",
  match: /Sports|Sport|体育/i,
}
```

规则：

- `id` 会成为访问路径，例如 `/sports`。
- `match` 是筛选正则，会匹配频道元信息和播放地址。
- `match: null` 表示不筛选，直接返回完整上游列表。

不建议做成 `?url=任意地址` 的开放代理。白名单式配置更容易控缓存、排障和安全边界。

## CORS 说明

`allowedOrigins` 只影响浏览器跨域 `fetch()`。PotPlayer 订阅 M3U 一般不会带 `Origin` 请求头，也不会受浏览器 CORS 限制。

如果你的网页前端需要跨域读取 `/sources` 或某个 M3U，把网页域名加入 `CONFIG.allowedOrigins` 即可。

## 验证

本地运行：

```bash
node --test iptv/iptv-snippet.test.mjs
```

测试覆盖：

- `/` 返回 HTML 而不是 M3U。
- 主页包含 favicon。
- Snippet 体积低于 32KB。
- `/sources` 返回公开源信息。
- `/china` 能匹配 `.cn/.hk/.mo/.tw` 频道。
- 未知路径返回 `404` 和可用 source 列表。
