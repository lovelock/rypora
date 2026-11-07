# 代码块复制按钮 + 分平台字体（设计文档）

- 日期：2026-11-07
- 状态：已确认

## 1. 意图与为什么

用户把 Rypora 当作 snippets 仓库，经常需要把代码块整段复制走；现在只能进入源码模式手动选中，效率低。

同时在 macOS 上字体渲染偏「发虚」。现有样式对所有平台使用同一套字体栈和
`-webkit-font-smoothing: antialiased`，而 macOS、Windows、Linux 的原生字体与渲染策略并不相同，
需要按平台分别配置。

## 2. 目标

- G1 每个渲染后的代码块右上角提供「复制」按钮，一键复制整段代码（不含 ``` 围栏与语言标记）。
- G2 点击后给出短暂「已复制」反馈，失败时给出可见错误提示。
- G3 启动时识别当前平台，给 `<html>` 打 `data-platform="macos|windows|linux"`。
- G4 三组字体变量（UI / 正文 / 等宽）与字体平滑按平台设置。
- G5 所有平台的编辑器正文改用系统无衬线，等宽字体用各平台原生默认（macOS 走
  `ui-monospace`，Menlo 兜底）。
- G6 不引入字体文件，不增加安装包体积。

## 3. 非目标

- 不做字体/平滑的设置界面（v1 明确不做自定义 CSS/主题市场）。
- 不随包内置 JetBrains Mono 等字体。
- 不给行内代码、表格、图片加复制按钮。
- 不改 Windows / Linux 的视觉设计基调，只做平台适配。

## 4. 方案取舍

### 复制功能

| 方案 | 结论 | 理由 |
|---|---|---|
| **A. Tauri clipboard-manager 插件 + 悬停按钮** | **选中** | 跨平台可靠，不受 WebView 安全上下文差异影响；代价是多一个插件和一条 capability 权限。 |
| B. 纯 `navigator.clipboard` + `execCommand` 兜底 | 否决 | 零依赖，但 Linux WebKitGTK 等环境可能静默失败。 |
| C. 点击代码块任意位置即复制 | 否决 | 与「点进去编辑」冲突，不可预期。 |

保留 B 的兜底逻辑，仅作为浏览器开发模式（无 Tauri IPC）时的降级路径。

### 字体

| 方案 | 结论 | 理由 |
|---|---|---|
| **F1. 运行时平台标记 + CSS 分平台变量** | **选中** | 零依赖，集中管理；每个平台可以用到自己的原生字体和渲染策略。 |
| F2. 只按平台调平滑，不动字体栈 | 否决 | 用户确认 macOS 要换系统无衬线，且等宽字体要换掉 SF Mono。 |
| F3. 字体/平滑设置界面 | 否决 | 超出 v1 范围，工作量大。 |

## 5. 关键决定

### 5.1 复制按钮

- 位置：代码块容器 `position: relative`，按钮绝对定位在右上角。
- 显示：默认透明，容器 `:hover` 或按钮 `:focus-visible` 时显示；触屏/无 hover 环境常驻显示。
- 文案：默认「复制」，成功后「已复制」，约 1.5s 后还原；失败显示「复制失败」。
- 复制内容：`CodeBlockWidget.code` 原文，保留内部换行与缩进，去掉首尾多余空行。
- 事件：按钮 `mousedown` / `click` 阻止冒泡，避免触发 widget 的「跳回源码」逻辑和编辑器失焦。
- 剪贴板：`@tauri-apps/plugin-clipboard-manager` 的 `writeText`；失败时降级到
  `navigator.clipboard.writeText`，再失败用隐藏 textarea + `execCommand("copy")`。
- 权限：`src-tauri/capabilities/default.json` 增加 `clipboard-manager:allow-write-text`。
- 组件：新增 `src/lib/utils/clipboard.ts`，暴露 `copyText(text): Promise<boolean>`，便于单测。

### 5.2 平台识别

- 新增 `src/lib/utils/platform.ts`，暴露 `detectPlatform(ua = navigator.userAgent)`：
  - `Macintosh|Mac OS X` → `macos`
  - `Windows` → `windows`
  - 其余 → `linux`
- `src/main.ts` 在挂载 Svelte 前写入 `document.documentElement.dataset.platform`。
- 纯函数便于在 jsdom 里测试。

### 5.3 字体栈

变量定义在 `src/app.css`，默认值即 Linux；`data-platform` 覆盖。

| 平台 | `--ui-font` | `--editor-font` | `--mono-font` | `--font-smoothing` |
|---|---|---|---|---|
| Linux | `system-ui, "Noto Sans CJK SC", sans-serif` | 同 UI（系统无衬线） | `"JetBrains Mono", "Noto Sans Mono", monospace` | `antialiased` |
| macOS | `-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif` | 同 UI（系统无衬线） | `ui-monospace, "SF Mono", Menlo, monospace` | `auto` |
| Windows | `"Segoe UI", "Microsoft YaHei", sans-serif` | 同 UI（系统无衬线） | `Consolas, "Cascadia Mono", monospace` | `antialiased` |

- 三个平台的编辑器正文统一改用系统无衬线；Linux 不再使用 Noto Serif CJK。
- `body` 使用 `font-family: var(--ui-font)` 与 `-webkit-font-smoothing: var(--font-smoothing)`。
- CM 主题的 scroller 使用 `var(--editor-font)`，行内代码/代码块/token 使用 `var(--mono-font)`。
- 移除现有的 `SFMono-Regular`（PostScript 名会解析到 SF Mono）以及硬编码衬线回退。

### 5.4 关于等宽字体

- Zed 的默认字体是 `.ZedMono`（基于 Iosevka 的定制字体），不是 SF Mono；用户不喜欢的是前者。
- macOS 系统层面从 10.11 起用 SF Mono，WebKit 里通过 `ui-monospace` 获取；Safari 的固定宽度
  默认字体仍是 **Menlo**。
- 采用 Apple 官方推荐栈 `ui-monospace, "SF Mono", Menlo, monospace`：新版 WebKit 得到 SF Mono，
  老环境自动落到 Menlo。Windows / Linux 同理使用各自的原生等宽栈。

## 6. 测试与验证

- 单测：
  - `tests/platform.test.ts`：三种 UA 的识别结果。
  - `tests/live-preview.test.ts` 扩展：渲染出的代码块包含复制按钮；点击调用 `copyText` 并显示「已复制」（mock 剪贴板模块）。
- 回归：`npm run check`、`npx vitest run`、`npm run build`。
- 人工（用户在 macOS 上验证，我无法在 Linux 复现）：
  - 正文是否变清晰、字重是否正常。
  - 代码块是否为 Menlo。
  - 复制按钮悬停、点击反馈是否正常。
- 若 macOS 仍发虚，下一个排查方向是 Retina/高 DPI 与字重，而不是继续换字体。

## 7. 留给实现者的判断

- 按钮的具体视觉（内边距、圆角、颜色）沿用现有 `.ghost` 风格，保持克制。
- 复制失败提示用按钮文案还是 `console`/banner，取最小实现（按钮文案）。
- 平台判断优先用 `navigator.userAgent`，不引入 `@tauri-apps/plugin-os`。
