<script lang="ts">
  import type { FileNode } from "../types";
  import { workspace } from "../state/workspace.svelte";
  import TreeNode from "./TreeNode.svelte";

  let {
    node,
    depth,
    onOpen,
  }: { node: FileNode; depth: number; onOpen: (path: string) => void } = $props();

  const expanded = $derived(workspace.expanded.has(node.path));
  const active = $derived(workspace.selectedPath === node.path);
</script>

{#if node.isDir}
  <button
    class="tree-row"
    class:active
    style={`padding-left: ${10 + depth * 14}px`}
    onclick={() => workspace.toggle(node.path)}
  >
    <span class="chev">{expanded ? "▾" : "▸"}</span>
    <span class="name">{node.name}</span>
  </button>
  {#if expanded}
    {#each node.children as child (child.path)}
      <TreeNode node={child} depth={depth + 1} {onOpen} />
    {/each}
  {/if}
{:else}
  <button
    class="tree-row file"
    class:active
    style={`padding-left: ${10 + depth * 14}px`}
    onclick={() => onOpen(node.path)}
  >
    <span class="dot">·</span>
    <span class="name">{node.name}</span>
  </button>
{/if}
