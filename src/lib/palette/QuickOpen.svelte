<script lang="ts">
  import { searchFiles } from "../ipc";
  import type { SearchHit } from "../types";
  import { splitByIndices } from "../utils/highlight";

  let {
    visible,
    onClose,
    onSelect,
  }: {
    visible: boolean;
    onClose: () => void;
    onSelect: (path: string) => void;
  } = $props();

  let query = $state("");
  let results = $state<SearchHit[]>([]);
  let selected = $state(0);
  let input = $state<HTMLInputElement | undefined>(undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;

  $effect(() => {
    if (visible) {
      query = "";
      results = [];
      selected = 0;
      queueMicrotask(() => input?.focus());
    }
  });

  $effect(() => {
    const current = query;
    const id = ++generation;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const hits = await searchFiles(current, 50);
        if (id === generation) {
          results = hits;
          selected = 0;
        }
      } catch {
        if (id === generation) {
          results = [];
        }
      }
    }, 120);

    return () => clearTimeout(timer);
  });

  function choose(path: string): void {
    onSelect(path);
    onClose();
  }

  function handleKey(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      selected = Math.min(selected + 1, results.length - 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selected = Math.max(selected - 1, 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const hit = results[selected];
      if (hit) {
        choose(hit.path);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }
</script>

{#if visible}
  <div class="palette-overlay">
    <button class="palette-backdrop" aria-label="关闭搜索" onclick={onClose}></button>
    <div class="palette" role="dialog" aria-modal="true" tabindex="-1">
      <input bind:this={input} bind:value={query} onkeydown={handleKey} placeholder="按文件名搜索…" />
      <div class="results">
        {#each results as hit, index (hit.path)}
          <button
            class="result"
            class:active={index === selected}
            onclick={() => choose(hit.path)}
            onmouseenter={() => (selected = index)}
          >
            {#each splitByIndices(hit.relPath, hit.indices) as part}<span class:hit={part.hit}
                >{part.text}</span
              >{/each}
          </button>
        {:else}
          <p class="empty">{query ? "没有匹配的文件" : "开始输入以搜索"}</p>
        {/each}
      </div>
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
    width: min(560px, 80vw);
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
    max-height: 46vh;
    overflow-y: auto;
    padding: 4px;
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
</style>
