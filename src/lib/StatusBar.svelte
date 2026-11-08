<script lang="ts">
  import { tabs } from "./state/tabs.svelte";
  import TablePicker from "./ui/TablePicker.svelte";

  let {
    onPrint,
    onInsertTable,
  }: {
    onPrint: () => void;
    onInsertTable: (rows: number, columns: number) => void;
  } = $props();

  let tableOpen = $state(false);
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
    <button class="action" title="插入表格" onclick={() => (tableOpen = true)}>表格</button>
    <button class="action" title="打印 / 另存为 PDF" onclick={onPrint}>打印</button>
  {/if}
  {#if tableOpen}
    <TablePicker onSelect={onInsertTable} onClose={() => (tableOpen = false)} />
  {/if}
</footer>

<style>
  .statusbar {
    position: relative;
  }

  .action {
    padding: 0 6px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: transparent;
    color: var(--muted);
    font-size: 11px;
    cursor: pointer;
  }

  .action:hover {
    background: var(--hover);
    color: var(--fg);
  }
</style>
