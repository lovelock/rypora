# Rypora MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个可运行的 Linux 桌面 Markdown 工作区：文件树 + `Ctrl+P` 文件名模糊搜索 + CodeMirror 6 实时渲染 + 自动保存。

**Architecture:** Tauri 2 壳（Rust 负责目录扫描、文件 CRUD、监听、搜索、配置），WebView 内 Svelte 5 负责 UI，CodeMirror 6 用装饰实现单栏实时渲染。

**Tech Stack:** Rust 1.99、Tauri 2.12、Svelte 5.57、Vite、TypeScript、CodeMirror 6.43、Vitest、nucleo-matcher、notify。

**Spec:** `docs/superpowers/specs/2026-11-07-rypora-design.md`

## Global Constraints

- Linux 优先；webkit2gtk-4.1 / gtk3 / libsoup3 / javascriptcoregtk-4.1 已确认存在。
- 只处理 UTF-8 文本；打开再保存必须保留原文件的 LF / CRLF。
- v1 必须先选工作区；不做单文件打开、MIME 关联、命令行传参。
- 文件系统是唯一真相，不引入数据库。
- 自动保存去抖 400ms，写盘必须原子（临时文件 + rename）。
- 搜索只匹配文件名/相对路径，不做全文。
- 目标：冷启动 < 1.5s，常驻内存 < 200MB，10k 文件可用。
- 不做插件、图谱、双链、同步、协作、导出。
- 中文输入法必须可用，作为验收项。
- 所有 Rust 结构体与前端通信字段统一 `#[serde(rename_all = "camelCase")]`。

## Review Focus

1. 中文输入法合成期间，装饰替换不能吞掉正在组合的文本。
2. 外部删除 / 重命名已打开文件时，自动保存不得把旧路径写回、复活文件。
3. CRLF 文件打开再保存后仍是 CRLF。
4. 10k 文件工作区：打开、`Ctrl+P`、树刷新不能卡死界面。
5. 权限拒绝、单文件 > 2MB、二进制文件：报错不崩，不丢已有内容。

---

### Task 1: 脚手架与基线

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`
- Create: `src/main.ts`, `src/App.svelte`, `src/app.css`
- Create: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`
- Create: `src-tauri/icons/*`（用 `npx tauri icon` 生成）
- Modify: `.gitignore`

**Interfaces:**
- Produces: `App.svelte` 挂载点；`run()` 作为 Tauri 入口；Vite 端口 `1420`。

- [ ] **Step 1: 初始化前端工程**

`package.json` 脚本：`dev`、`build`、`preview`、`check`、`test`、`tauri`。依赖：`svelte`、`@sveltejs/vite-plugin-svelte`、`vite`、`typescript`、`svelte-check`、`vitest`、`jsdom`、`@tauri-apps/api`、`@tauri-apps/cli`、`@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-opener`、`@codemirror/*`、`@lezer/highlight`。

- [ ] **Step 2: 写最小 Svelte 页面**

`App.svelte` 显示标题 "Rypora" 和一个空的 `<div id="editor">`。

- [ ] **Step 3: 初始化 Tauri 2**

`tauri.conf.json`：`identifier = "dev.rypora.app"`，窗口 1100×760，`devUrl = "http://localhost:1420"`，`frontendDist = "../dist"`，`assetProtocol.enable = true`。`lib.rs` 定义 `run()`，`main.rs` 调用它。

- [ ] **Step 4: 生成图标**

用 ImageMagick 生成 1024×1024 的纯色底 + "R" 图，再执行 `npx tauri icon /tmp/rypora-icon.png`。

- [ ] **Step 5: 验证基线**

Run: `npm run build && cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 两者均成功，无错误。

- [ ] **Step 6: 提交**

```bash
git add -A && git commit -m "chore: scaffold tauri + svelte + codemirror"
```

---

### Task 2: 目录扫描与树模型

**Files:**
- Create: `src-tauri/src/tree.rs`, `src-tauri/src/error.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces:
```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode { pub name: String, pub path: String, pub is_dir: bool, pub children: Vec<FileNode> }

pub fn is_markdown(path: &Path) -> bool;
pub fn scan_tree(root: &Path) -> Result<FileNode, WorkspaceError>;
```
- `WorkspaceError` 变体：`NotFound`、`Conflict`、`InvalidName`、`TooLarge`、`Io(String)`。

