# Rypora

一个轻量的本地 Markdown 工作区：文件树 + `Ctrl+P` 文件名模糊搜索 + 单栏实时渲染 + 自动保存。

它想补的是 Typora 和 Obsidian 之间的空档：Typora 的文件管理太弱，Obsidian 又太重。Rypora 把磁盘上的文件夹当作仓库，不做图谱、插件、双链和同步。

## 功能

- 打开文件夹作为工作区，左侧文件树支持新建、重命名、删除、拖拽移动。
- `Ctrl+P` 按文件名模糊搜索并跳转，命中字符高亮。
- 单栏实时渲染：标题、粗体、斜体、删除线、行内代码、代码块、图片、链接、引用、列表、任务列表、分割线。
- 光标所在行显示 Markdown 源码，移开即渲染（Typora / Obsidian live preview 风格）。
- 400ms 去抖自动保存，原子写盘，保留 LF / CRLF。
- 标签页、会话恢复（工作区、标签、光标位置）、外部文件变更提示。
- 亮 / 暗 / 跟随系统三档主题。

## 环境要求

- Linux（优先验证）、macOS / Windows 可构建。
- Rust 1.77+、Node 20+。
- Linux 需要 `webkit2gtk-4.1`、`gtk3`、`libsoup3`、`javascriptcoregtk-4.1`。

## 开发

```bash
npm install
npm run tauri dev
```

## 测试

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npx vitest run
npm run check
npm run build
```

## 打包

```bash
npm run tauri build -- --bundles deb
```

产物在 `src-tauri/target/release/bundle/deb/`。

## 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl+P` | 文件名模糊搜索 |
| `Ctrl+S` | 立即保存 |
| `Ctrl+W` | 关闭当前标签 |
| `Ctrl+Tab` | 下一个标签 |
| `Ctrl+B` / `Ctrl+I` | 粗体 / 斜体 |
| `Ctrl+Shift+X` | 删除线 |
| `Ctrl+E` | 行内代码 |
| `F2`（文件树） | 重命名 |

## 结构

- `src-tauri/`：Rust 后端。目录扫描、文件 CRUD、原子写入、文件监听、文件名索引、会话配置。
- `src/`：Svelte 5 + TypeScript 前端。
  - `lib/editor/`：CodeMirror 6、实时渲染装饰与块级 widget。
  - `lib/sidebar/`：文件树与右键菜单。
  - `lib/palette/`：`Ctrl+P` 面板。
  - `lib/state/`：工作区与标签状态。
- `docs/superpowers/specs/`：设计文档。
- `docs/superpowers/plans/`：实现计划。

## v1 范围之外

全文搜索、双链 / 图谱 / 标签、插件、同步、协作、移动端、PDF / HTML 导出、表格与公式的可视化编辑。
