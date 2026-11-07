# Rypora 全文搜索实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 `Ctrl+P` 面板中加入正文全文搜索，文件结果在前、内容结果在后，索引异步批量更新，并提供手动全量重建。

**Architecture:** Rust 侧用 Tantivy（嵌入式 Lucene）+ jieba 分词建索引，后台 worker 通过 channel 接收 upsert/delete/rebuild，去抖后批量 commit；Tauri 命令只负责入队和查询。前端把现有的 QuickOpen 改成双分组 SearchPalette，文件结果立即返回，正文结果异步追加。

**Tech Stack:** Rust 1.99、Tantivy 0.22、jieba-rs 0.11、Tauri 2、Svelte 5、TypeScript、Vitest。

**Spec:** `docs/superpowers/specs/2026-11-07-rypora-fulltext-design.md`

## Global Constraints

- 索引目录放在 app data：`index/<fnv(root)>/`；`meta.json` 与 `manifest.json` 必须原子写。
- 只索引 `.md` / `.markdown` / `.mdown`，单文件 ≤ 2MB，UTF-8。
- 文件写入 / CRUD 命令只入队，不得等待索引完成。
- 全文查询只查 `body` 字段；文件名由现有的文件分组负责。
- 查询输入按字面量处理，只有成对引号是短语。
- 索引更新必须批量 commit，禁止每次保存全量重建。
- 手动重建入口常驻搜索面板。

## Review Focus

1. 中文子串召回：`笔记` 命中 `我的笔记本`，不能整段一个 token。
2. 异步写入：保存命令不被索引阻塞；连续保存只产生批量 commit。
3. 目录删除/重命名：不留下 ghost 内容结果。
4. 重启对账：关闭期间的修改/删除在下次打开后被修正。
5. 查询字面量安全：`C++`、`a AND b`、`*`、不平衡引号不 panic、不误触发语法。
6. 索引损坏 / 锁冲突：面板里的“重建全文索引”能恢复。

---

### Task 1: 依赖、schema 与 jieba tokenizer

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/index/mod.rs`, `src-tauri/src/index/schema.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
```rust
pub const SCHEMA_VERSION: u32 = 1;
pub struct IndexSchema {
  pub schema: tantivy::schema::Schema,
  pub path: Field,
  pub rel_path: Field,
  pub title: Field,
  pub body: Field,
  pub mtime: Field,
}
pub fn build_schema() -> IndexSchema;
pub fn register_tokenizers(index: &Index) -> tantivy::Result<()>;
pub struct JiebaTokenizer { /* jieba */ }
impl Tokenizer for JiebaTokenizer { type TokenStream<'a> = JiebaTokenStream; ... }
```

- [ ] **Step 1: 加依赖**

`tantivy = "0.22"`、`jieba-rs = "0.11"`。保留现有 `rust-version`。

- [ ] **Step 2: 写失败测试**

在 `schema.rs` 的 `#[cfg(test)]` 中：
- `tokenize("我的笔记本很好用")` 包含 `我`/`笔记`/`笔记本` 等子词（search 模式）。
- `tokenize("Hello World")` 输出小写 `hello`、`world`。
- `build_schema()` 的 `path` 字段是 STRING、`body` 是 TEXT。

- [ ] **Step 3: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml index::schema`
Expected: FAIL。

- [ ] **Step 4: 实现 tokenizer**

用 `jieba.tokenize(text, TokenizeMode::Search, true)` 生成带 byte offset 的 token；单词 `to_lowercase()`；过滤空 token；`Token.position` 递增。注册名 `"jieba"`。

- [ ] **Step 5: 通过测试**

Run: `cargo test --manifest-path src-tauri/Cargo.toml index::schema`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src-tauri && git commit -m "feat: tantivy schema and jieba tokenizer"
```

---

### Task 2: 索引目录、meta 与 manifest

**Files:**
- Create: `src-tauri/src/index/storage.rs`, `src-tauri/src/index/manifest.rs`