- [ ] **Step 1: 写失败测试**

`tempfile` 建目录：`a.md`、`b.txt`、`sub/c.markdown`、`.hidden/x.md`、`node_modules/y.md`。断言树只含 `a.md`、`sub/`、`sub/c.markdown`；目录排在文件前；名称不区分大小写排序。

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml tree`
Expected: FAIL，`scan_tree` 未定义。

- [ ] **Step 3: 实现扫描**

用 `walkdir`，跳过隐藏目录和 `node_modules`、`target`、`.git`、`.obsidian`；只收 `.md`/`.markdown`/`.mdown`；目录递归构建；符号链接目录跳过；按 `is_dir` 降序、名称小写升序排序。

- [ ] **Step 4: 运行确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml tree`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri && git commit -m "feat: workspace tree scanning"
```

---

### Task 3: 文件 CRUD 与读写

**Files:**
- Create: `src-tauri/src/workspace.rs`
- Modify: `src-tauri/src/error.rs`

**Interfaces:**
- Produces:
```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Eol { Lf, Crlf }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent { pub text: String, pub eol: Eol, pub mtime_ms: u64 }

pub fn read_file(path: &Path) -> Result<FileContent, WorkspaceError>;
pub fn write_file_atomic(path: &Path, text: &str, eol: Eol, expected_mtime_ms: u64) -> Result<u64, WorkspaceError>;
pub fn create_entry(parent: &Path, name: &str, is_dir: bool) -> Result<PathBuf, WorkspaceError>;
pub fn rename_entry(path: &Path, new_name: &str) -> Result<PathBuf, WorkspaceError>;
pub fn delete_entry(path: &Path) -> Result<(), WorkspaceError>;
pub fn move_entry(src: &Path, dest_dir: &Path) -> Result<PathBuf, WorkspaceError>;
pub fn validate_name(name: &str) -> Result<(), WorkspaceError>;
```

- [ ] **Step 1: 写测试**

覆盖：`validate_name` 拒绝空串、含 `/`、含 `\\`、`..`、`.`；CRLF 文件读入后 `text` 不含 `\r`、`eol == Crlf`，写回后字节仍是 CRLF；mtime 不匹配时 `write_file_atomic` 返回 `Conflict`；`create_entry("note")` 自动补 `.md`；重名返回 `Conflict`；`move_entry` 到已存在同名文件返回 `Conflict`。

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml workspace`
Expected: FAIL。

- [ ] **Step 3: 实现**

读文件先检查大小 > 2MB 返回 `TooLarge`；用 `String::from_utf8` 校验；检测 `\r\n`。写盘写同目录临时文件、`sync_all`、`rename`；写前比较 mtime。删除走 `trash`  crate。

- [ ] **Step 4: 运行确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml workspace`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri && git commit -m "feat: file crud with atomic writes"
```

---

### Task 4: 配置与会话

**Files:**
- Create: `src-tauri/src/config.rs`

**Interfaces:**
- Produces:
```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TabState { pub path: String, pub cursor: u32, pub scroll_top: f64 }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
  pub last_workspace: Option<String>,
  pub tabs: Vec<TabState>,
  pub active_tab: Option<String>,
  pub theme: String,
  pub sidebar_width: f64,
  pub font_size: f64,
}
impl Default for AppConfig { /* theme "system", sidebar 260.0, font_size 16.0 */ }

pub fn load_config(dir: &Path) -> AppConfig;
pub fn save_config(dir: &Path, cfg: &AppConfig) -> Result<(), WorkspaceError>;
```

- [ ] **Step 1: 写测试**

