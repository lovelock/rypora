# 文件操作快捷键（设计文档）

- 日期：2026-11-07
- 状态：已确认

## 1. 意图与为什么

用户把 Rypora 当 snippets 仓库，新建文件是高频操作，目前只能点文件树按钮或右键菜单。
只加最常用、容易记住的一组，不堆快捷键。

## 2. 目标

| 快捷键（macOS） | 快捷键（Windows/Linux） | 动作 |
|---|---|---|
| `Cmd+N` | `Ctrl+N` | 新建文件 |
| `Cmd+Shift+N` | `Ctrl+Shift+N` | 新建文件夹 |
| `Cmd+O` | `Ctrl+O` | 打开文件夹 |
| `F2` | `F2` | 重命名选中项 |

- 修饰键按平台区分：macOS 只认 `metaKey`，其余平台只认 `ctrlKey`。
  这样 macOS 的 `Ctrl+N` 继续留给 CodeMirror 的「光标下移」，不会被抢走。
- `Alt` 参与时一律不匹配；按住不放产生的 repeat 事件在分发层忽略。
- 新建文件的落点：选中文件夹 → 建在里面；选中文件 → 同目录；未选中 → 工作区根目录。
- 新建后沿用现有行为：自动打开并进入重命名。
- 搜索面板或强制关闭确认框打开时，忽略这些快捷键。

## 3. 非目标

- 不加标签序号切换（`Cmd+1..9`）、`Cmd+Shift+[ ]`、删除、刷新、设置等快捷键。
- 不改现有 `Cmd+S` / `Cmd+Shift+S` / `Cmd+W` / `Cmd+P` / `Ctrl+Tab` 的行为。

## 4. 方案

| 方案 | 结论 | 理由 |
|---|---|---|
| **A. 纯函数匹配器 + 自定义事件** | **选中** | 匹配逻辑可单测；复用 `FileTree` 现有的 `PromptDialog`，不重复创建流程；沿用项目已有的 `rypora:open-link` 事件模式。 |
| B. 在 `FileTree` 内直接监听 `window` | 否决 | 快捷键逻辑分散，且与 `App.svelte` 的集中处理冲突。 |
| C. 把创建流程提升到全局 store | 否决 | 改动面大，收益不明显。 |

### 4.1 文件

- 新增 `src/lib/utils/shortcuts.ts`：
  - `matchShortcut(event, platform): Shortcut | null`
  - `newEntryParent(root, selectedPath, selectedIsDir): string`
- 把 `parentDirectory` 从 `workspace.svelte.ts` 移到 `utils/paths.ts`（纯函数，避免测试时拉起 Tauri 依赖）。
- `App.svelte` 在现有 `handleKeydown` 里先匹配新快捷键；`open-folder` 直接调 `workspace.openFolder()`，其余通过
  `window.dispatchEvent(new CustomEvent("rypora:command", { detail: { command } }))` 通知 `FileTree`。
- `FileTree.svelte` 监听 `rypora:command`，打开现有 `PromptDialog` 或设置 `renamingPath`。
- 删除 `FileTree` 里只在本组件生效的 F2 处理，避免重复响应。
- 更新 `README.md` 快捷键表。

## 5. 测试

- `tests/shortcuts.test.ts`：
  - macOS：`Cmd+N` → new-file；`Ctrl+N` → null；`Cmd+Shift+N` → new-folder。
  - Windows/Linux：`Ctrl+N` → new-file；`Cmd+N` → null。
  - `Cmd+O` → open-folder；`F2` → rename；`Cmd+F2` → null；带 Alt 一律 null。
  - `newEntryParent`：无选中、选中文件夹、选中文件三种落点。
- `tests/paths.test.ts` 补 `parentDirectory` 用例。
- 回归：`npx vitest run`、`npm run check`、`npm run build`。
- 人工：在 macOS 上确认 `Cmd+N`、`Cmd+Shift+N`、`Cmd+O`、`F2`，以及 `Ctrl+N` 仍是编辑器光标下移。
