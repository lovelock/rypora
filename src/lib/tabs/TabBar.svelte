<script lang="ts">
  import { tabs } from "../state/tabs.svelte";

  function activate(path: string): void {
    void tabs.activate(path);
  }

  function close(event: MouseEvent, path: string): void {
    event.stopPropagation();
    void tabs.close(path);
  }
</script>

<div class="tabbar" role="tablist">
  {#each tabs.tabs as tab (tab.path)}
    <div
      class="tab"
      class:active={tab.path === tabs.activePath}
      role="tab"
      tabindex="0"
      aria-selected={tab.path === tabs.activePath}
      onclick={() => activate(tab.path)}
      onkeydown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate(tab.path);
        }
      }}
      onauxclick={(event) => {
        if (event.button === 1) close(event, tab.path);
      }}
    >
      <span class="label">
        {tab.title}{#if tab.missing}<span class="flag">已删除</span>{/if}{#if tab.dirty}<span
            class="flag">•</span
          >{/if}
      </span>
      <button class="close" title="关闭" onclick={(event) => close(event, tab.path)}>×</button>
    </div>
  {/each}
</div>

<style>
  .tabbar {
    display: flex;
    align-items: stretch;
    min-height: 38px;
    overflow-x: auto;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px 0 12px;
    border-right: 1px solid var(--border);
    border-top: 2px solid transparent;
    font-size: 12.5px;
    color: var(--muted);
    cursor: pointer;
    white-space: nowrap;
    outline: none;
  }

  .tab:hover {
    background: var(--hover);
  }

  .tab.active {
    color: var(--fg);
    border-top-color: var(--accent);
    background: var(--bg);
  }

  .flag {
    margin-left: 5px;
    font-size: 11px;
    color: var(--muted);
  }

  .close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--muted);
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
  }

  .close:hover {
    background: var(--border);
    color: var(--fg);
  }
</style>
