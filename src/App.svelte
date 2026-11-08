<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { save as saveDialog, ask } from "@tauri-apps/plugin-dialog";
  import { workspace } from "./lib/state/workspace.svelte";
  import { tabs } from "./lib/state/tabs.svelte";
  import { indexStatus, loadConfig, openUrl, refreshIndex, revealItem, saveConfig } from "./lib/ipc";
  import type { AppConfig, IndexStatus, TextHit } from "./lib/types";
  import { basename, resolveRelative } from "./lib/utils/paths";
  import { buildPrintDocument, printDocument } from "./lib/print/document";
  import { INSERT_TABLE_EVENT } from "./lib/editor/table";
  import { detectPlatform } from "./lib/utils/platform";
  import { matchShortcut } from "./lib/utils/shortcuts";
  import FileTree from "./lib/sidebar/FileTree.svelte";
  import SearchPalette from "./lib/search/SearchPalette.svelte";
  import { searchState } from "./lib/state/search.svelte";
  import TabBar from "./lib/tabs/TabBar.svelte";
  import Editor from "./lib/editor/Editor.svelte";
  import StatusBar from "./lib/StatusBar.svelte";
  import ConfirmDialog from "./lib/ui/ConfirmDialog.svelte";
  import SettingsDialog from "./lib/ui/SettingsDialog.svelte";

  let paletteVisible = $state(false);
  let settingsOpen = $state(false);
  let theme = $state("system");
  let restored = $state(false);
  let sidebarWidth = $state(260);
  let fontSize = $state(16);
  let discardPath = $state<string | null>(null);
  let closing = false;
  let unlisten: UnlistenFn | undefined;
  let unlistenClose: UnlistenFn | undefined;
  let unlistenWatch: UnlistenFn | undefined;
  let unlistenIndex: UnlistenFn | undefined;

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

  function setTheme(value: string): void {
    theme = value;
    applyTheme(value);
  }

  function cycleTheme(): void {
    setTheme(theme === "system" ? "light" : theme === "light" ? "dark" : "system");
  }

  function openFile(path: string): void {
    void tabs.open(path);
  }

  function openText(hit: TextHit): void {
    void tabs.openAt(hit.path, hit.line, hit.term);
  }

  function refreshAll(): void {
    void workspace.refresh();
    void refreshIndex();
  }

  function buildConfig(): AppConfig {
    return {
      lastWorkspace: workspace.root,
      tabs: tabs.snapshot(),
      activeTab: tabs.activePath,
      theme,
      sidebarWidth,
      fontSize,
    };
  }

  async function saveActiveAs(): Promise<void> {
    const tab = tabs.active;
    if (!tab) {
      return;
    }
    const selected = await saveDialog({
      title: "另存为",
      defaultPath: tab.path,
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    });
    if (typeof selected === "string") {
      await tabs.saveAs(tab.path, selected);
    }
  }

  function insertTable(rows: number, columns: number): void {
    window.dispatchEvent(new CustomEvent(INSERT_TABLE_EVENT, { detail: { rows, columns } }));
  }

  async function printActive(): Promise<void> {
    const tab = tabs.active;
    if (!tab) {
      return;
    }
    const state = tabs.state(tab.path);
    if (!state) {
      tabs.error = "打印失败：当前文件尚未加载。";
      return;
    }

    try {
      const article = await buildPrintDocument(state.doc.toString(), tab.path);
      const title = basename(tab.path).replace(/\.(md|markdown|mdown)$/i, "");
      if (!(await printDocument(article, title))) {
        tabs.error = "打印失败：当前环境不支持打印。";
      }
    } catch (error) {
      tabs.error = `打印失败：${String(error)}`;
    }
  }

  function requestForceClose(): void {
    if (tabs.activePath) {
      discardPath = tabs.activePath;
    }
  }

  function confirmForceClose(): void {
    if (discardPath) {
      tabs.forceClose(discardPath);
      discardPath = null;
    }
  }

  function handleEditorError(event: Event): void {
    const message = (event as CustomEvent<{ message?: string }>).detail?.message;
    if (message) {
      tabs.error = message;
    }
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
    const shortcut = matchShortcut(
      {
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      },
      detectPlatform(),
    );

    if (shortcut) {
      event.preventDefault();
      if (event.repeat || paletteVisible || discardPath) {
        return;
      }
      if (shortcut === "settings") {
        settingsOpen = !settingsOpen;
        return;
      }
      if (settingsOpen) {
        return;
      }
      if (shortcut === "open-folder") {
        void workspace.openFolder();
      } else if (shortcut === "print") {
        void printActive();
      } else {
        window.dispatchEvent(new CustomEvent("rypora:command", { detail: { command: shortcut } }));
      }
      return;
    }

    const modifier = event.ctrlKey || event.metaKey;

    if (modifier && event.key.toLowerCase() === "p") {
      event.preventDefault();
      if (workspace.root && !settingsOpen) {
        paletteVisible = true;
      }
      return;
    }

    if (modifier && event.shiftKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveActiveAs();
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

  function saveActive(): void {
    void tabs.saveActive();
  }

  onMount(async () => {
    window.addEventListener("rypora:open-link", handleOpenLink);
    window.addEventListener("rypora:error", handleEditorError);
    window.addEventListener("blur", saveActive);
    document.addEventListener("visibilitychange", saveActive);

    const config = await loadConfig();
    theme = config.theme;
    const size = Number.isFinite(config.fontSize) ? config.fontSize : 16;
    const width = Number.isFinite(config.sidebarWidth) ? config.sidebarWidth : 260;
    fontSize = Math.min(22, Math.max(13, size));
    sidebarWidth = Math.min(420, Math.max(240, width));
    applyTheme(theme);

    if (config.lastWorkspace) {
      await workspace.open(config.lastWorkspace);
      if (workspace.root) {
        tabs.restore(config.tabs, config.activeTab);
      }
    }

    restored = true;

    unlistenIndex = await listen<IndexStatus>("index://progress", (event) => {
      searchState.setStatus(event.payload);
    });

    unlisten = await listen<{ paths: string[] }>("fs://changed", (event) => {
      void workspace.refresh();
      void refreshIndex();
      void tabs.handleFsChanged(event.payload.paths);
    });

    unlistenWatch = await listen<{ message: string }>("fs://watch-error", (event) => {
      workspace.error = `文件监听失败：${event.payload.message}`;
    });

    unlistenClose = await getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      if (closing) {
        return;
      }
      closing = true;
      void finishClose();
    });
  });

  async function finishClose(): Promise<void> {
    let failed = false;

    for (const tab of [...tabs.tabs]) {
      if (!tab.dirty) {
        continue;
      }
      if (tab.missing) {
        failed = true;
        continue;
      }
      const saved = await Promise.race([
        tabs.save(tab.path, true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
      ]);
      if (!saved) {
        failed = true;
      }
    }

    try {
      await Promise.race([
        saveConfig(buildConfig()),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch {
      // Config loss is not worth blocking the close.
    }

    if (failed) {
      const discard = await ask("有未保存的内容，仍要关闭吗？", {
        title: "Rypora",
        kind: "warning",
      });
      if (!discard) {
        closing = false;
        return;
      }
    }

    await getCurrentWindow().destroy();
  }

  onDestroy(() => {
    window.removeEventListener("rypora:open-link", handleOpenLink);
    window.removeEventListener("rypora:error", handleEditorError);
    window.removeEventListener("blur", saveActive);
    document.removeEventListener("visibilitychange", saveActive);
    unlisten?.();
    unlistenWatch?.();
    unlistenIndex?.();
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
    const config = buildConfig();
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
      <button class="ghost" title="刷新" onclick={refreshAll}>刷新</button>
      <button class="ghost" title="切换主题" onclick={cycleTheme}>
        {theme === "system" ? "自动" : theme === "light" ? "浅色" : "深色"}
      </button>
      <button class="ghost" title="设置" aria-label="设置" onclick={() => (settingsOpen = true)}>⚙</button>
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
      {#if tabs.error}
        <div class="banner">
          <span>{tabs.error}</span>
          <button onclick={() => (tabs.error = null)}>知道了</button>
        </div>
      {/if}
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
          <span>文件已从磁盘删除，编辑内容尚未保存。</span>
          <button onclick={saveActiveAs}>另存为</button>
          <button onclick={requestForceClose}>强制关闭</button>
        </div>
      {/if}
      <Editor />
      <StatusBar onPrint={printActive} onInsertTable={insertTable} />
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

<SearchPalette
  visible={paletteVisible}
  onClose={() => (paletteVisible = false)}
  onSelectFile={openFile}
  onSelectText={openText}
/>

{#if discardPath}
  <ConfirmDialog
    title="强制关闭"
    message="关闭后，这个标签里未保存的内容会丢失。确定继续？"
    confirmLabel="丢弃并关闭"
    danger
    onConfirm={confirmForceClose}
    onCancel={() => (discardPath = null)}
  />
{/if}

{#if settingsOpen}
  <SettingsDialog
    {theme}
    {fontSize}
    {sidebarWidth}
    onTheme={setTheme}
    onFontSize={(value) => (fontSize = value)}
    onSidebarWidth={(value) => (sidebarWidth = value)}
    onClose={() => (settingsOpen = false)}
  />
{/if}
