# Rypora 全文搜索设计

- 日期：2026-11-07
- 状态：待确认

## 1. 意图与为什么

现在 `Ctrl+P` 只搜文件名。对一个笔记仓库来说，记得内容却想不起文件名是常态，所以需要正文全文搜索。

交互上不新增第二个入口：`Ctrl+P` 打开同一个面板，**文件名结果在前，正文结果在后**，类似 IDEA 的 Search Everywhere。搜索要快、要能按相关度排序，索引更新不能拖慢保存和 CRUD。

## 2. 目标

- G1 `Ctrl+P` 统一搜索：文件名 + 正文，文件结果优先展示。
- G2 正文按 BM25 排序，标题加权，最后叠加轻量的修改时间重排。
- G3 中文分词可用（jieba search 模式），英文同索引；中文子串召回要明显好于“整段当一个词”。
- G4 索引异步：保存 / 新建 / 重命名 / 删除只入队，接口立即返回；后台去抖、批量、单次 commit。
- G5 首次打开工作区时后台全量索引，带进度；索引期间搜索仍可用（返回已提交的部分）。
- G6 结果带片段高亮；回车打开文件并跳到第一个命中行。
- G7 索引持久化；重启不重建，schema / tokenizer 版本变化时自动重建。
- G8 提供手动“全量重建索引”入口；索引损坏、manifest 异常或 writer 锁冲突时，用户可以从面板直接恢复，不用删配置目录。

## 3. 非目标

- 查询 DSL、布尔表达式、字段过滤、正则、模糊纠错、同义词；输入按字面量处理，只额外支持成对引号短语。
- 多工作区并行索引（当前仍是一次一个工作区）。
- 索引未保存的缓冲区（400ms 自动保存后即可搜到）。
- PDF / 图片 OCR / 附件内容。
- 双击 Shift 触发（与编辑器连续按 Shift 输入大写冲突）；只保留 `Ctrl+P`。

## 4. 约束

- 单机、离线；索引放 app data 目录。
- 只索引 `.md` / `.markdown` / `.mdown`，单文件 ≤ 2MB。
- 索引更新不得阻塞文件写入命令，也不得在每次保存时全量重建。
- G4 只约束新的全文索引；现有的文件名索引仍走 `rebuild_index`，属于已知的性能上限，不在本次范围内重写。
- 10k 文件目标：已建索引后的查询 < 100ms；首次索引在后台分批进行。

## 5. 方案取舍

| 方案 | 结论 | 理由 |
|---|---|---|
| **Tantivy + jieba** | **选中** | 嵌入式 Lucene，BM25、字段 boost、snippet 都是现成的；writer 单线程，适合后台批量 commit。 |
| SQLite FTS5 | 否决 | 中文分词和字段加权能力弱，排序离 ES 式体验更远。 |
| Meilisearch / Typesense | 否决 | 独立服务，不是嵌入式，违背轻量本地单机目标。 |

## 6. 架构

```
src-tauri/src/index/
  mod.rs        IndexService：持有 sender、reader、状态
  schema.rs     schema、jieba tokenizer、字段常量
  worker.rs     后台线程：channel → 批量 → commit → reload
  query.rs      解析、搜索、重排、snippet、命中行
src/lib/
  SearchPalette.svelte   统一搜索面板（替换 QuickOpen 的内容）
  state/search.svelte.ts 文件结果 + 正文结果 + 选中项
```

- `AppState` 增加 `index: IndexService`。
- 命令：`search_text(query, limit, exclude_paths)`、`index_status()`、`reindex_workspace()`。
- 事件：`index://progress`（`{ phase, indexed, total }`）。
- 文件写入 / CRUD / watcher 外部变更都向 `IndexService` 的 channel 投递路径，不等待索引。
- 搜索命令是 `async` + `spawn_blocking`，避免占用 Tauri 主线程。

## 7. 索引 Schema

| 字段 | 类型 | 说明 |
|---|---|---|
| `path` | STRING / STORED / indexed | 绝对路径，删除与去重的主键 |
| `rel_path` | STORED | 结果展示 |
| `title` | STORED | 文件名去扩展名；用于展示和命中后的标题加权，不单独参与正文召回 |
| `body` | TEXT / STORED | 正文，jieba search 模式分词；存储用于 snippet |
| `mtime` | u64 / FAST / STORED | 修改时间，用于重排和展示 |

