# 文件操作快捷键 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加 `Cmd/Ctrl+N` 新建文件、`Cmd/Ctrl+Shift+N` 新建文件夹、`Cmd/Ctrl+O` 打开文件夹、`F2` 重命名。

**Architecture:** 纯函数 `matchShortcut` 按平台判断修饰键并返回动作；`App.svelte` 分发，文件树相关动作通过 `rypora:command` 自定义事件交给 `FileTree.svelte`，复用现有 `PromptDialog`。

**Tech Stack:** Svelte 5、TypeScript、Vitest。

**Spec:** `docs/superpowers/specs/2026-11-07-file-shortcuts-design.md`

## Global Constraints

- macOS 只认 `metaKey`，Windows/Linux 只认 `ctrlKey`；`Alt` 参与时不匹配。
- 复用现有 `PromptDialog` 和创建流程，不新增创建逻辑。
- 不改现有 `Cmd+S` / `Cmd+Shift+S` / `Cmd+W` / `Cmd+P` / `Ctrl+Tab`。
- 搜索面板或强制关闭确认框打开时，忽略新快捷键。

## Review Focus

1. macOS 上按 `Ctrl+N` 不能被当成新建文件（要留给编辑器光标下移）。
2. Windows/Linux 上 `Ctrl+N` 正常触发，`Meta+N` 不触发。
3. 未选中任何节点时，新文件落在工作区根目录。
4. 选中文件时，新文件落在该文件所在目录；选中文件夹时落在文件夹内。
5. 没有活动标签或没有工作区时，快捷键不报错、不弹空对话框。

---

### Task 1: 把 `parentDirectory` 移到纯工具模块

**Files:**
- Modify: `src/lib/utils/paths.ts`
- Modify: `src/lib/state/workspace.svelte.ts`
- Modify: `src/lib/sidebar/FileTree.svelte:3,65`
- Test: `tests/paths.test.ts`

**Interfaces:**
- Produces: `parentDirectory(path: string): string`（从 `utils/paths.ts` 导出）。
- Consumes: 无。

- [ ] **Step 1: 写失败测试**

在 `tests/paths.test.ts` 增加：

```ts
import { parentDirectory } from "../src/lib/utils/paths";

describe("parentDirectory", () => {
  test("returns the containing directory", () => {
    expect(parentDirectory("/w/notes/a.md")).toBe("/w/notes");
  });

  test("returns root for top-level paths", () => {
    expect(parentDirectory("/a.md")).toBe("/");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/paths.test.ts`
Expected: FAIL，`parentDirectory` 不是 `paths.ts` 的导出。

- [ ] **Step 3: 实现并迁移**

`src/lib/utils/paths.ts` 增加：

```ts
export function parentDirectory(path: string): string {
  const index = path.lastIndexOf("/");
  return index > 0 ? path.slice(0, index) : "/";
}
```

删除 `workspace.svelte.ts` 里的同名函数；`FileTree.svelte` 改为从 `../utils/paths` 导入。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/paths.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/utils/paths.ts src/lib/state/workspace.svelte.ts src/lib/sidebar/FileTree.svelte tests/paths.test.ts
git commit -m "refactor: move parentDirectory to path utils"
```

---

### Task 2: 快捷键匹配器与新建落点

**Files:**
- Create: `src/lib/utils/shortcuts.ts`
- Create: `tests/shortcuts.test.ts`

**Interfaces:**
- Produces:
  - `type Shortcut = "new-file" | "new-folder" | "open-folder" | "rename"`
  - `matchShortcut(event: ShortcutEvent, platform: Platform): Shortcut | null`
  - `newEntryParent(root: string, selectedPath: string | null, selectedIsDir: boolean): string`
- Consumes: `parentDirectory`（Task 1）、`Platform`（`utils/platform.ts`）。

- [ ] **Step 1: 写失败测试**

创建 `tests/shortcuts.test.ts`：

```ts
import { describe, expect, test } from "vitest";
import { matchShortcut, newEntryParent } from "../src/lib/utils/shortcuts";

function key(init: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: "",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...init,
  } as KeyboardEvent;
}

