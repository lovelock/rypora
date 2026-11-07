<script lang="ts">
  import type { FileNode } from "../types";
  import { workspace } from "../state/workspace.svelte";
  import TreeNode from "./TreeNode.svelte";

  let {
    node,
    depth,
    renamingPath,
    onOpen,
    onMenu,
    onRename,
    onRenameCancel,
    onDragStart,
    onDrop,
  }: {
    node: FileNode;
    depth: number;
    renamingPath: string | null;
    onOpen: (path: string) => void;
    onMenu: (event: MouseEvent, node: FileNode) => void;
    onRename: (path: string, name: string) => void;
    onRenameCancel: () => void;
    onDragStart: (path: string) => void;
    onDrop: (destDir: string) => void;
  } = $props();

  const expanded = $derived(workspace.expanded.has(node.path));
  const active = $derived(workspace.selectedPath === node.path);
  const renaming = $derived(renamingPath === node.path);

  let draft = $state("");
  let input = $state<HTMLInputElement | undefined>(undefined);
  let cancelled = false;

  $effect(() => {
    if (renaming) {
      draft = node.name;
      cancelled = false;
      queueMicrotask(() => {
        input?.focus();
        input?.select();
      });
    }
  });

  function commit(): void {
    if (cancelled) {
      cancelled = false;
      return;
    }
    onRename(node.path, draft.trim());
  }

  function handleKey(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      input?.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelled = true;
      onRenameCancel();
    }
  }

  function startDrag(event: DragEvent): void {
    event.dataTransfer?.setData("text/plain", node.path);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
    onDragStart(node.path);
  }

  function allowDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  function drop(event: DragEvent): void {
    event.preventDefault();
    onDrop(node.path);
  }
</script>

{#if renaming}
  <div class="tree-row renaming" style={`padding-left: ${10 + depth * 14}px`}>
    <span class="dot">·</span>
    <input
      bind:this={input}
      bind:value={draft}
      onkeydown={handleKey}
      onblur={commit}
      onclick={(event) => event.stopPropagation()}
    />
  </div>
{:else if node.isDir}
  <button
    class="tree-row"
    class:active
    style={`padding-left: ${10 + depth * 14}px`}
    onclick={() => workspace.toggle(node.path)}
    oncontextmenu={(event) => onMenu(event, node)}
    draggable="true"
    ondragstart={startDrag}
    ondragover={allowDrop}
    ondrop={drop}
  >
    <span class="chev">{expanded ? "▾" : "▸"}</span>
    <span class="name">{node.name}</span>
  </button>
  {#if expanded}
    {#each node.children as child (child.path)}
      <TreeNode
        node={child}
        depth={depth + 1}
        {renamingPath}
        {onOpen}
        {onMenu}
        {onRename}
        {onRenameCancel}
        {onDragStart}
        {onDrop}
      />
    {/each}
  {/if}
{:else}
  <button
    class="tree-row file"
    class:active
    style={`padding-left: ${10 + depth * 14}px`}
    onclick={() => onOpen(node.path)}
    oncontextmenu={(event) => onMenu(event, node)}
    draggable="true"
    ondragstart={startDrag}
    ondragover={(event) => event.preventDefault()}
    ondrop={(event) => {
      event.preventDefault();
      event.stopPropagation();
    }}
  >
    <span class="dot">·</span>
    <span class="name">{node.name}</span>
  </button>
{/if}
