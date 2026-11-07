# 打印与 PDF 导出（设计文档）

- 日期：2026-11-07
- 状态：已确认

## 1. 意图与为什么

用户需要把当前笔记打印出来，或存成 PDF 分享。采用「打印 + 系统对话框另存为 PDF」的路线：
一套代码覆盖三平台，不写平台专有的静默 PDF 代码。

## 2. 目标

- 当前笔记可以打印；打印对话框里可选「另存为 PDF」/「Microsoft Print to PDF」。
- 打印内容是渲染后的 Markdown，不是编辑器视口（CodeMirror 只渲染可见行）。
- 保留代码块语法高亮、图片、表格、引用、列表。
- 快捷键 `Cmd/Ctrl+Shift+P`，状态栏提供「打印」按钮。
- 打印完成后清理临时 DOM，恢复原 document.title。

## 3. 非目标

- 不做应用内「一键静默导出 PDF」（需要 macOS / Windows / Linux 三套 Rust 实现）。
- 不做 HTML 导出、整库导出、页眉页脚/页码模板。
- 不改编辑器的实时预览结构。

## 4. 关键决定

### 4.1 Markdown → HTML

- 用 `marked`（GFM）渲染，`DOMPurify` 清洗，防止笔记里的 `<script>` / `onerror` 在 Tauri IPC 上下文执行。
- 图片：相对路径用 `resolveRelative(docPath, src)` 解析，再用 `convertFileSrc` 转成 `asset://`；
  `http(s):` / `data:` 保持原样。
- 代码块：复用 `@codemirror/language-data` + `@lezer/highlight` 的 `classHighlighter`，
  输出 `tok-*` class，颜色沿用 `app.css` 里已有的 token 样式。

### 4.2 打印流程

1. `buildPrintDocument(markdown, path)` 创建 `<article class="print-root">`。
2. 追加到 `document.body`，给 `<html>` 加 `.printing`。
3. 等待图片加载（`load`/`error`/3s 超时）。
4. 调 `window.print()`。
5. 监听 `afterprint` 清理 DOM 和标题；未触发时由下一次打印替换。

### 4.3 打印样式

- `@page { size: A4; margin: 18mm 16mm; }`
- `@media print` 下隐藏 `body > :not(.print-root)`，`#app` 不参与打印。
- 代码块、引用、表格、图片 `break-inside: avoid`；标题 `break-after: avoid`。
- 代码块保留浅色背景（`print-color-adjust: exact`）。
- 字体沿用当前平台的 `--ui-font`。

### 4.4 快捷键

- `matchShortcut` 增加 `"print"`：macOS `Cmd+Shift+P`，其他平台 `Ctrl+Shift+P`。
- 与现有 `Cmd+P`（搜索）不冲突。

## 5. 文件

- 新增 `src/lib/print/markdown.ts`（渲染 + 清洗 + 图片重写）
- 新增 `src/lib/print/highlight.ts`（代码块高亮）
- 新增 `src/lib/print/document.ts`（构建、图片等待、打印、清理）
- 修改 `src/lib/utils/shortcuts.ts`（print）
- 修改 `src/lib/utils/paths.ts`（`resolveRelative` 支持 Windows 分隔符）
- 修改 `src/App.svelte`、`src/lib/StatusBar.svelte`、`src/app.css`、`README.md`
- 测试：`tests/print.test.ts`、`tests/shortcuts.test.ts`、`tests/paths.test.ts`

## 6. 测试与验证

- 单测：Markdown 渲染、脚本/事件属性被清洗、图片路径重写、代码高亮、打印 DOM 生命周期、快捷键匹配、Windows 路径。
- 回归：`npx vitest run`、`npm run check`、`npm run build`。
- 人工：macOS 上 `Cmd+Shift+P` 打印，确认分页、代码块、图片、中文；在打印对话框里另存为 PDF。