**Interfaces:**
```rust
pub fn index_dir(app_data: &Path, root: &Path) -> PathBuf; // fnv hash
pub struct Meta { pub schema_version: u32, pub tokenizer_version: u32, pub root: String }
pub fn load_meta(dir: &Path) -> Option<Meta>;
pub fn save_meta(dir: &Path, meta: &Meta) -> Result<(), WorkspaceError>;
pub struct Manifest { pub version: u32, pub entries: BTreeMap<String, u64> }
pub fn load_manifest(dir: &Path) -> Manifest; // 损坏返回空
pub fn save_manifest(dir: &Path, manifest: &Manifest) -> Result<(), WorkspaceError>;
pub fn open_or_create(dir: &Path) -> Result<(Index, IndexSchema), WorkspaceError>;
```

- [ ] **Step 1: 写测试**

`index_dir` 同一 root 稳定、不同 root 不同；manifest 往返；损坏 manifest 返回空；meta 版本不匹配时 `needs_rebuild` 为 true。

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml index::storage index::manifest`
Expected: FAIL。

- [ ] **Step 3: 实现**

FNV-1a 64 位 hash；meta/manifest 用临时文件 + rename；`Index::open_in_dir` 失败时 `Index::create_in_dir`。

- [ ] **Step 4: 通过测试**

Run: `cargo test --manifest-path src-tauri/Cargo.toml index::storage index::manifest`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri && git commit -m "feat: index storage, meta and manifest"
```

---

### Task 3: 后台 worker（批量 upsert / delete / rebuild）

**Files:**
- Create: `src-tauri/src/index/worker.rs`
- Modify: `src-tauri/src/index/mod.rs`

**Interfaces:**
```rust
pub enum IndexCommand {
  RefreshPath(PathBuf),   // 文件或目录；worker 根据存在性 upsert / delete prefix
  DeletePrefix(PathBuf),
  RenamePrefix(PathBuf, PathBuf),
  Rebuild,
  Shutdown,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
  pub phase: String,      // "idle" | "indexing" | "reconciling" | "unavailable"
  pub indexed: usize,
  pub total: usize,
  pub generation: u64,
  pub available: bool,
}
pub struct WorkerHandle { pub sender: Sender<IndexCommand>, join: JoinHandle<()> }
pub fn spawn_worker(
  root: PathBuf,
  index: Index,
  schema: IndexSchema,
  manifest: Manifest,
  reader: IndexReader,
  status: Arc<Mutex<IndexStatus>>,
  on_status: impl Fn(IndexStatus) + Send + 'static,
) -> WorkerHandle;
```

- [ ] **Step 1: 写测试**

用临时目录和 3 个 md 文件：
- `RefreshPath(a.md)` 后 `reader.searcher()` 能搜到正文。
- 连续 5 次 `RefreshPath` 只产生一次可观察的 commit（用 status.indexed 或 manifest 版本计数）。
- `DeletePrefix(dir)` 后该目录下文档搜不到。
- `RenamePrefix(dir, new_dir)` 后旧路径搜不到、新路径可搜。
- `Rebuild` 清空后重新索引全部文件。

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml index::worker`
Expected: FAIL。

- [ ] **Step 3: 实现批次循环**

`recv_timeout(300ms)`；把一批命令合并成 `BTreeSet<PathBuf>`；对每个 path：
- 存在且是文件 → 读正文、`delete_term(path)`、`add_document`、manifest 更新；
- 存在且是目录 → 递归收集 md 文件 upsert；
- 不存在 → `DeletePrefix(path)`。
处理完 `writer.commit()`、`reader.reload()`、`save_manifest()`、推 `IndexStatus`。

- [ ] **Step 4: 实现 Rebuild 与 Shutdown**

Rebuild：`delete_all_documents()`、清空 manifest、`walkdir` 全量、每 64 篇 commit 一次；Shutdown：处理完队列、commit、写 manifest、退出。

- [ ] **Step 5: 通过测试**

Run: `cargo test --manifest-path src-tauri/Cargo.toml index::worker`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src-tauri && git commit -m "feat: async index worker with batched commits"
```

