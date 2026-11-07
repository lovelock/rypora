<script lang="ts">
  import { tabs } from "./state/tabs.svelte";

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
  {/if}
</footer>