索引目录：`app_data/index/<root-hash>/`，`meta.json` 记录 `schema_version`、`tokenizer_version`、`root`。版本不匹配则删库重建。不同工作区用不同 hash，互不影响。

## 8. 索引流水线

### 8.1 全量

1. `open_workspace` 后检查索引是否存在且版本匹配。
2. 不匹配：在 worker 里重建；匹配：直接加载 reader。
3. 重建时递归扫描工作区，读取正文，按 64 个文档一批 `add_document`，每批 commit，推 `index://progress`。
4. 删除已不存在的旧文档（按 `path` 对比或直接重建目录）。

### 8.2 增量

- `write_file` / `save_file_as` 成功后：`Upsert(path)`。
- `create_entry` / `rename_entry` / `delete_entry` / `move_entry`：对应 `Upsert` / `Delete` / `Rename`。
- watcher 的外部变更：`Upsert` / `Delete`。
- worker 用 `recv_timeout(300ms)` 收集一批路径，去重；批量 `delete_term(path)` + `add_document`；一次 `commit`；`reader.reload()`。
- 自身写入会被 watcher 抑制，所以**必须在写入命令里显式入队**，不能只依赖 watcher。

### 8.3 并发

- Tantivy 的 writer 本身单线程，但它在后台线程里串行处理；文件命令只做 channel send，立即返回。
- 搜索读 `IndexReader` 的最近快照；commit 后 `reload`。
- worker panic 时搜索降级为“全文索引不可用”，文件名搜索不受影响。

### 8.4 重启对账与 manifest

索引目录额外维护 `manifest.json`：`{ version, entries: { path: mtime } }`，由 worker 在每次 commit 后原子写入。

- 启动时若 `meta.json` 与 `manifest.json` 版本匹配：不重建，先加载 reader，再在后台做一次**对账**：
  - 扫描工作区得到当前文件与 mtime；
  - manifest 中没有或 mtime 不同的文件 → `Upsert`；
  - manifest 中有、磁盘上已不存在的文件 → `Delete`；
  - 对账完成后进入 `ready`。
- 这样仍满足“重启不重建”，同时修复关闭期间的外部改动/删除。
- 关闭应用时向 worker 发 `Shutdown`，worker 处理完队列、commit 后退出；主进程最多等 2s，超时直接退出。

### 8.5 目录级删除 / 重命名 / 移动

- 文件命令层面：目录操作由 worker 借助 manifest 展开，`DeletePrefix(path)` 删除所有 `path.starts_with` 的条目；`RenamePrefix(old, new)` 删除旧前缀并逐条 upsert 新路径。
- watcher 收到的目录事件同样按 manifest 前缀展开；manifest 是“索引里到底有哪些 path”的唯一真源，避免 `delete_term` 无法删子树的问题。
- 外部删目录、应用内删目录、拖拽移动都走同一套前缀逻辑。

### 8.6 工作区切换与多实例

- `open_workspace` 先向旧 worker 发 `Shutdown` 并等待最多 1s；随后为新 root 创建/加载新的 `IndexService`。旧 worker 的进度事件带 generation，前端丢弃过期事件。
- 不做单实例锁。若第二个实例拿不到 Tantivy writer 锁：该实例降级为“仅文件名搜索”，面板提示“全文索引被另一个 Rypora 实例占用”。

## 9. 查询与排序

- 输入按**字面量**处理：除成对的 `"…"` 作为短语外，其余字符全部转义；`C++`、`a AND b`、`*`、`~` 不会触发查询语法。解析失败时退回“把整段当普通词”的查询，不向用户报错。
- 正文查询只查 `body` 字段；文件名命中由文件分组负责，所以内容分组不会出现“标题命中、正文没命中”的空片段。
- BM25 取前 100 条；标题包含查询词的命中乘以 1.25；再叠加修改时间：
  `final = bm25 * title_boost * (1.0 + 0.15 * recency)`，`recency` 为 0..1。