---

### Task 4: 查询、排序、snippet、命中行

**Files:**
- Create: `src-tauri/src/index/query.rs`

**Interfaces:**
```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextHit {
  pub path: String,
  pub rel_path: String,
  pub title: String,
  pub score: f32,
  pub snippet_html: String,
  pub term: String,
  pub line: u32,
}
pub fn escape_query(raw: &str) -> String;
pub fn find_term_line(body: &str, term: &str) -> u32;
pub fn search(
  index: &Index,
  reader: &IndexReader,
  schema: &IndexSchema,
  raw_query: &str,
  exclude: &[String],
  limit: usize,
) -> Result<Vec<TextHit>, WorkspaceError>;
```

- [ ] **Step 1: 写测试**

- `escape_query("C++")` 不包含未转义的 `+`；`escape_query("a AND b")` 不把 AND 当操作符；`"foo bar"` 保留引号。
- 用 3 篇文档（标题/正文不同）搜索，标题含词的排在前面。
- `exclude` 中的 path 不出现。
- `find_term_line("a\nb\n笔记", "笔记") == 3`。
- `snippet_html` 包含 `<b>` 且 `<script>` 被转义。

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml index::query`
Expected: FAIL。

- [ ] **Step 3: 实现**

`QueryParser` 只对 `body`；取 Top 100，按 `bm25 * title_boost * recency` 重排；去重排除；`SnippetGenerator` 180 字符；`term` 取查询的第一个 token 原文；`line` 用 `find_term_line`。

- [ ] **Step 4: 通过测试**

Run: `cargo test --manifest-path src-tauri/Cargo.toml index::query`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri && git commit -m "feat: ranked full-text query with snippets"
```

---

### Task 5: IndexService 与 Tauri 接线

**Files:**
- Modify: `src-tauri/src/index/mod.rs`, `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/watcher.rs`
- Test: `src-tauri/src/index/mod.rs` 内联测试

**Interfaces:**
```rust
pub struct IndexService { /* sender, reader, index, schema, status, generation */ }
impl IndexService {
  pub fn open(app: &AppHandle, root: &Path) -> Result<Self, WorkspaceError>;
  pub fn enqueue(&self, command: IndexCommand);
  pub fn status(&self) -> IndexStatus;
  pub fn search(&self, query: &str, exclude: &[String], limit: usize) -> Result<Vec<TextHit>, WorkspaceError>;
  pub fn rebuild(&self);
  pub fn shutdown(&self);
}
```
- 命令：`search_text`、`index_status`、`reindex_workspace`。
- 事件：`index://progress`。
- `AppState` 增加 `index: Mutex<Option<IndexService>>`。

- [ ] **Step 1: 写测试**

Service 级：open 于临时 app data + workspace，等待 status 变为 idle 后 search 命中；`rebuild()` 后仍命中；`shutdown()` 不 panic。

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml index::tests`
Expected: FAIL。

- [ ] **Step 3: 实现**

`open_workspace`：旧 service `shutdown`；新 service `open`；后台 reconcile（manifest vs 磁盘）；存进 AppState。`write_file`/`save_file_as`/CRUD 成功后 `enqueue(RefreshPath/DeletePrefix/RenamePrefix)`。watcher 的路径也入队。搜索命令 `async` + `spawn_blocking`。

- [ ] **Step 4: 通过测试**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri && git commit -m "feat: index service and tauri commands"
```

---

### Task 6: 前端 IPC 与状态

**Files:**
- Modify: `src/lib/types.ts`, `src/lib/ipc.ts`
- Create: `src/lib/state/search.svelte.ts`
- Modify: `src/App.svelte`

**Interfaces:**
```ts
export interface TextHit { path: string; relPath: string; title: string; score: number; snippetHtml: string; term: string; line: number }
export interface IndexStatus { phase: string; indexed: number; total: number; generation: number; available: boolean }
export function searchText(query: string, limit: number, excludePaths: string[]): Promise<TextHit[]>;
export function indexStatus(): Promise<IndexStatus>;
export function reindexWorkspace(): Promise<void>;
```
- `search.svelte.ts` 持有 `status`，监听 `index://progress`。

