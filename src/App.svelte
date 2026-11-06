<script lang="ts">
  import { workspace } from "./lib/state/workspace.svelte";
  import FileTree from "./lib/sidebar/FileTree.svelte";

  function openFile(path: string): void {
    workspace.select(path);
  }

  const folderName = $derived(
    workspace.root ? (workspace.root.split("/").pop() ?? workspace.root) : "Rypora",
  );
</script>

<div class="app">
  <aside class="sidebar">
    <header class="sidebar-head">
      <span class="workspace-name" title={workspace.root ?? ""}>{folderName}</span>
      <button class="ghost" title="打开文件夹" onclick={() => workspace.openFolder()}>
        打开
      </button>
    </header>

    <div class="tree-scroll">
      {#if workspace.loading}
        <p class="hint">正在读取…</p>
      {:else if workspace.tree}
        <FileTree tree={workspace.tree} onOpen={openFile} />
      {:else}
        <p class="hint">还没有打开文件夹</p>
      {/if}
    </div>

    {#if workspace.error}
      <p class="error">{workspace.error}</p>
    {/if}
  </aside>

  <main class="main">
    {#if workspace.selectedPath}
      <div class="placeholder">
        <span class="muted">{workspace.selectedPath}</span>
      </div>
    {:else}
      <div class="welcome">
        <h1>Rypora</h1>
        <p>打开一个文件夹，开始写作。</p>
        <button class="primary" onclick={() => workspace.openFolder()}>打开文件夹</button>
      </div>
    {/if}
  </main>
</div>
