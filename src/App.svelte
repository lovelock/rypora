<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { workspace } from "./lib/state/workspace.svelte";
  import { tabs } from "./lib/state/tabs.svelte";
  import { loadConfig, openUrl, refreshIndex, revealItem, saveConfig } from "./lib/ipc";
  import type { AppConfig } from "./lib/types";
  import { resolveRelative } from "./lib/utils/paths";
  import FileTree from "./lib/sidebar/FileTree.svelte";
  import QuickOpen from "./lib/palette/QuickOpen.svelte";
  import TabBar from "./lib/tabs/TabBar.svelte";
  import Editor from "./lib/editor/Editor.svelte";

  let paletteVisible = $state(false);
  let theme = $state("system");
  let restored = $state(false);
  let sidebarWidth = $state(260);
  let fontSize = $state(16);
  let unlisten: UnlistenFn | undefined;
  let unlistenClose: UnlistenFn | undefined;

  const folderName = $derived(
    workspace.root ? (workspace.root.split("/").pop() ?? workspace.root) : "Rypora",
  );

  function applyTheme(value: string): void {
    if (value === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = value;
    }
  }

  function cycleTheme(): void {
    theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    applyTheme(theme);
  }

  function openFile(path: string): void {
    void tabs.open(path);
  }

  function handleOpenLink(event: Event): void {
    const detail = (event as CustomEvent<{ href: string; path: string }>).detail;
    if (!detail?.href) {
      return;
    }
    if (/^(https?:|mailto:)/i.test(detail.href)) {
      void openUrl(detail.href);
      return;
    }
    if (detail.href.startsWith("#")) {
      return;
    }
    const target = resolveRelative(detail.path, detail.href);
    if (/\.(md|markdown|mdown)$/i.test(target)) {
      openFile(target);
    } else {
      void revealItem(target);
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    const modifier = event.ctrlKey || event.metaKey;

    if (modifier && event.key.toLowerCase() === "p") {
      event.preventDefault();
      if (workspace.root) {
        paletteVisible = true;
      }
      return;
    }

    if (modifier && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void tabs.saveActive();
      return;
    }

    if (modifier && event.key.toLowerCase() === "w") {
      event.preventDefault();
      if (tabs.activePath) {
        void tabs.close(tabs.activePath);
      }
      return;
    }

    if (event.key === "Tab" && event.ctrlKey && tabs.tabs.length > 1) {
      event.preventDefault();
      const index = tabs.tabs.findIndex((tab) => tab.path === tabs.activePath);
      const delta = event.shiftKey ? -1 : 1;
      const next = tabs.tabs[(index + delta + tabs.tabs.length) % tabs.tabs.length];
      if (next) {
        void tabs.activate(next.path);
      }
    }
  }

  onMount(async () => {
    window.addEventListener("rypora:open-link", handleOpenLink);

    const config = await loadConfig();
    theme = config.theme;
    sidebarWidth = config.sidebarWidth;
    fontSize = config.fontSize;
    applyTheme(theme);

    if (config.lastWorkspace) {
      await workspace.open(config.lastWorkspace);
      if (workspace.root) {
        tabs.restore(config.tabs, config.activeTab);
      }
    }

    restored = true;

    unlisten = await listen<{ paths: string[] }>("fs://changed", (event) => {
      void workspace.refresh();
      void refreshIndex();
      void tabs.handleFsChanged(event.payload.paths);
    });

    unlistenClose = await getCurrentWindow().onCloseRequested(async () => {
      for (const tab of [...tabs.tabs]) {
        if (tab.dirty && !tab.missing) {
          await tabs.save(tab.path, true);
        }
      }
    });
  });

  onDestroy(() => {
    window.removeEventListener("rypora:open-link", handleOpenLink);
    unlisten?.();
    unlistenClose?.();
  });

  $effect(() => {
    workspace.selectedPath = tabs.activePath;
  });

  $effect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
    document.documentElement.style.setProperty("--editor-font-size", `${fontSize}px`);
  });

  $effect(() => {
    if (!restored) {
      return;
    }
    const config: AppConfig = {
      lastWorkspace: workspace.root,
      tabs: tabs.snapshot(),
      activeTab: tabs.activePath,
      theme,
      sidebarWidth,
      fontSize,
    };
    const timer = setTimeout(() => {
      void saveConfig(config);
    }, 500);
    return () => clearTimeout(timer);
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="app">
  <aside class="sidebar">
    <header class="sidebar-head">
      <span class="workspace-name" title={workspace.root ?? ""}>{folderName}</span>
      <button class="ghost" title="切换主题" onclick={cycleTheme}>
        {theme === "system" ? "自动" : theme === "light" ? "浅色" : "深色"}
      </button>
      <button class="ghost" title="打开文件夹" onclick={() => workspace.openFolder()}>打开</button>
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
    {#if tabs.tabs.length > 0}
      <TabBar />
      {#if tabs.active?.conflict}
        <div class="banner">
          <span>文件已在磁盘上被修改。</span>
          <button onclick={() => tabs.activePath && tabs.resolveConflict(tabs.activePath, true)}>
            载入磁盘版本
          </button>
          <button onclick={() => tabs.activePath && tabs.resolveConflict(tabs.activePath, false)}>
            保留我的
          </button>
        </div>
      {:else if tabs.active?.missing}
        <div class="banner">
          <span>文件已从磁盘删除，编辑器内容不会自动写回。</span>
          <button onclick={() => tabs.activePath && tabs.close(tabs.activePath)}>关闭标签</button>
        </div>
      {/if}
      <Editor />
    {:else if workspace.root}
      <div class="welcome">
        <p>从左侧选择文件，或按 <kbd>Ctrl</kbd> + <kbd>P</kbd> 搜索。</p>
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

<QuickOpen
  visible={paletteVisible}
  onClose={() => (paletteVisible = false)}
  onSelect={openFile}
/>
