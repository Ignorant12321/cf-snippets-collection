# GitHub UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 GitHub 代理首页刷新成更干净的效率工具台，同时保留克制的 GitHub 暗色气质。

**Architecture:** 以 `github/github.html` 作为首页 UI 的源文件，保持现有表单、ID、数据属性和内联 JavaScript 行为不变。完成静态页后，用现有 `minify-snippet.mjs` 重新把 HTML 压缩并写回 `github/github-snippet.js` 的 `HOME_HTML_GZIP_BASE64`。

**Tech Stack:** 静态 HTML、CSS、原生 JavaScript、Cloudflare Snippet runtime、Node test runner、`minify-snippet.mjs`。

---

## 文件结构

- Modify: `test/github-snippet.test.mjs`
  - 增加 UI 结构回归测试，保证静态 HTML 和 Snippet 渲染后的 HTML 都包含新的工具台布局标记。
- Modify: `github/github.html`
  - 重写页面的 CSS 视觉系统和主要布局结构。
  - 保留现有 JavaScript 依赖的 ID、`data-*` 属性、表单行为和本地历史逻辑。
- Modify: `github/github-snippet.js`
  - 只更新 `HOME_HTML_GZIP_BASE64`，不要改代理逻辑、白名单、镜像数据或请求处理。

---

### Task 1: 添加 UI 结构回归测试

**Files:**
- Modify: `test/github-snippet.test.mjs`

- [ ] **Step 1: 增加读取静态首页的辅助函数**

在 `const snippetUrl = ...` 后面加入：

```js
const htmlUrl = new URL('../github/github.html', import.meta.url);
```

在 `loadSnippet()` 后面加入：

```js
async function readStaticHomeHtml() {
  return readFile(htmlUrl, 'utf8');
}
```

- [ ] **Step 2: 更新已有静态 favicon 测试，复用辅助函数**

把当前测试里的读取语句：

```js
const html = await readFile(new URL('../github/github.html', import.meta.url), 'utf8');
```

替换为：

```js
const html = await readStaticHomeHtml();
```

- [ ] **Step 3: 写新的布局标记测试**

在 favicon 测试之后加入：

```js
test('static GitHub project page uses the refreshed console layout markers', async () => {
  const html = await readStaticHomeHtml();

  assert.match(html, /data-ui="github-console"/);
  assert.match(html, /class="[^"]*\bworkspace\b/);
  assert.match(html, /class="[^"]*\bconvert-card\b/);
  assert.match(html, /class="[^"]*\binspector\b/);
  assert.match(html, /class="[^"]*\btabbar\b/);
});

test('rendered snippet home page includes the refreshed console layout markers', async () => {
  const { default: snippet } = await loadSnippet();
  const response = await snippet.fetch(new Request('https://home-gh.ssr.ddns-ip.net/'));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /data-ui="github-console"/);
  assert.match(html, /class="[^"]*\bworkspace\b/);
  assert.match(html, /class="[^"]*\bconvert-card\b/);
  assert.match(html, /class="[^"]*\binspector\b/);
  assert.match(html, /class="[^"]*\btabbar\b/);
});
```

- [ ] **Step 4: 运行测试，确认新测试先失败**

Run:

```bash
node --test test/github-snippet.test.mjs
```

Expected:

```text
FAIL
```

失败点应为缺少 `data-ui="github-console"` 或新的布局类名。

- [ ] **Step 5: 提交测试**

```bash
git add test/github-snippet.test.mjs
git commit -m "test: cover github console layout markers"
```

---

### Task 2: 刷新静态首页 UI

**Files:**
- Modify: `github/github.html`

- [ ] **Step 1: 给根容器增加布局标记**

把：

```html
<div class="app">
```

改成：

```html
<div class="app" data-ui="github-console">
```

- [ ] **Step 2: 调整顶部区域语义和类名**

保留 `#homeHost`、`#baseHost`、`#wlNum`，把 header 结构调整为紧凑控制栏：

