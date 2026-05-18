# ip-snippet.js（Cloudflare Snippets）简明操作指南

本文用于快速部署和使用 `ip-snippet.js`。它是一个部署在 Cloudflare Snippets 上的 IP 检测面板，提供公网 IP、网络归属、proxycheck.io 风控情报和图片导出。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `ip-snippet.js` | 可读源码，包含 Snippet 后端逻辑和内嵌页面。 |
| `ip-snippet.min.js` | 压缩后用于部署到 Cloudflare Snippets 的版本，需小于 32KB。 |
| `ip.html` | 页面 UI 的可读源文件，修改界面时优先改它。 |
| `../minify-snippet.mjs` | 根目录通用压缩脚本，将 `ip.html` 同步压缩进 `ip-snippet.js` 并生成 `ip-snippet.min.js`。 |
| `../test/ip-snippet.test.mjs` | Node 测试，覆盖 API、风控解析、HTML 同步和密钥不泄露。 |

## 功能

- 访问 `/` 返回 IP 检测面板。
- 访问 `/ip/<ip-or-domain>` 打开页面并自动查询指定 IP 或域名，例如 `/ip/109.166.36.159`。
- 访问 `/api/me` 查询当前访问者公网 IP。
- 访问 `/api/lookup?target=<ip-or-domain>` 可直接获取指定 IP 或域名的 JSON 结果。
- 仍兼容 `/?ip=<ip>` 或 `/?target=<ip-or-domain>` 打开页面后自动查询，但推荐使用 `/ip/<ip-or-domain>`。
- 使用 proxycheck.io v3 查询风险分、Proxy/VPN/Tor/Hosting/Scraper/Compromised 等检测项。
- 支持多个 proxycheck API key 顺序轮询。
- 页面提供复制 IP、复制报告、导出 PNG 图片。
- 地图默认不加载，点击网络位置卡片右上角的刷新定位按钮后，才按当前经纬度加载 OpenStreetMap iframe。
- 底部提供外部查询跳转：
  - `https://ping0.cc/ip/<IP>`
  - `https://ippure.com/?ip=<IP>`
- 页面显示中文网络位置，国家/地区栏保留英文和代码信息。

## 原理

1. Snippet 收到请求后按路径分流。
2. `/` 和 `/ip/<ip-or-domain>` 返回内嵌 HTML 面板。
3. `/api/me` 从 `CF-Connecting-IP`、`X-Real-IP` 或 `X-Forwarded-For` 提取访问者 IP。
4. 页面从 `/ip/<ip-or-domain>`、`?ip=` 或输入框读取目标后，调用 `/api/lookup` 获取 JSON。
5. `/api/lookup` 会先校验输入，只允许 IP 或纯域名，不接受协议、路径、端口等危险输入。
6. 如果输入是域名，Snippet 使用 Cloudflare DNS-over-HTTPS 解析 A/AAAA 记录。
7. 解析到 IP 后，请求 proxycheck.io v3 获取风控情报。
8. 返回标准化 JSON，前端渲染风险分、检测标签、位置、ASN、国家/地区等信息。

## 部署

1. 登录 Cloudflare Dashboard。
2. 进入你的站点。
3. 打开 `Rules` -> `Snippets`。
4. 点击 `Create snippet`。
5. 名称可填：`ip-check`。
6. 将 `ip-snippet.min.js` 全量内容粘贴进去并保存。
7. 给 Snippet 配置路由，例如：

```text
https://ip.example.com/*
```

如果你用主域名路径部署，也可以配置：

```text
https://example.com/ip*
```

但当前代码默认把接口暴露在根路径下的 `/api/me` 和 `/api/lookup`。最省心的方式是给它一个独立子域名。

## proxycheck API key

在 `ip-snippet.js` 顶部填写：

```js
const CONFIG = {
  proxycheckEndpoint: "https://proxycheck.io/v3/",
  proxycheckApiKeys: ["key1", "key2", "key3"],
  riskCacheSeconds: 600,
  htmlCacheSeconds: 300,
  maxTargetLength: 253,
};
```

多个 key 会按顺序轮询：

```text
key1 -> key2 -> key3 -> key1
```

如果不填 key，也会使用 proxycheck 免费无 key 模式，但额度和数据能力可能受限。

## 密钥不泄露边界

普通访问者不会在页面 HTML、接口响应、复制报告或导出图片中看到 API key。测试也覆盖了这一点。

但 Cloudflare Snippets 没有 Worker Secrets 那种独立 Secret 绑定能力。也就是说：

