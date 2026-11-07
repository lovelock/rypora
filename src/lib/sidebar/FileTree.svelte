<script lang="ts">
  import { onMount } from "svelte";
  import type { ContextAction, FileNode } from "../types";
  import { workspace } from "../state/workspace.svelte";
  import { parentDirectory } from "../utils/paths";
  import { newEntryParent } from "../utils/shortcuts";
  import { tabs } from "../state/tabs.svelte";
  import TreeNode from "./TreeNode.svelte";
  import ContextMenu from "./ContextMenu.svelte";
  import PromptDialog from "../ui/PromptDialog.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import { revealItem } from "../ipc";

  let { tree, onOpen }: { tree: FileNode; onOpen: (path: string) => void } = $props();

  let menu = $state<{ x: number; y: number; node: FileNode } | null>(null);
  let renamingPath = $state<string | null>(null);
  let prompt = $state<{ parent: string; isDir: boolean } | null>(null);
  let deleteTarget = $state<FileNode | null>(null);
  let dragSource = $state<string | null>(null);

  function findNode(node: FileNode, path: string): FileNode | null {
    if (node.path === path) {
      return node;
    }
    for (const child of node.children) {
      const found = findNode(child, path);
      if (found) {
        return found;
      }
    }
    return null;
  }

  function openMenu(event: MouseEvent, node: FileNode): void {
    event.preventDefault();
    event.stopPropagation();
    workspace.select(node.path);
    if (node.isDir && node.path !== workspace.root) {
      workspace.expand(node.path);
    }
    menu = {
      x: Math.min(event.clientX, window.innerWidth - 176),
      y: Math.min(event.clientY, window.innerHeight - 210),
      node,
    };
  }

  function openRootMenu(event: MouseEvent): void {
    if (!workspace.root) {
      return;
    }
    openMenu(event, {
      name: workspace.root,
      path: workspace.root,
      isDir: true,
      children: [],
    });
  }

  function handleAction(action: ContextAction): void {
    if (!menu) return;
    const node = menu.node;
    menu = null;

    if (action === "new-file" || action === "new-folder") {
      prompt = {
        parent: node.isDir ? node.path : parentDirectory(node.path),
        isDir: action === "new-folder",
      };
    } else if (action === "rename") {
      renamingPath = node.path;
    } else if (action === "delete") {
      deleteTarget = node;
    } else if (action === "reveal") {
      void revealItem(node.path);
    }
  }

  async function confirmPrompt(name: string): Promise<void> {
    if (!prompt) return;
    const { parent, isDir } = prompt;
    prompt = null;
    const created = await workspace.createEntry(parent, name, isDir);
    if (created && !isDir) {
      workspace.select(created);
      onOpen(created);
      renamingPath = created;
    }
  }

  async function commitRename(path: string, name: string): Promise<void> {
    if (!name || name === path.split("/").pop()) {
      renamingPath = null;
      return;
    }

    const node = findNode(tree, path);
    const isDir = node?.isDir ?? false;

    if (!(await tabs.prepareDelete(path))) {
      renamingPath = null;
      return;
    }

    const renamed = await workspace.renameEntry(path, name);
    renamingPath = null;
    if (renamed) {
      tabs.retarget(path, renamed);
      workspace.select(renamed);
      if (!isDir) {
        onOpen(renamed);
      }
    }
  }

  async function confirmDelete(): Promise<void> {
    const target = deleteTarget;
    deleteTarget = null;
    if (!target) {
      return;
    }
    if (!(await tabs.prepareDelete(target.path))) {
      return;
    }
    const deleted = await workspace.deleteEntry(target.path);
    if (deleted) {
      tabs.closeUnder(target.path);
    }
  }

  async function handleDrop(destDir: string): Promise<void> {
    const source = dragSource;
    dragSource = null;
    if (!source || source === destDir) {
      return;
    }
    const moved = await workspace.moveEntry(source, destDir);
    if (moved) {
      tabs.retarget(source, moved);
    }
  }

  function targetDirectory(): string {
    const selected = workspace.selectedPath;
    if (!selected) {
      return workspace.root!;
    }
    const node = findNode(tree, selected);
    return newEntryParent(workspace.root!, selected, node?.isDir ?? false);
  }

  function handleCommand(event: Event): void {
    const command = (event as CustomEvent<{ command?: string }>).detail?.command;
    if (!workspace.root || !command || prompt || deleteTarget || renamingPath) {
      return;
    }
    if (command === "new-file" || command === "new-folder") {
      prompt = { parent: targetDirectory(), isDir: command === "new-folder" };
    } else if (command === "rename" && workspace.selectedPath) {
      if (findNode(tree, workspace.selectedPath)) {
        renamingPath = workspace.selectedPath;
      }
    }
  }

  onMount(() => {
    window.addEventListener("rypora:command", handleCommand);
    return () => window.removeEventListener("rypora:command", handleCommand);
  });
</script>

{#if workspace.root}
  <div class="tree-toolbar">
    <button class="ghost" onclick={() => (prompt = { parent: workspace.root!, isDir: false })}>
      ＋ 文件
    </button>
    <button class="ghost" onclick={() => (prompt = { parent: workspace.root!, isDir: true })}>
      ＋ 文件夹
    </button>
  </div>
{/if}

<div
  class="tree"
  role="tree"
  tabindex="0"
  oncontextmenu={openRootMenu}
  ondragover={(event) => event.preventDefault()}
  ondrop={(event) => {
    event.preventDefault();
    if (workspace.root) {
      void handleDrop(workspace.root);
    }
  }}
>
  {#each tree.children as child (child.path)}
    <TreeNode
      node={child}
      depth={0}
      {renamingPath}
      {onOpen}
      onMenu={openMenu}
      onRename={commitRename}
      onRenameCancel={() => (renamingPath = null)}
      onDragStart={(path) => (dragSource = path)}
      onDrop={(path) => void handleDrop(path)}
    />
  {/each}
</div>

{#if menu}
  <ContextMenu
    x={menu.x}
    y={menu.y}
    node={menu.node}
    onAction={handleAction}
    onClose={() => (menu = null)}
  />
{/if}

{#if prompt}
  <PromptDialog
    title={prompt.isDir ? "新建文件夹" : "新建文件"}
    placeholder={prompt.isDir ? "文件夹名称" : "文件名"}
    confirmLabel="创建"
    onConfirm={confirmPrompt}
    onCancel={() => (prompt = null)}
  />
{/if}

{#if deleteTarget}
  <ConfirmDialog
    title="删除"
    message={`将“${deleteTarget.name}”移到回收站？`}
    confirmLabel="删除"
    danger
    onConfirm={confirmDelete}
    onCancel={() => (deleteTarget = null)}
  />
{/if}

<style>
  .tree-toolbar {
    display: flex;
    gap: 6px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
  }

  .tree-toolbar .ghost {
    flex: 1;
  }
</style>
