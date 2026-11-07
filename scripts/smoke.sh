#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${1:-$ROOT/src-tauri/target/debug/rypora}"
FIX="${RYPORA_FIXTURE:-/tmp/opencode/rypora-smoke}"
SHOT="${RYPORA_SHOT:-/tmp/opencode/rypora-smoke.png}"

if [[ ! -x "$BIN" ]]; then
  echo "binary not found: $BIN" >&2
  echo "run: npx tauri build --debug --no-bundle" >&2
  exit 1
fi

if ! command -v spectacle >/dev/null || ! command -v identify >/dev/null; then
  echo "smoke test needs KDE Spectacle and ImageMagick identify" >&2
  exit 1
fi

mkdir -p "$FIX/notes" "$FIX/.state/config/dev.rypora.desktop" "$FIX/.state/data" "$FIX/.state/cache"

if [[ ! -f "$FIX/demo.md" ]]; then
  cat > "$FIX/demo.md" <<'MARKDOWN'
# Rypora 演示

这是一个**轻量**的 Markdown 工作区，支持 *实时渲染*、`行内代码` 和 ~~删除线~~。

## 功能

- 文件树与 CRUD
- `Ctrl+P` 文件名模糊搜索
- 自动保存
- [打开另一篇笔记](notes/other.md)

> 光标所在行显示 Markdown 标记，移开即渲染。

- [x] 已完成的任务
- [ ] 待办事项

```rust
fn main() {
    println!("hello rypora");
}
```

---

中文输入法测试：你好，世界。
MARKDOWN
fi

if [[ ! -f "$FIX/notes/other.md" ]]; then
  printf '# 另一篇笔记\n\n从链接跳转过来。\n' > "$FIX/notes/other.md"
fi

cat > "$FIX/.state/config/dev.rypora.desktop/config.json" <<JSON
{
  "lastWorkspace": "$FIX",
  "tabs": [
    { "path": "$FIX/demo.md", "cursor": 0, "scrollTop": 0 }
  ],
  "activeTab": "$FIX/demo.md",
  "theme": "light",
  "sidebarWidth": 260,
  "fontSize": 16
}
JSON

export XDG_CONFIG_HOME="$FIX/.state/config"
export XDG_DATA_HOME="$FIX/.state/data"
export XDG_CACHE_HOME="$FIX/.state/cache"
export GDK_BACKEND="${GDK_BACKEND:-wayland}"
export WEBKIT_DISABLE_DMABUF_RENDERER=1

"$BIN" >"$FIX/app.log" 2>&1 &
APP_PID=$!
trap 'kill "$APP_PID" 2>/dev/null || true' EXIT

sleep 4

if ! kill -0 "$APP_PID" 2>/dev/null; then
  echo "app exited early; log:" >&2
  tail -30 "$FIX/app.log" >&2
  exit 1
fi

spectacle -a -b -n -o "$SHOT" >/dev/null 2>&1

if [[ ! -s "$SHOT" ]]; then
  echo "screenshot was not created" >&2
  exit 1
fi

MEAN="$(identify -format '%[fx:mean]' "$SHOT" 2>/dev/null || echo 0)"
if ! awk "BEGIN { exit !($MEAN > 0.05) }"; then
  echo "screenshot is (nearly) black: mean=$MEAN" >&2
  exit 1
fi

echo "smoke ok: $SHOT (mean=$MEAN)"