- 返回前 30 条；内容分组**排除已在文件分组出现过的 path**，避免重复行。
- `SnippetGenerator` 取 180 字符，`to_html()` 输出（Tantivy 会转义 HTML）；前端只对我们的高亮标签着色。
- 每条结果返回 `term` 与 1-based `line`（对存储 body 做首个查询词扫描）。前端在打开文件后用 `term` 在当前缓冲区里重新定位第一处，定位失败才退回 `line`，避免索引过期导致跳错行。

## 10. 统一搜索 UI

- `Ctrl+P` 打开面板，输入即搜。
- 两个分组，顺序固定：
  1. **文件**：复用现有文件名搜索，最多 12 条，立即返回。
  2. **内容**：全文搜索，最多 30 条，120–180ms 去抖后返回；结果到达前该分组显示“搜索中…”。内容结果排除已在文件分组出现过的路径。
- 键盘用一个扁平索引在两组之间移动；`↑/↓`、`Enter`、`Esc` 与现在一致。
- 内容行展示：标题 / 相对路径 / 高亮片段；回车调用 `tabs.openAt(path, line, term)`，先按 `term` 在当前缓冲区定位，找不到再退回索引给的行号。
- 索引进行中：面板底部显示“正在建立全文索引… 42%”；全文结果仍可用。
- 面板底部常驻“重建全文索引”按钮：点击后确认，调用 `reindex_workspace()`；重建期间显示进度，文件搜索不受影响。
- 空查询只显示最近文件，不显示内容分组。
- 请求带 generation 号，丢弃过期响应，避免慢请求覆盖新结果。

## 11. 错误与降级

- 索引损坏 / 版本不匹配：自动重建，UI 提示“正在重建全文索引”；同时保留手动的“重建全文索引”入口。
- 单文件读取失败 / 超大 / 二进制：跳过正文索引，文件名仍可搜。
- 搜索超时或 worker 不可用：只展示文件结果，并提示全文搜索暂不可用；面板仍提供重建按钮。
- manifest 损坏：忽略并重建索引目录。
- 第二个实例拿不到 writer 锁：降级为仅文件名搜索，面板提示占用原因（不做单实例锁）；用户可点“重建”尝试重新获取。

## 12. 测试

- Rust：
  - 中文分词与查询（“笔记”命中“我的笔记本”）。
  - 标题 boost 使标题命中排在正文命中前。
  - upsert / delete / rename 后结果正确。
  - 批量 commit 后 reader 可见。
  - snippet 输出转义、命中行计算。
- 前端：
  - 文件结果永远在内容结果之前。
  - 键盘导航跨分组。
  - 过期响应不会覆盖新查询。
- 手工：
  - 10k 文件索引期间搜索、保存后立即搜索、重启不重建。

## 13. 风险

- Tantivy 与 jieba 的版本/API 兼容；实现时以实际 crate 版本为准。
- 中文子串召回仍不如 trigram；用 jieba `cut_for_search` 缓解，必要时后续加 n-gram 字段。
- 存储 body 会让索引体积接近正文体积；对笔记仓库可接受。
- 首次索引的 commit 频率影响耗时；批量 64 / 500ms 起步，后续按实测调。

## 14. 留给实现者的决定

- 具体 tokenizer 实现、Tantivy API 细节、面板视觉。
- 索引 hash 算法与目录命名。
- 重排系数、批大小等可调参数。

## 15. 实现前已定的调用

- **重启一致性**：不重建，启动后后台对账（manifest vs 磁盘 mtime），diff 出 upsert/delete；关闭时 `Shutdown` + 最多等 2s。
- **目录操作**：用 manifest 前缀展开，支持删/改名整个子树，不依赖 `delete_term` 删子树。
- **查询语法**：输入按字面量，只有成对引号是短语；解析失败退回普通词，不报错。
- **G4 范围**：只保证新的全文索引异步；现有文件名索引的同步重建是已知上限，本次不重写。
- **重复结果**：内容分组只查正文，并排除文件分组已有的 path；不出现标题命中的空片段。
- **跳转**：返回 `term + line`，前端优先在缓冲区里按 `term` 定位。
- **工作区切换 / 多实例**：旧 worker 先 `Shutdown`；第二个实例 writer 锁失败时降级为仅文件名搜索。
- **全量重建**：面板底部常驻入口；`reindex_workspace()` 清空文档和 manifest 后重新扫描，重建期间文件搜索照常，全文结果可能短暂为空。
