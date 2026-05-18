# snippets-collection

这个仓库收集了一组可直接部署或复用的小型 Web snippet、代理工具和页面实验。主要代码以单目录方式组织：每个功能目录通常包含可读源码、独立 HTML 页面、测试文件和使用说明。

## 目录概览

| 目录 | 内容 |
| --- | --- |
| `ip/` | Cloudflare Snippets 版 IP 检测面板，包含公网 IP、网络归属和 proxycheck.io 风控信息。 |
| `iptv/` | IPTV M3U 过滤与频道查询 Snippet，带频道源页面和测试。 |
| `rss/` | RSS/RSSHub 代理 Snippet。 |
| `github/` | GitHub 资源代理相关 Snippet。 |
| `pic/` | 图片相关 Snippet 与页面。 |
| `BPSUB/` | BPSUB 使用说明。 |

## 常用命令

运行某个 Snippet 的测试：

```bash
node --test test/ip-snippet.test.mjs
node --test test/iptv-snippet.test.mjs
node --test test/rss-snippet.test.mjs
```

生成 IP Snippet 的 32KB 以下部署文件：

```bash
node minify-snippet.mjs ip
```

默认输出为：

```text
ip/ip-snippet.min.js
```

也可以指定输出文件名：

```bash
node minify-snippet.mjs ip ip-snippet.prod.js
```

## 构建脚本说明

根目录的 `minify-snippet.mjs` 是一个通用化的压缩入口，约定目标目录内存在：

- `<name>/<name>-snippet.js`
- `<name>/<name>.html`
- 源码中包含 `const HOME_HTML = String.raw\`...\`;`

目前 `ip/` 符合这个约定，可以直接使用。像 `iptv/`、`github/` 这类已经使用 gzip/base64 内嵌 HTML 的 Snippet，不适用这个脚本的 `HOME_HTML` 替换流程。

## 文档

更详细的部署和使用说明见各目录内的 `*-guide.md` 文件，例如：

- `ip/ip-snippet-guide.md`
- `iptv/iptv-snippet-guide.md`
- `rss/rss-snippet-guide.md`
- `github/github-snippet-guide.md`