- [ ] **Step 1: 验证**

Run: `npm run check`
Expected: 通过。

- [ ] **Step 2: 提交**

```bash
git add src && git commit -m "feat: full-text search ipc and status"
```

---

### Task 7: 统一 SearchPalette

**Files:**
- Create: `src/lib/search/SearchPalette.svelte`
- Delete/Replace: `src/lib/palette/QuickOpen.svelte`
- Modify: `src/App.svelte`

**Interfaces:**
- Props：`visible`、`onClose`、`onSelectFile(path)`、`onSelectText(hit)`。
- 内部：`files: SearchHit[]`、`text: TextHit[]`、`selected: number`、`loadingText`。
- 文件搜索 120ms 去抖；正文搜索 180ms 去抖；`exclude = files.map(f => f.path)`；generation 丢弃过期响应。
- 分组顺序固定；键盘在扁平列表上移动。
- 底部：索引状态 + “重建全文索引”按钮。

- [ ] **Step 1: 写组件**

替换现有的 QuickOpen 内容；保留原有键盘行为和样式基调；内容行渲染 `{@html snippetHtml}`（Tantivy 已转义）。

- [ ] **Step 2: 验证**

Run: `npm run check && npm run build`
Expected: 通过。

- [ ] **Step 3: 提交**

```bash
git add src && git commit -m "feat: unified file and full-text search palette"
```

---

### Task 8: 跳转到命中行

**Files:**
- Modify: `src/lib/state/tabs.svelte.ts`, `src/lib/editor/Editor.svelte`
- Create: `src/lib/utils/find-term.ts`, `tests/find-term.test.ts`

**Interfaces:**
```ts
export function findTerm(text: string, term: string): number | null; // UTF-16 offset
// TabsStore
openAt(path: string, line: number, term: string): Promise<void>;
takeJump(path: string): { line: number; term: string } | null;
```

- [ ] **Step 1: 写测试**

`findTerm("a\n笔记", "笔记")` 返回正确 offset；大小写不敏感；中文按 UTF-16 计数；找不到返回 null。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/find-term.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`openAt` 打开/激活文件，记录 pending jump；Editor 在 `setState` 后取 pending，先用 `findTerm` 在缓冲区定位，失败用 `line` 起点，dispatch selection + `scrollIntoView`。

- [ ] **Step 4: 通过测试**

Run: `npx vitest run tests/find-term.test.ts && npm run check`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src tests && git commit -m "feat: jump to full-text match"
```

---

### Task 9: 全量验证与打包

**Files:**
- Modify: `scripts/smoke.sh`（如需要）
- Create: `README` 段落（全文搜索说明）

- [ ] **Step 1: 跑完整测试**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npx vitest run
npm run check
npm run build
```

- [ ] **Step 2: 手工/脚本冒烟**

准备含中英文正文的 fixture；打开工作区；`Ctrl+P` 输入正文词；确认文件分组在前、内容分组在后、片段高亮、回车跳行；点“重建全文索引”后仍可搜。

- [ ] **Step 3: 打 AppImage**

```bash
npm run tauri build -- --bundles appimage
```

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "chore: full-text search verification"
```

## 交付验收清单

- [ ] `Ctrl+P` 同时显示文件名和正文结果，文件名分组在前。
- [ ] 中文正文搜索可命中子串（“笔记”命中“我的笔记本”）。
- [ ] 保存后不等待索引；后台批量 commit。
- [ ] 目录删除/重命名后没有 ghost 结果。
- [ ] 重启后对账修正离线修改。
- [ ] 索引损坏/锁冲突时，面板“重建全文索引”可恢复。
- [ ] `C++`、`AND`、不平衡引号不会报错或误解析。
- [ ] 结果片段高亮，回车跳到命中行。
- [ ] `cargo test`、`vitest`、`svelte-check`、`vite build`、AppImage 全通过。
