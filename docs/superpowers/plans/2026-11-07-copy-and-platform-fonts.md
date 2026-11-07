# 代码块复制按钮 + 分平台字体 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给渲染后的代码块加一键复制，并按平台使用各自合适的字体栈与字体平滑。

**Architecture:** 平台识别用一个纯函数写入 `<html data-platform>`，`app.css` 按该属性切换 CSS 变量；复制走 Tauri clipboard-manager 插件，封装成可降级的 `copyText()`，由 CodeMirror 的 `CodeBlockWidget` 调用并渲染按钮。

**Tech Stack:** Svelte 5、TypeScript、CodeMirror 6、Tauri 2、Vitest + jsdom。

**Spec:** `docs/superpowers/specs/2026-11-07-copy-and-platform-fonts-design.md`

## Global Constraints

- 不引入任何字体文件，安装包体积不因此增加。
- 新增依赖只允许：npm 的 `@tauri-apps/plugin-clipboard-manager`、Cargo 的 `tauri-plugin-clipboard-manager`。
- 平台只识别 `macos` / `windows` / `linux`，未知一律 `linux`。
- 复制按钮只出现在渲染后的 fenced code block，行内代码不加。
- 所有现有测试必须保持通过。

## Review Focus

1. 剪贴板插件不可用或权限被拒 → `copyText` 返回 `false`，按钮显示「复制失败」，不抛未处理异常。
2. 空代码块 / 只有语言标记 → 按钮仍然渲染，复制空串不崩溃。
3. 未知 UA → 落到 `linux`，`data-platform` 仍然被设置。
4. 连续快速点击 → 反馈期间不重复调用复制，1.5s 后按钮恢复「复制」。
5. 非 Tauri 环境且 `navigator.clipboard` 不存在 → 降级到 `execCommand`，不抛 `TypeError`。

---

### Task 1: 平台识别 + 分平台字体

**Files:**
- Create: `src/lib/utils/platform.ts`
- Create: `tests/platform.test.ts`
- Modify: `src/main.ts`
- Modify: `src/app.css`
- Modify: `src/lib/editor/theme.ts`

**Interfaces:**
- Produces: `type Platform = "macos" | "windows" | "linux"`、`detectPlatform(ua?: string): Platform`、`applyPlatform(root: HTMLElement, ua?: string): Platform`。
- Consumes: 无。

- [ ] **Step 1: 写失败测试**

创建 `tests/platform.test.ts`：

```ts
// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { applyPlatform, detectPlatform } from "../src/lib/utils/platform";

describe("detectPlatform", () => {
  test("detects macOS", () => {
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("macos");
  });

  test("detects Windows", () => {
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
  });

  test("detects Linux", () => {
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
  });

  test("falls back to linux for unknown UA", () => {
    expect(detectPlatform("SomeBot/1.0")).toBe("linux");
  });
});

describe("applyPlatform", () => {
  test("writes data-platform and returns it", () => {
    const root = document.createElement("html");
    expect(applyPlatform(root, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(root.dataset.platform).toBe("windows");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/platform.test.ts`
Expected: FAIL，`Failed to resolve import "../src/lib/utils/platform"`。

- [ ] **Step 3: 实现 `src/lib/utils/platform.ts`**

```ts
export type Platform = "macos" | "windows" | "linux";

export function detectPlatform(ua: string = navigator.userAgent): Platform {
  if (/Macintosh|Mac OS X/i.test(ua)) {
    return "macos";
  }
  if (/Windows/i.test(ua)) {
    return "windows";
  }
  return "linux";
}

export function applyPlatform(root: HTMLElement, ua?: string): Platform {
  const platform = detectPlatform(ua);
  root.dataset.platform = platform;
  return platform;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/platform.test.ts`
Expected: PASS，5 个用例全绿。

- [ ] **Step 5: 在 `src/main.ts` 挂载前应用平台**

在 `mount(...)` 之前加入：

```ts
import { applyPlatform } from "./lib/utils/platform";
applyPlatform(document.documentElement);
```

- [ ] **Step 6: 改写 `src/app.css` 的字体变量**

把 `:root` 开头的 `font-family` 一行替换为变量定义，并删除原有的 `--mono-font`、`--editor-font` 两行（统一由新变量组管理）。再添加平台覆盖块：

```css
:root {
  --ui-font: system-ui, "Noto Sans CJK SC", sans-serif;
  --editor-font: var(--ui-font);
  --mono-font: "JetBrains Mono", "Noto Sans Mono", monospace;
  --font-smoothing: antialiased;
  font-family: var(--ui-font);
  color-scheme: light dark;
  /* 其余变量保持不变 */
}

:root[data-platform="macos"] {
  --ui-font: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif;
  --mono-font: ui-monospace, "SF Mono", Menlo, monospace;
  --font-smoothing: auto;
}

:root[data-platform="windows"] {
  --ui-font: "Segoe UI", "Microsoft YaHei", sans-serif;
  --mono-font: Consolas, "Cascadia Mono", monospace;
}
```

