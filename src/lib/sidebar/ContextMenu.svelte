<script lang="ts">
  import type { ContextAction, FileNode } from "../types";
  import { workspace } from "../state/workspace.svelte";

  let {
    x,
    y,
    node,
    onAction,
    onClose,
  }: {
    x: number;
    y: number;
    node: FileNode;
    onAction: (action: ContextAction) => void;
    onClose: () => void;
  } = $props();

  const isRoot = $derived(node.path === workspace.root);
</script>

<div
  class="menu"
  role="menu"
  tabindex="-1"
  style={`left: ${x}px; top: ${y}px`}
>
  {#if node.isDir}
    <button role="menuitem" onclick={() => onAction("new-file")}>新建文件</button>
    <button role="menuitem" onclick={() => onAction("new-folder")}>新建文件夹</button>
    <div class="sep"></div>
  {/if}
  {#if !isRoot}
    <button role="menuitem" onclick={() => onAction("rename")}>重命名</button>
    <button role="menuitem" onclick={() => onAction("delete")}>删除</button>
    <div class="sep"></div>
    <button role="menuitem" onclick={() => onAction("reveal")}>在文件管理器中显示</button>
  {/if}
</div>
<button class="backdrop" aria-label="关闭菜单" onclick={onClose}></button>

<style>
  .menu {
    position: fixed;
    z-index: 60;
    min-width: 168px;
    padding: 5px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 10px 30px rgb(0 0 0 / 18%);
    display: flex;
    flex-direction: column;
  }

  .menu button {
    border: 0;
    background: transparent;
    text-align: left;
    padding: 7px 9px;
    border-radius: 5px;
    font-size: 13px;
    cursor: pointer;
  }

  .menu button:hover {
    background: var(--hover);
  }

  .sep {
    height: 1px;
    background: var(--border);
    margin: 4px 2px;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 55;
    border: 0;
    padding: 0;
    background: transparent;
  }
</style>