缺失文件返回默认值；损坏 JSON 返回默认值；写入后读回相等；目录不存在时自动创建。

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml config`
Expected: FAIL。

- [ ] **Step 3: 实现**

JSON 文件 `config.json`；先写临时文件再 rename。

- [ ] **Step 4: 运行确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml config`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri && git commit -m "feat: persist app session config"
```

---

### Task 5: 文件名索引与模糊搜索

**Files:**
- Create: `src-tauri/src/search.rs`

**Interfaces:**
- Produces:
```rust
#[derive(Debug, Clone)]
pub struct FileEntry { pub path: String, pub rel_path: String, pub name: String, pub modified_ms: u64 }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit { pub path: String, pub rel_path: String, pub score: u32, pub indices: Vec<u32> }

pub struct FileIndex { entries: Vec<FileEntry> }
impl FileIndex {
  pub fn build(root: &Path) -> Result<Self, WorkspaceError>;
  pub fn len(&self) -> usize;
  pub fn search(&self, query: &str, limit: usize) -> Vec<SearchHit>;
}
```

- [ ] **Step 1: 写测试**

`"report"` 命中 `docs/report.md`；`"rpt"` 模糊命中；`"docs rep"` 双 token 全命中；`"zzz"` 无结果；空查询按修改时间倒序返回前 N 条；`limit` 生效；大小写不敏感。

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml search`
Expected: FAIL。

- [ ] **Step 3: 实现**

`nucleo-matcher`，对 `rel_path` 与 `name` 分别匹配取较高分；`fuzzy_indices` 返回命中下标；排序：分数降序 → 修改时间降序 → 路径长度升序。

- [ ] **Step 4: 运行确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml search`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri && git commit -m "feat: fuzzy filename search index"
```

---

### Task 6: 文件监听与命令层

**Files:**
- Create: `src-tauri/src/watcher.rs`, `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces:
```rust
pub struct AppState {
  pub workspace: RwLock<Option<Workspace>>,
  pub config_dir: PathBuf,
  pub self_writes: Mutex<HashMap<PathBuf, Instant>>,
}
pub struct Workspace { pub root: PathBuf, pub index: FileIndex }

pub fn mark_self_write(map: &Mutex<HashMap<PathBuf, Instant>>, path: &Path);
pub fn should_suppress(map: &mut HashMap<PathBuf, Instant>, path: &Path, now: Instant) -> bool;
```
- Tauri 命令（`#[tauri::command]`）：`open_workspace`、`get_tree`、`create_entry`、`rename_entry`、`delete_entry`、`move_entry`、`read_file`、`write_file`、`search_files`、`load_config`、`save_config`、`allow_asset_dir`。
- 事件：`fs://changed`，payload `{ paths: string[] }`。

- [ ] **Step 1: 写测试**

`should_suppress`：刚标记的路径返回 true；超过 1s 返回 false；未标记返回 false。

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml watcher`
Expected: FAIL。

- [ ] **Step 3: 实现**

`notify` + `notify-debouncer-full` 250ms 去抖；后台线程推送合并后的路径；`write_file` 前后调用 `mark_self_write`；`open_workspace` 扫描树、建索引、启动监听、`asset_protocol_scope().allow_directory(root, true)`。

- [ ] **Step 4: 命令注册**

`lib.rs` 的 `invoke_handler` 注册全部命令，`.manage(AppState)`。capabilities 加 `dialog:default`、`opener:default`。

- [ ] **Step 5: 运行确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src-tauri && git commit -m "feat: watcher and tauri commands"
```

---

### Task 7: 前端外壳与文件树（只读）

**Files:**
- Create: `src/lib/types.ts`, `src/lib/ipc.ts`
- Create: `src/lib/state/workspace.svelte.ts`
- Create: `src/lib/sidebar/FileTree.svelte`, `src/lib/sidebar/TreeNode.svelte`
- Modify: `src/App.svelte`, `src/app.css`

**Interfaces:**
- `ipc.ts` 导出与命令同名的 camelCase 包装：`openWorkspace(path): Promise<{ root: string; tree: FileNode }>`、`getTree()`、`readFile(path)`、`searchFiles(query, limit)` 等。
- `workspace.svelte.ts` 导出 `workspace` 状态：`root`、`tree`、`openFolder()`、`refresh()`、`toggle(path)`。

- [ ] **Step 1: 写类型与 IPC**

TS 类型与 Rust `FileNode`/`FileContent`/`SearchHit` 一一对应。

