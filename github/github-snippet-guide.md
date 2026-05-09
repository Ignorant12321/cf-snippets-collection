# github-snippet.js（Cloudflare Snippets）简明操作指南

本文用于快速部署和使用 `github-snippet.js`，它提供一个 GitHub 相关域名的反向代理入口，并带有首页链接转换工具。

## 功能

- 代理访问 GitHub 主站：`github.com`。
- 代理访问 GitHub 静态资源、头像、API、Raw、Gist、GitHub Pages 等常用域名。
- 提供首页入口：`home-gh.<YOUR_DOMAIN>`。
- 首页支持输入原始 GitHub / Raw / Gist / GitHub Pages 链接，并跳转到对应代理地址。
- 提供 `/go?url=<url>` 跳转接口，用于把原始链接转换为代理链接后直接重定向。
- 提供 `/api/convert?url=<url>` JSON 接口，用于程序化获取代理链接。
- 自动改写文本内容中的 GitHub 相关链接，尽量让页面内跳转继续走代理域名。
- 自动改写上游重定向响应中的 `Location` 地址。
- 对文本、JSON、JavaScript、XML、SVG 等内容进行链接替换。
- 对图片、压缩包等非文本内容直接透传。
- 强制 HTTP 请求跳转到 HTTPS。
- 可选择让中国大陆以外地区自动跳回 GitHub 原始域名。
- 返回基础 CORS 与缓存响应头，方便浏览器访问和减少重复请求。

## 原理

脚本通过域名前缀判断要代理的原始 GitHub 域名。

例如你的域名是：

```text
example.com
```

那么常用代理域名会是：

```text
github-com-gh.example.com
raw-githubusercontent-com-gh.example.com
gist-githubusercontent-com-gh.example.com
api-github-com-gh.example.com
home-gh.example.com
```

访问：

```text
https://github-com-gh.example.com/octocat/Hello-World
```

脚本会请求：

```text
https://github.com/octocat/Hello-World
```

再把响应中的 GitHub 相关链接改写回你的代理域名。

## 支持的域名

默认白名单在 `domain_whitelist` 中维护，当前包含：

- `github.com`
- `avatars.githubusercontent.com`
- `github.githubassets.com`
- `collector.github.com`
- `api.github.com`
- `raw.githubusercontent.com`
- `gist.githubusercontent.com`
- `github.io`
- `assets-cdn.github.com`
- `cdn.jsdelivr.net`
- `securitylab.github.com`
- `www.githubstatus.com`
- `npmjs.com`
- `git-lfs.github.com`
- `githubusercontent.com`
- `github.global.ssl.fastly.net`
- `api.npms.io`
- `github.community`
- `desktop.github.com`
- `central.github.com`

如需代理更多域名，可在代码顶部的 `domain_whitelist` 中追加。

## 使用示例

首页入口：

```text
https://home-gh.example.com/
```

通过首页跳转接口转换 GitHub 链接：

```text
https://home-gh.example.com/go?url=https%3A%2F%2Fgithub.com%2Foctocat%2FHello-World
```

返回 302，跳转到：

```text
https://github-com-gh.example.com/octocat/Hello-World
```

获取转换结果 JSON：

```bash
curl "https://home-gh.example.com/api/convert?url=https://github.com/octocat/Hello-World"
```

返回示例：

```json
{
  "ok": true,
  "proxy_url": "https://github-com-gh.example.com/octocat/Hello-World"
}
```

直接访问代理后的 Raw 文件：

```text
https://raw-githubusercontent-com-gh.example.com/user/repo/branch/path/file.txt
```

## 1. 在 Cloudflare 创建 Snippet

1. 登录 Cloudflare Dashboard。
2. 进入你的站点（Domain）页面。
3. 打开 `Rules` -> `Snippets`。
4. 点击 `Create snippet`。
5. 名称可填：`github-proxy`（可自定义）。
6. 将 `github-snippet.js` 全量内容粘贴进去并保存。

## 2. 配置 DNS

你需要让这些代理子域名指向 Cloudflare。

推荐配置一个通配符 DNS 记录：

```text
*.example.com
```

并开启 Cloudflare 代理状态。