describe("matchShortcut", () => {
  test("macOS Cmd+N creates a file", () => {
    expect(matchShortcut(key({ key: "n", metaKey: true }), "macos")).toBe("new-file");
  });

  test("macOS Ctrl+N is left to the editor", () => {
    expect(matchShortcut(key({ key: "n", ctrlKey: true }), "macos")).toBeNull();
  });

  test("macOS Cmd+Shift+N creates a folder", () => {
    expect(matchShortcut(key({ key: "N", metaKey: true, shiftKey: true }), "macos")).toBe(
      "new-folder",
    );
  });

  test("Windows and Linux use Ctrl+N", () => {
    for (const platform of ["windows", "linux"] as const) {
      expect(matchShortcut(key({ key: "n", ctrlKey: true }), platform)).toBe("new-file");
      expect(matchShortcut(key({ key: "n", metaKey: true }), platform)).toBeNull();
    }
  });

  test("Cmd/Ctrl+O opens a folder", () => {
    expect(matchShortcut(key({ key: "o", metaKey: true }), "macos")).toBe("open-folder");
    expect(matchShortcut(key({ key: "o", ctrlKey: true }), "linux")).toBe("open-folder");
  });

  test("F2 renames without a modifier", () => {
    expect(matchShortcut(key({ key: "F2" }), "macos")).toBe("rename");
    expect(matchShortcut(key({ key: "F2", metaKey: true }), "macos")).toBeNull();
  });

  test("Alt disables every shortcut", () => {
    expect(matchShortcut(key({ key: "n", metaKey: true, altKey: true }), "macos")).toBeNull();
  });
});

describe("newEntryParent", () => {
  test("uses the workspace root when nothing is selected", () => {
    expect(newEntryParent("/w", null, false)).toBe("/w");
  });

  test("creates inside a selected directory", () => {
    expect(newEntryParent("/w", "/w/notes", true)).toBe("/w/notes");
  });

  test("creates beside a selected file", () => {
    expect(newEntryParent("/w", "/w/notes/a.md", false)).toBe("/w/notes");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/shortcuts.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `src/lib/utils/shortcuts.ts`**

```ts
import type { Platform } from "./platform";
import { parentDirectory } from "./paths";

export type Shortcut = "new-file" | "new-folder" | "open-folder" | "rename";

export interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function matchShortcut(event: ShortcutEvent, platform: Platform): Shortcut | null {
  if (event.altKey) {
    return null;
  }

  const mod = platform === "macos" ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  const key = event.key.toLowerCase();

  if (mod && key === "n") {
    return event.shiftKey ? "new-folder" : "new-file";
  }
  if (mod && !event.shiftKey && key === "o") {
    return "open-folder";
  }
  if (!mod && !event.shiftKey && event.key === "F2") {
    return "rename";
  }
  return null;
}

export function newEntryParent(
  root: string,
  selectedPath: string | null,
  selectedIsDir: boolean,
): string {
  if (!selectedPath) {
    return root;
  }
  return selectedIsDir ? selectedPath : parentDirectory(selectedPath);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/shortcuts.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/utils/shortcuts.ts tests/shortcuts.test.ts
git commit -m "feat: add file shortcut matcher"
```

---

### Task 3: 接入 App 与文件树

**Files:**
- Modify: `src/App.svelte`
- Modify: `src/lib/sidebar/FileTree.svelte`
- Modify: `README.md`

**Interfaces:**
- Consumes: `matchShortcut`、`newEntryParent`、`detectPlatform`。
- Produces: window 事件 `rypora:command`，`detail: { command: Shortcut }`。

- [ ] **Step 1: `App.svelte` 分发**

在 `handleKeydown` 开头加入（保留现有分支）：

```ts
const shortcut = matchShortcut(
  {
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
  },
  detectPlatform(),
);

if (shortcut) {
  event.preventDefault();
  if (event.repeat || paletteVisible || discardPath) {
    return;
  }
  if (shortcut === "open-folder") {
    void workspace.openFolder();
  } else {
    window.dispatchEvent(new CustomEvent("rypora:command", { detail: { command: shortcut } }));
  }
  return;
}
```

- [ ] **Step 2: `FileTree.svelte` 监听**

```ts
import { onMount } from "svelte";

function targetDirectory(): string {
  const selected = workspace.selectedPath;
  if (!selected) {
    return workspace.root!;
  }
  const node = findNode(tree, selected);
  return newEntryParent(workspace.root!, selected, node?.isDir ?? false);
}

function handleCommand(event: Event): void {
  const command = (event as CustomEvent<{ command?: string }>).detail?.command;
  if (!workspace.root || !command) {
    return;
  }
  if (command === "new-file" || command === "new-folder") {
    prompt = { parent: targetDirectory(), isDir: command === "new-folder" };
  } else if (command === "rename" && workspace.selectedPath) {
    const node = findNode(tree, workspace.selectedPath);
    if (node) {
      renamingPath = workspace.selectedPath;
    }
  }
}

onMount(() => {
  window.addEventListener("rypora:command", handleCommand);
  return () => window.removeEventListener("rypora:command", handleCommand);
});
```

删除 `FileTree` 里原有的 `handleTreeKey` 和 `onkeydown`（F2 改由全局处理）。

- [ ] **Step 3: README**

把快捷键表更新为包含 `N`、`Shift+N`、`O`、`F2`，并标注 macOS 用 `Cmd`、其他平台用 `Ctrl`。

- [ ] **Step 4: 全量验证**

Run: `npx vitest run && npm run check && npm run build`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add src/App.svelte src/lib/sidebar/FileTree.svelte README.md
git commit -m "feat: wire file operation shortcuts"
```
