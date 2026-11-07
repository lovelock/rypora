<script lang="ts">
  import { indexStatus, reindexWorkspace, searchFiles, searchText } from "../ipc";
  import { searchState } from "../state/search.svelte";
  import type { IndexStatus, SearchHit, TextHit } from "../types";
  import { splitByIndices } from "../utils/highlight";

  let {
    visible,
    onClose,
    onSelectFile,
    onSelectText,
  }: {
    visible: boolean;
    onClose: () => void;
    onSelectFile: (path: string) => void;
    onSelectText: (hit: TextHit) => void;
  } = $props();

  type Item = { kind: "file"; hit: SearchHit } | { kind: "text"; hit: TextHit };

  let query = $state("");
  let files = $state<SearchHit[]>([]);
  let text = $state<TextHit[]>([]);
  let selected = $state(0);
  let input = $state<HTMLInputElement | undefined>(undefined);
  let loadingFiles = $state(false);
  let loadingText = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;

  const items = $derived<Item[]>([
    ...files.map((hit) => ({ kind: "file" as const, hit })),
    ...text.map((hit) => ({ kind: "text" as const, hit })),
  ]);

  $effect(() => {
    if (visible) {
      query = "";
      files = [];
      text = [];
      selected = 0;
      queueMicrotask(() => input?.focus());
      void indexStatus()
        .then((status: IndexStatus) => searchState.setStatus(status))
        .catch(() => {});
    }
  });

  $effect(() => {
    const current = query.trim();
    const id = ++generation;
    clearTimeout(timer);
    files = [];
    text = [];
    loadingFiles = current.length > 0;
    loadingText = current.length > 0;
    selected = 0;

    timer = setTimeout(async () => {
      try {
        const fileHits = await searchFiles(current, 12);
        if (id !== generation) {
          return;
        }
        files = fileHits;
        loadingFiles = false;

        if (!current) {
          loadingText = false;
          return;
        }

        const contentHits = await searchText(
          current,
          30,
          fileHits.map((hit) => hit.path),
        );
        if (id !== generation) {
          return;
        }
        const filePaths = new Set(fileHits.map((hit) => hit.path));
        text = contentHits.filter((hit) => !filePaths.has(hit.path));
        loadingText = false;
      } catch {
        if (id === generation) {
          loadingFiles = false;
          loadingText = false;
        }
      }
    }, 120);

    return () => clearTimeout(timer);
  });

  function choose(item: Item): void {
    if (item.kind === "file") {
      onSelectFile(item.hit.path);
    } else {
      onSelectText(item.hit);
    }
    onClose();
  }

  function handleKey(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      selected = Math.min(selected + 1, Math.max(items.length - 1, 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selected = Math.max(selected - 1, 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[selected];
      if (item) {
        choose(item);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  function statusText(status: IndexStatus): string {
    if (!status.available) {
      return "全文索引不可用";
    }
    if (status.phase === "indexing" || status.phase === "reconciling") {
      const total = status.total > 0 ? `/${status.total}` : "";
      return `全文索引 ${status.indexed}${total}`;
    }
    return "全文索引就绪";
  }

  function rebuild(): void {
    searchState.setStatus({ ...searchState.status, phase: "indexing" });
    void reindexWorkspace().catch(() => {
      searchState.setStatus({ ...searchState.status, phase: "unavailable", available: false });
    });
  }
</script>

{#if visible}
  <div class="palette-overlay">
    <button class="palette-backdrop" aria-label="关闭搜索" onclick={onClose}></button>
    <div class="palette" role="dialog" aria-modal="true" tabindex="-1">
      <input bind:this={input} bind:value={query} onkeydown={handleKey} placeholder="搜索文件名或正文…" />

      <div class="results">
        {#if items.length === 0 && !loadingFiles && !loadingText}
          <p class="empty">{query ? "没有匹配结果" : "开始输入以搜索"}</p>
        {/if}

        {#if files.length > 0}
          <div class="section">文件</div>
          {#each files as hit, index (hit.path)}
            <button
              class="result"
              class:active={selected === index}
              onclick={() => choose({ kind: "file", hit })}
              onmouseenter={() => (selected = index)}
            >
              {#each splitByIndices(hit.relPath, hit.indices) as part}<span class:hit={part.hit}
                  >{part.text}</span
                >{/each}
            </button>
          {/each}
        {/if}

        {#if query.trim() && (loadingText || text.length > 0)}
          <div class="section">
            内容
            {#if loadingText}<span class="loading">搜索中…</span>{/if}
          </div>
          {#each text as hit, index (hit.path)}
            <button
              class="result text"
              class:active={selected === files.length + index}
              onclick={() => choose({ kind: "text", hit })}
              onmouseenter={() => (selected = files.length + index)}
            >
              <span class="title">{hit.title}</span>
              <span class="path">{hit.relPath}</span>
              <span class="snippet">{@html hit.snippetHtml}</span>
            </button>
          {/each}
        {/if}
      </div>

      <footer class="footer">
        <span>{statusText(searchState.status)}</span>
        <button onclick={rebuild}>重建全文索引</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .palette-overlay {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 12vh;
  }

  .palette-backdrop {
    position: fixed;
    inset: 0;
    border: 0;
    padding: 0;
    background: rgb(0 0 0 / 22%);
  }

  .palette {
    position: relative;
    z-index: 1;
    width: min(680px, 86vw);
    overflow: hidden;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 18px 50px rgb(0 0 0 / 22%);
  }

  .palette input {
    width: 100%;
    padding: 12px 14px;
    border: 0;
    border-bottom: 1px solid var(--border);
    background: transparent;
    color: var(--fg);
    font: inherit;
    font-size: 15px;
    outline: none;
  }

  .results {
    max-height: 56vh;
    overflow-y: auto;
    padding: 4px;
  }

  .section {
    display: flex;
    gap: 8px;
    padding: 10px 10px 4px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .loading {
    font-weight: 400;
  }

  .result {
    display: block;
    width: 100%;
    padding: 7px 10px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    text-align: left;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result.active {
    background: var(--accent-soft);
  }

  .result.text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    white-space: normal;
  }

  .title {
    font-weight: 600;
  }

  .path {
    color: var(--muted);
    font-size: 11px;
  }

  .snippet {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
  }

  .snippet :global(b) {
    color: var(--accent);
    font-weight: 600;
  }

  .hit {
    color: var(--accent);
    font-weight: 600;
  }

  .empty {
    margin: 0;
    padding: 14px;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
  }

  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 11px;
  }

  .footer button {
    padding: 3px 8px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: transparent;
    color: var(--muted);
    font-size: 11px;
    cursor: pointer;
  }

  .footer button:hover {
    background: var(--hover);
    color: var(--fg);
  }
</style>