`body` 里把 `-webkit-font-smoothing: antialiased;` 换成：

```css
font-family: var(--ui-font);
-webkit-font-smoothing: var(--font-smoothing);
```

- [ ] **Step 7: 让 CodeMirror 使用编辑器字体变量**

`src/lib/editor/theme.ts` 的 `.cm-scroller`：

```ts
fontFamily: "var(--editor-font)",
```

删除原先硬编码的 `'Noto Serif CJK SC', 'Songti SC', Georgia, serif` 回退。

- [ ] **Step 8: 验证构建与全部单测**

Run: `npx vitest run && npm run check && npm run build`
Expected: 全部通过。

- [ ] **Step 9: 提交**

```bash
git add src/lib/utils/platform.ts tests/platform.test.ts src/main.ts src/app.css src/lib/editor/theme.ts
git commit -m "feat: per-platform font stacks and smoothing"
```

---

### Task 2: 剪贴板工具与 Tauri 插件

**Files:**
- Create: `src/lib/utils/clipboard.ts`
- Create: `tests/clipboard.test.ts`
- Modify: `package.json` / `package-lock.json`
- Modify: `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

**Interfaces:**
- Produces: `copyText(text: string): Promise<boolean>`。
- Consumes: `@tauri-apps/plugin-clipboard-manager` 的 `writeText(text: string): Promise<void>`。

- [ ] **Step 1: 安装依赖并注册插件**

```bash
npm install @tauri-apps/plugin-clipboard-manager@^2
```

在 `src-tauri/Cargo.toml` 的依赖区加入 `tauri-plugin-clipboard-manager = "2"`。

在 `src-tauri/src/lib.rs` 的 builder 链上加：

```rust
.plugin(tauri_plugin_clipboard_manager::init())
```

在 `src-tauri/capabilities/default.json` 的 `permissions` 数组加入 `"clipboard-manager:allow-write-text"`。

- [ ] **Step 2: 写失败测试**

创建 `tests/clipboard.test.ts`：

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";

const { writeText } = vi.hoisted(() => ({ writeText: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText }));

import { copyText } from "../src/lib/utils/clipboard";

beforeEach(() => {
  vi.restoreAllMocks();
  writeText.mockReset();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
});

describe("copyText", () => {
  test("uses the Tauri plugin first", async () => {
    writeText.mockResolvedValue(undefined);
    expect(await copyText("hello")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  test("falls back to navigator.clipboard when the plugin fails", async () => {
    writeText.mockRejectedValue(new Error("no plugin"));
    const webWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: webWrite },
    });
    expect(await copyText("hello")).toBe(true);
    expect(webWrite).toHaveBeenCalledWith("hello");
  });

  test("falls back to execCommand when clipboard API is missing", async () => {
    writeText.mockRejectedValue(new Error("no plugin"));
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: exec,
    });
    expect(await copyText("hello")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
  });

  test("returns false when every strategy fails", async () => {
    writeText.mockRejectedValue(new Error("no plugin"));
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    });
    expect(await copyText("hello")).toBe(false);
  });

  test("copies empty text without throwing", async () => {
    writeText.mockResolvedValue(undefined);
    expect(await copyText("")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("");
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run tests/clipboard.test.ts`
Expected: FAIL，`Failed to resolve import "../src/lib/utils/clipboard"`。

- [ ] **Step 4: 实现 `src/lib/utils/clipboard.ts`**

```ts
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

export async function copyText(text: string): Promise<boolean> {
  try {
    await writeText(text);
    return true;
  } catch {
    // Tauri 插件不可用时继续降级。
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 浏览器/WebView 没有剪贴板 API 时继续降级。
  }

  return copyWithExecCommand(text);
}

function copyWithExecCommand(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  area.remove();
  return copied;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/clipboard.test.ts`
Expected: PASS，5 个用例全绿。

- [ ] **Step 6: 验证 Rust 侧配置可编译**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 通过；若本机缺少 webkit2gtk 等系统依赖，记录错误并在最终汇报中注明未验证。

- [ ] **Step 7: 提交**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json src/lib/utils/clipboard.ts tests/clipboard.test.ts
git commit -m "feat: add clipboard support via tauri plugin"
```

---

### Task 3: 代码块复制按钮

**Files:**
- Modify: `src/lib/editor/widgets.ts`
- Modify: `src/lib/editor/theme.ts`
- Create: `tests/code-block-copy.test.ts`

**Interfaces:**
- Consumes: `copyText(text: string): Promise<boolean>`（Task 2）。
- Produces: DOM 类名 `.cm-preview-copy`（按钮）、`.cm-preview-codeblock`（已存在，新增 `position: relative`）。

- [ ] **Step 1: 写失败测试**

创建 `tests/code-block-copy.test.ts`：

```ts
// @vitest-environment jsdom
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { livePreview } from "../src/lib/editor/live-preview";