- 访问网站的用户看不到 key。
- 有 Cloudflare Dashboard / API 中 Snippet 编辑权限的人能看到源码里的 key。

如果你的要求是“后台编辑者也看不到 key”，需要改用 Cloudflare Workers + Secrets 或外部后端。

## 使用示例

打开面板：

```text
https://ip.example.com/
```

查询当前访问者 IP：

```text
https://ip.example.com/api/me
```

查询指定 IP：

```text
https://ip.example.com/ip/109.166.36.159
```

查询域名：

```text
https://ip.example.com/ip/example.com
```

兼容的自动查询参数：

```text
https://ip.example.com/?ip=109.166.36.159
https://ip.example.com/?target=example.com
```

直接获取 JSON：

```text
https://ip.example.com/api/me
https://ip.example.com/api/lookup?target=109.166.36.159
```

## 页面说明

- 顶部大号 IP：当前查询目标。
- 检测标签：Proxy、VPN、Tor、Hosting、Scraper、Compromised，命中时高亮。
- 网络位置：中文优先展示。
- 地图：默认是本地 CSS 占位，不产生地图流量；点击刷新定位后才请求 OpenStreetMap 嵌入地图。
- 国家/地区：保留英文名、国家代码、洲名，方便与 API 原始结果对应。
- ASN/运营商：显示 AS 编号和网络服务商。
- 风险评估：右侧显示风险分，下面用进度条展示风险区间。
- 外部查询：跳转到 ping0.cc 和 ippure.com 的同 IP 查询页。

## 生成 32KB 以下部署文件

Cloudflare Snippets 有 32KB 大小限制。不要直接部署可读版 `ip-snippet.js`，请先生成压缩版：

```bash
node minify-snippet.mjs ip
```

默认输出：

```text
ip/ip-snippet.min.js
```

当前压缩结果约为：

```text
Original: 49,961 bytes
Minified: 31,122 bytes
Limit:    32,768 bytes
```

也可以指定输出文件名：

```bash
node minify-snippet.mjs ip ip-snippet.prod.js
```

脚本会：

1. 压缩 `ip.html`。
2. 把压缩后的 HTML 写入临时 snippet 源。
3. 用 esbuild 压缩外层 JS。
4. 检查产物是否小于 `32768` bytes。

如果超过限制，脚本会以非 0 状态退出。

## 修改 UI 的流程

推荐流程：

1. 修改 `ip.html`。
2. 修改必要的后端逻辑 `ip-snippet.js`。
3. 运行测试：

```bash
node --test test/ip-snippet.test.mjs
```

4. 生成压缩版：

```bash
node minify-snippet.mjs ip
```

5. 将 `ip/ip-snippet.min.js` 粘贴到 Cloudflare Snippets。

测试会检查 `ip.html` 与 `ip-snippet.js` 内嵌 HTML 是否同步。如果你只改了 `ip.html`，需要重新运行压缩脚本生成部署版。

## 快速自检

部署后建议检查：

1. 打开首页：
   - `https://ip.example.com/`
2. 自动查询参数：
   - `https://ip.example.com/ip/109.166.36.159`
   - `https://ip.example.com/?ip=109.166.36.159`
3. API：
   - `https://ip.example.com/api/me`
   - `https://ip.example.com/api/lookup?target=example.com`
4. 页面按钮：
   - 复制 IP
   - 图片导出
   - Report
5. 外部查询跳转：
   - Ping0.cc
   - IPPure
6. 浏览器开发者工具中确认响应体没有出现 proxycheck API key。

## 本地验证

运行测试：

```bash
node --test test/ip-snippet.test.mjs
```

检查语法：

```bash
node --check ip/ip-snippet.js
node --check ip/ip-snippet.min.js
```

检查压缩体积：

```bash
node minify-snippet.mjs ip
```

## 注意事项

- `riskCacheSeconds` 会让 proxycheck 查询在 Cloudflare 边缘缓存一段时间，减少 API 消耗。
- 域名查询会先解析到一个 IP，再查该 IP 的风控。
- 地图使用按需加载策略。默认页面不会请求地图服务；点击刷新定位按钮后，浏览器会向 OpenStreetMap 发起 iframe 请求。
- `device_estimate` 是 proxycheck 的设备/地址估计，不应解释为准确人数。
- `risk`、`confidence`、检测标签和 `last_updated` 来自 proxycheck，具体含义以 proxycheck 官方文档为准。
- Snippets 不是开放代理，本脚本只允许固定 API 路径和受限目标格式。
- 若需要真正 Secret 管理、KV/D1、复杂缓存或更大代码体积，建议改用 Cloudflare Workers。