- [ ] **Step 2: 写树组件**

递归渲染；目录可展开/收起；文件点击调用 `onOpen(path)`；当前文件高亮；空工作区显示"打开文件夹"。

- [ ] **Step 3: 验证**

Run: `npm run check && npm run build`
Expected: 无类型错误，构建成功。

- [ ] **Step 4: 手工冒烟**

`npm run tauri dev`，选一个临时目录，确认树正确渲染、目录可展开。

- [ ] **Step 5: 提交**

```bash
git add src && git commit -m "feat: workspace shell and file tree"
```

---

### Task 8: 文件树 CRUD 交互

**Files:**
- Create: `src/lib/sidebar/ContextMenu.svelte`, `src/lib/ui/ConfirmDialog.svelte`
- Modify: `src/lib/sidebar/FileTree.svelte`, `src/lib/sidebar/TreeNode.svelte`, `src/lib/state/workspace.svelte.ts`

**Interfaces:**
- `workspace.svelte.ts` 增加：`createEntry(parent, name, isDir)`、`renameEntry(path, newName)`、`deleteEntry(path)`、`moveEntry(src, destDir)`、`selectedPath`。

- [ ] **Step 1: 实现右键菜单**

新建文件、新建文件夹、重命名、删除、在文件管理器中显示。重命名使用行内 `<input>`，`Enter` 提交、`Esc` 取消。

- [ ] **Step 2: 实现拖拽移动**

`dragstart` 记录路径，目录节点 `dragover` 高亮、`drop` 调用 `moveEntry`；失败弹提示。

- [ ] **Step 3: 删除确认**

删除前弹 `ConfirmDialog`，确认后进回收站。

- [ ] **Step 4: 验证**

Run: `npm run check && npm run build`
Expected: 通过。

- [ ] **Step 5: 手工冒烟**

建/改名/移动/删除各一次，确认树与磁盘一致。

- [ ] **Step 6: 提交**

```bash
git add src && git commit -m "feat: file tree crud"
```

---

### Task 9: Ctrl+P 快速打开

**Files:**
- Create: `src/lib/palette/QuickOpen.svelte`
- Create: `src/lib/utils/highlight.ts`, `tests/highlight.test.ts`
- Modify: `src/App.svelte`, `src/lib/state/workspace.svelte.ts`

**Interfaces:**
- `highlight.ts` 导出 `splitByIndices(text: string, indices: number[]): { text: string; hit: boolean }[]`。
- `QuickOpen.svelte`：`visible`、`onSelect(path)`；输入 120ms 去抖调用 `searchFiles`。

- [ ] **Step 1: 写高亮测试**

`splitByIndices("abc", [1])` → `[{text:"a"},{text:"b",hit:true},{text:"c"}]`；空 indices 原样返回；indices 越界忽略。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/highlight.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现高亮与面板**

面板固定居中，`↑/↓` 移动，`Enter` 打开，`Esc` 关闭；无结果显示占位；全局 `Ctrl+P` 拦截。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/highlight.test.ts && npm run check`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src tests && git commit -m "feat: ctrl+p fuzzy quick open"
```

---

### Task 10: 编辑器、标签、会话与自动保存

**Files:**
- Create: `src/lib/editor/setup.ts`, `src/lib/editor/theme.ts`, `src/lib/state/tabs.svelte.ts`
- Create: `src/lib/tabs/TabBar.svelte`, `src/lib/editor/Editor.svelte`
- Modify: `src/App.svelte`

**Interfaces:**
- `setup.ts` 导出 `createEditorState(doc: string, extensions: Extension[]): EditorState` 与 `baseExtensions(onChange)`。
- `tabs.svelte.ts`：`tabs: Tab[]`、`activePath`、`openFile(path)`、`closeTab(path)`、`setTabState(path, state)`、`markSaved(path, mtime)`、`markMissing(path)`。`Tab = { path, title, state: EditorState | null, eol, mtime, dirty, missing }`。
- `Editor.svelte` 单例 `EditorView`，切换标签 `view.setState(tab.state)`。

- [ ] **Step 1: 写编辑器基础**

