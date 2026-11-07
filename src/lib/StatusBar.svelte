<script lang="ts">
  import { tabs } from "./state/tabs.svelte";

  let { onPrint }: { onPrint: () => void } = $props();

  const tab = $derived(tabs.active);
</script>

<footer class="statusbar">
  <span class="path" title={tab?.path ?? ""}>{tab?.path ?? ""}</span>
  <span class="spacer"></span>
  {#if tab}
    <span>{tabs.cursorLine}:{tabs.cursorColumn}</span>
    <span>{tabs.wordCount} 字</span>
    <span class:conflict={tab.conflict || tab.missing || tab.error}>
      {tab.missing
        ? "已删除"
        : tab.error
          ? "出错"
          : tab.saving
            ? "保存中…"
            : tab.dirty
              ? "未保存"
              : "已保存"}
    </span>
    <button class="print" title="打印 / 另存为 PDF" onclick={onPrint}>打印</button>
  {/if}
</footer>

<style>
  .print {
    padding: 0 6px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: transparent;
    color: var(--muted);
    font-size: 11px;
    cursor: pointer;
  }

  .print:hover {
    background: var(--hover);
    color: var(--fg);
  }
</style>