```html
<header class="topbar">
  <div class="brand">
    <div class="mark">GITHUB EDGE PROXY</div>
    <h1 class="title">云间引渡</h1>
  </div>
  <div class="chips" aria-label="运行状态">
    <span class="chip">入口 <b id="homeHost">local</b></span>
    <span class="chip">根域 <b id="baseHost">-</b></span>
    <span class="chip">白名单 <b id="wlNum">0</b></span>
  </div>
</header>
```

- [ ] **Step 3: 调整转换工作区类名**

把主工作区外层从：

```html
<section class="hero">
```

改成：

```html
<section class="workspace">
```

把表单类名从：

```html
<form class="main" id="goForm" action="/go" method="get" target="_blank">
```

改成：

```html
<form class="convert-card" id="goForm" action="/go" method="get" target="_blank">
```

把侧栏从：

```html
<aside class="side">
```

改成：

```html
<aside class="inspector">
```

- [ ] **Step 4: 调整标签栏类名**

把：

```html
<nav class="tabs" id="tabs">
```

改成：

```html
<nav class="tabbar" id="tabs">
```

保留每个按钮上的 `class="tab"` 和 `data-tab`。

- [ ] **Step 5: 重写 CSS 变量和页面底色**

替换 `<style>` 内的 `:root` 和 `body` 基础样式，使用下面的变量方向：

```css
:root{
  color-scheme:dark;
  --bg:#0d1117;
  --surface:#111820;
  --surface-2:#151d27;
  --field:#0b1016;
  --line:#27313d;
  --line-strong:#394552;
  --text:#e6edf3;
  --muted:#8b949e;
  --accent:#2fbc73;
  --accent-2:#58a6ff;
  --warn:#f0883e;
  --danger:#ff7b72;
  --shadow:0 24px 70px rgba(1,4,9,.35);
}
*{box-sizing:border-box}
body{
  margin:0;
  min-height:100dvh;
  color:var(--text);
  font:14px/1.55 "Microsoft YaHei","PingFang SC",sans-serif;
  background:
    linear-gradient(90deg,rgba(139,148,158,.06) 1px,transparent 1px),
    linear-gradient(180deg,rgba(139,148,158,.045) 1px,transparent 1px),
    var(--bg);
  background-size:32px 32px,32px 32px,auto;
}
```

- [ ] **Step 6: 重写布局和控件样式**

保留现有选择器对应的功能状态，例如 `.tab.active`、`.panel.active`、`.notice.show`、`.toast.show`。新增或替换这些核心类的样式：

```css
.app{width:min(1120px,100%);min-height:100dvh;margin:auto;padding:18px;display:grid;grid-template-rows:auto auto auto 1fr;gap:12px}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;border:1px solid var(--line);border-radius:8px;background:rgba(17,24,32,.92);box-shadow:var(--shadow);padding:14px}
.brand{display:grid;gap:2px;min-width:0}
.mark{color:var(--accent-2);font:11px Consolas,monospace;letter-spacing:.08em}
.title{margin:0;font:700 32px/1.05 "Microsoft YaHei","PingFang SC",sans-serif;letter-spacing:0}
.workspace{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(280px,.75fr);gap:12px}
.convert-card,.inspector,.panel{border:1px solid var(--line);border-radius:8px;background:rgba(17,24,32,.94);box-shadow:var(--shadow)}
.convert-card{display:grid;gap:13px;padding:14px}
.inspector{display:grid;gap:10px;align-content:start;padding:14px}
.tabbar{display:flex;gap:8px;overflow-x:auto;padding:1px}
.box{display:flex;gap:8px;align-items:center;border:1px solid var(--line);border-radius:8px;background:var(--field);padding:8px;min-height:44px}
.open{min-height:42px;font-weight:700;background:linear-gradient(180deg,#238a57,#1f6f48);color:white}
```

其余 `.chip`、`.mini`、`.icon`、`.small`、`.info`、`.card`、`table`、`.toast` 等样式按同一视觉系统收紧间距和边框，保持圆角不超过 8px。