CM6 基础扩展：行号关闭、换行、历史、搜索、Markdown 语言、主题、`updateListener`。`Ctrl+S` 立即保存。

- [ ] **Step 2: 写标签**

打开文件读入内容与 EOL；关闭时若未保存先落盘；切换时保存/恢复 `EditorState`；`Ctrl+W` 关闭。

- [ ] **Step 3: 自动保存**

文档变化后 400ms 去抖写盘；失焦、切标签、关窗立即保存；保存失败显示状态栏错误。

- [ ] **Step 4: 外部变更**

监听 `fs://changed`：刷新树；对每个打开标签比较 mtime。干净则重载；脏则显示冲突条（保留我的 / 载入磁盘）；路径消失则 `markMissing` 并暂停自动保存。

- [ ] **Step 5: 会话**

启动 `loadConfig`，恢复工作区与标签元数据；标签内容懒加载。状态变化 500ms 去抖 `saveConfig`。

- [ ] **Step 6: 验证**

Run: `npm run check && npm run build && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全部通过。

- [ ] **Step 7: 手工冒烟**

新建文件输入文字，等 1s，`cat` 确认落盘；关闭重开，标签与光标恢复。

- [ ] **Step 8: 提交**

```bash
git add src && git commit -m "feat: tabs, autosave and session restore"
```

---

### Task 11: 实时渲染（行内）

**Files:**
- Create: `src/lib/editor/live-preview.ts`, `src/lib/editor/preview-model.ts`
- Create: `tests/preview-model.test.ts`
- Modify: `src/lib/editor/setup.ts`, `src/lib/editor/theme.ts`

**Interfaces:**
- `preview-model.ts` 导出：
```ts
export type PreviewRange =
  | { kind: "hide"; from: number; to: number }
  | { kind: "style"; from: number; to: number; cls: string };
export function computeInlineRanges(tree: Tree, doc: Text, activeLines: Set<number>): PreviewRange[];
```
- `live-preview.ts` 导出 `livePreview(): Extension`，内部把 `PreviewRange` 转成 `Decoration`，并注册 `atomicRanges`。

- [ ] **Step 1: 写纯函数测试**

用 `@lezer/markdown` 解析：
`# 标题` 的 `#` 被 hide；`**粗体**` 的 `**` 被 hide、内部文本 `style=strong`；`*斜体*`、`~~删除~~`、`` `code` `` 同理；光标在标题行时该行不产生 hide；普通段落不产生装饰。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/preview-model.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现纯函数**

遍历语法树，识别 `ATXHeading1..6`、`StrongEmphasis`、`Emphasis`、`Strikethrough`、`InlineCode` 及其 Mark 子节点；用 `activeLines` 跳过光标行。

- [ ] **Step 4: 接入 CM6**

`ViewPlugin` 在 `docChanged || selectionSet || viewportChanged` 时重算，只处理 `visibleRanges`；`Decoration.set(ranges, true)` 排序；原子区间用同一组 replace 范围。

- [ ] **Step 5: 跑测试与构建**

Run: `npx vitest run tests/preview-model.test.ts && npm run check && npm run build`
Expected: PASS。

- [ ] **Step 6: 手工冒烟**

输入 `# 标题`、`**粗体**`，移开光标看渲染；回到该行看源码。

- [ ] **Step 7: 提交**

```bash
git add src tests && git commit -m "feat: inline live preview decorations"
```

---

### Task 12: 块级 widget 与链接

**Files:**
- Create: `src/lib/editor/widgets.ts`, `src/lib/utils/paths.ts`
- Create: `tests/paths.test.ts`
- Modify: `src/lib/editor/live-preview.ts`, `src/lib/editor/theme.ts`

**Interfaces:**
- `paths.ts` 导出 `resolveRelative(docPath: string, href: string): string`。
- `widgets.ts` 导出 `ImageWidget`、`RuleWidget`、`CodeBlockWidget`、`TaskWidget` 四个 `WidgetType` 子类。

- [ ] **Step 1: 写路径测试**

`resolveRelative("/w/notes/a.md", "../img/x.png")` → `/w/img/x.png`；`./x.png`；`/abs/x.png` 原样；带 `#anchor` 的 `.md` 链接去掉锚点后解析。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/paths.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 widget**

