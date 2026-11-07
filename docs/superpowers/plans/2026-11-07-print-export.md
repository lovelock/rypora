# 打印与 PDF 导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 当前笔记可打印，并通过系统打印对话框另存为 PDF。

**Architecture:** `marked` + `DOMPurify` 生成安全 HTML，复用 lezer 高亮代码块；把 `.print-root` 临时挂到 `body`，用 `@media print` 隐藏应用界面，调 `window.print()`，`afterprint` 清理。

**Tech Stack:** Svelte 5、TypeScript、marked、DOMPurify、CodeMirror/lezer、Vitest + jsdom。

**Spec:** `docs/superpowers/specs/2026-11-07-print-export-design.md`

## Global Constraints

- 不写平台专有的静默 PDF 代码；PDF 通过系统打印对话框完成。
- 打印内容必须经过 DOMPurify 清洗。
- 不改变编辑器实时预览结构。
- 现有测试保持通过。

## Review Focus

1. 笔记里含 `<script>` 或 `onerror` 时，打印文档不能执行脚本。
2. 相对图片路径要解析到笔记所在目录；`https:` / `data:` 不改写。
3. 没有活动标签或没有工作区时，按打印快捷键不报错、不打印空内容。
4. `window.print()` 抛错或 `afterprint` 不触发时，临时 DOM 和标题要能恢复。
5. macOS 上 `Cmd+Shift+P` 触发打印，`Cmd+P` 仍是搜索。

---

### Task 1: Windows 分隔符下的 `resolveRelative`

**Files:** `src/lib/utils/paths.ts`、`tests/paths.test.ts`

- [ ] 写失败测试：`resolveRelative("C:\\w\\notes\\a.md", "img/x.png")` → `C:/w/notes/img/x.png`。
- [ ] 实现：取 `/` 和 `\\` 中较后的分隔符作为 base；输出统一用 `/`。
- [ ] 运行 `npx vitest run tests/paths.test.ts` 通过并提交。

### Task 2: 打印快捷键

**Files:** `src/lib/utils/shortcuts.ts`、`tests/shortcuts.test.ts`

- [ ] 测试 `Cmd+Shift+P` / `Ctrl+Shift+P` → `"print"`；`Cmd+P` → `null`。
- [ ] 在 `Shortcut` 与 `matchShortcut` 中加入 `print`。
- [ ] 运行 `npx vitest run tests/shortcuts.test.ts` 通过并提交。

### Task 3: Markdown 渲染与高亮

**Files:** `src/lib/print/markdown.ts`、`src/lib/print/highlight.ts`、`tests/print.test.ts`

- [ ] 测试标题/列表/表格/代码块渲染；`<script>`、`onerror` 被移除；相对图片转 `asset://`；`https:` 图片保持。
- [ ] 测试 ` ```js ` 代码块产生 `tok-` 高亮 span。
- [ ] 实现 `renderMarkdownHtml(markdown, docPath)` 与 `highlightCodeBlocks(root)`。
- [ ] 通过并提交。

### Task 4: 打印生命周期

**Files:** `src/lib/print/document.ts`、`tests/print.test.ts`

- [ ] 测试 `printDocument` 调用 `window.print()`、追加 `.print-root`、`afterprint` 后清理并恢复标题。
- [ ] 实现 `buildPrintDocument`、`waitForImages`、`printDocument`（try/finally + afterprint + 超时兜底）。
- [ ] 通过并提交。

### Task 5: 接线与样式

**Files:** `src/App.svelte`、`src/lib/StatusBar.svelte`、`src/app.css`、`README.md`

- [ ] `App` 处理 `print` 动作：取 `tabs.state(path).doc`，构建并打印；失败时 `tabs.error`。
- [ ] `StatusBar` 加「打印」按钮。
- [ ] `app.css` 加 `.print-root` 与 `@media print` 样式（A4、页边距、分页规则、代码背景）。
- [ ] README 加 `Cmd/Ctrl+Shift+P` 和 PDF 说明。
- [ ] `npx vitest run && npm run check && npm run build` 全绿。
- [ ] 提交。