- [ ] **Step 7: 更新移动端媒体查询**

把移动端断点保持在 `760px`，确保布局单列堆叠：

```css
@media(max-width:760px){
  .app{padding:10px;gap:10px}
  .topbar,.workspace,.panelHead{display:grid;grid-template-columns:1fr}
  .chips{justify-content:flex-start}
  .convert-card,.inspector{padding:12px}
  .title{font-size:28px}
  .head{align-items:flex-start;flex-direction:column}
  .grid{grid-template-columns:1fr}
  .open{width:100%}
  .tools{width:100%}
  .tools .box{width:100%}
  .search{min-height:28px}
  .panel{min-height:300px}
}
```

- [ ] **Step 8: 运行测试，确认静态页布局测试通过、Snippet 布局测试仍失败**

Run:

```bash
node --test test/github-snippet.test.mjs
```

Expected:

```text
FAIL
```

预期只剩 Snippet 渲染页缺少新布局标记，因为 `github/github-snippet.js` 还没有重新打包。

- [ ] **Step 9: 提交静态首页刷新**

```bash
git add github/github.html
git commit -m "style: refresh github proxy home ui"
```

---

### Task 3: 重新打包 Snippet 首页模板

**Files:**
- Modify: `github/github-snippet.js`

- [ ] **Step 1: 用现有打包脚本写回 Snippet 模板**

Run:

```bash
node minify-snippet.mjs github github-snippet.js
```

Expected:

```text
Original: ...
Minified: ...
Limit:    32,768 bytes
```

命令会把 `github/github.html` 压缩后写入 `github/github-snippet.js` 的 `HOME_HTML_GZIP_BASE64`。

- [ ] **Step 2: 确认只更新了压缩模板，不改代理逻辑**

Run:

```bash
git diff -- github/github-snippet.js
```

Expected:

```text
diff 只应主要集中在 HOME_HTML_GZIP_BASE64 字符串。
```

- [ ] **Step 3: 运行 GitHub Snippet 测试**

Run:

```bash
node --test test/github-snippet.test.mjs
```

Expected:

```text
PASS
```

测试覆盖首页主动作、favicon、布局标记、32KB 限制和 `/go` 跳转。

- [ ] **Step 4: 运行全量 Node 测试**

Run:

```bash
node --test test
```

Expected:

```text
PASS
```

- [ ] **Step 5: 提交 Snippet 模板同步**

```bash
git add github/github-snippet.js
git commit -m "chore: sync github snippet home template"
```

---

### Task 4: 浏览器人工验收

**Files:**
- Verify: `github/github.html`

- [ ] **Step 1: 打开静态页检查桌面布局**

Run:

```bash
Start-Process (Resolve-Path github/github.html).Path
```

Expected:

```text
页面打开后首屏能看到顶部控制栏、转换工作区、解析摘要和标签页。
```

- [ ] **Step 2: 验证主流程**

在输入框中填入：

```text
github.com/octocat/Hello-World
```

Expected:

```text
状态显示可打开，代理链接显示为 https://github-com-gh.<base-host>/octocat/Hello-World，打开按钮可用。
```

- [ ] **Step 3: 验证无效域名状态**

在输入框中填入：

```text
example.com
```

Expected:

```text
状态显示域名未放行，打开按钮禁用，输出框显示当前链接无法代理。
```

- [ ] **Step 4: 验证标签页**

依次点击：

```text
历史
镜像
白名单
```

Expected:

```text
只有当前标签对应面板显示，搜索框、清空历史、镜像打开按钮和白名单表格保持可用。
```

- [ ] **Step 5: 浏览器验收完成后提交测试文件或最终修正**

如果 Task 4 发现需要微调 `github/github.html`，修正后运行：

```bash
node --test test/github-snippet.test.mjs
node minify-snippet.mjs github github-snippet.js
node --test test
```

Expected:

```text
PASS
```

然后提交：

```bash
git add github/github.html github/github-snippet.js test/github-snippet.test.mjs
git commit -m "fix: polish github proxy home layout"
```