图片：`convertFileSrc(resolveRelative(...))`；分割线：`<hr>`；代码块：`@codemirror/language-data` 异步加载语言，`highlightTree` 生成 span，加载前先显示纯文本；任务框：点击 dispatch 切换 `[ ]`/`[x]`。所有 widget 点击后把光标放到源码区间。

- [ ] **Step 4: 链接点击**

`EditorView.domEventHandlers` 监听 `mousedown`：`Ctrl/Cmd` 按下且点击位置在 `Link` 节点内才处理；相对 `.md` 调用 `openFile`，`http(s)` 调 `openUrl`，其他路径调 `revealItem`。

- [ ] **Step 5: 跑测试与构建**

Run: `npx vitest run tests/paths.test.ts && npm run check && npm run build`
Expected: PASS。

- [ ] **Step 6: 手工冒烟**

包含图片、围栏代码块、任务列表、分割线的文档，逐项确认渲染与点回源码。

- [ ] **Step 7: 提交**

```bash
git add src tests && git commit -m "feat: block widgets and link handling"
```

---

### Task 13: 快捷键、状态栏与空态

**Files:**
- Create: `src/lib/editor/format-commands.ts`, `tests/format-commands.test.ts`
- Create: `src/lib/StatusBar.svelte`
- Modify: `src/App.svelte`, `src/lib/editor/setup.ts`

**Interfaces:**
- `format-commands.ts` 导出 `toggleWrap(text: string, from: number, to: number, marker: string): { changes: { from: number; to: number; insert: string }; selection: { anchor: number; head: number } }`。

- [ ] **Step 1: 写测试**

无选区时插入成对标记并把光标放中间；有选区时包裹；已包裹时取消包裹；多行选区逐行处理。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/format-commands.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现并绑定**

`Ctrl+B` 粗体、`Ctrl+I` 斜体、`Ctrl+Shift+X` 删除线、`Ctrl+E` 行内代码。状态栏显示路径、行列、字数、保存状态。

- [ ] **Step 4: 跑测试与构建**

Run: `npx vitest run && npm run check && npm run build`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src tests && git commit -m "feat: formatting shortcuts and status bar"
```

---

### Task 14: 打包与完整验证

**Files:**
- Create: `README.md`, `scripts/smoke.sh`
- Modify: `src-tauri/tauri.conf.json`

**Interfaces:**
- `scripts/smoke.sh`：在 Xvfb 下启动应用，等待窗口出现，截图到 `/tmp/rypora-smoke.png`，退出码 0 表示成功。

- [ ] **Step 1: 配置打包**

`bundle.targets = ["deb"]`，补全 icon、category、shortDescription。

- [ ] **Step 2: 写冒烟脚本**

用 `xvfb-run` 启动 `src-tauri/target/release/rypora`，`sleep 3`，用 `import`/`scrot` 截图，`kill` 进程。

- [ ] **Step 3: 跑完整验证**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml
npx vitest run
npm run check
npm run build
cargo build --release --manifest-path src-tauri/Cargo.toml
bash scripts/smoke.sh
```
Expected: 全部成功，截图存在且非全黑。

- [ ] **Step 4: 打包**

Run: `npm run tauri build -- --bundles deb`
Expected: 产出 `.deb`，路径在 `src-tauri/target/release/bundle/deb/`。

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "chore: packaging and verification"
```

---

## 交付验收清单

- [ ] 打开工作区，树正确、可展开、可 CRUD、可拖拽移动。
- [ ] `Ctrl+P` 模糊搜索文件名并跳转。
- [ ] 标题/粗体/斜体/删除线/行内代码/代码块/图片/任务列表/分割线/链接实时渲染。
- [ ] 光标行显示源码，移开即渲染。
- [ ] 自动保存 400ms 落盘；CRLF 往返不变。
- [ ] 外部改文件不丢内容；外部删除不复活。
- [ ] 中文输入法可正常输入与候选。
- [ ] 重启恢复工作区、标签、光标。
- [ ] `cargo test`、`vitest`、`npm run check`、`npm run build`、`tauri build` 全通过。