如果不想使用通配符，也可以按需添加具体子域名，例如：

```text
home-gh.example.com
github-com-gh.example.com
raw-githubusercontent-com-gh.example.com
gist-githubusercontent-com-gh.example.com
api-github-com-gh.example.com
avatars-githubusercontent-com-gh.example.com
github-githubassets-com-gh.example.com
```

## 3. 配置生效路由

在 Snippet 的 `Route` 中添加你要拦截的域名范围，例如：

```text
https://*-gh.example.com/*
```

如果 Cloudflare 控制台不接受该写法，可为常用子域名单独配置路由：

```text
https://home-gh.example.com/*
https://github-com-gh.example.com/*
https://raw-githubusercontent-com-gh.example.com/*
https://gist-githubusercontent-com-gh.example.com/*
https://api-github-com-gh.example.com/*
```

## 4. 配置首页入口

首页入口由代码顶部的 `HOME_PREFIX` 控制：

```js
const HOME_PREFIX = 'home-gh.';
```

因此首页地址格式是：

```text
https://home-gh.<YOUR_DOMAIN>/
```

打开后可以输入 GitHub 原始链接，页面会跳转到代理后的链接。

## 5. 域名前缀规则

代理域名前缀的生成规则是：

1. 原始域名中的 `.` 替换为 `-`。
2. 末尾追加 `-gh.`。
3. 再拼接你的基础域名。

示例：

```text
github.com                  -> github-com-gh.example.com
raw.githubusercontent.com   -> raw-githubusercontent-com-gh.example.com
gist.githubusercontent.com  -> gist-githubusercontent-com-gh.example.com
api.github.com              -> api-github-com-gh.example.com
```

## 6. 重要配置项

首页入口前缀：

```js
const HOME_PREFIX = 'home-gh.';
```

域名白名单：

```js
const domain_whitelist = [
  'github.com',
  'raw.githubusercontent.com'
];
```

不希望代理的特殊路径：

```js
const redirect_paths = [];
```

中国大陆以外地区是否跳回源站：

```js
const enable_geo_redirect = true;
```

当 `enable_geo_redirect` 为 `true` 时，如果 Cloudflare 请求头 `CF-IPCountry` 不是 `CN`，脚本会重定向回原始 GitHub 域名。

## 7. 接口说明

### 首页

```text
GET https://home-gh.example.com/
```

返回内置 HTML 首页。

### 跳转转换

```text
GET https://home-gh.example.com/go?url=<原始链接>
```

成功时返回 `302`，跳转到代理链接。

失败时返回 `400`，并展示错误提示页面。

### JSON 转换

```text
GET https://home-gh.example.com/api/convert?url=<原始链接>
```

成功：

```json
{
  "ok": true,
  "proxy_url": "https://github-com-gh.example.com/octocat/Hello-World"
}
```

失败：

```json
{
  "ok": false,
  "error": "Invalid URL"
}
```

## 8. 快速自检

1. 访问首页，确认能看到输入框：
   - `https://home-gh.example.com/`
2. 在首页输入 GitHub 链接，确认能跳转到代理域名。
3. 测试 `/go`：
   - `https://home-gh.example.com/go?url=https%3A%2F%2Fgithub.com%2Foctocat%2FHello-World`
4. 测试 `/api/convert`：
   - `https://home-gh.example.com/api/convert?url=https://github.com/octocat/Hello-World`
5. 直接访问代理域名：
   - `https://github-com-gh.example.com/`
6. 打开浏览器开发者工具，确认页面资源也走对应的 `*-gh.example.com` 域名。
7. 输入不在白名单内的链接，确认返回无效链接提示。

## 注意事项

- 该脚本适合部署在 Cloudflare Snippets / Workers 运行环境。
- 如果只配置了部分子域名，页面内资源可能无法完全加载。
- GitHub 登录、验证码、部分动态接口可能受上游策略、Cookie、CSP 或地区网络影响，不保证所有交互都可用。
- 代理访问第三方站点存在合规和安全风险，建议只保留确实需要的白名单域名。
- `github-snippet.js` 需要保持在 Cloudflare Snippets 的大小限制内，修改首页 HTML 或新增逻辑时要注意体积。