const { copyText } = vi.hoisted(() => ({ copyText: vi.fn() }));
vi.mock("../src/lib/utils/clipboard", () => ({ copyText }));
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}));

let view: EditorView | undefined;
let parent: HTMLDivElement;

function render(doc: string): HTMLElement {
  parent = document.createElement("div");
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [markdown({ base: markdownLanguage }), livePreview()],
  });
  ensureSyntaxTree(state, state.doc.length, 1000);
  view = new EditorView({ state, parent });
  return parent;
}

beforeEach(() => {
  copyText.mockReset();
  copyText.mockResolvedValue(true);
});

afterEach(() => {
  view?.destroy();
  view = undefined;
  parent?.remove();
});

describe("code block copy button", () => {
  test("renders a copy button", () => {
    const root = render("```rust\nfn main() {}\n```\n\n");
    const button = root.querySelector<HTMLButtonElement>(".cm-preview-copy");
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe("复制");
  });

  test("copies the code without fences and shows feedback", async () => {
    const root = render("```rust\nfn main() {}\n```\n\n");
    const button = root.querySelector<HTMLButtonElement>(".cm-preview-copy")!;
    button.click();
    await vi.waitFor(() => expect(copyText).toHaveBeenCalledWith("fn main() {}"));
    expect(button.textContent).toBe("已复制");
  });

  test("shows failure feedback when copying fails", async () => {
    copyText.mockResolvedValue(false);
    const root = render("```rust\nfn main() {}\n```\n\n");
    const button = root.querySelector<HTMLButtonElement>(".cm-preview-copy")!;
    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe("复制失败"));
  });

  test("does not copy twice while feedback is showing", async () => {
    const root = render("```rust\nfn main() {}\n```\n\n");
    const button = root.querySelector<HTMLButtonElement>(".cm-preview-copy")!;
    button.click();
    button.click();
    await vi.waitFor(() => expect(copyText).toHaveBeenCalledTimes(1));
  });

  test("still renders a button for an empty code block", () => {
    const root = render("```\n```\n\n");
    expect(root.querySelector(".cm-preview-copy")).not.toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/code-block-copy.test.ts`
Expected: FAIL，`.cm-preview-copy` 为 `null`。

- [ ] **Step 3: 在 `CodeBlockWidget` 中加入按钮**

`src/lib/editor/widgets.ts` 引入 `copyText`，在 `toDOM` 里创建按钮并插入到 `pre` 之前：

```ts
const button = document.createElement("button");
button.type = "button";
button.className = "cm-preview-copy";
button.textContent = "复制";
button.title = "复制代码";
button.setAttribute("aria-label", "复制代码");
button.addEventListener("mousedown", (event) => event.stopPropagation());
button.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  void this.copy(button);
});
```

复制内容用 `this.code.replace(/^\n+|\n+$/g, "")`，保留内部缩进。实现：

```ts
private async copy(button: HTMLButtonElement): Promise<void> {
  if (button.disabled) {
    return;
  }
  button.disabled = true;
  const copied = await copyText(this.code.replace(/^\n+|\n+$/g, ""));
  button.textContent = copied ? "已复制" : "复制失败";
  window.setTimeout(() => {
    button.textContent = "复制";
    button.disabled = false;
  }, 1500);
}
```

- [ ] **Step 4: 在 `src/lib/editor/theme.ts` 加样式**

在 `.cm-preview-codeblock` 中加 `position: "relative"`，并新增：

```ts
".cm-preview-copy": {
  position: "absolute",
  top: "6px",
  right: "6px",
  padding: "2px 8px",
  border: "1px solid var(--border)",
  borderRadius: "5px",
  background: "var(--bg)",
  color: "var(--muted)",
  fontFamily: "var(--ui-font)",
  fontSize: "11px",
  lineHeight: "1.6",
  cursor: "pointer",
  opacity: "0",
  pointerEvents: "none",
  transition: "opacity 120ms ease",
},
".cm-preview-codeblock:hover .cm-preview-copy, .cm-preview-copy:focus-visible": {
  opacity: "1",
  pointerEvents: "auto",
},
"@media (hover: none)": {
  ".cm-preview-copy": {
    opacity: "1",
    pointerEvents: "auto",
  },
},
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/code-block-copy.test.ts`
Expected: PASS，5 个用例全绿。

- [ ] **Step 6: 全量验证**

Run: `npx vitest run && npm run check && npm run build`
Expected: 全部通过。

- [ ] **Step 7: 提交**

```bash
git add src/lib/editor/widgets.ts src/lib/editor/theme.ts tests/code-block-copy.test.ts
git commit -m "feat: add copy button to rendered code blocks"
```

---

## 最后检查

- [ ] `git status` 干净，3 个提交都在 `feat/copy-button-platform-fonts` 分支上。
- [ ] 汇报中注明：macOS 的字体观感与按钮交互需要用户在 macOS 上实际确认；Linux 环境无法复现渲染差异。
