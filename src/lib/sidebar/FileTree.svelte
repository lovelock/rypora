<script lang="ts">
  import type { ContextAction, FileNode } from "../types";
  import { workspace, parentDirectory } from "../state/workspace.svelte";
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

  function openMenu(event: MouseEvent, node: FileNode): void {
    event.preventDefault();
    workspace.select(node.path);
    if (node.isDir) {
      workspace.expand(node.path);
    }
    menu = {
      x: Math.min(event.clientX, window.innerWidth - 176),
      y: Math.min(event.clientY, window.innerHeight - 210),
      node,
    };
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
    const renamed = await workspace.renameEntry(path, name);
    renamingPath = null;
    if (renamed) {
      workspace.select(renamed);
      onOpen(renamed);
    }
  }

  async function confirmDelete(): Promise<void> {
    const target = deleteTarget;
    deleteTarget = null;
    if (target) {
      await workspace.deleteEntry(target.path);
    }
  }

  function handleDrop(destDir: string): void {
    const source = dragSource;
    dragSource = null;
    if (source && source !== destDir) {
      void workspace.moveEntry(source, destDir);
    }
  }
</script>

<div
  class="tree"
  role="tree"
  tabindex="0"
  ondragover={(event) => event.preventDefault()}
  ondrop={(event) => {
    event.preventDefault();
    if (workspace.root) handleDrop(workspace.root);
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
      onDrop={handleDrop}
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
